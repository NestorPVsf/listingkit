import { access } from "node:fs/promises";
import path from "node:path";
import type {
  VideoScene,
  VideoStoryboard,
} from "@/lib/engine/ports/video-storyboard";
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
  const root = path.resolve(process.cwd(), "uploads", "assets");
  const candidate = path.resolve(root, fileName);
  const relative = path.relative(root, candidate);
  if (
    path.basename(fileName) !== fileName ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
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
  const root = path.resolve(process.cwd(), "uploads", "brand");
  const candidate = path.resolve(process.cwd(), logoUrl.replace(/^\/+/, ""));
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
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
): Promise<VideoStoryboard | null> {
  const property = await prisma.property.findUnique({
    where: { id: entityId },
    include: { photos: { orderBy: { order: "asc" } }, brand: true },
  });
  if (!property) {
    return null;
  }

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
