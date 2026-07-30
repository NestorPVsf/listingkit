/**
 * Vivia en `lib/text-engine/index.ts`, pero genera copy INMOBILIARIO: importaba
 * `PublicPropertyView`, la politica de texto y las etiquetas del nicho, mientras
 * el nicho importaba de vuelta `compose`/`policy`. Esa dependencia circular
 * entre "generico" y "vertical" era la señal de que el fichero estaba en la
 * capa equivocada. Lo que si es generico —componer, sanear frases prohibidas y
 * el puerto `AiProvider`— se queda en `lib/text-engine/`.
 *
 * Motor de texto por plantillas locales (sin IA) — Fase 4.3 del PLAN.md.
 * Determinista: misma `PublicPropertyView` + mismas opciones -> mismo
 * `PropertyTextBundle`, siempre (sin `Math.random`, sin reloj).
 *
 * El motor SOLO conoce `PublicPropertyView` (regla dura #1 de spec.md: la
 * direccion privada nunca llega aqui porque `toPublicPropertyView` ya la
 * excluyo). El vocabulario y la politica de frases son configuracion del
 * vertical, importada desde `niches/inmobiliaria/`.
 */
import type { PublicPropertyView } from "./public-view";
import { realEstateTextPolicy } from "./text-policy";
import {
  buildFeatureList,
  CONDITION_LABELS,
  PROPERTY_TYPE_LABELS,
} from "./text-labels";
import { sanitizeProhibitedPhrases } from "@/lib/text-engine/policy";
import {
  capitalize,
  formatPriceLabel,
  joinList,
  joinSentences,
  joinWithAnd,
  truncateAtWord,
} from "@/lib/text-engine/compose";

export interface PropertyTextBundle {
  readonly headline: string;
  readonly subheadline: string;
  readonly descriptionShort: string;
  readonly descriptionLong: string;
  readonly highlights: readonly string[];
  readonly instagramPostCopy: string;
  readonly carouselSlides: readonly [string, string, string, string, string];
  readonly storyCopy: string;
  readonly email: {
    readonly subject: string;
    readonly preheader: string;
    readonly body: string;
  };
  readonly videoScript: string;
  readonly cta: string;
}

export interface GeneratePropertyTextsOptions {
  readonly explicitlyAllowedClaims?: readonly string[];
}

const DESCRIPTION_SHORT_MAX_LENGTH = 240;

