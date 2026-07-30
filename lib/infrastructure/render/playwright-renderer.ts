import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type {
  PieceDefinition,
  RenderArtifact,
  RenderJob,
  RenderTask,
} from "@/lib/engine/contracts";
import { EngineError } from "@/lib/engine/errors";
import type {
  RendererPort,
  RenderSession,
} from "@/lib/engine/ports/renderer";

export interface PreviewCaptureTarget {
  readonly previewId: string;
  readonly fileName: string;
  readonly variant: string;
  readonly kind: "image" | "pdf";
  readonly width?: number;
  readonly height?: number;
}

export type PreviewPlanResolver = (
  piece: Readonly<PieceDefinition>,
) => readonly PreviewCaptureTarget[] | null;

export interface PlaywrightRendererOptions {
  readonly baseUrl: string;
  readonly resolvePlan: PreviewPlanResolver;
  /** Techo por captura. Ver CAPTURE_TIMEOUT_MS. */
  readonly captureTimeoutMs?: number;
}

/**
 * F-12 de la review adversarial: `waitUntilReady` espera `document.fonts.ready`
 * y la decodificacion de TODAS las imagenes dentro de un `page.evaluate()`, que
 * no tiene timeout propio. Un asset que nunca resuelve dejaba la promesa colgada
 * para siempre; como la cola de render es serial y global, un solo preview
 * atascado congelaba todos los trabajos siguientes sin error ni diagnostico.
 *
 * 90 s por captura es holgado: el PDF de la ficha, que es la mas pesada, ronda
 * los 3-6 s en local.
 */
const CAPTURE_TIMEOUT_MS = 90_000;

/** Techo de las operaciones con timeout nativo (goto, waitForSelector...). */
const PLAYWRIGHT_OPERATION_TIMEOUT_MS = 30_000;

class CaptureTimeout extends Error {
  constructor(readonly ms: number) {
    super(`CAPTURE_TIMEOUT_${ms}`);
    this.name = "CaptureTimeout";
  }
}

function hardTimeout(ms: number): {
  readonly promise: Promise<never>;
  cancel(): void;
} {
  let timer: NodeJS.Timeout | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new CaptureTimeout(ms)), ms);
  });
  return {
    promise,
    cancel: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new EngineError({
      code: "OUTPUT_SEGMENT_INVALID",
      cause: "El identificador de salida contiene caracteres no permitidos.",
      solution: "Usa identificadores internos alfanumericos.",
      retryable: false,
    });
  }
  return value;
}

function outputPath(...segments: readonly string[]): string {
  const root = path.resolve(process.cwd(), "output");
  const candidate = path.resolve(root, ...segments);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("OUTPUT_PATH_OUTSIDE_ROOT");
  }
  return candidate;
}

async function waitUntilReady(page: Page): Promise<void> {
  await page.waitForSelector("[data-piece-canvas]", { state: "visible" });
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = Array.from(document.images);
    await Promise.all(
      images.map(async (image) => {
        if (!image.complete) {
          await new Promise<void>((resolve, reject) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => reject(), { once: true });
          });
        }
        await image.decode();
      }),
    );
  });
}

function previewUrl(
  baseUrl: string,
  previewId: string,
  entityId: string,
): string {
  const url = new URL(`/preview/${encodeURIComponent(previewId)}`, baseUrl);
  url.searchParams.set("propertyId", entityId);
  url.searchParams.set("brandId", "");
  return url.toString();
}

async function captureTarget(
  page: Page,
  job: Readonly<RenderJob>,
  task: Readonly<RenderTask>,
  target: Readonly<PreviewCaptureTarget>,
  baseUrl: string,
): Promise<RenderArtifact> {
  const entitySegment = safeSegment(job.entityId);
  const jobSegment = safeSegment(job.id);
  const directory = outputPath(entitySegment);
  const temporaryDirectory = outputPath(
    entitySegment,
    `.tmp-${jobSegment}`,
  );
  const finalPath = outputPath(entitySegment, target.fileName);
  const temporaryPath = outputPath(
    entitySegment,
    `.tmp-${jobSegment}`,
    `${randomUUID()}.tmp`,
  );
  await mkdir(directory, { recursive: true });
  await mkdir(temporaryDirectory, { recursive: true });

  if (target.width && target.height) {
    await page.setViewportSize({
      width: target.width,
      height: target.height,
    });
  }
  await page.goto(
    previewUrl(baseUrl, target.previewId, job.entityId),
    { waitUntil: "domcontentloaded" },
  );
  await waitUntilReady(page);

  if (target.kind === "image") {
    await page.screenshot({
      path: temporaryPath,
      type: "png",
      fullPage: false,
      animations: "disabled",
      caret: "hide",
    });
  } else {
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: temporaryPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });
  }

  await rm(finalPath, { force: true });
  await rename(temporaryPath, finalPath);
  const [fileStats, bytes] = await Promise.all([
    stat(finalPath),
    readFile(finalPath),
  ]);
  const storageKey = path
    .relative(process.cwd(), finalPath)
    .replaceAll("\\", "/");

  return {
    id: randomUUID(),
    pieceKey: task.piece.key,
    variant: target.variant,
    fileName: target.fileName,
    storageKey,
    mediaType: target.kind === "pdf" ? "application/pdf" : "image/png",
    bytes: fileStats.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width: target.width,
    height: target.height,
  };
}

