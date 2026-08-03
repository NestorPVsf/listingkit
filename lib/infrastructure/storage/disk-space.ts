/**
 * Espacio libre del disco donde viven los artefactos.
 *
 * El producto escribe sin parar y en local: cada generacion completa son ~18 MB
 * con fotos reales, y aunque la poda conserva solo tres generaciones superadas,
 * lo VIGENTE no caduca nunca — una agencia con cartera grande suma sin techo.
 * Cuando el disco se llena, lo que falla no es una pantalla: falla FFmpeg a
 * mitad de un MP4, o el ZIP, con un error tecnico que no dice "no te queda
 * disco". Mas vale avisar antes.
 *
 * Solo avisa. No bloquea la generacion: decidir que borrar es del operador, y
 * un producto que se planta solo porque queda un 14% seria peor que el problema
 * que evita.
 */
import { statfs } from "node:fs/promises";
import { outputRoot } from "./output-paths";

/** Por debajo de esto se avisa. */
export const DISK_WARNING_RATIO = 0.15;
/** Y por debajo de esto el aviso cambia de tono: ya no es previsor. */
export const DISK_CRITICAL_RATIO = 0.05;

export interface DiskSpace {
  readonly freeBytes: number;
  readonly totalBytes: number;
  /** Entre 0 y 1. */
  readonly freeRatio: number;
}

export type DiskLevel = "ok" | "warning" | "critical";

export function diskLevel(space: DiskSpace): DiskLevel {
  if (space.freeRatio < DISK_CRITICAL_RATIO) return "critical";
  if (space.freeRatio < DISK_WARNING_RATIO) return "warning";
  return "ok";
}

/** Lo que `node:fs` devuelve, reducido a lo que se usa. Inyectable en tests. */
export interface StatfsLike {
  readonly bsize: number;
  readonly blocks: number;
  readonly bavail: number;
}

export type StatfsReader = (path: string) => Promise<StatfsLike>;

/**
 * Devuelve el espacio del volumen que contiene `path`, o `null` si no se puede
 * saber. `null` no es un fallo: en un contenedor con `statfs` capado, o si el
 * directorio de salida aun no existe, callar es mejor que inventarse una cifra
 * y asustar al operador con un aviso falso.
 *
 * Se usa `bavail` (bloques disponibles para un usuario normal) y no `bfree`,
 * que incluye la reserva del sistema y daria mas margen del que hay de verdad.
 */
export async function readDiskSpace(
  path: string,
  read: StatfsReader = statfs,
): Promise<DiskSpace | null> {
  const stats = await read(path).catch(() => null);
  if (!stats) return null;

  const { bsize, blocks, bavail } = stats;
  if (
    !Number.isFinite(bsize) ||
    !Number.isFinite(blocks) ||
    !Number.isFinite(bavail) ||
    bsize <= 0 ||
    blocks <= 0 ||
    bavail < 0
  ) {
    return null;
  }

  return {
    freeBytes: bavail * bsize,
    totalBytes: blocks * bsize,
    freeRatio: Math.min(1, bavail / blocks),
  };
}

/**
 * El caso de uso real: el volumen donde se escriben los artefactos. Si ese
 * directorio todavia no existe (instalacion recien hecha), se mide el del
 * proyecto — que en la practica es el mismo volumen.
 */
export async function readOutputDiskSpace(
  read: StatfsReader = statfs,
): Promise<DiskSpace | null> {
  return (
    (await readDiskSpace(outputRoot(), read)) ??
    (await readDiskSpace(process.cwd(), read))
  );
}
