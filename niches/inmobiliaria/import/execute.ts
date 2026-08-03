/**
 * Segunda fase de la importacion: escribir lo que el informe dijo que entraria.
 *
 * Dos reglas que gobiernan todo lo de abajo:
 *
 * 1. **Una propiedad se crea entera o no se crea.** Si fallan las fotos, no se
 *    escribe una ficha sin fotos que ademas no puede generar piezas: se reporta
 *    y se pasa a la siguiente. Media propiedad en la cartera es peor que
 *    ninguna, porque nadie la revisa hasta que sale mal.
 * 2. **Un fallo no tumba la importacion.** De 40 propiedades, si 3 tienen el
 *    CDN caido entran 37 y se dice cuales fallaron y por que. Abortar el lote
 *    entero por una foto obliga a repetirlo todo.
 *
 * La deduplicacion va por `externalRef` (el `<id>` del feed): reimportar el
 * mismo fichero actualiza en vez de duplicar la cartera.
 */
import { storeImageUpload } from "@/lib/infrastructure/files/local-asset-store";
import {
  fetchRemoteImage,
  RemoteImageRejected,
} from "@/lib/infrastructure/files/fetch-remote-image";
import { prisma } from "@/lib/prisma";
import { completeCandidate, type ImportCandidate } from "./kyero";

/** Tope del esquema: `photoAssetIds` admite 20 como maximo. */
const MAX_FOTOS = 20;
const MIN_FOTOS = 3;

export type ImportOutcome = "created" | "updated" | "failed";

export interface ImportResult {
  readonly externalId: string;
  readonly outcome: ImportOutcome;
  readonly propertyId?: string;
  readonly photosImported?: number;
  readonly reason?: string;
}

export interface ImportSummary {
  readonly created: number;
  readonly updated: number;
  readonly failed: number;
  readonly results: readonly ImportResult[];
}

/**
 * Descarga hasta `MAX_FOTOS`, saltando las que fallen. Devuelve los ids de
 * asset ya guardados y sanitizados por `storeImageUpload` (que recodifica con
 * sharp y borra el EXIF — las fotos de inmuebles vienen con GPS dentro).
 */
async function descargarFotos(
  urls: readonly string[],
): Promise<{ assetIds: string[]; descartadas: number }> {
  const assetIds: string[] = [];
  let descartadas = 0;

  for (const url of urls.slice(0, MAX_FOTOS)) {
    try {
      const fichero = await fetchRemoteImage(url);
      const asset = await storeImageUpload(fichero);
      assetIds.push(asset.id);
    } catch (error: unknown) {
      // Una foto rota no invalida las demas: puede ser un enlace caducado en
      // un feed por lo demas correcto.
      descartadas += 1;
      if (!(error instanceof RemoteImageRejected) && !(error instanceof Error)) throw error;
    }
  }

  return { assetIds, descartadas };
}

async function escribirPropiedad(
  candidate: Readonly<ImportCandidate>,
  assetIds: readonly string[],
  brandId: string | null,
): Promise<{ propertyId: string; outcome: "created" | "updated" }> {
  // Validacion contra el esquema REAL del nicho, el mismo que usa el formulario
  // manual. El informe dice lo que se espera; esto comprueba lo que hay.
  const input = completeCandidate(candidate, assetIds);

  const datos = {
    brandId,
    externalRef: candidate.externalId,
    internalName: input.internalName,
    operation: input.operation,
    propertyType: input.propertyType,
    price: input.price,
    currency: input.currency,
    pricePeriod: input.pricePeriod ?? null,
    city: input.city,
    district: input.district ?? null,
    publicAddress: input.publicAddress ?? null,
    privateAddress: input.privateAddress,
    builtAreaM2: input.builtAreaM2,
    usableAreaM2: input.usableAreaM2 ?? null,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    floor: input.floor ?? null,
    elevator: input.elevator,
    terrace: input.terrace,
    balcony: input.balcony,
    garage: input.garage,
    storageRoom: input.storageRoom,
    pool: input.pool,
    garden: input.garden,
    condition: input.condition,
    constructionYear: input.constructionYear ?? null,
    energyCertificateRating: input.energyCertificate?.rating ?? null,
    energyCertificateIdentifier: input.energyCertificate?.identifier ?? null,
    description: input.description,
    highlights: [...input.highlights],
    cta: input.cta,
    listingUrl: input.listingUrl ?? null,
    agentName: input.agent.name,
    agentPhone: input.agent.phone,
    agentEmail: input.agent.email,
    agencyName: input.agency.name,
    agencyWebsite: input.agency.website ?? null,
    primaryPhotoAssetId: input.primaryPhotoAssetId,
    explicitlyAllowedClaims: [...input.explicitlyAllowedClaims],
  };

  const existente = await prisma.property.findUnique({
    where: { externalRef: candidate.externalId },
    select: { id: true },
  });

  if (existente) {
    // Reimportacion: se reemplazan las fotos y sube la revision, porque cambian
    // las piezas (F-06). Las anteriores se borran en cascada.
    await prisma.$transaction([
      prisma.propertyPhoto.deleteMany({ where: { propertyId: existente.id } }),
      prisma.property.update({
        where: { id: existente.id },
        data: {
          ...datos,
          revision: { increment: 1 },
          photos: {
            create: assetIds.map((assetId, index) => ({
              id: assetId,
              path: `${assetId}.jpg`,
              order: index,
              esMain: index === 0,
            })),
          },
        },
      }),
    ]);
    return { propertyId: existente.id, outcome: "updated" };
  }

  const creada = await prisma.property.create({
    data: {
      ...datos,
      photos: {
        create: assetIds.map((assetId, index) => ({
          id: assetId,
          path: `${assetId}.jpg`,
          order: index,
          esMain: index === 0,
        })),
      },
    },
    select: { id: true },
  });
  return { propertyId: creada.id, outcome: "created" };
}

export async function importCandidates(
  candidates: readonly ImportCandidate[],
  brandId: string | null,
): Promise<ImportSummary> {
  const results: ImportResult[] = [];

  for (const candidate of candidates) {
    const bloqueos = candidate.issues.filter((i) => i.severity === "blocking");
    if (bloqueos.length > 0) {
      results.push({
        externalId: candidate.externalId,
        outcome: "failed",
        reason: `No importable: ${bloqueos.map((b) => b.field).join(", ")}`,
      });
      continue;
    }

    try {
      const { assetIds, descartadas } = await descargarFotos(candidate.photoUrls);
      if (assetIds.length < MIN_FOTOS) {
        results.push({
          externalId: candidate.externalId,
          outcome: "failed",
          reason: `Solo se pudieron descargar ${assetIds.length} de ${candidate.photoUrls.length} fotos; hacen falta ${MIN_FOTOS}.`,
        });
        continue;
      }

      const { propertyId, outcome } = await escribirPropiedad(
        candidate,
        assetIds,
        brandId,
      );
      results.push({
        externalId: candidate.externalId,
        outcome,
        propertyId,
        photosImported: assetIds.length,
        ...(descartadas > 0
          ? { reason: `${descartadas} foto(s) no se pudieron descargar.` }
          : {}),
      });
    } catch (error: unknown) {
      // Una propiedad que falla no tumba el lote: de 40, entran las 39 buenas.
      results.push({
        externalId: candidate.externalId,
        outcome: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    created: results.filter((r) => r.outcome === "created").length,
    updated: results.filter((r) => r.outcome === "updated").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    results,
  };
}
