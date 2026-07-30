import type { PropertyTextBundle } from "@/niches/inmobiliaria/text-engine";
import { formatPriceLabel } from "@/lib/text-engine/compose";
import type { PublicPropertyView } from "./public-view";
import { buildFeatureList } from "./text-labels";
import type { PieceTexts } from "./templates/types";

const capitalize = (value: string): string =>
  value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);

export function propertyTextBundleToPieceTexts(
  bundle: Readonly<PropertyTextBundle>,
  view: Readonly<PublicPropertyView>,
): PieceTexts {
  return {
    headline: bundle.headline,
    priceLabel: formatPriceLabel(
      view.price,
      view.currency,
      view.pricePeriod,
    ),
    publicLocation:
      view.publicAddress ??
      (view.district ? `${view.district}, ${view.city}` : view.city),
    metrics: [
      `${view.bedrooms} hab.`,
      `${view.bathrooms} baño${view.bathrooms === 1 ? "" : "s"}`,
      `${view.builtAreaM2} m²`,
    ],
    featureLabels: buildFeatureList(view).map(capitalize),
    description: bundle.descriptionLong,
    highlights: bundle.highlights,
    cta: bundle.cta,
    lifestyleParagraph: bundle.carouselSlides[3] || undefined,
    legalNotice:
      view.energyCertificate === undefined
        ? "Falta certificado energético — obligatorio para publicar (España, 2013)."
        : undefined,
    verificationNotice: "Verificar antes de publicar.",
  };
}
