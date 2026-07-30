/**
 * Proyeccion publica de una Property persistida. Regla dura #1 de spec.md:
 * "La direccion privada JAMAS aparece en ninguna pieza publica, en el ZIP,
 * ni en datos-propiedad.json." `PublicPropertyView` es el UNICO tipo que las
 * plantillas de piezas publicas pueden recibir.
 *
 * `toPublicPropertyView` es una proyeccion EXPLICITA POR INCLUSION (allowlist
 * de campos) — nunca por omision/delete. Un campo nuevo en `Property` no se
 * filtra a la vista publica hasta que alguien lo anade aqui a proposito.
 */
import type { PropertyInput } from "./schema";

export interface Property extends PropertyInput {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicPropertyView {
  readonly id: string;
  readonly operation: PropertyInput["operation"];
  readonly propertyType: PropertyInput["propertyType"];
  readonly price: number;
  readonly currency: PropertyInput["currency"];
  readonly pricePeriod?: PropertyInput["pricePeriod"];
  readonly city: string;
  readonly district?: string;
  readonly publicAddress?: string;
  readonly builtAreaM2: number;
  readonly usableAreaM2?: number;
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly floor?: string;
  readonly elevator: boolean;
  readonly terrace: boolean;
  readonly balcony: boolean;
  readonly garage: boolean;
  readonly storageRoom: boolean;
  readonly pool: boolean;
  readonly garden: boolean;
  readonly condition: PropertyInput["condition"];
  readonly constructionYear?: number;
  readonly energyCertificate?: PropertyInput["energyCertificate"];
  readonly description: string;
  readonly highlights: readonly string[];
  readonly cta: string;
  readonly listingUrl?: string;
  readonly agent: PropertyInput["agent"];
  readonly agency: PropertyInput["agency"];
  readonly photoAssetIds: readonly string[];
  readonly primaryPhotoAssetId: string;
  readonly musicAssetId?: string;
  readonly narrationAssetId?: string;
}

export const toPublicPropertyView = (
  property: Readonly<Property>,
): PublicPropertyView => ({
  id: property.id,
  operation: property.operation,
  propertyType: property.propertyType,
  price: property.price,
  currency: property.currency,
  pricePeriod: property.pricePeriod,
  city: property.city,
  district: property.district,
  publicAddress: property.publicAddress,
  builtAreaM2: property.builtAreaM2,
  usableAreaM2: property.usableAreaM2,
  bedrooms: property.bedrooms,
  bathrooms: property.bathrooms,
  floor: property.floor,
  elevator: property.elevator,
  terrace: property.terrace,
  balcony: property.balcony,
  garage: property.garage,
  storageRoom: property.storageRoom,
  pool: property.pool,
  garden: property.garden,
  condition: property.condition,
  constructionYear: property.constructionYear,
  energyCertificate: property.energyCertificate,
  description: property.description,
  highlights: property.highlights,
  cta: property.cta,
  listingUrl: property.listingUrl,
  agent: property.agent,
  agency: property.agency,
  photoAssetIds: property.photoAssetIds,
  primaryPhotoAssetId: property.primaryPhotoAssetId,
  musicAssetId: property.musicAssetId,
  narrationAssetId: property.narrationAssetId,
});
