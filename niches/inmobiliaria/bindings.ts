import type { FieldBindingMap } from "@/lib/engine/niche-config";
import type { BindingRecord } from "@/lib/engine/contracts";
import { formatPriceLabel } from "@/lib/text-engine/compose";
import type { PublicPropertyInput } from "./schema";
import {
  PROPERTY_TYPE_LABELS,
} from "./text-labels";

export type PropertyBindings = BindingRecord & {
  readonly headline: string;
  readonly priceLabel: string;
  readonly publicLocation: string;
  readonly metrics: readonly string[];
  readonly featureLabels: readonly string[];
  readonly description: string;
  readonly highlights: readonly string[];
  readonly cta: string;
  readonly listingUrl: string | null;
  readonly agentName: string;
  readonly agentPhone: string;
  readonly agentEmail: string;
  readonly agencyName: string;
  readonly primaryPhotoAssetId: string;
  readonly galleryAssetIds: readonly string[];
  readonly musicAssetId: string | null;
  readonly narrationAssetId: string | null;
};

function featureLabels(input: Readonly<PublicPropertyInput>): readonly string[] {
  return [
    input.elevator && "ascensor",
    input.terrace && "terraza",
    input.balcony && "balcón",
    input.garage && "garaje",
    input.storageRoom && "trastero",
    input.pool && "piscina",
    input.garden && "jardín",
  ].filter((value): value is string => typeof value === "string");
}

export const propertyBindingMap = {
  headline: {
    sources: ["propertyType", "district", "city"],
    resolve: (input) =>
      `${PROPERTY_TYPE_LABELS[input.propertyType]} en ${
        [input.district, input.city].filter(Boolean).join(", ")
      }`,
  },
  priceLabel: {
    sources: ["price", "currency", "pricePeriod"],
    resolve: (input) =>
      formatPriceLabel(input.price, input.currency, input.pricePeriod),
  },
  publicLocation: {
    sources: ["publicAddress", "district", "city"],
    resolve: (input) =>
      input.publicAddress ??
      [input.district, input.city].filter(Boolean).join(", "),
  },
  metrics: {
    sources: ["bedrooms", "bathrooms", "builtAreaM2"],
    resolve: (input) => [
      `${input.bedrooms} hab.`,
      `${input.bathrooms} baño${input.bathrooms === 1 ? "" : "s"}`,
      `${input.builtAreaM2} m²`,
    ],
  },
  featureLabels: {
    sources: [
      "elevator",
      "terrace",
      "balcony",
      "garage",
      "storageRoom",
      "pool",
      "garden",
    ],
    resolve: (input) => featureLabels(input),
  },
  description: {
    sources: ["description"],
    resolve: (input) => input.description,
  },
  highlights: {
    sources: ["highlights"],
    resolve: (input) => input.highlights,
  },
  cta: {
    sources: ["cta"],
    resolve: (input) => input.cta,
  },
  listingUrl: {
    sources: ["listingUrl"],
    resolve: (input) => input.listingUrl ?? null,
  },
  agentName: {
    sources: ["agent"],
    resolve: (input) => input.agent.name,
  },
  agentPhone: {
    sources: ["agent"],
    resolve: (input) => input.agent.phone,
  },
  agentEmail: {
    sources: ["agent"],
    resolve: (input) => input.agent.email,
  },
  agencyName: {
    sources: ["agency"],
    resolve: (input) => input.agency.name,
  },
  primaryPhotoAssetId: {
    sources: ["primaryPhotoAssetId"],
    resolve: (input) => input.primaryPhotoAssetId,
  },
  galleryAssetIds: {
    sources: ["photoAssetIds"],
    resolve: (input) => input.photoAssetIds,
  },
  musicAssetId: {
    sources: ["musicAssetId"],
    resolve: (input) => input.musicAssetId ?? null,
  },
  narrationAssetId: {
    sources: ["narrationAssetId"],
    resolve: (input) => input.narrationAssetId ?? null,
  },
} satisfies FieldBindingMap<PublicPropertyInput, PropertyBindings>;
