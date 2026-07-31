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
import {
  assertPublicTextOverride,
  TextOverrideRejected,
} from "@/niches/inmobiliaria/validate-text-override";

export const runtime = "nodejs";
export const maxDuration = 120;

interface RegeneratePieceRouteContext {
  readonly params: Promise<{ readonly propertyId: string }>;
}

/**
 * Regenera UNA sola pieza de una propiedad (spec.md: "puede regenerar SOLO esa
 * pieza sin tocar las demas"). Crea un RenderJob nuevo con
 * `requestedPieceKeys: [pieceKey]` — el resto de piezas no se re-renderizan y
 * sus GeneratedPiece/artifacts quedan intactos.
 *
 * Body: { "pieceKey": "instagram-post" } (clave del catalogo, ver
 * niches/inmobiliaria/catalog.ts) y opcionalmente "textOverride" (string) que
 * se persiste en GeneratedPiece.editableText/metadata de la pieza para que el
 * render la use como texto editado por el usuario.
 *
 * → 202 { jobId }
 */
export async function POST(
  request: Request,
  context: RegeneratePieceRouteContext,
): Promise<Response> {
  const { propertyId } = await context.params;

  let pieceKey: string;
  let textOverride: string | undefined;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return Response.json({ error: "BODY_INVALID" }, { status: 400 });
    }
    const record = body as Record<string, unknown>;
    if (typeof record.pieceKey !== "string" || record.pieceKey.length === 0) {
      return Response.json({ error: "PIECE_KEY_REQUIRED" }, { status: 400 });
    }
    pieceKey = record.pieceKey;
    textOverride =
      typeof record.textOverride === "string" && record.textOverride.trim().length > 0
        ? record.textOverride
        : undefined;
  } catch {
    return Response.json({ error: "BODY_INVALID" }, { status: 400 });
  }

  const row = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { photos: { orderBy: { order: "asc" } } },
  });
  if (!row) {
    return Response.json({ error: "PROPERTY_NOT_FOUND" }, { status: 404 });
  }

  // Mismo guardarrail que POST .../piece-text (F-01): sin esto, este endpoint
  // era una segunda puerta para reintroducir la direccion privada saltandose
  // por completo `PublicPropertyView`, y ademas sin limite de tamaño.
  if (textOverride !== undefined) {
    try {
      textOverride = assertPublicTextOverride(textOverride, row);
    } catch (error: unknown) {
      if (error instanceof TextOverrideRejected) {
        return Response.json(
          { error: error.code, field: error.field },
          { status: 422 },
        );
      }
      throw error;
    }
  }

  const application = getApplication();

  // F-08: mismo hueco reservado que en /generate. Reintentar una pieza a
  // botonazos ya no encadena N renders identicos.
  let reservation: RenderSlotReservation;
  try {
    reservation = application.reserveRenderSlot(propertyId, [pieceKey]);
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
    // Persiste el texto editado ANTES de regenerar: el renderer de la pieza
    // lee el override mas reciente al componer los textos.
    let revision = row.revision;
    if (textOverride !== undefined) {
      const latestPiece = await prisma.generatedPiece.findFirst({
        where: { propertyId, pieceKey },
        orderBy: { createdAt: "desc" },
        select: { id: true, metadata: true },
      });
      if (latestPiece) {
        const previousMetadata =
          typeof latestPiece.metadata === "object" && latestPiece.metadata !== null
            ? (latestPiece.metadata as Record<string, unknown>)
            : {};
        // F-06: igual que POST .../piece-text, guardar el override sube la
        // revision. Y este job tiene que nacer con la revision NUEVA: es el
        // propio endpoint quien acaba de cambiar la propiedad, asi que
        // arrancarlo con la vieja lo condenaria a fallar el control de version.
        const [, actualizada] = await prisma.$transaction([
          prisma.generatedPiece.update({
            where: { id: latestPiece.id },
            data: {
              editableText: { edited: textOverride },
              metadata: { ...previousMetadata, textOverride },
            },
          }),
          prisma.property.update({
            where: { id: propertyId },
            data: { revision: { increment: 1 } },
            select: { revision: true },
          }),
        ]);
        revision = actualizada.revision;
      }
    }

    const assets = await Promise.all(
      row.photos.map((photo) => getStoredAsset(photo.id)),
    );
    const input = storedPropertyToEntityInput({ ...row, revision }, assets);
    const bindings = await application.engine.createBindings(input);
    const renderRequest: RenderRequest = {
      requestedPieceKeys: [pieceKey],
      priority: "retry",
      correlationId: randomUUID(),
    };
    const job = await application.engine.createRenderJob(bindings, renderRequest);

    after(() => reservation.run(job.id));
    return Response.json({ jobId: job.id }, { status: 202 });
  } catch (error: unknown) {
    reservation.release();
    return Response.json(
      {
        error: "PIECE_REGENERATE_FAILED",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
