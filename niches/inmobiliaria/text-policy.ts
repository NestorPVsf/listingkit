/**
 * Politica de texto del vertical inmobiliario — ver
 * docs/architecture/niche-engine.md ("Politica de texto inmobiliaria").
 * Configuracion del nicho, no del motor: el motor (`lib/text-engine/`) no
 * conoce estas frases concretas.
 */
import type { TextPolicy } from "@/lib/text-engine/policy";

function normalizeForComparison(value: string): string {
  return value.toLocaleLowerCase("es-ES").replace(/\s+/g, " ").trim();
}

export const realEstateTextPolicy: TextPolicy = {
  prohibitedPhrases: [
    "oportunidad única",
    "la mejor propiedad",
    "inversión garantizada",
    "rentabilidad asegurada",
    "última oportunidad",
  ],
  normalizeForComparison,
};
