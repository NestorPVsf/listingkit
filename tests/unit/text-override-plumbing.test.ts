/**
 * Fontaneria "editar texto de pieza -> regenerar -> el render usa el texto
 * editado" (Fase 5.3). Verificado por code-review 2026-07-30: el override se
 * guarda vía POST .../piece-text|regenerate-piece en
 * GeneratedPiece.editableText, pero ¿llega de verdad a la pieza que se
 * renderiza, o solo a ALGUNAS?
 *
 * Este test usa la SQLite real (misma DB que prisma/seed.ts, ver lib/prisma.ts)
 * — crea una Property + varias GeneratedPiece con un centinela ÚNICO en
 * `editableText`, y resuelve los textos EXACTAMENTE como lo hacen los
 * consumidores reales (no un mock de la lógica):
 *
 * - `applyHeadlineOverride` (niches/inmobiliaria/apply-text-override.ts) es
 *   el único punto de resolución — lo usan app/preview/[pieceId]/page.tsx
 *   (post, story, ficha, carrusel) y niches/inmobiliaria/email/load-piece-data.ts.
 * - `loadEmailPieceData` se llama completo (no solo el helper) para blindar
 *   contra que alguien vuelva a olvidar el wiring en ese archivo concreto —
 *   fue precisamente el punto que estaba roto antes de este fix (el email
 *   nunca pasa por app/preview, así que no heredaba el override).
 *
 * Limpieza: la Property se borra en `afterAll` (cascade se lleva sus
 * GeneratedPiece/PropertyPhoto) para no ensuciar prisma/dev.db entre runs.
 */
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { applyHeadlineOverride } from "@/niches/inmobiliaria/apply-text-override";
import { loadEmailPieceData } from "@/niches/inmobiliaria/email/load-piece-data";
import { generatePropertyTexts } from "@/niches/inmobiliaria/text-engine";
import { propertyTextBundleToPieceTexts } from "@/niches/inmobiliaria/piece-texts-adapter";
import type { PublicPropertyView } from "@/niches/inmobiliaria/public-view";
import { demoPropertyPayload } from "@/tests/fixtures/demo-property";
import type { Property as PrismaProperty } from "@prisma/client";

// Mismo mapeo Prisma -> PublicPropertyView que usan loadRealData
// (app/preview/[pieceId]/page.tsx) y loadEmailPieceData (niches/inmobiliaria/
// email/load-piece-data.ts) — duplicado aqui a proposito para no importar
// codigo de pagina de Next.js (next/navigation) dentro de un test de node.
function toView(property: PrismaProperty): PublicPropertyView {
  return {
    id: property.id,
    operation: property.operation as PublicPropertyView["operation"],
    propertyType: property.propertyType as PublicPropertyView["propertyType"],
    price: property.price,
    currency: property.currency as PublicPropertyView["currency"],
    pricePeriod: (property.pricePeriod ?? undefined) as PublicPropertyView["pricePeriod"],
    city: property.city,
    district: property.district ?? undefined,
    publicAddress: property.publicAddress ?? undefined,
    builtAreaM2: property.builtAreaM2,
    usableAreaM2: property.usableAreaM2 ?? undefined,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    floor: property.floor ?? undefined,
    elevator: property.elevator,
    terrace: property.terrace,
    balcony: property.balcony,
    garage: property.garage,
    storageRoom: property.storageRoom,
    pool: property.pool,
    garden: property.garden,
    condition: property.condition as PublicPropertyView["condition"],
    constructionYear: property.constructionYear ?? undefined,
    description: property.description,
    highlights: (property.highlights as string[]) ?? [],
    cta: property.cta,
    listingUrl: property.listingUrl ?? undefined,
    agent: { name: property.agentName, phone: property.agentPhone, email: property.agentEmail },
    agency: { name: property.agencyName, website: property.agencyWebsite ?? undefined },
    photoAssetIds: [],
    primaryPhotoAssetId: property.primaryPhotoAssetId ?? "",
  };
}

const SENTINEL_POST = `SENTINEL-POST-${randomUUID()}`;
const SENTINEL_EMAIL = `SENTINEL-EMAIL-${randomUUID()}`;
const SENTINEL_CAROUSEL = `SENTINEL-CAROUSEL-${randomUUID()}`;

async function createTestProperty(): Promise<string> {
  const payload = demoPropertyPayload({
    photoAssetIds: [],
    primaryPhotoAssetId: "",
  });
  const created = await prisma.property.create({
    data: {
      internalName: payload.internalName,
      operation: payload.operation,
      propertyType: payload.propertyType,
      price: payload.price,
      currency: payload.currency,
      city: payload.city,
      district: payload.district,
      publicAddress: payload.publicAddress,
      privateAddress: payload.privateAddress,
      builtAreaM2: payload.builtAreaM2,
      usableAreaM2: payload.usableAreaM2,
      bedrooms: payload.bedrooms,
      bathrooms: payload.bathrooms,
      floor: payload.floor,
      elevator: payload.elevator,
      terrace: payload.terrace,
      balcony: payload.balcony,
      garage: payload.garage,
      storageRoom: payload.storageRoom,
      pool: payload.pool,
      garden: payload.garden,
      condition: payload.condition,
      constructionYear: payload.constructionYear,
      energyCertificateRating: payload.energyCertificate?.rating,
      description: payload.description,
      highlights: payload.highlights,
      cta: payload.cta,
      listingUrl: payload.listingUrl,
      agentName: payload.agent.name,
      agentPhone: payload.agent.phone,
      agentEmail: payload.agent.email,
      agencyName: payload.agency.name,
      agencyWebsite: payload.agency.website,
    },
  });
  return created.id;
}

