import type { Prisma } from "@prisma/client";
import type {
  RenderJob,
  RenderRequest,
  RenderTask,
  TemplateBindings,
} from "@/lib/engine/contracts";
import type { RenderJobRepository } from "@/lib/engine/ports/render-job-repository";
import { prisma } from "@/lib/prisma";

function toInputJson(value: unknown): Prisma.InputJsonValue {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  return parsed as Prisma.InputJsonValue;
}

function fromStoredJson<T>(value: Prisma.JsonValue): T {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  return parsed as T;
}

function firstTaskError(job: Readonly<RenderJob>) {
  return job.tasks.find((task) => task.error)?.error;
}

export function createPrismaRenderJobRepository(): RenderJobRepository {
  return {
    async create(job) {
      const error = firstTaskError(job);
      await prisma.renderJob.create({
        data: {
          id: job.id,
          propertyId: job.entityId,
          nicheId: job.nicheId,
          entityRevision: job.entityRevision,
          status: job.status,
          request: toInputJson(job.request),
          bindings: toInputJson(job.bindings),
          tasks: toInputJson(job.tasks),
          errorCode: error?.code,
          errorCause: error?.cause,
          errorSolution: error?.solution,
          retryable: error?.retryable ?? false,
          errorTechnicalDetails: error?.technicalDetails,
        },
      });
    },

    async get(jobId) {
      const row = await prisma.renderJob.findUnique({ where: { id: jobId } });
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        nicheId: row.nicheId,
        entityId: row.propertyId,
        entityRevision: row.entityRevision,
        status: row.status as RenderJob["status"],
        request: fromStoredJson<RenderRequest>(row.request),
        bindings: fromStoredJson<TemplateBindings>(row.bindings),
        tasks: fromStoredJson<readonly RenderTask[]>(row.tasks),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    },

    async save(job) {
      const error = firstTaskError(job);
      const artifactWrites = job.tasks.flatMap((task) =>
        task.artifacts.map((artifact) =>
          prisma.generatedPiece.upsert({
            where: { id: artifact.id },
            create: {
              id: artifact.id,
              propertyId: job.entityId,
              pieceKey: artifact.pieceKey,
              path: artifact.storageKey,
              metadata: artifact.metadata
                ? toInputJson(artifact.metadata)
                : undefined,
            },
            update: {
              path: artifact.storageKey,
              pieceKey: artifact.pieceKey,
              metadata: artifact.metadata
                ? toInputJson(artifact.metadata)
                : undefined,
            },
          }),
        ),
      );

      await prisma.$transaction([
        prisma.renderJob.update({
          where: { id: job.id },
          data: {
            status: job.status,
            request: toInputJson(job.request),
            bindings: toInputJson(job.bindings),
            tasks: toInputJson(job.tasks),
            errorCode: error?.code ?? null,
            errorCause: error?.cause ?? null,
            errorSolution: error?.solution ?? null,
            retryable: error?.retryable ?? false,
            errorTechnicalDetails: error?.technicalDetails ?? null,
          },
        }),
        ...artifactWrites,
      ]);
    },

    async reclaimStale(staleBefore) {
      const abandoned = await prisma.renderJob.findMany({
        where: {
          status: { in: ["pending", "rendering"] },
          updatedAt: { lt: new Date(staleBefore) },
        },
        select: { id: true, tasks: true },
      });
      if (abandoned.length === 0) {
        return 0;
      }

      const abandonedError = {
        code: "RENDER_JOB_ABANDONED",
        cause:
          "El proceso que generaba estas piezas se detuvo antes de terminar.",
        solution: "Vuelve a generar las piezas que falten.",
        retryable: true,
      };

      await prisma.$transaction(
        abandoned.map((row) => {
          const tasks = fromStoredJson<readonly RenderTask[]>(row.tasks).map(
            (task) =>
              task.status === "pending" || task.status === "rendering"
                ? { ...task, status: "error" as const, error: abandonedError }
                : task,
          );
          const status = tasks.some((task) => task.status === "done")
            ? "partial"
            : "error";
          return prisma.renderJob.update({
            where: { id: row.id },
            data: {
              status,
              tasks: toInputJson(tasks),
              errorCode: abandonedError.code,
              errorCause: abandonedError.cause,
              errorSolution: abandonedError.solution,
              retryable: true,
            },
          });
        }),
      );
      return abandoned.length;
    },
  };
}
