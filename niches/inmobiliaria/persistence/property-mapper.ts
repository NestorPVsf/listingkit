import type { Prisma } from "@prisma/client";
import type { AssetRef, EntityInput } from "@/lib/engine/contracts";
import { propertyInputSchema, type PropertyInput } from "../schema";

export type StoredPropertyWithPhotos = Prisma.PropertyGetPayload<{
  include: { photos: true };
}>;

export function storedPropertyToEntityInput(
  row: Readonly<StoredPropertyWithPhotos>,
  assets: readonly AssetRef[],
): EntityInput<PropertyInput> {
  const payload = propertyInputSchema.parse({
    internalName: row.internalName,
    operation: row.operation,
    propertyType: row.propertyType,
    price: row.price,
    currency: row.currency,
    pricePeriod: row.pricePeriod ?? undefined,
    city: row.city,
    district: row.district ?? undefined,
    publicAddress: row.publicAddress ?? undefined,
    privateAddress: row.privateAddress,
    builtAreaM2: row.builtAreaM2,
    usableAreaM2: row.usableAreaM2 ?? undefined,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    floor: row.floor ?? undefined,
    elevator: row.elevator,
    terrace: row.terrace,
    balcony: row.balcony,
    garage: row.garage,
    storageRoom: row.storageRoom,
    pool: row.pool,
    garden: row.garden,
    condition: row.condition,
    constructionYear: row.constructionYear ?? undefined,
    energyCertificate: row.energyCertificateRating
      ? {
          rating: row.energyCertificateRating,
          identifier: row.energyCertificateIdentifier ?? undefined,
        }
      : undefined,
    description: row.description,
    highlights: row.highlights,
    cta: row.cta,
    listingUrl: row.listingUrl ?? undefined,
    agent: {
      name: row.agentName,
      phone: row.agentPhone,
      email: row.agentEmail,
    },
    agency: {
      name: row.agencyName,
      website: row.agencyWebsite ?? undefined,
    },
    photoAssetIds: row.photos
      .toSorted((left, right) => left.order - right.order)
      .map((photo) => photo.id),
    primaryPhotoAssetId: row.primaryPhotoAssetId,
    musicAssetId: row.musicAssetId ?? undefined,
    narrationAssetId: row.narrationAssetId ?? undefined,
    explicitlyAllowedClaims: row.explicitlyAllowedClaims,
  });

  return {
    nicheId: "inmobiliaria",
    entityId: row.id,
    // F-06: la revision real de la fila, no un 1 fijo. Es lo que permite
    // detectar que la propiedad cambio a mitad de una generacion, y lo que hace
    // que el `entityRevision` del manifiesto del ZIP diga la verdad.
    revision: row.revision,
    locale: "es-ES",
    payload,
    assets,
  };
}
