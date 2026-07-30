import type { PieceDefinition } from "@/lib/engine/contracts";
import type { TreatmentBindings } from "./bindings";

/**
 * Dos piezas, mismo contrato `PieceDefinition` que las seis de inmobiliaria.
 * `requiredBindingKeys` y `blocksOnLegalSeverity` los interpreta el motor sin
 * saber si el binding que falta es "priceLabel" de un piso o de un implante.
 */
export const dentalPieces = [
  {
    key: "treatment-poster",
    label: "Poster del tratamiento",
    renderer: "image",
    templateId: "clinica-dental/treatment-poster@1",
    output: {
      kind: "single",
      extension: "png",
      mediaType: "image/png",
      width: 1080,
      height: 1350,
    },
    requiredBindingKeys: ["headline", "priceLabel", "primaryPhotoAssetId"],
    blocksOnLegalSeverity: ["blocking"],
    enabledByDefault: true,
  },
  {
    key: "treatment-email",
    label: "Email a pacientes",
    renderer: "email",
    templateId: "clinica-dental/treatment-email@1",
    // `kind: "email"` es el contrato del motor para piezas de correo (html +
    // texto plano + ancho maximo). Primer intento del PoC: declararla como
    // `kind: "single", extension: "html"` — y `tsc` lo rechazo, porque el
    // contrato `single` solo admite pdf/png/mp4. Es una friccion real del
    // motor, anotada en AUDIT.md: la lista de extensiones binarias esta
    // cerrada porque refleja lo que los renderers saben producir.
    output: {
      kind: "email",
      html: true,
      plainText: true,
      maxContentWidth: 600,
    },
    requiredBindingKeys: ["headline", "summary", "cta"],
    blocksOnLegalSeverity: ["blocking"],
    enabledByDefault: true,
  },
] as const satisfies readonly PieceDefinition<TreatmentBindings>[];
