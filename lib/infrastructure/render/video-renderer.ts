import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import type {
  BindingRecord,
  RenderArtifact,
  RenderJob,
  RenderTask,
} from "@/lib/engine/contracts";
import { EngineError } from "@/lib/engine/errors";
import type { RendererPort, RenderSession } from "@/lib/engine/ports/renderer";
import type { TTSProvider } from "@/lib/engine/ports/tts-provider";
import type {
  VideoStoryboard,
  VideoStoryboardResolver,
} from "@/lib/engine/ports/video-storyboard";
import {
  resolveFfmpegTools,
  type FfmpegTools,
} from "@/lib/infrastructure/process/binary-resolver";
import {
  ProcessLaunchError,
  spawnWithTimeout,
  type ProcessResult,
} from "@/lib/infrastructure/process/spawn-with-timeout";
import {
  createVideoDurationPlan,
  TRANSITION_SECONDS,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "./video/duration-plan";
import { renderSceneFrame } from "./video/scene-frame";
import { outputPath } from "@/lib/infrastructure/storage/output-paths";

export const MUSIC_VOLUME_WITH_NARRATION = 0.12;
export const MUSIC_VOLUME_ALONE = 0.22;
export const NARRATION_VOLUME = 1;

const DEFAULT_PROCESS_TIMEOUT_MS = 120_000;

export interface VideoRendererOptions {
  readonly resolveStoryboard: VideoStoryboardResolver;
  readonly ttsProvider: TTSProvider;
  readonly processTimeoutMs?: number;
  readonly musicVolumeWithNarration?: number;
  readonly musicVolumeAlone?: number;
  readonly narrationVolume?: number;
}

interface ProbedVideo {
  readonly width: number;
  readonly height: number;
  readonly codecName: string;
  readonly durationSeconds: number;
}

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new EngineError({
      code: "OUTPUT_SEGMENT_INVALID",
      cause: "El identificador de salida contiene caracteres no permitidos.",
      solution: "Usa identificadores internos alfanuméricos.",
      retryable: false,
    });
  }
  return value;
}


