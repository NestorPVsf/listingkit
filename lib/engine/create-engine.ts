import { randomUUID } from "node:crypto";
import type {
  BindingValue,
  EnginePipeline,
  EntityInput,
  Package,
  PieceDefinition,
  RenderError,
  RenderJob,
  RenderJobStatus,
  RenderRequest,
  RenderTask,
  TemplateBindings,
} from "./contracts";
import { EngineError, normalizeRenderFailure } from "./errors";
import type { BindingContext } from "./niche-config";
import type { NicheRegistry } from "./niche-registry";
import type { PackageBuilder } from "./ports/package-builder";
import type { RenderJobRepository } from "./ports/render-job-repository";
import type { RenderLock } from "./ports/render-lock";
import type { RendererPort } from "./ports/renderer";

export interface Clock {
  now(): string;
}

export interface CreateEngineOptions {
  readonly niches: NicheRegistry;
  readonly jobs: RenderJobRepository;
  readonly renderer: RendererPort;
  readonly packages: PackageBuilder;
  /**
   * F-05: exclusion entre PROCESOS. La cola de la raiz de composicion solo
   * protege dentro del suyo.
   */
  readonly locks: RenderLock;
  readonly clock: Clock;
  readonly createBindingContext: (
    input: Readonly<EntityInput>,
    now: string,
  ) => Promise<BindingContext>;
}

export interface Engine extends EnginePipeline {
  getRenderJob(jobId: string): Promise<RenderJob | null>;
}

function hasRequiredValue(
  variables: TemplateBindings["variables"],
  key: string,
): boolean {
  const value: BindingValue | undefined = variables[key];
  if (value === null || value === undefined || value === "") {
    return false;
  }
  return !Array.isArray(value) || value.length > 0;
}

function planningError(
  piece: PieceDefinition,
  bindings: TemplateBindings,
): RenderError | undefined {
  const missingKey = piece.requiredBindingKeys.find(
    (key) => !hasRequiredValue(bindings.variables, key),
  );
  if (missingKey) {
    return {
      code: "REQUIRED_BINDING_MISSING",
      cause: `Falta el binding obligatorio "${missingKey}".`,
      solution: "Completa el dato requerido antes de reintentar.",
      retryable: false,
    };
  }

  const finding = bindings.legalFindings.find(
    (candidate) =>
      piece.blocksOnLegalSeverity.includes(candidate.severity) &&
      (!candidate.affectedPieceKeys ||
        candidate.affectedPieceKeys.includes(piece.key)),
  );
  if (finding) {
    return {
      code: finding.code,
      cause: finding.message,
      solution: finding.remediation,
      retryable: false,
    };
  }

  return undefined;
}

function finalJobStatus(tasks: readonly RenderTask[]): RenderJobStatus {
  // Una task todavia activa al cerrar el job significa que algo se perdio por
  // el camino (F-11): nunca puede contar como "done". `abandonActiveTasks` ya
  // las convierte en error antes de llegar aqui; esto es el cinturon.
  if (tasks.some((task) => task.status === "pending" || task.status === "rendering")) {
    return tasks.some((task) => task.status === "done") ? "partial" : "error";
  }
  const doneCount = tasks.filter((task) => task.status === "done").length;
  if (doneCount === tasks.length) {
    return "done";
  }
  if (doneCount > 0) {
    return "partial";
  }
  return "error";
}

/**
 * F-11: si el proceso muere despues de persistir una task como "rendering",
 * al reanudar el job el bucle la saltaba (solo ejecuta "pending") y quedaba
 * "rendering" para siempre — una pieza que la UI no podia ni completar ni
 * reintentar. La cola es serial y por proceso, asi que una task en "rendering"
 * al ARRANCAR un job solo puede ser huerfana: la devolvemos a "pending".
 */
function reclaimOrphanTasks(tasks: readonly RenderTask[]): RenderTask[] {
  return tasks.map((task) =>
    task.status === "rendering"
      ? { ...task, status: "pending", error: undefined, finishedAt: undefined }
      : task,
  );
}

/** Cierra como error retryable cualquier task que quede viva al terminar. */
function abandonActiveTasks(
  tasks: readonly RenderTask[],
  finishedAt: string,
): RenderTask[] {
  return tasks.map((task) =>
    task.status === "pending" || task.status === "rendering"
      ? {
          ...task,
          status: "error",
          finishedAt,
          error: {
            code: "RENDER_TASK_ABANDONED",
            cause: "La pieza quedo a medias: el proceso de render no la completo.",
            solution: "Reintenta esta pieza.",
            retryable: true,
          },
        }
      : task,
  );
}

/**
 * Vida del lease. Tiene que superar al job mas lento imaginable — 8 capturas a
 * 90 s de techo mas un video a 120 s — para que no caduque a media faena, y ser
 * lo bastante corto para que un proceso muerto no deje la entidad bloqueada
 * media jornada.
 */
const RENDER_LEASE_TTL_MS = 15 * 60_000;

