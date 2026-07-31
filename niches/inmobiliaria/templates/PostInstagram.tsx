import { BrandLogo, Ellipsis, PieceCanvas } from "./shared";
import type { BasePieceProps } from "./types";

const SAFE_MARGIN = 64;

/**
 * Post de Instagram 1080x1350 (spec.md pieza 2): foto principal, tipo, zona,
 * precio, 3 caracteristicas, logo, CTA. Márgenes seguros ≥64px, legible en
 * movil. notasDeUso por preset (naranja SOLO en precio/CTA, nunca fondo
 * completo) se cumple por construccion: el color primary solo se usa en el
 * badge de precio y la linea de CTA, nunca como background del post.
 */
export function PostInstagram({ view, brand, texts, photos }: BasePieceProps) {
  const mainPhoto = photos[0];

  return (
    <PieceCanvas pieceId="post-instagram" brand={brand}>
      {mainPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mainPhoto.url}
          alt={mainPhoto.alt}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : null}

      {/* Scrim inferior neutro para legibilidad — no es color de marca.
          Reforzado tras cambiar las fotos demo (degradados grises) por fotos
          reales: con un gris medio, 0,55 de negro bastaba; sobre una foto
          luminosa —una ventana, un cielo, una piscina— el titular blanco
          desaparecia. La demo se veia perfecta y la pieza real era ilegible.
          El degradado ahora sube mas arriba y llega mas opaco abajo, que es
          donde se apoya TODO el texto. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.84) 0%, rgba(0,0,0,0.7) 20%, rgba(0,0,0,0.38) 44%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.4) 100%)",
        }}
      />

      {/* Top: tipo + operacion */}
      <div
        style={{
          position: "absolute",
          top: SAFE_MARGIN,
          left: SAFE_MARGIN,
          right: SAFE_MARGIN,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-piece-body)",
            fontWeight: 600,
            fontSize: 28,
            color: "#ffffff",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          {view.operation === "rent" ? "En alquiler" : "En venta"}
        </span>
        <BrandLogo brand={brand} maxHeight={44} />
      </div>

      {/* Bottom: headline, ubicacion, metrics, precio, CTA */}
      <div
        style={{
          position: "absolute",
          left: SAFE_MARGIN,
          right: SAFE_MARGIN,
          bottom: SAFE_MARGIN,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <Ellipsis
          lines={2}
          style={{
            fontFamily: "var(--font-piece-display)",
            fontWeight: 700,
            fontSize: 56,
            lineHeight: 1.1,
            color: "#ffffff",
          }}
        >
          {texts.headline}
        </Ellipsis>

        {texts.publicLocation ? (
          <span style={{ fontSize: 30, color: "rgba(255,255,255,0.9)" }}>
            {texts.publicLocation}
          </span>
        ) : null}

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {texts.metrics.slice(0, 3).map((metric) => (
            <span
              key={metric}
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: "#ffffff",
                background: "rgba(0,0,0,0.42)",
                borderRadius: "var(--piece-radius-md)",
                padding: "8px 18px",
              }}
            >
              {metric}
            </span>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-piece-display)",
              fontWeight: 700,
              fontSize: 44,
              color: "var(--piece-on-primary)",
              background: "var(--piece-primary)",
              borderRadius: "var(--piece-radius-lg)",
              padding: "14px 28px",
            }}
          >
            {texts.priceLabel}
          </span>
          <span
            style={{
              fontSize: 30,
              fontWeight: 600,
              color: "#ffffff",
              textDecoration: "underline",
              textUnderlineOffset: 4,
            }}
          >
            {texts.cta}
          </span>
        </div>
      </div>
    </PieceCanvas>
  );
}
