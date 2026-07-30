import type { BrandBindings, EntityInput, RenderJob } from "@/lib/engine/contracts";
import { createEngine, type Engine } from "@/lib/engine/create-engine";
import { createPrismaRenderJobRepository } from "@/lib/infrastructure/db/render-job-repository.prisma";
import { jszipPackageBuilder } from "@/lib/infrastructure/package/jszip-package-builder";
import { createCompositeRenderer } from "@/lib/infrastructure/render/composite-renderer";
import { createEmailRenderer } from "@/lib/infrastructure/render/email-renderer";
import { createPlaywrightRenderer } from "@/lib/infrastructure/render/playwright-renderer";
import { createVideoRenderer } from "@/lib/infrastructure/render/video-renderer";
import { createV1TTSProvider } from "@/lib/infrastructure/tts/v1-tts-provider";
import { prisma } from "@/lib/prisma";
import brandPresetsData from "@/niches/inmobiliaria/brand-presets.json";
import {
  brandConfigSchema,
  brandPresetSchema,
  type BrandConfig,
  type BrandPreset,
} from "@/niches/inmobiliaria/brand.schema";
import { resolveInmobiliariaPreviewPlan } from "@/niches/inmobiliaria/render-plan";
import { loadVideoPieceData } from "@/niches/inmobiliaria/video/load-piece-data";
import { nicheRegistry } from "@/niches/registry";
import type { TTSMode } from "@/lib/engine/ports/tts-provider";

/**
 * F-08 de la review adversarial: la cola era una cadena de promesas sin techo
 * ni deduplicacion. Repetir el POST de generacion (un doble clic basta) creaba
 * un job nuevo por peticion y los encadenaba todos; con vídeo de por medio eso
 * ocupa la CPU durante horas y ademas deja jobs pendientes en base de datos.
 *
 * 8 trabajos activos es holgado para un solo operador —el caso de uso de v1—
 * y bajo para un bucle accidental.
 */
const MAX_ACTIVE_RENDER_JOBS = 8;

/**
 * F-11: la cola vive en memoria, asi que los jobs de un proceso muerto se
 * quedan "pending"/"rendering" para siempre y la UI los sondea sin fin. Al
 * arrancar cerramos los que llevan mas de este tiempo sin tocarse. Un job vivo
 * actualiza su fila en cada transicion de pieza (segundos), nunca 10 minutos.
 */
const STALE_JOB_AFTER_MS = 10 * 60_000;

export type RenderQueueRejectionCode =
  | "RENDER_JOB_DUPLICATED"
  | "RENDER_QUEUE_FULL";

export class RenderQueueError extends Error {
  readonly code: RenderQueueRejectionCode;
  readonly activeJobId?: string;

  constructor(code: RenderQueueRejectionCode, activeJobId?: string) {
    super(code);
    this.name = "RenderQueueError";
    this.code = code;
    this.activeJobId = activeJobId;
  }
}

/** Hueco reservado en la cola ANTES de crear el job en base de datos. */
export interface RenderSlotReservation {
  /** Encola el job ya creado. Libera el hueco al terminar. */
  run(jobId: string): Promise<RenderJob>;
  /** Libera el hueco sin encolar (el job no llego a crearse). */
  release(): void;
}

interface RenderQueue {
  tail: Promise<void>;
  /** clave de trabajo -> jobId (null mientras el job aun no existe). */
  readonly active: Map<string, string | null>;
}

export interface Application {
  readonly engine: Engine;
  /**
   * Reserva sitio para un trabajo. Lanza `RenderQueueError` si ya hay uno
   * equivalente en curso o si la cola esta llena.
   */
  reserveRenderSlot(
    entityId: string,
    requestedPieceKeys: readonly string[],
  ): RenderSlotReservation;
  enqueueRenderJob(jobId: string): Promise<RenderJob>;
}

/**
 * Dos peticiones son "el mismo trabajo" si tocan la misma entidad y el mismo
 * conjunto de piezas. Lista vacia = catalogo por defecto completo.
 */
function slotKey(
  entityId: string,
  requestedPieceKeys: readonly string[],
): string {
  const pieces =
    requestedPieceKeys.length > 0
      ? [...requestedPieceKeys].sort().join(",")
      : "*";
  return `${entityId}::${pieces}`;
}

type RuntimeGlobal = typeof globalThis & {
  __inmoApplication?: Application;
  __inmoRenderQueue?: RenderQueue;
};

const runtimeGlobal = globalThis as RuntimeGlobal;

function videoTtsMode(): TTSMode {
  const configured = process.env.VIDEO_TTS_MODE ?? "manual-upload";
  if (
    configured === "local" ||
    configured === "api-env" ||
    configured === "manual-upload" ||
    configured === "none"
  ) {
    return configured;
  }
  throw new Error(`VIDEO_TTS_MODE_INVALID:${configured}`);
}

