import { spawn } from "node:child_process";

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/**
 * Techo por stream (F-10 de la review adversarial): un audio hostil o un
 * filtergraph roto pueden hacer que FFmpeg escupa megabytes de diagnostico
 * durante los 120 s de timeout. Ese texto se persistia entero en
 * `RenderJob.errorTechnicalDetails` y se devolvia por API. Guardamos solo la
 * COLA — el motivo real del fallo siempre esta al final.
 *
 * stdout tiene un techo mucho mas alto porque SI se parsea (el JSON de
 * `ffprobe -show_streams -show_format` ronda los 4 KB); recortarlo a 8 KB
 * romperia la validacion del MP4 en videos con muchas pistas.
 */
const MAX_STDERR_CAPTURE_BYTES = 8 * 1024;
const MAX_STDOUT_CAPTURE_BYTES = 512 * 1024;

interface CappedSink {
  push(chunk: Buffer): void;
  text(): string;
}

function createCappedSink(limit: number): CappedSink {
  const chunks: Buffer[] = [];
  let size = 0;
  let dropped = 0;

  return {
    push(chunk) {
      chunks.push(chunk);
      size += chunk.byteLength;

      while (size > limit && chunks.length > 1) {
        const removed = chunks.shift() as Buffer;
        size -= removed.byteLength;
        dropped += removed.byteLength;
      }
      // Un unico chunk mayor que el limite: recortamos por dentro.
      if (size > limit) {
        const only = chunks[0] as Buffer;
        const excess = only.byteLength - limit;
        chunks[0] = only.subarray(excess);
        dropped += excess;
        size = limit;
      }
    },

    text() {
      const body = Buffer.concat(chunks).toString("utf8");
      return dropped > 0
        ? `[...${dropped} bytes anteriores descartados...]\n${body}`
        : body;
    },
  };
}

export class ProcessLaunchError extends Error {
  readonly command: string;

  constructor(command: string, cause: unknown) {
    super(
      cause instanceof Error
        ? cause.message
        : `No se pudo iniciar el proceso: ${String(cause)}`,
    );
    this.name = "ProcessLaunchError";
    this.command = command;
  }
}

/**
 * Ejecuta exclusivamente un binario absoluto/directo con argumentos separados.
 * AbortController corta el proceso al vencer el timeout; `kill` queda como
 * respaldo explícito para builds de Node/Windows que tarden en propagar abort.
 */
export function spawnWithTimeout(
  command: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<ProcessResult> {
  const controller = new AbortController();
  const stdoutSink = createCappedSink(MAX_STDOUT_CAPTURE_BYTES);
  const stderrSink = createCappedSink(MAX_STDERR_CAPTURE_BYTES);
  let timedOut = false;
  let settled = false;

  return new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, [...args], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      signal: controller.signal,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutSink.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrSink.push(chunk);
    });

    child.on("error", (error: Error) => {
      if (timedOut) {
        return;
      }
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new ProcessLaunchError(command, error));
      }
    });

    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        stdout: stdoutSink.text(),
        stderr: stderrSink.text(),
        timedOut,
      });
    });
  });
}
