import { readFile } from "node:fs/promises";
import path from "node:path";
import { getApplication } from "@/lib/bootstrap/create-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PackageRouteContext {
  readonly params: Promise<{ readonly jobId: string }>;
}

export async function GET(
  _request: Request,
  context: PackageRouteContext,
): Promise<Response> {
  const { jobId } = await context.params;
  const application = getApplication();
  const job = await application.engine.getRenderJob(jobId);

  if (!job) {
    return Response.json({ error: "RENDER_JOB_NOT_FOUND" }, { status: 404 });
  }

  // `job.status` agregado se escribe DESPUÉS de que la última tarea individual
  // se guarda como "done" (ver create-engine.ts runRenderJob): hay una
  // ventana breve en la que todas las tareas ya están resueltas pero el campo
  // `status` del job todavía dice "rendering". La UI hace polling por tarea y
  // puede habilitar la descarga en ese instante — comprobar la disponibilidad
  // real por tarea evita un 425 falso justo ahí.
  const tasksPending =
    job.tasks.length === 0 ||
    job.tasks.some((task) => task.status === "pending" || task.status === "rendering");

  if (tasksPending && (job.status === "pending" || job.status === "rendering")) {
    return Response.json({ error: "RENDER_JOB_NOT_READY" }, { status: 425 });
  }

  if (job.status === "error" && job.tasks.every((task) => task.status !== "done")) {
    return Response.json({ error: "RENDER_JOB_FAILED" }, { status: 409 });
  }

  try {
    const pkg = await application.engine.createPackage(jobId);
    const zipBuffer = await readFile(path.resolve(process.cwd(), pkg.storageKey));

    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": pkg.mediaType,
        "Content-Disposition": `attachment; filename="${pkg.fileName}"`,
        "Content-Length": String(pkg.bytes),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "PACKAGE_BUILD_FAILED" }, { status: 409 });
  }
}