export function generatePropertyTexts(
  view: PublicPropertyView,
  options: GeneratePropertyTextsOptions = {},
): PropertyTextBundle {
  const allowedClaims = options.explicitlyAllowedClaims ?? [];

  const typeLabel = PROPERTY_TYPE_LABELS[view.propertyType];
  const conditionLabel = CONDITION_LABELS[view.condition];
  const locationLabel = joinList([view.district, view.city]) || view.city;
  const priceLabel = formatPriceLabel(view.price, view.currency, view.pricePeriod);
  const featureList = buildFeatureList(view);
  const featuresSentence =
    featureList.length > 0 ? `Cuenta con ${joinWithAnd(featureList)}.` : "";
  const roomsLabel = `${view.bedrooms} hab. y ${view.bathrooms} baño${view.bathrooms === 1 ? "" : "s"}`;
  const areaLabel = `${view.builtAreaM2} m² construidos${
    view.usableAreaM2 ? ` (${view.usableAreaM2} m² útiles)` : ""
  }`;
  const floorLabel = view.floor ? `${view.floor} planta` : "";
  const yearLabel = view.constructionYear ? `construido en ${view.constructionYear}` : "";
  const energyLabel = view.energyCertificate
    ? view.energyCertificate.rating === "en-tramite"
      ? "certificado energético en trámite"
      : view.energyCertificate.rating === "exento"
        ? "certificado energético exento"
        : `certificado energético ${view.energyCertificate.rating}`
    : "";
  // El agente escribe `description` en texto libre: puede colar sin querer
  // una frase prohibida, de ahi que pase por el censor antes de usarse.
  const description = sanitizeProhibitedPhrases(
    view.description,
    realEstateTextPolicy,
    allowedClaims,
  );

  const headline = `${capitalize(typeLabel)} de ${roomsLabel} en ${locationLabel} — ${priceLabel}`;

  const subheadline = joinList([areaLabel, roomsLabel, floorLabel, priceLabel], " · ");

  const descriptionShort = truncateAtWord(
    joinSentences([
      `${capitalize(typeLabel)} de ${roomsLabel} en ${locationLabel}.`,
      `${capitalize(areaLabel)}.`,
      featuresSentence,
      `${priceLabel}.`,
    ]),
    DESCRIPTION_SHORT_MAX_LENGTH,
  );

  const descriptionLong = joinSentences([
    `${capitalize(typeLabel)} de ${roomsLabel} en ${locationLabel}${
      view.publicAddress ? ` (${view.publicAddress})` : ""
    }.`,
    `${capitalize(areaLabel)}${floorLabel ? `, ${floorLabel}` : ""}.`,
    featuresSentence,
    `Vivienda ${conditionLabel}${yearLabel ? `, ${yearLabel}` : ""}.`,
    energyLabel ? `${capitalize(energyLabel)}.` : "",
    description,
    `${priceLabel}.`,
  ]);

  const instagramPostCopy = joinSentences([
    `🏠 ${capitalize(typeLabel)} en ${locationLabel}`,
    `${roomsLabel} · ${areaLabel}`,
    featuresSentence,
    `💶 ${priceLabel}`,
    `👉 ${view.cta}`,
  ]);

  const highlightForSlide = view.highlights[0] ?? featuresSentence ?? `Vivienda ${conditionLabel}.`;

  const carouselSlides: [string, string, string, string, string] = [
    `${capitalize(typeLabel)} en ${locationLabel}`,
    `${roomsLabel} · ${areaLabel}`,
    joinSentences([featuresSentence, `Vivienda ${conditionLabel}.`]),
    highlightForSlide,
    `${priceLabel} · ${view.cta}`,
  ];

  const storyCopy = joinSentences([
    `${capitalize(typeLabel)} en ${locationLabel}`,
    priceLabel,
    "👆 Desliza para más info",
  ]);

  const emailSubject = `${capitalize(typeLabel)} en ${locationLabel} — ${priceLabel}`;
  const emailPreheader = joinList([roomsLabel, areaLabel], " · ");
  const emailBody = joinSentences([
    "Hola,",
    `te presentamos ${typeLabel} en ${locationLabel}${
      view.publicAddress ? ` (${view.publicAddress})` : ""
    }.`,
    `${capitalize(areaLabel)}, ${roomsLabel}${floorLabel ? `, ${floorLabel}` : ""}.`,
    featuresSentence,
    `Vivienda ${conditionLabel}${yearLabel ? `, ${yearLabel}` : ""}.`,
    description,
    `Precio: ${priceLabel}.`,
    `${view.cta}: contacta con ${view.agent.name} (${view.agent.phone} · ${view.agent.email}).`,
  ]);

  const videoScript = joinSentences([
    `ESCENA 1 (exterior/fachada): ${typeLabel} en ${locationLabel}.`,
    `ESCENA 2 (interior): ${roomsLabel}, ${areaLabel}.`,
    featuresSentence ? `ESCENA 3 (detalles): ${featuresSentence}` : "",
    `ESCENA 4 (cierre): ${priceLabel}. ${view.cta}.`,
  ]);

  const bundle: PropertyTextBundle = {
    headline,
    subheadline,
    descriptionShort,
    descriptionLong,
    highlights: view.highlights,
    instagramPostCopy,
    carouselSlides,
    storyCopy,
    email: {
      subject: emailSubject,
      preheader: emailPreheader,
      body: emailBody,
    },
    videoScript,
    cta: view.cta,
  };

  return censorBundle(bundle, allowedClaims);
}

/**
 * Defensa en profundidad (regla dura #3 de spec.md): se escanea el bundle
 * COMPLETO al final, no solo los campos que a proposito incorporan texto
 * libre. `sanitizeProhibitedPhrases` es un no-op si no hay coincidencia,
 * asi que `cta` y el resto de campos ya limpios salen identicos.
 */
function censorBundle(
  bundle: PropertyTextBundle,
  allowedClaims: readonly string[],
): PropertyTextBundle {
  const censor = (text: string) =>
    sanitizeProhibitedPhrases(text, realEstateTextPolicy, allowedClaims);

  return {
    headline: censor(bundle.headline),
    subheadline: censor(bundle.subheadline),
    descriptionShort: censor(bundle.descriptionShort),
    descriptionLong: censor(bundle.descriptionLong),
    highlights: bundle.highlights.map(censor),
    instagramPostCopy: censor(bundle.instagramPostCopy),
    carouselSlides: bundle.carouselSlides.map(censor) as [
      string,
      string,
      string,
      string,
      string,
    ],
    storyCopy: censor(bundle.storyCopy),
    email: {
      subject: censor(bundle.email.subject),
      preheader: censor(bundle.email.preheader),
      body: censor(bundle.email.body),
    },
    videoScript: censor(bundle.videoScript),
    cta: censor(bundle.cta),
  };
}

export type { AiProvider } from "@/lib/text-engine/ai-provider";
export { noopAiProvider } from "@/lib/text-engine/ai-provider";
