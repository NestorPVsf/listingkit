/**
 * Regresion de F-08 y F-11 (review adversarial).
 *
 * F-08 — la cola era una cadena de promesas sin techo ni deduplicacion: cada
 * POST creaba un job y lo encadenaba, asi que repetir la peticion (un doble
 * clic basta) ocupaba la CPU durante horas rehaciendo el mismo trabajo.
 *
 * F-11 — si el proceso moria con una task en "rendering", al reanudar el job
 * el bucle la saltaba (solo ejecuta "pending") y quedaba en ese estado para
 * siempre: una pieza que la UI no podia completar ni reintentar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "@/lib/engine/create-engine";
import { createInMemoryRenderLock } from "@/lib/engine/ports/render-lock";
import type {
  RenderArtifact,
  RenderJob,
  TemplateBindings,
} from "@/lib/engine/contracts";
import type { RenderJobRepository } from "@/lib/engine/ports/render-job-repository";
import type { NicheRegistry } from "@/lib/engine/niche-registry";
import type { RendererPort } from "@/lib/engine/ports/renderer";

const NOW = "2026-07-30T10:00:00.000Z";

function bindings(): TemplateBindings {
  return {
    nicheId: "test",
    nicheVersion: "1.0.0",
    entityId: "entity-1",
    entityRevision: 1,
    locale: "es-ES",
    variables: {},
    brand: {
      name: "Test",
      logoAssetId: "",
      colors: {
        primary: "#000000",
        secondary: "#000000",
        background: "#ffffff",
        text: "#000000",
      },
      fonts: { heading: "Inter", body: "Inter" },
      contact: {},
    },
    assets: [],
    legalFindings: [],
    createdAt: NOW,
  };
}

/** Repositorio en memoria: el engine no debe necesitar nada mas. */
function memoryRepository(seed?: RenderJob): {
  readonly repository: RenderJobRepository;
  current(): RenderJob | null;
} {
  let stored: RenderJob | null = seed ?? null;
  return {
    current: () => stored,
    repository: {
      async create(job) {
        stored = job;
      },
      async get() {
        return stored;
      },
      async save(job) {
        stored = job;
      },
      async reclaimStale() {
        return 0;
      },
    },
  };
}

function engineFor(
  repository: RenderJobRepository,
  render: (jobId: string) => Promise<RenderArtifact[]>,
) {
  const pieces = [
    {
      key: "piece-a",
      renderer: "image" as const,
      enabledByDefault: true,
      requiredBindingKeys: [],
      blocksOnLegalSeverity: [],
    },
    {
      key: "piece-b",
      renderer: "image" as const,
      enabledByDefault: true,
      requiredBindingKeys: [],
      blocksOnLegalSeverity: [],
    },
  ];
  const renderer: RendererPort = {
    async open() {
      return {
        async render(job) {
          return render(job.id);
        },
        async close() {},
      };
    },
  };

  return createEngine({
    niches: {
      get: () => ({
        id: "test",
        version: "1.0.0",
        pieces,
        prepare: async () => ({ bindings: bindings() }),
      }),
    } as unknown as NicheRegistry,
    jobs: repository,
    renderer,
    packages: { build: async () => ({}) } as never,
    locks: createInMemoryRenderLock(),
    clock: { now: () => NOW },
    createBindingContext: async () => ({}) as never,
  });
}

