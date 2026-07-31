import { notFound } from "next/navigation";
import QRCode from "qrcode";
import brandPresetsData from "@/niches/inmobiliaria/brand-presets.json";
import {
  brandPresetSchema,
  normalizeBrandJsonField,
  type BrandPreset,
  type BrandConfig,
} from "@/niches/inmobiliaria/brand.schema";
import type { PublicPropertyView } from "@/niches/inmobiliaria/public-view";
import { storedPropertyToPublicView } from "@/niches/inmobiliaria/persistence/public-view-mapper";
import {
  PostInstagram,
  StoryInstagram,
  CarouselSlide,
  FichaPdf,
  isPieceId,
  demoPhotoUrls,
  presetToPieceBrand,
  brandConfigToPieceBrand,
  googleFontsHref,
  type PieceBrand,
  type PiecePhoto,
} from "@/niches/inmobiliaria/templates";
import { buildFallbackTexts } from "@/niches/inmobiliaria/templates/fallback-texts";
import { propertyTextBundleToPieceTexts } from "@/niches/inmobiliaria/piece-texts-adapter";
import { applyHeadlineOverride } from "@/niches/inmobiliaria/apply-text-override";
import { demoPropertyPayload } from "@/tests/fixtures/demo-property";
import { generatePropertyTexts } from "@/niches/inmobiliaria/text-engine";
import { isPreviewAccessAllowed } from "@/lib/render-access/preview-token";
import { prisma } from "@/lib/prisma";

// Lee de Prisma / genera QR en cada request — nunca cacheable ni prerenderable.
export const dynamic = "force-dynamic";

interface PreviewPageProps {
  readonly params: Promise<{ readonly pieceId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface PieceData {
  readonly view: PublicPropertyView;
  readonly brand: PieceBrand;
  readonly photos: readonly PiecePhoto[];
}

function findPreset(presetId: string): BrandPreset {
  const presets = (brandPresetsData as { presets: unknown[] }).presets;
  const match =
    presets.find((preset) => (preset as { id?: string }).id === presetId) ??
    presets.find((preset) => (preset as { esDefault?: boolean }).esDefault);
  return brandPresetSchema.parse(match);
}

const DEMO_PHOTO_IDS = ["demo-1", "demo-2", "demo-3", "demo-4", "demo-5"];

// Mapa inverso de render-plan.ts: previewId → pieceKey del catalogo.
const PREVIEW_ID_TO_PIECE_KEY: Record<string, string> = {
  "ficha-pdf": "property-sheet",
  "post-instagram": "instagram-post",
  "story-instagram": "instagram-story",
  "carousel-1": "instagram-carousel",
  "carousel-2": "instagram-carousel",
  "carousel-3": "instagram-carousel",
  "carousel-4": "instagram-carousel",
  "carousel-5": "instagram-carousel",
};

type PieceTextsShape = ReturnType<typeof propertyTextBundleToPieceTexts>;

/**
 * Lee el texto editado por el usuario (GeneratedPiece.editableText.edited) de
 * la pieza correspondiente a este preview y lo aplica como titular. El campo
 * `headline` es el unico visible en TODAS las piezas de imagen/PDF (post,
 * story, ficha, carrusel-1), asi que un unico string editado se refleja en
 * cualquiera de ellas al regenerar.
 */
async function applyTextOverride(
  texts: PieceTextsShape,
  propertyId: string,
  pieceId: string,
): Promise<PieceTextsShape> {
  const pieceKey = PREVIEW_ID_TO_PIECE_KEY[pieceId];
  if (!pieceKey) return texts;
  return applyHeadlineOverride(texts, propertyId, pieceKey);
}

function loadDemoData(presetId: string): PieceData {
  const payload = demoPropertyPayload({
    photoAssetIds: DEMO_PHOTO_IDS,
    primaryPhotoAssetId: DEMO_PHOTO_IDS[0],
  });
  const { internalName, privateAddress, ...publicFields } = payload;
  void internalName;
  void privateAddress;

  const view: PublicPropertyView = { id: "demo", ...publicFields };
  const brand = presetToPieceBrand(findPreset(presetId));
  const photos: PiecePhoto[] = demoPhotoUrls(DEMO_PHOTO_IDS.length).map((url, index) => ({
    url,
    alt: `Foto demo ${index + 1} (marcada como placeholder, sin derechos)`,
  }));

  return { view, brand, photos };
}

async function loadRealData(
  propertyId: string,
  brandId: string | undefined,
  expectedRevision: number | undefined,
): Promise<PieceData> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { photos: { orderBy: { order: "asc" } }, brand: true },
  });

  if (!property) notFound();

  // F-06: si la propiedad cambio despues de arrancar el trabajo, esta pieza
  // saldria con datos distintos de las que ya se capturaron. La comparacion va
  // AQUI, en la misma peticion que lee la fila y la pinta, para que no quede
  // ventana entre comprobar y renderizar.
  if (expectedRevision !== undefined && property.revision !== expectedRevision) {
    notFound();
  }

  const view: PublicPropertyView = storedPropertyToPublicView(property);

  const brandRow = brandId
    ? await prisma.brand.findUnique({ where: { id: brandId } })
    : property.brand;

  const brand: PieceBrand = brandRow
    ? brandConfigToPieceBrand({
        nombre: brandRow.nombre,
        logo: brandRow.logo,
        colores: normalizeBrandJsonField<BrandConfig["colores"]>(brandRow.colores),
        tipografia: normalizeBrandJsonField<BrandConfig["tipografia"]>(brandRow.tipografia),
        web: brandRow.web ?? undefined,
        telefono: brandRow.telefono ?? undefined,
        email: brandRow.email ?? undefined,
        instagram: brandRow.instagram ?? undefined,
        ctaHabitual: brandRow.ctaHabitual ?? undefined,
      })
    : presetToPieceBrand(findPreset("editorial-crema"));

  const photos: PiecePhoto[] = property.photos.map((photo, index) => ({
    url: `/api/assets/${photo.id}`,
    alt: `Foto ${index + 1} de ${view.propertyType} en ${view.city}`,
  }));

  return { view, brand, photos };
}

