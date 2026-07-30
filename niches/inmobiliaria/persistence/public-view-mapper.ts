/**
 * UNICO sitio donde una fila de Prisma se convierte en `PublicPropertyView`.
 *
 * Hasta el cierre de la review habia CUATRO copias de este mapeo escritas a
 * mano —preview, email, video y el empaquetador ZIP— y ya habian divergido: la
 * del ZIP dejaba `photoAssetIds: []` y se saltaba el fallback de la foto
 * principal. Esa duplicacion es peligrosa por lo que ESTE mapeo significa: es
 * la allowlist que decide que campos de la propiedad pueden salir publicados.
 * Cuatro allowlists que hay que recordar mantener en sincronia son cuatro
 * oportunidades de que un campo privado se cuele en la quinta version.
 *
 * Sigue siendo una proyeccion POR INCLUSION (ver public-view.ts): un campo
 * nuevo en el schema de Prisma no aparece aqui hasta que alguien lo anade a
 * proposito. `privateAddress` e `internalName` no estan, y no es un olvido.
 */
import type { Prisma } from "@prisma/client";
import type { PublicPropertyView } from "../public-view";

/** Fila con sus fotos ordenadas. Es lo que consumen preview, email y video. */
export type StoredPropertyForPublicView = Prisma.PropertyGetPayload<{
  include: { photos: true };
}>;

/**
 * Fila sin fotos: el empaquetador solo necesita los datos textuales, asi que
 * no paga el join. `photoAssetIds` queda vacio, que es la verdad de lo que se
 * ha leido — no una divergencia silenciosa.
 */
type StoredPropertyRow = Prisma.PropertyGetPayload<Record<string, never>>;

type PhotoRow = { readonly id: string; readonly order: number };

export function storedPropertyToPublicView(
  row: Readonly<StoredPropertyRow> & { readonly photos?: readonly PhotoRow[] },
): PublicPropertyView {
  const photoAssetIds = (row.photos ?? [])
    .toSorted((left, right) => left.order - right.order)
    .map((photo) => photo.id);

  return {
    id: row.id,
    operation: row.operation as PublicPropertyView["operation"],
    propertyType: row.propertyType as PublicPropertyView["propertyType"],
    price: row.price,
    currency: row.currency as PublicPropertyView["currency"],
    pricePeriod: (row.pricePeriod ?? undefined) as PublicPropertyView["pricePeriod"],
    city: row.city,
    district: row.district ?? undefined,
    publicAddress: row.publicAddress ?? undefined,
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
    condition: row.condition as PublicPropertyView["condition"],
    constructionYear: row.constructionYear ?? undefined,
    energyCertificate: row.energyCertificateRating
      ? {
          rating: row.energyCertificateRating as NonNullable<
            PublicPropertyView["energyCertificate"]
          >["rating"],
          identifier: row.energyCertificateIdentifier ?? undefined,
        }
      : undefined,
    description: row.description,
    highlights: (row.highlights as string[]) ?? [],
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
    photoAssetIds,
    primaryPhotoAssetId: row.primaryPhotoAssetId ?? photoAssetIds[0] ?? "",
    musicAssetId: row.musicAssetId ?? undefined,
    narrationAssetId: row.narrationAssetId ?? undefined,
  };
}
