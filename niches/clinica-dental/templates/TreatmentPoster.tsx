/**
 * Plantilla 1/2 del PoC dental: poster 1080x1350.
 *
 * Detalle importante para la prueba de generalizacion: recibe
 * `TemplateBindings<TreatmentBindings>` — el tipo GENERICO del motor — y
 * `BrandBindings`. No conoce ningun tipo del vertical inmobiliario ni de la
 * capa de persistencia. Un nicho nuevo escribe su plantilla contra el mismo
 * contrato y nada mas.
 */
import type { BrandBindings, TemplateBindings } from "@/lib/engine/contracts";
import type { TreatmentBindings } from "../bindings";

export interface TreatmentPosterProps {
  readonly bindings: TemplateBindings<TreatmentBindings>;
  readonly photoUrl: string;
}

export function TreatmentPoster({ bindings, photoUrl }: TreatmentPosterProps) {
  const v = bindings.variables;
  const brand: BrandBindings = bindings.brand;

  return (
    <div
      data-piece-canvas
      style={{
        width: 1080,
        height: 1350,
        display: "flex",
        flexDirection: "column",
        background: brand.colors.background,
        color: brand.colors.text,
        fontFamily: brand.fonts.body,
      }}
    >
      <img
        src={photoUrl}
        alt=""
        style={{ width: 1080, height: 620, objectFit: "cover" }}
      />

      <div style={{ padding: 64, display: "flex", flexDirection: "column", gap: 24 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: brand.fonts.heading,
            fontSize: 64,
            lineHeight: 1.05,
          }}
        >
          {v.headline}
        </h1>

        <p style={{ margin: 0, fontSize: 32, color: brand.colors.primary }}>
          {v.priceLabel} <span style={{ fontSize: 22 }}>({v.priceDetail})</span>
        </p>

        <p style={{ margin: 0, fontSize: 26 }}>{v.planLabel}</p>

        <ul style={{ margin: 0, paddingLeft: 28, fontSize: 24 }}>
          {v.includes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <div style={{ marginTop: "auto", fontSize: 20, lineHeight: 1.5 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{v.cta}</p>
          <p style={{ margin: 0 }}>{v.clinicLine}</p>
          <p style={{ margin: 0 }}>{v.professionalLine}</p>
          {/* Aviso legal obligatorio: no es decoracion, va en TODAS las piezas. */}
          <p style={{ margin: "12px 0 0", fontSize: 16, opacity: 0.75 }}>
            {v.legalNotice}
          </p>
        </div>
      </div>
    </div>
  );
}
