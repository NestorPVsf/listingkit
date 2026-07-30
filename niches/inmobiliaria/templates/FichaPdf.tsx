import { BrandLogo, PieceCanvas } from "./shared";
import type { FichaPdfProps } from "./types";

const PAGE_MARGIN = "14mm";

/**
 * Ficha tecnica PDF A4 (spec.md pieza 1): logo, foto principal, nombre,
 * precio, ubicacion publica, caracteristicas, descripcion, galeria, datos
 * del agente, QR a la URL de la propiedad, aviso "verificar antes de
 * publicar". `qrDataUrl` llega ya generado (server-side, `qrcode` npm) — si
 * es null (sin `listingUrl`), el componente omite el bloque QR en vez de
 * inventar un placeholder.
 */
export function FichaPdf({ view, brand, texts, photos, qrDataUrl }: FichaPdfProps) {
  const mainPhoto = photos[0];
  const gallery = photos.slice(1, 5);

  return (
    <PieceCanvas pieceId="ficha-pdf" brand={brand}>
      <div
        style={{
          padding: PAGE_MARGIN,
          height: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "6mm",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <BrandLogo brand={brand} maxHeight={28} />
          <span style={{ fontSize: "3mm", color: "var(--piece-text-muted)" }}>
            {view.agency.name}
          </span>
        </header>

        {mainPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mainPhoto.url}
            alt={mainPhoto.alt}
            style={{ width: "100%", height: "80mm", objectFit: "cover", borderRadius: "var(--piece-radius-md)" }}
          />
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2mm", maxWidth: "60%" }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-piece-display)", fontWeight: 700, fontSize: "7mm", color: "var(--piece-text)" }}>
              {texts.headline}
            </h1>
            {texts.publicLocation ? (
              <span style={{ fontSize: "3.5mm", color: "var(--piece-text-muted)" }}>{texts.publicLocation}</span>
            ) : null}
          </div>
          <span
            style={{
              fontFamily: "var(--font-piece-display)",
              fontWeight: 700,
              fontSize: "6mm",
              color: "var(--piece-on-primary)",
              background: "var(--piece-primary)",
              borderRadius: "var(--piece-radius-md)",
              padding: "2mm 4mm",
              whiteSpace: "nowrap",
            }}
          >
            {texts.priceLabel}
          </span>
        </div>

        <section style={{ display: "flex", gap: "4mm", flexWrap: "wrap" }}>
          {[...texts.metrics, ...texts.featureLabels].map((item) => (
            <span
              key={item}
              style={{
                fontSize: "3.2mm",
                fontWeight: 600,
                color: "var(--piece-text)",
                border: "0.3mm solid var(--piece-border)",
                borderRadius: "var(--piece-radius-sm)",
                padding: "1.5mm 3mm",
              }}
            >
              {item}
            </span>
          ))}
        </section>

        <section>
          <p style={{ margin: 0, fontSize: "3.4mm", lineHeight: 1.5, color: "var(--piece-text)" }}>
            {texts.description}
          </p>
        </section>

        {gallery.length > 0 ? (
          <section style={{ display: "flex", gap: "2mm" }}>
            {gallery.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.url}
                src={photo.url}
                alt={photo.alt}
                style={{ flex: 1, height: "28mm", objectFit: "cover", borderRadius: "var(--piece-radius-sm)", minWidth: 0 }}
              />
            ))}
          </section>
        ) : null}

        <footer
          style={{
            marginTop: "auto",
            paddingTop: "4mm",
            borderTop: "0.3mm solid var(--piece-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1mm" }}>
            <span style={{ fontSize: "3.2mm", fontWeight: 600, color: "var(--piece-text)" }}>{view.agent.name}</span>
            <span style={{ fontSize: "2.8mm", color: "var(--piece-text-muted)" }}>{view.agent.phone}</span>
            <span style={{ fontSize: "2.8mm", color: "var(--piece-text-muted)" }}>{view.agent.email}</span>
            {texts.legalNotice ? (
              <span style={{ fontSize: "2.6mm", color: "var(--piece-secondary)", marginTop: "1mm" }}>
                {texts.legalNotice}
              </span>
            ) : null}
            <span style={{ fontSize: "2.4mm", color: "var(--piece-text-muted)", fontStyle: "italic" }}>
              {texts.verificationNotice}
            </span>
          </div>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Codigo QR al anuncio" style={{ width: "22mm", height: "22mm" }} />
          ) : null}
        </footer>
      </div>
    </PieceCanvas>
  );
}
