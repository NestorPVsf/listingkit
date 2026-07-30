import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  assertPublicTextOverride,
  MAX_TEXT_OVERRIDE_LENGTH,
  TextOverrideRejected,
} from "@/niches/inmobiliaria/validate-text-override";

export const runtime = "nodejs";

interface PieceTextRouteContext {
  readonly params: Promise<{ readonly propertyId: string }>;
}

const bodySchema = z.object({
  pieceKey: z.string().trim().min(1),
  text: z.string().trim().min(1).max(MAX_TEXT_OVERRIDE_LENGTH),
});

/**
 * Guarda el texto editado por el usuario de UNA pieza (sin regenerar todavia —
 * eso lo hace POST .../regenerate-piece). Lo persiste en la GeneratedPiece mas
 * reciente de (propertyId, pieceKey) en `editableText` (campo ya existente en
 * el schema Prisma, sin migracion) y en `metadata.textOverride` para que el
 * render lo recoja.
 *
 * Body: { "pieceKey": "instagram-post", "text": "..." }
 * → 200 { ok: true }
 */
export async function POST(
  request: Request,
  context: PieceTextRouteContext,
): Promise<Response> {
  const { propertyId } = await context.params;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "BODY_INVALID" }, { status: 400 });
  }

  // F-01: el texto editado a mano entra DESPUES de la proyeccion publica, asi
  // que es la unica via por la que la direccion privada puede volver a una
  // pieza. Se compara contra los valores privados de esta propiedad.
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { privateAddress: true, internalName: true },
  });
  if (!property) {
    return Response.json({ error: "PROPERTY_NOT_FOUND" }, { status: 404 });
  }

  let text: string;
  try {
    text = assertPublicTextOverride(parsed.text, property);
  } catch (error: unknown) {
    if (error instanceof TextOverrideRejected) {
      return Response.json(
        { error: error.code, field: error.field },
        { status: 422 },
      );
    }
    throw error;
  }

  const piece = await prisma.generatedPiece.findFirst({
    where: { propertyId, pieceKey: parsed.pieceKey },
    orderBy: { createdAt: "desc" },
    select: { id: true, metadata: true },
  });
  if (!piece) {
    return Response.json({ error: "PIECE_NOT_FOUND" }, { status: 404 });
  }

  const previousMetadata =
    typeof piece.metadata === "object" && piece.metadata !== null
      ? (piece.metadata as Record<string, unknown>)
      : {};

  await prisma.generatedPiece.update({
    where: { id: piece.id },
    data: {
      editableText: { edited: text },
      metadata: { ...previousMetadata, textOverride: text },
    },
  });

  return Response.json({ ok: true }, { status: 200 });
}