async function saveOverride(
  propertyId: string,
  pieceKey: string,
  editedText: string,
): Promise<void> {
  // Misma forma que escriben app/api/properties/[propertyId]/piece-text/route.ts
  // y regenerate-piece/route.ts: GeneratedPiece.editableText = { edited }.
  await prisma.generatedPiece.create({
    data: {
      propertyId,
      pieceKey,
      path: `output/${propertyId}/${pieceKey}.placeholder`,
      editableText: { edited: editedText },
    },
  });
}

describe("Fontaneria de override de texto de pieza", () => {
  const createdPropertyIds: string[] = [];

  async function newTestProperty(): Promise<string> {
    const id = await createTestProperty();
    createdPropertyIds.push(id);
    return id;
  }

  afterAll(async () => {
    for (const id of createdPropertyIds) {
      await prisma.property.delete({ where: { id } }).catch(() => undefined);
    }
  });

  it("propaga el override al headline de un post y NO contamina otras piezas", async () => {
    const propertyId = await newTestProperty();
    await saveOverride(propertyId, "instagram-post", SENTINEL_POST);

    const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
    const view = toView(property);
    const baseTexts = propertyTextBundleToPieceTexts(generatePropertyTexts(view), view);

    const postTexts = await applyHeadlineOverride(baseTexts, propertyId, "instagram-post");
    expect(postTexts.headline).toBe(SENTINEL_POST);

    // Otra pieza de la MISMA propiedad sin override propio no debe heredarlo.
    const storyTexts = await applyHeadlineOverride(baseTexts, propertyId, "instagram-story");
    expect(storyTexts.headline).not.toBe(SENTINEL_POST);
    expect(storyTexts.headline).toBe(baseTexts.headline);
  });

  it("propaga el override al carrusel de forma independiente del post", async () => {
    const propertyId = await newTestProperty();
    await saveOverride(propertyId, "instagram-post", SENTINEL_POST);
    await saveOverride(propertyId, "instagram-carousel", SENTINEL_CAROUSEL);

    const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
    const view = toView(property);
    const baseTexts = propertyTextBundleToPieceTexts(generatePropertyTexts(view), view);

    const carouselTexts = await applyHeadlineOverride(baseTexts, propertyId, "instagram-carousel");
    expect(carouselTexts.headline).toBe(SENTINEL_CAROUSEL);
    expect(carouselTexts.headline).not.toBe(SENTINEL_POST);
  });

  it("el override sobrevive a un render posterior que crea una GeneratedPiece nueva SIN editableText (bug real detectado al endurecer el E2E)", async () => {
    const propertyId = await newTestProperty();
    await saveOverride(propertyId, "instagram-post", SENTINEL_POST);

    // Simula lo que hace playwright-renderer.ts + render-job-repository.prisma.ts
    // `save()` tras CADA regeneracion: una GeneratedPiece nueva (id random,
    // createdAt mas reciente) sin editableText — el artefacto binario en si.
    await prisma.generatedPiece.create({
      data: {
        propertyId,
        pieceKey: "instagram-post",
        path: `output/${propertyId}/post-instagram.png`,
      },
    });

    const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
    const view = toView(property);
    const baseTexts = propertyTextBundleToPieceTexts(generatePropertyTexts(view), view);

    const postTexts = await applyHeadlineOverride(baseTexts, propertyId, "instagram-post");
    expect(postTexts.headline).toBe(SENTINEL_POST);
  });

  it("propaga el override al CUERPO del email a traves de loadEmailPieceData completo (antes roto: el email nunca pasaba por applyTextOverride)", async () => {
    const propertyId = await newTestProperty();
    await saveOverride(propertyId, "property-email", SENTINEL_EMAIL);
    // El post de la MISMA propiedad tiene su propio override — confirma que
    // loadEmailPieceData resuelve por pieceKey "property-email" y no cruza
    // con el de otra pieza.
    await saveOverride(propertyId, "instagram-post", SENTINEL_POST);

    const emailData = await loadEmailPieceData(propertyId, "http://localhost:3000");
    expect(emailData).not.toBeNull();
    expect(emailData?.texts.headline).toBe(SENTINEL_EMAIL);
    expect(emailData?.texts.headline).not.toBe(SENTINEL_POST);
  });

  it("sin override guardado, usa el texto generado (comportamiento base intacto)", async () => {
    const propertyId = await newTestProperty();

    const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
    const view = toView(property);
    const baseTexts = propertyTextBundleToPieceTexts(generatePropertyTexts(view), view);

    const resolved = await applyHeadlineOverride(baseTexts, propertyId, "instagram-post");
    expect(resolved.headline).toBe(baseTexts.headline);

    const emailData = await loadEmailPieceData(propertyId, "http://localhost:3000");
    expect(emailData?.texts.headline).toBe(baseTexts.headline);
  });
});
