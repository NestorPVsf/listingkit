/**
 * Reglas legales del vertical sanitario. Demuestran que el gate legal del
 * motor es realmente generico: inmobiliaria lo usa para el certificado
 * energetico y aqui bloquea publicidad sanitaria ilegal, con el mismo
 * contrato `LegalRule` y la misma semantica de severidad.
 *
 * Base: RD 1907/1996 (publicidad de pretendida finalidad sanitaria) y Ley
 * 34/1988 General de Publicidad — no se pueden prometer resultados ni
 * garantizar la curacion. La TAE es obligatoria al anunciar financiacion
 * (Ley 16/2011 de credito al consumo).
 */
import type { LegalRule } from "@/lib/engine/niche-config";
import type { TreatmentInput } from "./schema";

/** Promesas que convierten el anuncio en publicidad sanitaria ilicita. */
const FORBIDDEN_PROMISES = [
  "resultados garantizados",
  "garantizamos el resultado",
  "cura definitiva",
  "sin dolor",
  "100% de exito",
  "sin riesgos",
  "resultado permanente",
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export const dentalLegalRules: readonly LegalRule<TreatmentInput>[] = [
  {
    id: "es-health-no-guaranteed-results",
    jurisdictions: ["ES"],
    evaluate: (input) => {
      const haystack = normalize(`${input.treatmentName} ${input.summary}`);
      const offending = FORBIDDEN_PROMISES.find((phrase) =>
        haystack.includes(normalize(phrase)),
      );
      return offending
        ? {
            ruleId: "es-health-no-guaranteed-results",
            severity: "blocking",
            code: "HEALTH_GUARANTEED_RESULT_CLAIM",
            message: `El texto promete un resultado ("${offending}"), prohibido en publicidad sanitaria.`,
            remediation:
              "Reescribe el texto sin prometer resultados ni ausencia de riesgos (RD 1907/1996).",
          }
        : null;
    },
  },
  {
    id: "es-health-professional-identification",
    jurisdictions: ["ES"],
    evaluate: (input) =>
      input.professional.licenseNumber.trim().length > 0
        ? null
        : {
            ruleId: "es-health-professional-identification",
            severity: "blocking",
            code: "HEALTH_PROFESSIONAL_ID_MISSING",
            message:
              "Falta el numero de colegiado del profesional responsable del tratamiento.",
            remediation:
              "Anade el numero de colegiado antes de publicar cualquier pieza.",
          },
  },
  {
    id: "es-financing-apr",
    jurisdictions: ["ES"],
    evaluate: (input) =>
      input.financingAvailable && input.financingApr === undefined
        ? {
            ruleId: "es-financing-apr",
            severity: "warning",
            code: "FINANCING_APR_MISSING",
            message:
              "Se anuncia financiacion sin declarar la TAE, obligatoria en credito al consumo.",
            remediation:
              "Anade la TAE aplicable o retira la mencion a la financiacion.",
          }
        : null,
  },
];
