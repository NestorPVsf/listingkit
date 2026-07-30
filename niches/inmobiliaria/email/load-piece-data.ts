/**
 * Carga los datos (view/brand/texts/photos) que necesita el email a partir
 * del `entityId` de un RenderJob. Duplica deliberadamente el mapeo Prisma ->
 * PublicPropertyView de app/preview/[pieceId]/page.tsx (loadRealData) en vez
 * de refactorizarlo: el brief prohibe tocar las plantillas visuales
 * existentes y el time-box no cubre una extraccion segura de esa ruta.
 * ponytail: duplicacion aceptada por time-box; upgrade path = extraer un
 * `niches/inmobiliaria/load-property-view.ts` compartido por ambos consumidores.
 *
 * Diferencia clave con el preview: las fotos necesitan URL ABSOLUTA (un
 * cliente de correo no tiene el contexto relativo de la app) — de ahi el
 * `baseUrl` explicito, igual que `RENDER_BASE_URL` en el renderer Playwright.
 */
import { prisma } from "@/lib/prisma";
import { generatePropertyTexts } from "@/lib/text-engine";
import { applyHeadlineOverride } from "../apply-text-override";
import brandPresetsData from "../brand-presets.json";
import {
  brandConfigSchema,
  brandPresetSchema,
  normalizeBrandJsonField,
  type BrandConfig,
  type BrandPreset,
} from "../brand.schema";
import { propertyTextBundleToPieceTexts } from "../piece-texts-adapter";
import type { PublicPropertyView } from "../public-view";
import { storedPropertyToPublicView } from "../persistence/public-view-mapper";
import {
  brandConfigToPieceBrand,
  presetToPieceBrand,
} from "../templates/brand-adapter";
import type { PieceBrand, PiecePhoto, PieceTexts } from "../templates/types";

export interface EmailPieceData {
  readonly view: PublicPropertyView;
  readonly brand: PieceBrand;
  readonly texts: PieceTexts;
  readonly photos: readonly PiecePhoto[];
}

function findDefaultPreset(): BrandPreset {
  const presets = (brandPresetsData as { presets: unknown[] }).presets;
  return brandPresetSchema.parse(
    presets.find(
      (candidate) =>
        typeof candidate === "object" &&
        candidate !== null &&
        "esDefault" in candidate &&
        candidate.esDefault === true,
    ),
  );
}

export async function loadEmailPieceData(
  entityId: string,
  baseUrl: string,
): Promise<EmailPieceData | null> {
  const property = await prisma.property.findUnique({
    where: { id: entityId },
    include: { photos: { orderBy: { order: "asc" } }, brand: true },
  });
  if (!property) return null;

  const view: PublicPropertyView = storedPropertyToPublicView(property);

  const brand: PieceBrand = property.brand
    ? brandConfigToPieceBrand({
        nombre: property.brand.nombre,
        logo: property.brand.logo,
        colores: normalizeBrandJsonField<BrandConfig["colores"]>(property.brand.colores),
        tipografia: normalizeBrandJsonField<BrandConfig["tipografia"]>(property.brand.tipografia),
        web: property.brand.web ?? undefined,
        telefono: property.brand.telefono ?? undefined,
        email: property.brand.email ?? undefined,
        instagram: property.brand.instagram ?? undefined,
        ctaHabitual: property.brand.ctaHabitual ?? undefined,
      })
    : presetToPieceBrand(findDefaultPreset());

  const baseTexts = propertyTextBundleToPieceTexts(generatePropertyTexts(view), view);
  // Override de texto editado por el usuario en la UI de preview: la pieza
  // "property-email" no pasa por app/preview/[pieceId] (no usa Playwright),
  // asi que sin esto el titular editado nunca llegaba al email renderizado.
  const texts = await applyHeadlineOverride(baseTexts, entityId, "property-email");

  const photos: PiecePhoto[] = property.photos.map((photo, index) => ({
    url: `${baseUrl}/api/assets/${photo.id}`,
    alt: `Foto ${index + 1} de ${view.propertyType} en ${view.city}`,
  }));

  return { view, brand, texts, photos };
}
