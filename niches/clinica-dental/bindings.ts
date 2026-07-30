import type { BindingRecord } from "@/lib/engine/contracts";
import type { FieldBindingMap } from "@/lib/engine/niche-config";
import type { PublicTreatmentInput } from "./schema";

export type TreatmentBindings = BindingRecord & {
  readonly headline: string;
  readonly priceLabel: string;
  readonly priceDetail: string;
  readonly planLabel: string;
  readonly includes: readonly string[];
  readonly summary: string;
  readonly professionalLine: string;
  readonly clinicLine: string;
  readonly legalNotice: string;
  readonly cta: string;
  readonly bookingUrl: string | null;
  readonly primaryPhotoAssetId: string;
  readonly galleryAssetIds: readonly string[];
};

const CATEGORY_LABELS: Record<PublicTreatmentInput["category"], string> = {
  implantologia: "Implantologia",
  ortodoncia: "Ortodoncia",
  estetica: "Estetica dental",
  periodoncia: "Periodoncia",
  odontopediatria: "Odontopediatria",
  prevencion: "Prevencion",
};

function euros(amount: number): string {
  return `${new Intl.NumberFormat("es-ES").format(amount)} EUR`;
}

/**
 * Mismo contrato `FieldBindingMap` que inmobiliaria: cada binding declara de
 * que campos publicos depende y como se deriva. El motor no interpreta ninguno.
 */
export const treatmentBindingMap = {
  headline: {
    sources: ["treatmentName", "category"],
    resolve: (input) =>
      `${input.treatmentName} · ${CATEGORY_LABELS[input.category]}`,
  },
  priceLabel: {
    sources: ["priceFromEur"],
    resolve: (input) => `Desde ${euros(input.priceFromEur)}`,
  },
  priceDetail: {
    sources: ["priceIncludesVat", "financingAvailable", "financingApr"],
    resolve: (input) => {
      const vat = input.priceIncludesVat ? "IVA incluido" : "IVA no incluido";
      if (!input.financingAvailable) return vat;
      const apr =
        input.financingApr === undefined
          ? "financiacion disponible"
          : `financiacion desde ${input.financingApr.toFixed(2)}% TAE`;
      return `${vat} · ${apr}`;
    },
  },
  planLabel: {
    sources: ["sessions", "sessionMinutes"],
    resolve: (input) =>
      `${input.sessions} ${input.sessions === 1 ? "sesion" : "sesiones"} de ${input.sessionMinutes} min`,
  },
  includes: {
    sources: ["priceIncludes"],
    resolve: (input) => input.priceIncludes,
  },
  summary: {
    sources: ["summary"],
    resolve: (input) => input.summary,
  },
  professionalLine: {
    sources: ["professional"],
    resolve: (input) =>
      `${input.professional.name} · Col. n.o ${input.professional.licenseNumber}`,
  },
  clinicLine: {
    sources: ["clinic"],
    resolve: (input) => `${input.clinic.name} · ${input.clinic.city} · ${input.clinic.phone}`,
  },
  legalNotice: {
    sources: ["treatmentName"],
    // Aviso fijo del sector: la publicidad sanitaria no puede prometer
    // resultados y debe remitir a valoracion profesional previa.
    resolve: () =>
      "Tratamiento sujeto a valoracion clinica previa. Los resultados varian en cada paciente.",
  },
  cta: {
    sources: ["cta"],
    resolve: (input) => input.cta,
  },
  bookingUrl: {
    sources: ["clinic"],
    resolve: (input) => input.clinic.bookingUrl ?? null,
  },
  primaryPhotoAssetId: {
    sources: ["primaryPhotoAssetId"],
    resolve: (input) => input.primaryPhotoAssetId,
  },
  galleryAssetIds: {
    sources: ["photoAssetIds"],
    resolve: (input) => input.photoAssetIds,
  },
} satisfies FieldBindingMap<PublicTreatmentInput, TreatmentBindings>;
