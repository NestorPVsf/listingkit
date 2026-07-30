/**
 * SHIM TEMPORAL — el text-engine real (bindingMap de docs/architecture/
 * niche-engine.md) es responsabilidad de una fase posterior (tests unit ya
 * en rojo, ver TIME-BOX del brief: "no lo arregles tu"). Esta funcion deriva
 * un `PieceTexts` minimo y correcto desde `PublicPropertyView` SOLO para que
 * la ruta de preview tenga algo que renderizar mientras no existe el motor
 * de texto real. Ningun dato se inventa: todo sale de campos presentes en
 * `view`; los ausentes se omiten (regla de negocio #2 de spec.md).
 *
 * Cuando exista `lib/text-engine`, esta funcion se elimina y el preview la
 * sustituye por una llamada real.
 */
import type { PublicPropertyView } from "../public-view";
import type { PieceTexts } from "./types";

const PROPERTY_TYPE_LABEL: Record<PublicPropertyView["propertyType"], string> = {
  apartment: "Piso",
  house: "Casa",
  penthouse: "Ático",
  studio: "Estudio",
  commercial: "Local",
  land: "Terreno",
};

function featureLabels(view: PublicPropertyView): string[] {
  return [
    view.elevator && "Ascensor",
    view.terrace && "Terraza",
    view.balcony && "Balcón",
    view.garage && "Garaje",
    view.storageRoom && "Trastero",
    view.pool && "Piscina",
    view.garden && "Jardín",
  ].filter((value): value is string => typeof value === "string");
}

function formatPrice(view: PublicPropertyView, locale: string): string {
  const amount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: view.currency,
    maximumFractionDigits: 0,
  }).format(view.price);
  return view.operation === "rent" ? `${amount}/mes` : amount;
}

export function buildFallbackTexts(
  view: PublicPropertyView,
  { locale = "es-ES" }: { readonly locale?: string } = {},
): PieceTexts {
  const zone = [view.district, view.city].filter(Boolean).join(", ");

  return {
    headline: [PROPERTY_TYPE_LABEL[view.propertyType], zone || view.city]
      .filter(Boolean)
      .join(" en "),
    priceLabel: formatPrice(view, locale),
    publicLocation: view.publicAddress ?? (view.district ? `${view.district}, ${view.city}` : undefined),
    metrics: [
      `${view.bedrooms} hab.`,
      `${view.bathrooms} baños`,
      `${view.builtAreaM2} m²`,
    ],
    featureLabels: featureLabels(view),
    description: view.description,
    highlights: view.highlights,
    cta: view.cta,
    lifestyleParagraph: view.highlights.length > 0 ? view.highlights.join(". ") : undefined,
    legalNotice:
      view.energyCertificate === undefined
        ? "Falta certificado energético — obligatorio para publicar (España, 2013)."
        : undefined,
    verificationNotice: "Verificar antes de publicar.",
  };
}
