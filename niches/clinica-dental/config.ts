import { compileNiche } from "@/lib/engine/compile-niche";
import { defineNicheConfig } from "@/lib/engine/niche-config";
import { treatmentBindingMap, type TreatmentBindings } from "./bindings";
import { dentalPieces } from "./catalog";
import { dentalLegalRules } from "./legal-rules";
import {
  treatmentInputSchema,
  toPublicTreatmentInput,
  type PublicTreatmentInput,
  type TreatmentInput,
} from "./schema";

/**
 * PoC de Fase 8.2. La forma del fichero es identica a
 * `niches/inmobiliaria/config.ts` — que es exactamente la prueba: montar un
 * vertical nuevo consiste en rellenar este objeto, no en tocar el motor.
 */
export const clinicaDentalConfig = defineNicheConfig<
  TreatmentInput,
  PublicTreatmentInput,
  TreatmentBindings
>({
  id: "clinica-dental",
  version: "0.1.0",
  inputSchema: treatmentInputSchema,
  toPublicInput: toPublicTreatmentInput,
  bindingMap: treatmentBindingMap,
  pieces: dentalPieces,
  textPolicy: {
    tone: {
      // Sanidad: el registro es mas formal y menos comercial que en vivienda.
      register: "formal",
      person: "first-plural",
      maxHeadlineLength: 70,
      maxParagraphLength: 380,
    },
    prohibitedPhrases: [
      "resultados garantizados",
      "sin dolor",
      "cura definitiva",
      "el mejor dentista",
      "sin riesgos",
    ],
    glossary: [
      {
        canonical: "implante dental",
        aliases: ["implante", "tornillo dental"],
        note: "Usar el termino clinico completo en la primera mencion.",
      },
    ],
    allowUnverifiedClaims: false,
    explicitlyAllowedPhrases: (input) => input.explicitlyAllowedClaims,
    normalizeForComparison: (value, locale) =>
      value
        .normalize("NFKD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase(locale)
        .replace(/\s+/g, " ")
        .trim(),
  },
  legalRules: dentalLegalRules,
});

export const clinicaDentalNiche = compileNiche(clinicaDentalConfig);
