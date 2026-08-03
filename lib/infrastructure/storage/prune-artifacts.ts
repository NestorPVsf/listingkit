/**
 * Retencion de artefactos: los trabajos generados se acumulan para siempre.
 *
 * F-05 dio a cada trabajo su propio directorio para que dos procesos no se
 * pisen y para que regenerar no cambie un fichero ya descargado. El precio es
 * que nada se borra: una propiedad regenerada cinco veces ocupaba 97 MB, y con
 * fotos reales una generacion completa son ~18 MB (el video, 10 de ellos).
 * Una agencia de 12 altas al mes suma medio giga al mes y no para nunca.
 *
 * ---------------------------------------------------------------------------
 * La regla que no se puede romper
 * ---------------------------------------------------------------------------
 * **Nunca se borra un directorio que contenga la version VIGENTE de una pieza.**
 *
 * No es una precaucion de mas: el ZIP no se arma con los ficheros del ultimo
 * trabajo, sino con el ultimo artefacto de CADA pieza (`ArtifactRegistry`). Si
 * regeneras solo el post, su fichero vive en un directorio nuevo mientras la
 * ficha PDF sigue en el viejo. Borrar por antiguedad sin mirar esto dejaria el
 * ZIP incompleto — que es exactamente el bug critico que costo introducir el
 * registro de artefactos.
 *
 * Asi que el orden es: primero se protege lo que esta en uso, y solo despues se
 * poda por antiguedad lo que ya nadie referencia.
 */
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { ArtifactRegistry } from "@/lib/engine/ports/artifact-registry";
import { outputPath, outputRoot } from "./output-paths";

/** Generaciones superadas que se conservan, ademas de las vigentes. */
export const GENERACIONES_CONSERVADAS = 3;

export interface PruneResult {
  readonly removedDirs: number;
  readonly freedBytes: number;
  readonly keptDirs: number;
}

async function tamañoDirectorio(dir: string): Promise<number> {
  let total = 0;
  const entradas = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entrada of entradas) {
    const completa = path.join(dir, entrada.name);
    if (entrada.isDirectory()) total += await tamañoDirectorio(completa);
    else total += (await stat(completa).catch(() => null))?.size ?? 0;
  }
  return total;
}

/**
 * Poda los artefactos de una entidad. Idempotente y silenciosa ante errores de
 * disco: es tarea de mantenimiento, no puede tumbar una generacion que acaba de
 * salir bien.
 */
export async function pruneEntityArtifacts(
  entityId: string,
  registry: ArtifactRegistry,
  keep: number = GENERACIONES_CONSERVADAS,
): Promise<PruneResult> {
  const vacio: PruneResult = { removedDirs: 0, freedBytes: 0, keptDirs: 0 };

  const raizEntidad = outputPath(entityId);
  const entradas = await readdir(raizEntidad, { withFileTypes: true }).catch(() => null);
  if (!entradas) return vacio;

  const directorios = entradas.filter((e) => e.isDirectory()).map((e) => e.name);
  if (directorios.length === 0) return vacio;

  // Directorios que sostienen la version vigente de alguna pieza. Se deducen de
  // los `storageKey` del registro, que son rutas relativas al proyecto.
  //
  // Si el registro no responde, se ABORTA la poda. Tratar el fallo como "no hay
  // nada vigente" haria justo lo contrario de lo prudente: borrar por
  // antiguedad el directorio que sostiene la ficha del ZIP. Borrar es
  // irreversible, no borrar solo cuesta disco — y la proxima generacion
  // reintenta. Lo destapo un test que asumia lo correcto antes de que el codigo
  // lo hiciera.
  const vigentes = new Set<string>();
  let artefactos: readonly { readonly storageKey: string }[];
  try {
    artefactos = await registry.latestByEntity(entityId);
  } catch {
    return vacio;
  }
  for (const artefacto of artefactos) {
    const absoluta = path.resolve(process.cwd(), artefacto.storageKey);
    const relativa = path.relative(outputRoot(), absoluta);
    // `<entidad>/<job>/<fichero>` — el segundo segmento es el trabajo.
    const [entidad, job] = relativa.split(path.sep);
    if (entidad === entityId && job) vigentes.add(job);
  }

  // De lo que ya nadie referencia, se conservan las `keep` mas recientes: es el
  // "deshacer" de quien regenera y no le gusta el resultado.
  const superados = await Promise.all(
    directorios
      .filter((d) => !vigentes.has(d))
      .map(async (d) => ({
        nombre: d,
        mtime: (await stat(outputPath(entityId, d)).catch(() => null))?.mtimeMs ?? 0,
      })),
  );
  superados.sort((a, b) => b.mtime - a.mtime);
  const aBorrar = superados.slice(keep);

  let freedBytes = 0;
  let removedDirs = 0;
  for (const { nombre } of aBorrar) {
    const dir = outputPath(entityId, nombre);
    try {
      freedBytes += await tamañoDirectorio(dir);
      await rm(dir, { recursive: true, force: true });
      removedDirs += 1;
    } catch {
      // Un fichero bloqueado en Windows, por ejemplo. Se reintentara en la
      // siguiente generacion: fallar aqui seria peor que no limpiar.
    }
  }

  return {
    removedDirs,
    freedBytes,
    keptDirs: directorios.length - removedDirs,
  };
}