export default async function PreviewPage({ params, searchParams }: PreviewPageProps) {
  const { pieceId } = await params;
  if (!isPieceId(pieceId)) notFound();

  const query = await searchParams;
  const isDemo = query.demo === "1" || query.demo === "true";
  const presetParam = typeof query.preset === "string" ? query.preset : "cercana-familiar";
  const propertyIdParam = typeof query.propertyId === "string" ? query.propertyId : undefined;
  const isProduction = process.env.NODE_ENV === "production";
  // `brandId` no va firmado en el token y cambia el logo, los colores y los
  // datos de contacto que se pintan. El renderer siempre lo envia vacio, asi
  // que en produccion se ignora y manda la marca de la propiedad.
  const brandIdParam =
    !isProduction && typeof query.brandId === "string" ? query.brandId : undefined;
  // `rev` solo se acepta como entero no negativo en forma canonica: cualquier
  // otra cosa vale `undefined` y, en produccion, eso ya es un rechazo.
  const revisionParam =
    typeof query.rev === "string" && /^(0|[1-9]\d*)$/.test(query.rev)
      ? Number(query.rev)
      : undefined;

  if (!isDemo && !propertyIdParam) notFound();

  // Control de acceso (F-14). La politica vive en lib/render-access para poder
  // probarla caso a caso; aqui solo se obedece.
  const allowed = isPreviewAccessAllowed({
    isProduction,
    isDemo,
    pieceId,
    propertyId: propertyIdParam,
    token: typeof query.rt === "string" ? query.rt : undefined,
    revision: revisionParam,
  });
  if (!allowed) notFound();

  const { view, brand, photos } = isDemo
    ? loadDemoData(presetParam)
    : await loadRealData(propertyIdParam as string, brandIdParam, revisionParam);

  const baseTexts = isDemo
    ? buildFallbackTexts(view)
    : propertyTextBundleToPieceTexts(generatePropertyTexts(view), view);

  // Override de texto editado por el usuario en la UI de preview (Fase 5.3):
  // si la GeneratedPiece mas reciente de esta pieza tiene editableText.edited,
  // sustituye el titular/desarrollo para que la regeneracion refleje la edicion.
  const texts = isDemo
    ? baseTexts
    : await applyTextOverride(baseTexts, propertyIdParam as string, pieceId);

  const fontHref = googleFontsHref(brand);
  const fontLink = fontHref ? <link rel="stylesheet" href={fontHref} /> : null;

  if (pieceId === "post-instagram") {
    return (
      <>
        {fontLink}
        <PostInstagram view={view} brand={brand} texts={texts} photos={photos} />
      </>
    );
  }

  if (pieceId === "story-instagram") {
    return (
      <>
        {fontLink}
        <StoryInstagram view={view} brand={brand} texts={texts} photos={photos} />
      </>
    );
  }

  if (pieceId === "ficha-pdf") {
    const qrDataUrl = view.listingUrl
      ? await QRCode.toDataURL(view.listingUrl, { margin: 0, width: 240 })
      : null;
    return (
      <>
        {fontLink}
        <FichaPdf view={view} brand={brand} texts={texts} photos={photos} qrDataUrl={qrDataUrl} />
      </>
    );
  }

  // carousel-1 .. carousel-5
  const slide = Number(pieceId.split("-")[1]) as 1 | 2 | 3 | 4 | 5;
  return (
    <>
      {fontLink}
      <CarouselSlide view={view} brand={brand} texts={texts} photos={photos} slide={slide} />
    </>
  );
}