function seconds(value: number): string {
  return value.toFixed(3);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseProbe(stdout: string): ProbedVideo {
  const parsed: unknown = JSON.parse(stdout);
  const root = recordValue(parsed);
  const streams = Array.isArray(root?.streams) ? root.streams : [];
  const videoStream = streams
    .map(recordValue)
    .find((stream) => stream?.codec_type === "video");
  const format = recordValue(root?.format);
  const width = numberValue(videoStream?.width);
  const height = numberValue(videoStream?.height);
  const codecName =
    typeof videoStream?.codec_name === "string"
      ? videoStream.codec_name
      : null;
  const duration =
    numberValue(format?.duration) ?? numberValue(videoStream?.duration);

  if (!width || !height || !codecName || duration === null) {
    throw new Error("FFPROBE_OUTPUT_INVALID");
  }
  return {
    width,
    height,
    codecName,
    durationSeconds: duration,
  };
}

function processFailure(
  code: string,
  result: ProcessResult,
  timeoutMs: number,
): EngineError {
  if (result.timedOut) {
    return new EngineError({
      code: "FFMPEG_TIMEOUT",
      cause: `FFmpeg superó el timeout duro de ${timeoutMs} ms.`,
      solution:
        "Reintenta el trabajo; si se repite, reduce el número o tamaño de las fotos.",
      retryable: true,
      technicalDetails: result.stderr,
    });
  }
  return new EngineError({
    code,
    cause: "FFmpeg no pudo completar el vídeo.",
    solution: "Revisa el diagnóstico técnico y vuelve a intentar la generación.",
    retryable: true,
    technicalDetails: result.stderr,
  });
}

function videoFilters(
  storyboard: VideoStoryboard,
  durations: readonly number[],
): {
  readonly filters: string[];
  readonly videoOutput: string;
} {
  const filters: string[] = [];

  durations.forEach((duration, index) => {
    const delta = 0.08 / Math.max(1, duration * VIDEO_FPS);
    const zoom =
      index % 2 === 0
        ? `min(zoom+${delta.toFixed(8)},1.08)`
        : `if(eq(on,0),1.08,max(1.0,zoom-${delta.toFixed(8)}))`;
    const x = index % 2 === 0 ? "0" : "iw-iw/zoom";
    const y = index % 2 === 0 ? "0" : "ih-ih/zoom";
    filters.push(
      `[${index}:v]zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${VIDEO_FPS},` +
        `trim=duration=${seconds(duration)},setpts=PTS-STARTPTS,format=yuv420p[scene${index}]`,
    );
  });

  let currentLabel = "scene0";
  let currentDuration = durations[0] ?? 0;
  for (let index = 1; index < storyboard.scenes.length; index += 1) {
    const nextLabel = `video${index}`;
    const offset = currentDuration - TRANSITION_SECONDS;
    filters.push(
      `[${currentLabel}][scene${index}]xfade=transition=fade:duration=${seconds(TRANSITION_SECONDS)}:offset=${seconds(offset)}[${nextLabel}]`,
    );
    currentLabel = nextLabel;
    currentDuration += (durations[index] ?? 0) - TRANSITION_SECONDS;
  }

  return { filters, videoOutput: currentLabel };
}

function audioFilters({
  musicInputIndex,
  narrationInputIndex,
  durationSeconds,
  musicVolumeWithNarration,
  musicVolumeAlone,
  narrationVolume,
}: {
  readonly musicInputIndex: number | null;
  readonly narrationInputIndex: number | null;
  readonly durationSeconds: number;
  readonly musicVolumeWithNarration: number;
  readonly musicVolumeAlone: number;
  readonly narrationVolume: number;
}): readonly string[] {
  const endFadeAt = Math.max(0, durationSeconds - 1);
  const commonTail =
    `atrim=duration=${seconds(durationSeconds)},asetpts=PTS-STARTPTS,` +
    `afade=t=out:st=${seconds(endFadeAt)}:d=1`;

  if (musicInputIndex !== null && narrationInputIndex !== null) {
    return [
      `[${musicInputIndex}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${musicVolumeWithNarration},${commonTail}[music]`,
      `[${narrationInputIndex}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${narrationVolume},apad=pad_dur=${seconds(durationSeconds)},${commonTail}[voice]`,
      `[music][voice]amix=inputs=2:duration=longest:normalize=0,atrim=duration=${seconds(durationSeconds)}[audio]`,
    ];
  }
  if (musicInputIndex !== null) {
    return [
      `[${musicInputIndex}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${musicVolumeAlone},${commonTail}[audio]`,
    ];
  }
  if (narrationInputIndex !== null) {
    return [
      `[${narrationInputIndex}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${narrationVolume},apad=pad_dur=${seconds(durationSeconds)},${commonTail}[audio]`,
    ];
  }
  return [];
}

async function probeVideo(
  tools: FfmpegTools,
  filePath: string,
  timeoutMs: number,
): Promise<ProbedVideo> {
  const result = await spawnWithTimeout(
    tools.ffprobe,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      filePath,
    ],
    timeoutMs,
  );
  if (result.timedOut || result.exitCode !== 0) {
    throw processFailure("FFPROBE_FAILED", result, timeoutMs);
  }

  try {
    return parseProbe(result.stdout);
  } catch (error: unknown) {
    throw new EngineError({
      code: "FFPROBE_OUTPUT_INVALID",
      cause: "El MP4 se generó, pero ffprobe no pudo validar sus metadatos.",
      solution: "Revisa la instalación local de FFmpeg y reintenta.",
      retryable: true,
      technicalDetails:
        `${error instanceof Error ? error.message : String(error)}\n` +
        `${result.stderr}\n${result.stdout}`,
    });
  }
}

