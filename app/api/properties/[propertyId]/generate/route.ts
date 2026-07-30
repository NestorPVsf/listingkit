import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { RenderRequest } from "@/lib/engine/contracts";
import {
  getApplication,
  RenderQueueError,
  type RenderSlotReservation,
} from "@/lib/bootstrap/create-app";
import { getStoredAsset } from "@/lib/infrastructure/files/local-asset-store";
import { prisma } from "@/lib/prisma";
import { storedPropertyToEntityInput } from "@/niches/inmobiliaria/persistence/property-mapper";

export const runtime = "nodejs";
export const maxDuration = 120;

interface GenerateRouteContext {
  readonly params: Promise<{ readonly propertyId: string }>;
}

export async function POST(
  _request: Request,
  context: GenerateRouteContext,
): Promise<Response> {
  const { propertyId } = await context.params;
  const row = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { photos: { orderBy: { order: "asc" } } },
  });
  if (!row) {
    return Response.json({ error: "PROPERTY_NOT_FOUND" }, { status: 404 });
  }

  const application = getApplication();

  // F-08: el hueco se reserva ANTES de crear el job, para no dejar filas
  // huerfanas cuando se rechaza el duplicado.
  let reservation: RenderSlotReservation;
  try {
    reservation = application.reserveRenderSlot(propertyId, []);
  } catch (error: unknown) {
    if (error instanceof RenderQueueError) {
      return Response.json(
        { error: error.code, jobId: error.activeJobId },
        { status: error.code === "RENDER_QUEUE_FULL" ? 429 : 409 },
      );
    }
    throw error;
  }

  try {
    const assets = await Promise.all(
      row.photos.map((photo) => getStoredAsset(photo.id)),
    );
    const input = storedPropertyToEntityInput(row, assets);
    const bindings = await application.engine.createBindings(input);
    const renderRequest: RenderRequest = {
      requestedPieceKeys: [],
      priority: "normal",
      correlationId: randomUUID(),
    };
    const job = await application.engine.createRenderJob(
      bindings,
      renderRequest,
    );

    after(() => reservation.run(job.id));
    return Response.json({ jobId: job.id }, { status: 202 });
  } catch (error: unknown) {
    reservation.release();
    return Response.json(
      {
        error: "RENDER_JOB_CREATE_FAILED",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
