import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  demoPropertyPayload,
  uploadDemoPhotos,
} from "../fixtures/demo-property";
import {
  createDemoProperty,
  downloadArtifact,
  findTask,
  pollRenderJob,
  triggerGenerate,
} from "./helpers";

interface SpawnResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface VideoProbe {
  readonly width: number;
  readonly height: number;
  readonly codecName: string;
  readonly durationSeconds: number;
  readonly audioStreamCount: number;
}

let ffprobePromise: Promise<string> | undefined;

function spawnCapture(
  command: string,
  args: readonly string[],
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

function resolveFfprobe(): Promise<string> {
  ffprobePromise ??= spawnCapture("where.exe", ["ffprobe"]).then((result) => {
    const firstPath = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (result.exitCode !== 0 || !firstPath || !path.isAbsolute(firstPath)) {
      throw new Error(`FFPROBE_NOT_FOUND\n${result.stderr}`);
    }
    return firstPath;
  });
  return ffprobePromise;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function probeVideo(filePath: string): Promise<VideoProbe> {
  const ffprobe = await resolveFfprobe();
  const result = await spawnCapture(ffprobe, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    filePath,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`ffprobe falló:\n${result.stderr}`);
  }

  const parsed: unknown = JSON.parse(result.stdout);
  const root = recordValue(parsed);
  const streams = Array.isArray(root?.streams)
    ? root.streams.map(recordValue).filter((stream) => stream !== null)
    : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const format = recordValue(root?.format);
  const width = numericValue(video?.width);
  const height = numericValue(video?.height);
  const duration =
    numericValue(format?.duration) ?? numericValue(video?.duration);
  const codecName =
    typeof video?.codec_name === "string" ? video.codec_name : null;

  if (!width || !height || duration === null || !codecName) {
    throw new Error(`Salida ffprobe incompleta:\n${result.stdout}`);
  }
  return {
    width,
    height,
    codecName,
    durationSeconds: duration,
    audioStreamCount: streams.filter(
      (stream) => stream.codec_type === "audio",
    ).length,
  };
}

async function generateVideo(
  request: Parameters<typeof uploadDemoPhotos>[0],
  outputPath: string,
): Promise<{
  readonly probe: VideoProbe;
  readonly artifact: {
    readonly fileName: string;
    readonly mediaType: string;
    readonly bytes: number;
  };
  readonly rawArtifact: unknown;
}> {
  const photoAssetIds = await uploadDemoPhotos(request);
  const payload = demoPropertyPayload({
    photoAssetIds,
    primaryPhotoAssetId: photoAssetIds[0]!,
  });
  const propertyId = await createDemoProperty(request, payload);
  const jobId = await triggerGenerate(request, propertyId);
  const job = await pollRenderJob(request, jobId, {
    timeoutMs: 180_000,
    intervalMs: 1_000,
  });

  expect(job.status === "done" || job.status === "partial").toBe(true);
  const task = findTask(job, "vertical-video");
  expect(task.status).toBe("done");
  expect(task.artifacts).toHaveLength(1);
  const artifact = task.artifacts[0]!;
  const videoBuffer = await downloadArtifact(request, artifact.id);
  await writeFile(outputPath, videoBuffer);

  return {
    probe: await probeVideo(outputPath),
    artifact,
    rawArtifact: artifact,
  };
}

test.describe("Render de vídeo vertical", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  test("genera video-vertical.mp4 H.264 1080x1920 de 20-35 segundos", async ({
    request,
  }, testInfo) => {
    const result = await generateVideo(
      request,
      testInfo.outputPath("video-vertical.mp4"),
    );

    expect(result.artifact.fileName).toBe("video-vertical.mp4");
    expect(result.artifact.mediaType).toBe("video/mp4");
    expect(result.artifact.bytes).toBeGreaterThan(0);
    expect(result.probe.width).toBe(1080);
    expect(result.probe.height).toBe(1920);
    expect(result.probe.codecName).toBe("h264");
    expect(result.probe.durationSeconds).toBeGreaterThanOrEqual(20);
    expect(result.probe.durationSeconds).toBeLessThanOrEqual(35);
  });

  test("sin musicAssetId genera un MP4 válido y declara que no hay locución", async ({
    request,
  }, testInfo) => {
    const result = await generateVideo(
      request,
      testInfo.outputPath("video-vertical-sin-musica.mp4"),
    );

    expect(result.artifact.bytes).toBeGreaterThan(0);
    expect(result.probe.width).toBe(1080);
    expect(result.probe.height).toBe(1920);
    expect(result.probe.codecName).toBe("h264");
    expect(result.probe.durationSeconds).toBeGreaterThanOrEqual(20);
    expect(result.probe.durationSeconds).toBeLessThanOrEqual(35);
    expect(result.probe.audioStreamCount).toBe(0);
    expect(result.rawArtifact).toMatchObject({
      metadata: {
        audio: {
          narrationMode: "none",
          hasNarration: false,
          hasMusic: false,
          voiceStatus: "sin-locucion",
        },
      },
    });
  });
});
