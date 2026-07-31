import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface PhotoOrderRouteContext {
  readonly params: Promise<{ readonly propertyId: string }>;
}

const bodySchema = z.object({
  // Ids de PropertyPhoto en el nuevo orden (todos, sin duplicados).
  orderedPhotoIds: z.array(z.string().min(1)).min(1),
  // Nueva foto principal (debe estar en orderedPhotoIds).
  primaryPhotoId: z.string().min(1).optional(),
});

/**
 * Reordena las fotos de una propiedad y/o cambia la foto principal.
 * Actualiza PropertyPhoto.order y esMain, y Property.primaryPhotoAssetId.
 *
 * Body: { "orderedPhotoIds": ["id1","id2",...], "primaryPhotoId": "id1" }
 * → 200 { ok: true }
 */
export async function POST(
  request: Request,
  context: PhotoOrderRouteContext,
): Promise<Response> {
  const { propertyId } = await context.params;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "BODY_INVALID" }, { status: 400 });
  }

  const photos = await prisma.propertyPhoto.findMany({
    where: { propertyId },
    select: { id: true },
  });
  const ownedIds = new Set(photos.map((photo) => photo.id));

  if (
    parsed.orderedPhotoIds.length !== ownedIds.size ||
    parsed.orderedPhotoIds.some((id) => !ownedIds.has(id))
  ) {
    return Response.json(
      { error: "PHOTO_ORDER_MISMATCH" },
      { status: 400 },
    );
  }
  if (parsed.primaryPhotoId && !ownedIds.has(parsed.primaryPhotoId)) {
    return Response.json({ error: "PRIMARY_NOT_IN_GALLERY" }, { status: 400 });
  }

  const primaryId = parsed.primaryPhotoId;
  await prisma.$transaction([
    // Dos pasadas, y no por gusto: `@@unique([propertyId, order])` se comprueba
    // sentencia a sentencia, asi que asignar los ordenes definitivos de uno en
    // uno revienta en cuanto dos fotos se intercambian el sitio (la primera ya
    // quiere el hueco que la segunda todavia ocupa). Es decir: reordenar
    // fallaba en el caso mas normal de todos. Los negativos son un aparcadero
    // seguro porque ningun orden real lo es.
    ...parsed.orderedPhotoIds.map((id, index) =>
      prisma.propertyPhoto.update({
        where: { id },
        data: { order: -(index + 1) },
      }),
    ),
    ...parsed.orderedPhotoIds.map((id, index) =>
      prisma.propertyPhoto.update({
        where: { id },
        data: {
          order: index,
          // Si hay nueva principal, se marca esa y se desmarcan las demas;
          // si no, se conserva el esMain actual.
          ...(primaryId ? { esMain: id === primaryId } : {}),
        },
      }),
    ),
    // F-06: el orden de las fotos decide que foto sale en cada pieza, asi que
    // esto ES un cambio de version aunque solo se toquen filas de PropertyPhoto.
    // Va dentro de la misma transaccion: o cambia todo, o no cambia nada.
    prisma.property.update({
      where: { id: propertyId },
      data: {
        revision: { increment: 1 },
        ...(primaryId ? { primaryPhotoAssetId: primaryId } : {}),
      },
    }),
  ]);

  return Response.json({ ok: true }, { status: 200 });
}
