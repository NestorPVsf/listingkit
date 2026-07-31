import { BrandLogo, Ellipsis, PieceCanvas } from "./shared";
import type { BasePieceProps } from "./types";

const SIDE_MARGIN = 72; // >= 64px pedido por el brief (zona segura IG)
// Zonas reservadas a la UI nativa de Instagram (barra de perfil arriba,
// barra de respuesta/CTA nativo abajo) — el contenido nunca debe entrar ahi.
const TOP_SAFE = 220;
const BOTTOM_SAFE = 260;

/**
 * Story de Instagram 1080x1920 (spec.md pieza 4): foto vertical, tipo,
 * precio, zona, 3 datos, CTA, zona segura para UI de Instagram.
 */
export function StoryInstagram({ view, brand, texts, photos }: BasePieceProps) {
  const mainPhoto = photos[0];

  return (
    <PieceCanvas pieceId="story-instagram" brand={brand}>
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

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.72) 18%, rgba(0,0,0,0.3) 44%, rgba(0,0,0,0.12) 70%, rgba(0,0,0,0.45) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: TOP_SAFE,
          left: SIDE_MARGIN,
        }}
      >
        <span
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: "#ffffff",
            textTransform: "uppercase",
            letterSpacing: 1,
            background: "rgba(0,0,0,0.35)",
            borderRadius: "var(--piece-radius-md)",
            padding: "8px 16px",
          }}
        >
          {view.operation === "rent" ? "Alquiler" : "Venta"}
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          left: SIDE_MARGIN,
          right: SIDE_MARGIN,
          bottom: BOTTOM_SAFE,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <Ellipsis
          lines={3}
          style={{
            fontFamily: "var(--font-piece-display)",
            fontWeight: 700,
            fontSize: 60,
            lineHeight: 1.12,
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

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
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

        <span
          style={{
            fontFamily: "var(--font-piece-display)",
            fontWeight: 700,
            fontSize: 48,
            color: "var(--piece-on-primary)",
            background: "var(--piece-primary)",
            borderRadius: "var(--piece-radius-lg)",
            padding: "16px 30px",
            alignSelf: "flex-start",
          }}
        >
          {texts.priceLabel}
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          left: SIDE_MARGIN,
          right: SIDE_MARGIN,
          bottom: BOTTOM_SAFE - 96,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <BrandLogo brand={brand} maxHeight={40} />
        <span
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: "#ffffff",
          }}
        >
          {texts.cta} ↑
        </span>
      </div>
    </PieceCanvas>
  );
}
