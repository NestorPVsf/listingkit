/**
 * Helpers compartidos por los E2E de render (Fase 4.1, TDD).
 *
 * CONTRATO DE INVOCACIÓN DEL ENGINE asumido por estos tests — AÚN NO EXISTE,
 * lo define este archivo siguiendo el árbol de rutas de plan.md y los
 * contratos de docs/architecture/niche-engine.md. Los implementadores deben
 * construir estas 4 rutas (Route Handlers de Next):
 *
 * 1. `POST /api/assets`
 *    multipart/form-data: { file: Blob, kind: "image" }
 *    → 201 { id: string, kind: "image", mediaType: string, width: number,
 *             height: number, bytes: number, sha256: string }
 *    (= `AssetRef` del ADR, campo `storageKey`/`fileName` opcionales en la
 *    respuesta JSON pública).
 *
 * 2. `POST /api/properties`
 *    body: JSON válido según `propertyInputSchema` (niches/inmobiliaria/schema.ts)
 *    → 201 { id: string }  (revision inicial = 1)
 *
 * 3. `POST /api/properties/{propertyId}/generate`
 *    body: {} (usa `requestedPieceKeys` por defecto = todas las `enabledByDefault`)
 *    → 202 { jobId: string }
 *    Dispara `EnginePipeline.createBindings → createRenderJob → runRenderJob`
 *    (puede ejecutarse de forma síncrona en v1 de un solo worker, o async —
 *    por eso este helper hace polling).
 *
 * 4. `GET /api/render-jobs/{jobId}`
 *    → 200 `RenderJob` (contrato exacto de niche-engine.md): incluye
 *      `status` ("pending"|"rendering"|"done"|"partial"|"error") y
 *      `tasks: RenderTask[]`, cada uno con `piece.key`, `status`, `artifacts`.
 *    Este helper hace polling hasta que `status` sea "done" o "partial".
 *
 * 5. `GET /api/generated-pieces/{artifactId}/download`
 *    → 200 con el binario (`Content-Type` = `RenderArtifact.mediaType`).
 *    `{artifactId}` es el campo `RenderArtifact.id` de las tareas del job.
 */
import type { APIRequestContext } from "@playwright/test";

export type RenderTaskStatus =
  | "pending"
  | "rendering"
  | "done"
  | "error"
  | "blocked";

export interface RenderArtifactDto {
  readonly id: string;
  readonly pieceKey: string;
  readonly variant: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly width?: number;
  readonly height?: number;
}

export interface RenderTaskDto {
  readonly id: string;
  readonly piece: { readonly key: string };
  readonly status: RenderTaskStatus;
  readonly artifacts: readonly RenderArtifactDto[];
}

export interface RenderJobDto {
  readonly id: string;
  readonly status: "pending" | "rendering" | "done" | "partial" | "error";
  readonly tasks: readonly RenderTaskDto[];
}

export async function createDemoProperty(
  request: APIRequestContext,
  payload: unknown,
): Promise<string> {
  const response = await request.post("/api/properties", { data: payload });
  if (!response.ok()) {
    throw new Error(
      `POST /api/properties falló (${response.status()}): ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { id: string };
  return body.id;
}

export async function triggerGenerate(
  request: APIRequestContext,
  propertyId: string,
): Promise<string> {
  const response = await request.post(
    `/api/properties/${propertyId}/generate`,
    { data: {} },
  );
  if (!response.ok()) {
    throw new Error(
      `POST /api/properties/${propertyId}/generate falló (${response.status()}): ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { jobId: string };
  return body.jobId;
}

export async function pollRenderJob(
  request: APIRequestContext,
  jobId: string,
  { timeoutMs = 60_000, intervalMs = 1_000 } = {},
): Promise<RenderJobDto> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await request.get(`/api/render-jobs/${jobId}`);
    if (!response.ok()) {
      throw new Error(
        `GET /api/render-jobs/${jobId} falló (${response.status()})`,
      );
    }
    const job = (await response.json()) as RenderJobDto;
    if (job.status === "done" || job.status === "partial" || job.status === "error") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timeout esperando RenderJob ${jobId}`);
}

export function findTask(
  job: RenderJobDto,
  pieceKey: string,
): RenderTaskDto {
  const task = job.tasks.find((candidate) => candidate.piece.key === pieceKey);
  if (!task) {
    throw new Error(`El RenderJob no contiene la pieza "${pieceKey}"`);
  }
  return task;
}

export async function downloadArtifact(
  request: APIRequestContext,
  artifactId: string,
): Promise<Buffer> {
  const response = await request.get(
    `/api/generated-pieces/${artifactId}/download`,
  );
  if (!response.ok()) {
    throw new Error(
      `GET /api/generated-pieces/${artifactId}/download falló (${response.status()})`,
    );
  }
  return response.body();
}
