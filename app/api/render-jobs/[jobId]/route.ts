import type { RenderJob } from "@/lib/engine/contracts";
import { getApplication } from "@/lib/bootstrap/create-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RenderJobRouteContext {
  readonly params: Promise<{ readonly jobId: string }>;
}

/**
 * DTO publico del job (F-10 de la review adversarial): `technicalDetails`
 * arrastra el stderr crudo de FFmpeg/Playwright, con rutas locales del disco y
 * metadatos del fichero de audio que subio el usuario. El diagnostico completo
 * sigue en la fila `RenderJob.errorTechnicalDetails` para soporte; la API solo
 * expone codigo, causa y solucion, que es lo que la UI necesita.
 */
function toPublicJob(job: Readonly<RenderJob>): RenderJob {
  return {
    ...job,
    tasks: job.tasks.map((task) => {
      if (!task.error) return task;
      const { technicalDetails: _omitted, ...publicError } = task.error;
      return { ...task, error: publicError };
    }),
  };
}

export async function GET(
  _request: Request,
  context: RenderJobRouteContext,
): Promise<Response> {
  const { jobId } = await context.params;
  const job = await getApplication().engine.getRenderJob(jobId);
  if (!job) {
    return Response.json({ error: "RENDER_JOB_NOT_FOUND" }, { status: 404 });
  }
  return Response.json(toPublicJob(job), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