function defaultPreset(): BrandPreset {
  const presets = (brandPresetsData as { presets: unknown[] }).presets;
  return brandPresetSchema.parse(
    presets.find(
      (candidate) =>
        typeof candidate === "object" &&
        candidate !== null &&
        "esDefault" in candidate &&
        candidate.esDefault === true,
    ),
  );
}

function presetBindings(preset: BrandPreset): BrandBindings {
  return {
    name: preset.nombre,
    logoAssetId: "",
    colors: {
      primary: preset.colores.primary,
      secondary: preset.colores.secondary,
      background: preset.colores.background,
      text: preset.colores.text,
    },
    fonts: {
      heading: preset.tipografia.display.familia,
      body: preset.tipografia.body.familia,
    },
    contact: {},
  };
}

function configBindings(config: BrandConfig): BrandBindings {
  return {
    name: config.nombre,
    logoAssetId: config.logo,
    colors: {
      primary: config.colores.primary,
      secondary: config.colores.secondary,
      background: config.colores.background,
      text: config.colores.text,
    },
    fonts: {
      heading: config.tipografia.display.familia,
      body: config.tipografia.body.familia,
    },
    contact: {
      website: config.web,
      phone: config.telefono,
      email: config.email,
      instagram: config.instagram,
    },
  };
}

async function resolveBrandBindings(
  input: Readonly<EntityInput>,
): Promise<BrandBindings> {
  const row = await prisma.property.findUnique({
    where: { id: input.entityId },
    include: { brand: true },
  });
  if (!row?.brand) {
    return presetBindings(defaultPreset());
  }

  const config = brandConfigSchema.parse({
    nombre: row.brand.nombre,
    logo: row.brand.logo,
    colores: row.brand.colores as BrandConfig["colores"],
    tipografia: row.brand.tipografia as BrandConfig["tipografia"],
    web: row.brand.web ?? undefined,
    telefono: row.brand.telefono ?? undefined,
    email: row.brand.email ?? undefined,
    instagram: row.brand.instagram ?? undefined,
    ctaHabitual: row.brand.ctaHabitual ?? undefined,
  });
  return configBindings(config);
}

function createApplication(): Application {
  const jobs = createPrismaRenderJobRepository();
  const baseUrl = process.env.RENDER_BASE_URL ?? "http://localhost:3000";
  const playwrightRenderer = createPlaywrightRenderer({
    baseUrl,
    resolvePlan: resolveInmobiliariaPreviewPlan,
  });
  const videoRenderer = createVideoRenderer({
    resolveStoryboard: (job) => loadVideoPieceData(job.entityId),
    ttsProvider: createV1TTSProvider({ mode: videoTtsMode() }),
  });
  const engine = createEngine({
    niches: nicheRegistry,
    jobs,
    renderer: createCompositeRenderer({
      pdf: playwrightRenderer,
      image: playwrightRenderer,
      email: createEmailRenderer({ baseUrl }),
      video: videoRenderer,
    }),
    packages: jszipPackageBuilder,
    clock: {
      now: () => new Date().toISOString(),
    },
    createBindingContext: async (input, now) => ({
      locale: input.locale,
      now,
      brand: await resolveBrandBindings(input),
    }),
  });
  const queue =
    runtimeGlobal.__inmoRenderQueue ??
    { tail: Promise.resolve(), active: new Map<string, string | null>() };
  runtimeGlobal.__inmoRenderQueue = queue;

  // Fail-open a proposito: que la reconciliacion falle no puede impedir que la
  // aplicacion arranque.
  void jobs
    .reclaimStale(new Date(Date.now() - STALE_JOB_AFTER_MS).toISOString())
    .catch(() => undefined);

  function enqueue(jobId: string): Promise<RenderJob> {
    const execution = queue.tail
      .catch(() => undefined)
      .then(() => engine.runRenderJob(jobId));
    queue.tail = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }

  return {
    engine,

    reserveRenderSlot(entityId, requestedPieceKeys) {
      const key = slotKey(entityId, requestedPieceKeys);
      const activeJobId = queue.active.get(key);
      if (activeJobId !== undefined) {
        throw new RenderQueueError(
          "RENDER_JOB_DUPLICATED",
          activeJobId ?? undefined,
        );
      }
      if (queue.active.size >= MAX_ACTIVE_RENDER_JOBS) {
        throw new RenderQueueError("RENDER_QUEUE_FULL");
      }
      queue.active.set(key, null);

      let released = false;
      const release = (): void => {
        if (released) return;
        released = true;
        queue.active.delete(key);
      };

      return {
        release,
        run(jobId) {
          queue.active.set(key, jobId);
          const execution = enqueue(jobId);
          queue.tail = execution.then(
            () => release(),
            () => release(),
          );
          return execution;
        },
      };
    },

    enqueueRenderJob: enqueue,
  };
}

export function getApplication(): Application {
  runtimeGlobal.__inmoApplication ??= createApplication();
  return runtimeGlobal.__inmoApplication;
}
