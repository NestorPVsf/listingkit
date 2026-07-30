import type { LegalRule } from "@/lib/engine/niche-config";
import type { PropertyInput } from "./schema";

export const realEstateLegalRules: readonly LegalRule<PropertyInput>[] = [
  {
    id: "es-energy-certificate",
    jurisdictions: ["ES"],
    evaluate: (input) =>
      input.energyCertificate
        ? null
        : {
            ruleId: "es-energy-certificate",
            severity: "warning",
            code: "ENERGY_CERTIFICATE_MISSING",
            message:
              "Falta la información del certificado energético para el anuncio.",
            remediation:
              "Añade la calificación energética o valida la excepción aplicable antes de publicar.",
          },
  },
];
