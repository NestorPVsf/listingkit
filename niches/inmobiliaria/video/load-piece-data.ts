import { access } from "node:fs/promises";
import path from "node:path";
import { uploadPath } from "@/lib/infrastructure/storage/upload-paths";
import type {
  VideoScene,
  VideoStoryboard,
} from "@/lib/engine/ports/video-storyboard";
import { assertEntityRevision } from "@/lib/engine/entity-revision";
import { resolveStoredAudioAssetPath } from "@/lib/infrastructure/files/local-asset-store";
import { prisma } from "@/lib/prisma";
import { generatePropertyTexts } from "@/niches/inmobiliaria/text-engine";
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
import type { PieceBrand } from "../templates/types";

const MAX_VIDEO_PHOTOS = 12;

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

async function resolvePhotoPath(fileName: string): Promise<string> {
  // Solo un nombre de fichero, nunca una ruta: la comprobacion se queda aunque
  // `uploadPath` ya rechace lo que se salga de la raiz. Son dos preguntas
  // distintas —"esto es un nombre" y "esto cae dentro"— y la segunda no
  // sustituye a la primera.
  if (path.basename(fileName) !== fileName) {
    throw new Error("PHOTO_PATH_OUTSIDE_STORAGE");
  }
  let candidate: string;
  try {
    candidate = uploadPath("assets", fileName);
  } catch {
    throw new Error("PHOTO_PATH_OUTSIDE_STORAGE");
  }
  await access(candidate);
  return candidate;
}

async function resolveLogoPath(
  logoUrl: string | null,
): Promise<string | undefined> {
  if (!logoUrl) {
    return undefined;
  }
  // `logoUrl` es una URL PUBLICA (`/uploads/brand/x.png`), no una ruta del
  // disco: se sirve por un route handler. Antes se resolvia tal cual contra el
  // directorio de trabajo, lo que solo funcionaba porque la ruta publica y la
  // del disco coincidian por casualidad. Se toma el nombre y se busca donde
  // los logos viven de verdad.
  const fileName = path.basename(logoUrl);
  if (!fileName || fileName !== logoUrl.split("/").pop()) {
    throw new Error("LOGO_PATH_OUTSIDE_STORAGE");
  }
  let candidate: string;
  try {
    candidate = uploadPath("brand", fileName);
  } catch {
    throw new Error("LOGO_PATH_OUTSIDE_STORAGE");
  }
  try {
    await access(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

function alternatingPhoto(
  photoPaths: readonly string[],
  index: number,
): string {
  return photoPaths[index % photoPaths.length]!;
}

function buildScenes({
  photoPaths,
  headline,
  priceLabel,
  metrics,
  featureLabels,
  highlights,
  descriptionShort,
  cta,
  agentName,
  agentPhone,
  agencyName,
  closingContact,
}: {
  readonly photoPaths: readonly string[];
  readonly headline: string;
  readonly priceLabel: string;
  readonly metrics: readonly string[];
  readonly featureLabels: readonly string[];
  readonly highlights: readonly string[];
  readonly descriptionShort: string;
  readonly cta: string;
  readonly agentName: string;
  readonly agentPhone: string;
  readonly agencyName: string;
  readonly closingContact: readonly string[];
}): readonly VideoScene[] {
  const photoScenes: VideoScene[] = photoPaths.map((photoPath, index) => ({
    kind: "photo",
    backgroundImagePath: photoPath,
    title: highlights[index] ?? "",
    lines: [],
  }));
  const differentialLines =
    highlights.length > 0
      ? highlights.slice(0, 3)
      : [descriptionShort];

  return [
    {
      kind: "hook",
      backgroundImagePath: photoPaths[0]!,
      title: headline,
      lines: [priceLabel],
    },
    ...photoScenes,
    {
      kind: "features",
      backgroundImagePath: alternatingPhoto(photoPaths, 1),
      title: "Características",
      lines: [...metrics, ...featureLabels].slice(0, 6),
    },
    {
      kind: "differential",
      backgroundImagePath: alternatingPhoto(photoPaths, 2),
      title: "Lo que la hace especial",
      lines: differentialLines,
    },
    {
      kind: "cta",
      backgroundImagePath: alternatingPhoto(photoPaths, 3),
      title: cta,
      lines: [agentName, agentPhone],
    },
    {
      kind: "closing",
      backgroundImagePath: photoPaths[0]!,
      title: agencyName,
      lines: closingContact,
    },
  ];
}

export async function loadVideoPieceData(
  entityId: string,
  expectedRevision?: number,
): Promise<VideoStoryboard | null> {
  const property = await prisma.property.findUnique({
    where: { id: entityId },
    include: { photos: { orderBy: { order: "asc" } }, brand: true },
  });
  if (!property) {
    return null;
  }

  // F-06: el video tampoco pasa por `/preview`. Mismo control de version, misma
  // peticion que lee la fila.
  assertEntityRevision(property.revision, expectedRevision);

  const view: PublicPropertyView = storedPropertyToPublicView(property);
  const brand: PieceBrand = property.brand
    ? brandConfigToPieceBrand(
        brandConfigSchema.parse({
          nombre: property.brand.nombre,
          logo: property.brand.logo,
          colores: normalizeBrandJsonField<BrandConfig["colores"]>(property.brand.colores),
          tipografia: normalizeBrandJsonField<BrandConfig["tipografia"]>(property.brand.tipografia),
          web: property.brand.web ?? undefined,
          telefono: property.brand.telefono ?? undefined,
          email: property.brand.email ?? undefined,
          instagram: property.brand.instagram ?? undefined,
          ctaHabitual: property.brand.ctaHabitual ?? undefined,
        }),
      )
    : presetToPieceBrand(findDefaultPreset());
  const bundle = generatePropertyTexts(view);
  const texts = propertyTextBundleToPieceTexts(bundle, view);
  const photoPaths = (
    await Promise.all(
      property.photos
        .slice(0, MAX_VIDEO_PHOTOS)
        .map((photo) => resolvePhotoPath(photo.path)),
    )
  ).filter((photoPath) => photoPath.length > 0);
  if (photoPaths.length === 0) {
    return null;
  }

  const [musicPath, narrationPath, logoPath] = await Promise.all([
    property.musicAssetId
      ? resolveStoredAudioAssetPath(property.musicAssetId)
      : Promise.resolve(undefined),
    property.narrationAssetId
      ? resolveStoredAudioAssetPath(property.narrationAssetId)
      : Promise.resolve(undefined),
    resolveLogoPath(brand.logoUrl),
  ]);
  const brandName = property.brand ? brand.name : view.agency.name;
  const closingContact = [
    brand.contact.phone ?? view.agent.phone,
    brand.contact.email ?? view.agent.email,
    brand.contact.website ?? view.agency.website,
  ].filter((value): value is string => Boolean(value));

  return {
    locale: "es-ES",
    narrationText: bundle.videoScript,
    scenes: buildScenes({
      photoPaths,
      headline: texts.headline,
      priceLabel: texts.priceLabel,
      metrics: texts.metrics,
      featureLabels: texts.featureLabels,
      highlights: texts.highlights,
      descriptionShort: bundle.descriptionShort,
      cta: texts.cta,
      agentName: view.agent.name,
      agentPhone: view.agent.phone,
      agencyName: view.agency.name,
      closingContact,
    }),
    brand: {
      name: brandName,
      primaryColor: brand.colors.primary,
      secondaryColor: brand.colors.secondary,
      textColor: brand.colors.onPrimary,
      logoPath,
      contactLines: closingContact,
    },
    audio: {
      musicPath,
      narrationPath,
    },
  };
}
