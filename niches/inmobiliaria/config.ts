import { compileNiche } from "@/lib/engine/compile-niche";
import { defineNicheConfig } from "@/lib/engine/niche-config";
import { propertyBindingMap, type PropertyBindings } from "./bindings";
import { realEstatePieces } from "./catalog";
import { realEstateLegalRules } from "./legal-rules";
import {
  propertyInputSchema,
  toPublicPropertyInput,
  type PropertyInput,
  type PublicPropertyInput,
} from "./schema";
import { realEstateTextPolicy } from "./text-policy";

export const inmobiliariaConfig = defineNicheConfig<
  PropertyInput,
  PublicPropertyInput,
  PropertyBindings
>({
  id: "inmobiliaria",
  version: "1.0.0",
  inputSchema: propertyInputSchema,
  toPublicInput: toPublicPropertyInput,
  bindingMap: propertyBindingMap,
  pieces: realEstatePieces,
  textPolicy: {
    tone: {
      register: "neutral",
      person: "second-singular",
      maxHeadlineLength: 80,
      maxParagraphLength: 420,
    },
    prohibitedPhrases: realEstateTextPolicy.prohibitedPhrases,
    glossary: [],
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
  legalRules: realEstateLegalRules,
});

export const inmobiliariaNiche = compileNiche(inmobiliariaConfig);