export function createEngine(options: CreateEngineOptions): Engine {
  const createBindings = async (
    input: EntityInput,
  ): Promise<TemplateBindings> => {
    const runtime = options.niches.get(input.nicheId);
    const now = options.clock.now();
    const context = await options.createBindingContext(input, now);
    const prepared = await runtime.prepare(input, context);
    return prepared.bindings;
  };

  const createRenderJob = async (
    bindings: TemplateBindings,
    request: RenderRequest,
  ): Promise<RenderJob> => {
    const runtime = options.niches.get(bindings.nicheId);
    const requestedKeys =
      request.requestedPieceKeys.length > 0
        ? request.requestedPieceKeys
        : runtime.pieces
            .filter((piece) => piece.enabledByDefault)
            .map((piece) => piece.key);
    const selectedPieces = requestedKeys.map((key) => {
      const piece = runtime.pieces.find((candidate) => candidate.key === key);
      if (!piece) {
        throw new EngineError({
          code: "PIECE_NOT_AVAILABLE",
          cause: `La pieza "${key}" no existe en el catalogo activo.`,
          solution: "Solicita una clave incluida en el catalogo del nicho.",
          retryable: false,
        });
      }
      return piece;
    });
    const now = options.clock.now();
    const tasks: RenderTask[] = selectedPieces.map((piece) => {
      const error = planningError(piece, bindings);
      return {
        id: randomUUID(),
        piece,
        status: error ? "blocked" : "pending",
        attempt: 0,
        artifacts: [],
        error,
        finishedAt: error ? now : undefined,
      };
    });
    const job: RenderJob = {
      id: randomUUID(),
      nicheId: bindings.nicheId,
      entityId: bindings.entityId,
      entityRevision: bindings.entityRevision,
      status: "pending",
      request,
      bindings,
      tasks,
      createdAt: now,
      updatedAt: now,
    };
    await options.jobs.create(job);
    return job;
  };

  const runRenderJob = async (jobId: string): Promise<RenderJob> => {
    const initialJob = await options.jobs.get(jobId);
    if (!initialJob) {
      throw new EngineError({
        code: "RENDER_JOB_NOT_FOUND",
        cause: "No existe el trabajo solicitado.",
        solution: "Comprueba el identificador y vuelve a iniciar la generacion.",
        retryable: false,
      });
    }
    if (
      initialJob.status === "done" ||
      initialJob.status === "partial" ||
      initialJob.status === "error"
    ) {
      return initialJob;
    }

    // F-05: nadie mas puede estar renderizando esta entidad. Se pide ANTES de
    // marcar el job como "rendering" para no dejarlo en un estado que no es.
    const lockAdquirido = await options.locks.acquire(
      initialJob.entityId,
      initialJob.id,
      RENDER_LEASE_TTL_MS,
    );
    if (!lockAdquirido) {
      throw new EngineError({
        code: "ENTITY_RENDER_LOCKED",
        cause: "Otro trabajo esta generando piezas de esta entidad ahora mismo.",
        solution: "Espera a que termine y reintenta.",
        retryable: true,
      });
    }

    const renderingJob: RenderJob = {
      ...initialJob,
      status: "rendering",
      tasks: reclaimOrphanTasks(initialJob.tasks),
      updatedAt: options.clock.now(),
    };
    await options.jobs.save(renderingJob);

    const tasks = [...renderingJob.tasks];
    let session: Awaited<ReturnType<RendererPort["open"]>> | null = null;

    try {
      session = await options.renderer.open(renderingJob);

      for (const [index, task] of tasks.entries()) {
        if (task.status !== "pending") {
          continue;
        }
        const startedAt = options.clock.now();
        tasks[index] = {
          ...task,
          status: "rendering",
          attempt: task.attempt + 1,
          startedAt,
          error: undefined,
        };
        await options.jobs.save({
          ...renderingJob,
          tasks: [...tasks],
          updatedAt: startedAt,
        });

        try {
          const artifacts = await session.render(renderingJob, tasks[index]);
          tasks[index] = {
            ...tasks[index],
            status: "done",
            artifacts,
            finishedAt: options.clock.now(),
          };
        } catch (error: unknown) {
          const failure = normalizeRenderFailure(error);
          tasks[index] = {
            ...tasks[index],
            status: failure.status,
            error: failure.error,
            finishedAt: options.clock.now(),
          };
        }

        await options.jobs.save({
          ...renderingJob,
          tasks: [...tasks],
          updatedAt: options.clock.now(),
        });
      }
    } catch (error: unknown) {
      const failure = normalizeRenderFailure(error);
      const failedAt = options.clock.now();
      for (const [index, task] of tasks.entries()) {
        if (task.status === "pending" || task.status === "rendering") {
          tasks[index] = {
            ...task,
            status: failure.status,
            error: failure.error,
            finishedAt: failedAt,
          };
        }
      }
    } finally {
      await session?.close();
      // Se libera pase lo que pase: un lease retenido tras un fallo bloquearia
      // la entidad hasta que caducase.
      await options.locks.release(initialJob.entityId, initialJob.id);
    }

    const closedAt = options.clock.now();
    const finalTasks = abandonActiveTasks(tasks, closedAt);
    const completedJob: RenderJob = {
      ...renderingJob,
      status: finalJobStatus(finalTasks),
      tasks: finalTasks,
      updatedAt: closedAt,
    };
    await options.jobs.save(completedJob);
    return completedJob;
  };

  const createPackage = async (jobId: string): Promise<Package> => {
    const job = await options.jobs.get(jobId);
    if (!job) {
      throw new Error("RENDER_JOB_NOT_FOUND");
    }
    return options.packages.build(job);
  };

  return {
    createBindings,
    createRenderJob,
    runRenderJob,
    createPackage,
    getRenderJob: (jobId) => options.jobs.get(jobId),
  };
}