async function createSession(
  browser: Browser,
  context: BrowserContext,
  options: PlaywrightRendererOptions,
): Promise<RenderSession> {
  const captureTimeoutMs = options.captureTimeoutMs ?? CAPTURE_TIMEOUT_MS;
  let page = await context.newPage();

  /**
   * Tras un timeout la pestaña queda dentro de un `evaluate` que nunca vuelve:
   * reutilizarla arrastraria el bloqueo a las piezas siguientes del mismo job.
   * Se abre una limpia y la atascada se cierra en segundo plano.
   */
  async function resetPage(): Promise<void> {
    const wedged = page;
    page = await context.newPage();
    void wedged
      .close({ runBeforeUnload: false })
      .catch(() => undefined);
  }

  return {
    async render(job, task) {
      const targets = options.resolvePlan(task.piece);
      if (!targets) {
        throw new EngineError({
          code: "NOT_IMPLEMENTED",
          cause: `El renderer "${task.piece.renderer}" no esta implementado en este paso.`,
          solution: "Completa la fase correspondiente antes de reintentar.",
          retryable: false,
          taskStatus: "blocked",
        });
      }

      const artifacts: RenderArtifact[] = [];
      for (const target of targets) {
        const guard = hardTimeout(captureTimeoutMs);
        try {
          artifacts.push(
            await Promise.race([
              captureTarget(page, job, task, target, options.baseUrl),
              guard.promise,
            ]),
          );
        } catch (error: unknown) {
          if (error instanceof CaptureTimeout) {
            await resetPage();
            throw new EngineError({
              code: "PLAYWRIGHT_CAPTURE_TIMEOUT",
              cause: `La captura de "${target.variant}" supero el techo de ${captureTimeoutMs} ms.`,
              solution:
                "Suele ser una foto o una fuente que no termina de cargar: revisa los assets de la propiedad y reintenta.",
              retryable: true,
            });
          }
          throw new EngineError({
            code: "PLAYWRIGHT_CAPTURE_FAILED",
            cause: `No se pudo capturar la variante "${target.variant}".`,
            solution:
              "Comprueba el preview, los assets y la instalacion de Chromium; despues reintenta.",
            retryable: true,
            technicalDetails:
              error instanceof Error ? error.message : String(error),
          });
        } finally {
          guard.cancel();
        }
      }
      return artifacts;
    },

    async close() {
      try {
        await context.close();
      } finally {
        await browser.close();
      }
    },
  };
}

export function createPlaywrightRenderer(
  options: PlaywrightRendererOptions,
): RendererPort {
  const allowedHost = new URL(options.baseUrl).hostname;

  return {
    async open() {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1080, height: 1920 },
        deviceScaleFactor: 1,
        locale: "es-ES",
        timezoneId: "Europe/Madrid",
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      await context.route("**/*", async (route) => {
        const requestUrl = new URL(route.request().url());
        if (
          requestUrl.protocol === "data:" ||
          requestUrl.hostname === allowedHost ||
          requestUrl.hostname === "127.0.0.1" ||
          requestUrl.hostname === "localhost"
        ) {
          await route.continue();
          return;
        }
        await route.abort("blockedbyclient");
      });
      context.setDefaultTimeout(PLAYWRIGHT_OPERATION_TIMEOUT_MS);
      context.setDefaultNavigationTimeout(PLAYWRIGHT_OPERATION_TIMEOUT_MS);
      return createSession(browser, context, options);
    },
  };
}
