import path from "node:path";
import { spawnWithTimeout } from "./spawn-with-timeout";

export interface FfmpegTools {
  readonly ffmpeg: string;
  readonly ffprobe: string;
}

const WHERE_TIMEOUT_MS = 5_000;
let ffmpegToolsPromise: Promise<FfmpegTools> | undefined;

/**
 * Cada sistema tiene el suyo y no son intercambiables: `where.exe` no existe
 * fuera de Windows y `which` no existe en un Windows limpio. Se resuelve por
 * plataforma en vez de asumir una — durante meses aqui habia un `where.exe`
 * fijo, y con el la generacion de video no arrancaba en Linux ni en macOS.
 */
function localizador(): readonly [string, (binario: string) => string[]] {
  return process.platform === "win32"
    ? ["where.exe", (binario) => [binario]]
    : ["/usr/bin/env", (binario) => ["which", binario]];
}

async function resolveWithWhere(binaryName: string): Promise<string> {
  const [comando, argumentos] = localizador();
  const result = await spawnWithTimeout(
    comando,
    argumentos(binaryName),
    WHERE_TIMEOUT_MS,
  );
  const candidate = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (
    result.timedOut ||
    result.exitCode !== 0 ||
    !candidate ||
    !path.isAbsolute(candidate)
  ) {
    throw new Error(
      `BINARY_NOT_FOUND:${binaryName}\n${result.stderr || result.stdout}`,
    );
  }
  return path.normalize(candidate);
}

/**
 * Se resuelve una sola vez por proceso Node. La promesa compartida también
 * deduplica llamadas concurrentes de varios RenderJobs.
 */
export function resolveFfmpegTools(): Promise<FfmpegTools> {
  ffmpegToolsPromise ??= Promise.all([
    resolveWithWhere("ffmpeg"),
    resolveWithWhere("ffprobe"),
  ]).then(([ffmpeg, ffprobe]) => ({ ffmpeg, ffprobe }));
  return ffmpegToolsPromise;
}