function jobWithOrphanTask(): RenderJob {
  return {
    id: "job-orphan",
    nicheId: "test",
    entityId: "entity-1",
    entityRevision: 1,
    // Estado exacto que deja un proceso muerto a mitad de render.
    status: "rendering",
    request: { requestedPieceKeys: [], priority: "normal", correlationId: "c" },
    bindings: bindings(),
    tasks: [
      {
        id: "task-a",
        piece: {
          key: "piece-a",
          renderer: "image",
          enabledByDefault: true,
          requiredBindingKeys: [],
          blocksOnLegalSeverity: [],
        },
        status: "rendering",
        attempt: 1,
        artifacts: [],
        startedAt: NOW,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  } as unknown as RenderJob;
}

describe("F-11 — tasks huerfanas en 'rendering'", () => {
  it("reanuda una task huerfana en vez de saltarla para siempre", async () => {
    const { repository, current } = memoryRepository(jobWithOrphanTask());
    const rendered: string[] = [];
    const engine = engineFor(repository, async (jobId) => {
      rendered.push(jobId);
      return [];
    });

    const job = await engine.runRenderJob("job-orphan");

    expect(rendered).toHaveLength(1);
    expect(job.tasks[0]?.status).toBe("done");
    expect(job.status).toBe("done");
    expect(current()?.status).toBe("done");
  });

  it("nunca deja una task activa al cerrar el job, ni lo marca 'done'", async () => {
    const orphan = jobWithOrphanTask();
    const { repository } = memoryRepository(orphan);
    // El renderer revienta al abrir sesion: el camino por el que antes
    // quedaban tasks colgadas.
    const engine = createEngineThatFailsToOpen(repository);

    const job = await engine.runRenderJob("job-orphan");

    expect(job.tasks.every((task) => task.status !== "rendering")).toBe(true);
    expect(job.tasks.every((task) => task.status !== "pending")).toBe(true);
    expect(job.status).not.toBe("done");
    expect(job.tasks[0]?.error?.retryable).toBe(true);
  });
});

function createEngineThatFailsToOpen(repository: RenderJobRepository) {
  return createEngine({
    niches: {
      get: () => ({ id: "test", version: "1.0.0", pieces: [], prepare: async () => ({ bindings: bindings() }) }),
    } as unknown as NicheRegistry,
    jobs: repository,
    renderer: {
      async open() {
        throw new Error("CHROMIUM_DOWN");
      },
    },
    packages: { build: async () => ({}) } as never,
    locks: createInMemoryRenderLock(),
    clock: { now: () => NOW },
    createBindingContext: async () => ({}) as never,
  });
}

describe("F-08 — la cola no acepta trabajo infinito", () => {
  beforeEach(() => {
    vi.resetModules();
    // Cada test necesita su propia cola: vive en globalThis.
    delete (globalThis as { __inmoRenderQueue?: unknown }).__inmoRenderQueue;
    delete (globalThis as { __inmoApplication?: unknown }).__inmoApplication;
  });

  it("rechaza un segundo trabajo identico y devuelve el que ya corre", async () => {
    const { reserveRenderSlot, RenderQueueError } = await queueUnderTest();

    const first = reserveRenderSlot("prop-1", []);
    first.run("job-1");

    try {
      reserveRenderSlot("prop-1", []);
      throw new Error("deberia haber rechazado el duplicado");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(RenderQueueError);
      expect((error as { code: string }).code).toBe("RENDER_JOB_DUPLICATED");
      expect((error as { activeJobId?: string }).activeJobId).toBe("job-1");
    }
  });

  it("distingue trabajos por pieza: regenerar una pieza no choca con otra", async () => {
    const { reserveRenderSlot } = await queueUnderTest();

    reserveRenderSlot("prop-1", ["instagram-post"]).run("job-1");
    expect(() =>
      reserveRenderSlot("prop-1", ["instagram-story"]),
    ).not.toThrow();
  });

  it("corta con RENDER_QUEUE_FULL al superar el techo de trabajos activos", async () => {
    const { reserveRenderSlot } = await queueUnderTest();

    for (let index = 0; index < 8; index += 1) {
      reserveRenderSlot(`prop-${index}`, []).run(`job-${index}`);
    }

    try {
      reserveRenderSlot("prop-desbordado", []);
      throw new Error("deberia haber rechazado por cola llena");
    } catch (error: unknown) {
      expect((error as { code: string }).code).toBe("RENDER_QUEUE_FULL");
    }
  });

  it("libera el hueco cuando el job no llega a crearse", async () => {
    const { reserveRenderSlot } = await queueUnderTest();

    reserveRenderSlot("prop-1", []).release();
    expect(() => reserveRenderSlot("prop-1", [])).not.toThrow();
  });

  it("libera el hueco al terminar el render", async () => {
    const { reserveRenderSlot } = await queueUnderTest();

    await reserveRenderSlot("prop-1", []).run("job-1");
    // Un tick para que corra el .then() de liberacion encadenado.
    await new Promise((resolve) => setImmediate(resolve));

    expect(() => reserveRenderSlot("prop-1", [])).not.toThrow();
  });
});

/**
 * `create-app` arrastra Prisma, Playwright y FFmpeg. Aqui solo interesa la
 * cola, asi que sustituimos el engine por uno que resuelve al instante.
 */
async function queueUnderTest() {
  vi.doMock("@/lib/engine/create-engine", () => ({
    createEngine: () => ({
      createBindings: async () => bindings(),
      createRenderJob: async () => ({}) as RenderJob,
      runRenderJob: async (jobId: string) => ({ id: jobId }) as RenderJob,
      createPackage: async () => ({}),
      getRenderJob: async () => null,
    }),
  }));
  vi.doMock("@/lib/infrastructure/db/render-job-repository.prisma", () => ({
    createPrismaRenderJobRepository: () => memoryRepository().repository,
  }));

  const appModule = await import("@/lib/bootstrap/create-app");
  const application = appModule.getApplication();
  return {
    reserveRenderSlot: application.reserveRenderSlot.bind(application),
    RenderQueueError: appModule.RenderQueueError,
  };
}
