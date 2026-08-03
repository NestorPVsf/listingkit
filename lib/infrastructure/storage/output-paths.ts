/**
 * Donde se escriben los artefactos generados, en un solo sitio.
 *
 * Esta funcion estaba copiada literalmente en los tres renderers y en el
 * empaquetador ZIP — cuatro copias de la misma comprobacion de seguridad, que
 * es el peor sitio posible para tener duplicacion: basta que alguien arregle
 * tres. (Habia incluso un comentario remitiendo a "output-paths.ts", un fichero
 * que nunca llego a existir.)
 *
 * Y la raiz es configurable por una razon concreta: la suite E2E levanta sus
 * propios servidores y hasta ahora escribia en el MISMO `output/` que el
 * usuario. Se separaron las bases de datos y no esto, asi que los tests dejaban
 * cientos de directorios huerfanos — 705 MB y 108 propiedades en disco con solo
 * 3 en la base de datos.
 */
import path from "node:path";

export function outputRoot(): string {
  const configurada = process.env.RENDER_OUTPUT_DIR?.trim();
  return path.resolve(process.cwd(), configurada && configurada.length > 0 ? configurada : "output");
}

/**
 * Ruta dentro de la raiz de salida, comprobando que no se escapa de ella.
 * Los segmentos vienen de identificadores internos, pero un `..` que se cuele
 * escribiria fuera del proyecto y eso no se deja a la confianza.
 */
export function outputPath(...segments: readonly string[]): string {
  const root = outputRoot();
  const candidate = path.resolve(root, ...segments);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("OUTPUT_PATH_OUTSIDE_ROOT");
  }
  return candidate;
}

/** Directorio propio de un trabajo: `<raiz>/<entidad>/<job>/` (F-05). */
export function jobOutputDir(entityId: string, jobId: string): string {
  return outputPath(entityId, jobId);
}
