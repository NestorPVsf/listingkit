/**
 * Donde se guarda lo que SUBE el operador (fotos, audios y el logo de marca),
 * en un solo sitio. Gemelo de `output-paths.ts`, por la misma razon y con la
 * misma forma.
 *
 * `output/` se separo el 2026-08-03 porque los servidores de la suite E2E
 * escribian en el del usuario y dejaron 705 MB de artefactos huerfanos.
 * `uploads/` se quedo sin separar ese dia, y el problema es el mismo pero peor:
 * aqui no viven copias regenerables, viven las FOTOS que subio la agencia. Un
 * test que limpie de mas y se lleva material que no se puede volver a generar.
 *
 * Ya habia dado la cara, ademas: dos ficheros de test escriben a la vez en
 * `uploads/assets` desde workers distintos, y uno acabo acusando al almacen de
 * dejar basura que habia puesto el otro.
 *
 * La raiz por defecto es `uploads`, asi que sin configurar nada todo queda
 * exactamente donde estaba — las claves de almacenamiento ya guardadas siguen
 * resolviendo.
 */
import path from "node:path";

export function uploadsRoot(): string {
  const configurada = process.env.UPLOADS_DIR?.trim();
  return path.resolve(
    process.cwd(),
    configurada && configurada.length > 0 ? configurada : "uploads",
  );
}

/**
 * Ruta dentro de la raiz de subidas, comprobando que no se escapa de ella.
 * Los nombres ya vienen saneados de sus respectivos contratos, pero esta es la
 * ultima linea y no se deja a la confianza: un `..` que se cuele leeria o
 * escribiria fuera del proyecto.
 */
export function uploadPath(...segments: readonly string[]): string {
  const root = uploadsRoot();
  const candidate = path.resolve(root, ...segments);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("UPLOAD_PATH_OUTSIDE_ROOT");
  }
  return candidate;
}

/** Assets subidos por la API: fotos de propiedad y audios del video. */
export function assetsDir(): string {
  return uploadPath("assets");
}

/** Logos de marca. Se sirven por `GET /uploads/brand/[fileName]`. */
export function brandDir(): string {
  return uploadPath("brand");
}

/**
 * Clave de almacenamiento tal y como se PERSISTE: relativa al proyecto y con
 * barras normales. Se deriva de la ruta real en vez de construirse a mano, que
 * es lo que se hacia antes: con la raiz configurable, dos cadenas armadas por
 * separado se habrian separado en cuanto alguien cambiase una.
 */
export function storageKeyOf(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath).replaceAll("\\", "/");
}
