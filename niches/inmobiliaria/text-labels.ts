/**
 * Vocabulario de plantillas del vertical inmobiliario (español v1). Vive
 * fuera de `lib/text-engine/` a proposito: son las "plantillas" del nicho,
 * el motor solo sabe interpolar/componer.
 *
 * Extension a otro idioma: anadir un modulo hermano (ej. `text-labels.en.ts`)
 * con la misma forma y resolver por locale en `lib/text-engine/index.ts` —
 * v1 solo cablea español.
 */
import type { PublicPropertyView } from "./public-view";

export const PROPERTY_TYPE_LABELS: Record<PublicPropertyView["propertyType"], string> = {
  apartment: "piso",
  house: "casa",
  penthouse: "ático",
  studio: "estudio",
  commercial: "local comercial",
  land: "parcela",
};

export const CONDITION_LABELS: Record<PublicPropertyView["condition"], string> = {
  new: "a estrenar",
  excellent: "en excelente estado",
  good: "en buen estado",
  "renovation-needed": "para reformar",
};

const FEATURE_LABELS = {
  elevator: "ascensor",
  terrace: "terraza",
  balcony: "balcón",
  garage: "garaje",
  storageRoom: "trastero",
  pool: "piscina",
  garden: "jardín",
} as const satisfies Partial<Record<keyof PublicPropertyView, string>>;

/** Solo incluye una caracteristica si el booleano correspondiente es true —
 * nunca inventa datos ausentes (regla dura de spec.md). */
export function buildFeatureList(view: PublicPropertyView): string[] {
  return (Object.keys(FEATURE_LABELS) as (keyof typeof FEATURE_LABELS)[])
    .filter((key) => view[key])
    .map((key) => FEATURE_LABELS[key]);
}