async function resolveToolsOrThrow(): Promise<FfmpegTools> {
  try {
    return await resolveFfmpegTools();
  } catch (error: unknown) {
    throw new EngineError({
      code: "FFMPEG_NOT_FOUND",
      cause: "No se encontraron ffmpeg y ffprobe en PATH.",
      solution:
        "Instala FFmpeg para Windows, confirma `where ffmpeg` y `where ffprobe`, y reintenta.",
      retryable: false,
      taskStatus: "blocked",
      technicalDetails:
        error instanceof Error ? error.message : String(error),
    });
  }
}

async function renderVideoArtifact(
  tools: FfmpegTools,
  options: VideoRendererOptions,
  job: Readonly<RenderJob>,
  task: Readonly<RenderTask>,
): Promise<RenderArtifact> {
  const storyboard = await options.resolveStoryboard(job, task);
  if (!storyboard) {
    throw new EngineError({
      code: "ENTITY_NOT_FOUND",
      cause: "No existe la entidad asociada a este trabajo.",
      solution: "Comprueba que la entidad no se eliminó antes de renderizar.",
      retryable: false,
      taskStatus: "blocked",
    });
  }
  if (storyboard.scenes.length === 0) {
    throw new EngineError({
      code: "VIDEO_STORYBOARD_EMPTY",
      cause: "El storyboard no contiene escenas renderizables.",
      solution: "Añade al menos una imagen antes de generar el vídeo.",
      retryable: false,
      taskStatus: "blocked",
    });
  }

  const timeoutMs = options.processTimeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;
  const entitySegment = safeSegment(job.entityId);
  const jobSegment = safeSegment(job.id);
  // F-05: directorio propio por job, destino unico.
  const directory = outputPath(entitySegment, jobSegment);
  const temporaryDirectory = outputPath(entitySegment, jobSegment, ".tmp");
  const finalFileName = "video-vertical.mp4";
  const finalPath = outputPath(entitySegment, jobSegment, finalFileName);
  const temporaryVideoPath = outputPath(
    entitySegment,
    jobSegment,
    ".tmp",
    `${randomUUID()}.tmp.mp4`,
  );
  const durationPlan = createVideoDurationPlan(storyboard.scenes);
  const narrationController = new AbortController();
  const narrationTimer = setTimeout(
    () => narrationController.abort(),
    timeoutMs,
  );

  await mkdir(directory, { recursive: true });
  await mkdir(temporaryDirectory, { recursive: true });

  try {
    const narration = await options.ttsProvider.resolveNarration(
      {
        text: storyboard.narrationText,
        locale: storyboard.locale,
        deadline: new Date(Date.now() + timeoutMs).toISOString(),
        manualUploadPath: storyboard.audio.narrationPath,
      },
      narrationController.signal,
    );
    clearTimeout(narrationTimer);

    const framePaths = await Promise.all(
      durationPlan.scenes.map(async ({ scene }, index) => {
        const framePath = outputPath(
          entitySegment,
          jobSegment,
          ".tmp",
          `scene-${String(index).padStart(2, "0")}.png`,
        );
        await renderSceneFrame(scene, storyboard.brand, framePath);
        return framePath;
      }),
    );
    const durations = durationPlan.scenes.map(
      ({ durationSeconds }) => durationSeconds,
    );
    const { filters, videoOutput } = videoFilters(storyboard, durations);
    // `-loglevel error` (F-10): sin el, FFmpeg emite progreso y metadatos del
    // audio de entrada en cada frame; ese stderr acaba persistido en el job.
    const args: string[] = [
      "-hide_banner",
      "-nostdin",
      "-loglevel",
      "error",
      "-y",
    ];

    framePaths.forEach((framePath, index) => {
      args.push(
        "-loop",
        "1",
        "-framerate",
        String(VIDEO_FPS),
        "-t",
        seconds(durations[index] ?? 0),
        "-i",
        framePath,
      );
    });

    let nextInputIndex = framePaths.length;
    const musicInputIndex = storyboard.audio.musicPath
      ? nextInputIndex++
      : null;
    if (storyboard.audio.musicPath) {
      args.push("-stream_loop", "-1", "-i", storyboard.audio.musicPath);
    }
    const narrationInputIndex = narration ? nextInputIndex : null;
    if (narration) {
      args.push("-i", narration.inputPath);
    }

    const audio = audioFilters({
      musicInputIndex,
      narrationInputIndex,
      durationSeconds: durationPlan.durationSeconds,
      musicVolumeWithNarration:
        options.musicVolumeWithNarration ?? MUSIC_VOLUME_WITH_NARRATION,
      musicVolumeAlone:
        options.musicVolumeAlone ?? MUSIC_VOLUME_ALONE,
      narrationVolume: options.narrationVolume ?? NARRATION_VOLUME,
    });
    const allFilters = [...filters, ...audio];

    args.push(
      "-filter_complex",
      allFilters.join(";"),
      "-map",
      `[${videoOutput}]`,
    );
    if (audio.length > 0) {
      args.push("-map", "[audio]", "-c:a", "aac", "-b:a", "192k");
    } else {
      args.push("-an");
    }
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(VIDEO_FPS),
      "-t",
      seconds(durationPlan.durationSeconds),
      "-movflags",
      "+faststart",
      temporaryVideoPath,
    );

    const result = await spawnWithTimeout(
      tools.ffmpeg,
      args,
      timeoutMs,
    );
    if (result.timedOut || result.exitCode !== 0) {
      throw processFailure("FFMPEG_FAILED", result, timeoutMs);
    }

    const probed = await probeVideo(tools, temporaryVideoPath, timeoutMs);
    if (
      probed.width !== VIDEO_WIDTH ||
      probed.height !== VIDEO_HEIGHT ||
      probed.codecName !== "h264" ||
      probed.durationSeconds < 20 ||
      probed.durationSeconds > 35
    ) {
      throw new EngineError({
        code: "VIDEO_CONTRACT_MISMATCH",
        cause: "El MP4 generado no cumple resolución, codec o duración.",
        solution: "Revisa el pipeline FFmpeg antes de reintentar.",
        retryable: true,
        technicalDetails: JSON.stringify(probed),
      });
    }

    // Sin `rm` previo: el destino es unico de este job.
    await rename(temporaryVideoPath, finalPath);
    const [fileStats, bytes] = await Promise.all([
      stat(finalPath),
      readFile(finalPath),
    ]);
    const storageKey = path
      .relative(process.cwd(), finalPath)
      .replaceAll("\\", "/");
    const metadata: BindingRecord = {
      audio: {
        ttsMode: options.ttsProvider.mode,
        narrationMode: narration?.mode ?? "none",
        hasNarration: narration !== null,
        hasMusic: storyboard.audio.musicPath !== undefined,
        voiceStatus: narration ? "locucion-manual" : "sin-locucion",
      },
    };

    return {
      id: randomUUID(),
      pieceKey: task.piece.key,
      variant: "vertical",
      fileName: finalFileName,
      storageKey,
      mediaType: "video/mp4",
      bytes: fileStats.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width: probed.width,
      height: probed.height,
      durationSeconds: probed.durationSeconds,
      metadata,
    };
  } catch (error: unknown) {
    clearTimeout(narrationTimer);
    if (error instanceof EngineError) {
      throw error;
    }
    if (error instanceof ProcessLaunchError) {
      throw new EngineError({
        code: "FFMPEG_LAUNCH_FAILED",
        cause: "No se pudo iniciar FFmpeg.",
        solution: "Comprueba la instalación y permisos del binario y reintenta.",
        retryable: true,
        technicalDetails: error.message,
      });
    }
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export function createVideoRenderer(
  options: VideoRendererOptions,
): RendererPort {
  return {
    async open(): Promise<RenderSession> {
      const tools = await resolveToolsOrThrow();
      return {
        async render(job: Readonly<RenderJob>, task: Readonly<RenderTask>) {
          const artifact = await renderVideoArtifact(
            tools,
            options,
            job,
            task,
          );
          return [artifact];
        },
        async close() {
          // Cada proceso se espera y cierra dentro de render(); no queda daemon.
        },
      };
    },
  };
}
