/**
 * Lee el texto editado por el usuario (GeneratedPiece.editableText.edited)
 * de la pieza (propertyId, pieceKey) y lo aplica como titular.
 *
 * Unico punto de resolucion del override — compartido por TODOS los
 * consumidores que renderizan piezas (preview Playwright, email, ZIP) para
 * que ninguno se desincronice del otro. El campo `headline` es el unico
 * visible en TODAS las piezas de imagen/PDF/email, asi que un unico string
 * editado se refleja en cualquiera de ellas al regenerar (ver UI:
 * "Texto de la pieza (titular)" en PropertyDetail.tsx).
 *
 * OJO (bug real detectado 2026-07-30 al endurecer el E2E de regeneracion
 * parcial): cada regenerate-piece crea una GeneratedPiece NUEVA (id random,
 * ver playwright-renderer.ts/render-job-repository.prisma.ts `save()` ->
 * upsert.create) SIN editableText. Un simple `findFirst orderBy createdAt
 * desc` encuentra esa fila nueva en vez de la que tiene el override en
 * cuanto el render termina — el texto editado sobrevivia solo mientras
 * Playwright navegaba a /preview A MITAD del render (la fila nueva aun no
 * existia), pero se perdia en cualquier lectura posterior (recargar
 * preview, descargar el ZIP). Por eso se busca la fila mas reciente que
 * REALMENTE tenga editableText, no la mas reciente a secas.
 */
import { prisma } from "@/lib/prisma";
import type { PieceTexts } from "./templates/types";

/** Cuantas GeneratedPiece recientes de una pieza se inspeccionan buscando
 * un override — en la practica el editado siempre esta a 0-2 renders de
 * distancia; 20 da margen de sobra sin traer el historial completo. */
const OVERRIDE_LOOKUP_WINDOW = 20;

export async function resolveTextOverride(
  propertyId: string,
  pieceKey: string,
): Promise<string | undefined> {
  const rows = await prisma.generatedPiece.findMany({
    where: { propertyId, pieceKey },
    orderBy: { createdAt: "desc" },
    take: OVERRIDE_LOOKUP_WINDOW,
    select: { editableText: true },
  });
  for (const row of rows) {
    const edited =
      typeof row.editableText === "object" && row.editableText !== null
        ? (row.editableText as { edited?: unknown }).edited
        : undefined;
    if (typeof edited === "string" && edited.trim().length > 0) {
      return edited;
    }
  }
  return undefined;
}

export async function applyHeadlineOverride<T extends Pick<PieceTexts, "headline">>(
  texts: T,
  propertyId: string,
  pieceKey: string,
): Promise<T> {
  const edited = await resolveTextOverride(propertyId, pieceKey);
  return edited === undefined ? texts : { ...texts, headline: edited };
}
