import { BrandLogo, Ellipsis, PieceCanvas } from "./shared";
import type { CarouselSlideProps } from "./types";

const SAFE_MARGIN = 64;

function SlideNumber({ slide }: { readonly slide: number }) {
  return (
    <span
      style={{
        position: "absolute",
        top: SAFE_MARGIN,
        right: SAFE_MARGIN,
        fontSize: 24,
        fontWeight: 600,
        color: "var(--piece-text-muted)",
      }}
    >
      {String(slide).padStart(2, "0")}/05
    </span>
  );
}

/** Slide 1: foto + titular + ubicacion + precio. */
function Slide1({ texts, photos }: CarouselSlideProps) {
  const photo = photos[0];
  return (
    <>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.url}
          alt={photo.alt}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.84) 0%, rgba(0,0,0,0.68) 20%, rgba(0,0,0,0.3) 48%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.4) 100%)",
        }}
      />
      <SlideNumber slide={1} />
      <div
        style={{
          position: "absolute",
          left: SAFE_MARGIN,
          right: SAFE_MARGIN,
          bottom: SAFE_MARGIN,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <Ellipsis
          lines={2}
          style={{ fontFamily: "var(--font-piece-display)", fontWeight: 700, fontSize: 52, color: "#ffffff" }}
        >
          {texts.headline}
        </Ellipsis>
        {texts.publicLocation ? (
          <span style={{ fontSize: 28, color: "rgba(255,255,255,0.9)" }}>{texts.publicLocation}</span>
        ) : null}
        <span
          style={{
            alignSelf: "flex-start",
            fontFamily: "var(--font-piece-display)",
            fontWeight: 700,
            fontSize: 40,
            color: "var(--piece-on-primary)",
            background: "var(--piece-primary)",
            borderRadius: "var(--piece-radius-lg)",
            padding: "12px 24px",
          }}
        >
          {texts.priceLabel}
        </span>
      </div>
    </>
  );
}

/** Slide 2: hab/baños/m² + caracteristicas. */
function Slide2({ texts }: CarouselSlideProps) {
  return (
    <div style={{ padding: SAFE_MARGIN, display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
      <SlideNumber slide={2} />
      <span
        style={{ fontFamily: "var(--font-piece-display)", fontWeight: 700, fontSize: 44, color: "var(--piece-text)", marginTop: 60 }}
      >
        Datos de la vivienda
      </span>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 40 }}>
        {texts.metrics.map((metric) => (
          <span
            key={metric}
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: "var(--piece-text)",
              background: "var(--piece-surface)",
              border: "1px solid var(--piece-border)",
              borderRadius: "var(--piece-radius-md)",
              padding: "16px 26px",
            }}
          >
            {metric}
          </span>
        ))}
      </div>
      {texts.featureLabels.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 48 }}>
          {texts.featureLabels.map((label) => (
            <span key={label} style={{ fontSize: 28, color: "var(--piece-secondary)", fontWeight: 600 }}>
              • {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Slide 3: galeria de 2-3 fotos. */
function Slide3({ photos }: CarouselSlideProps) {
  const gallery = photos.slice(1, 4);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <SlideNumber slide={3} />
      {gallery.length > 0 ? (
        gallery.map((photo) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.url}
            src={photo.url}
            alt={photo.alt}
            style={{ width: "100%", flex: 1, objectFit: "cover", minHeight: 0 }}
          />
        ))
      ) : (
        <div style={{ flex: 1, background: "var(--piece-surface)" }} />
      )}
    </div>
  );
}

/** Slide 4: estilo de vida / beneficios reales. */
function Slide4({ texts }: CarouselSlideProps) {
  return (
    <div style={{ padding: SAFE_MARGIN, display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box", justifyContent: "center" }}>
      <SlideNumber slide={4} />
      <span style={{ fontFamily: "var(--font-piece-display)", fontWeight: 700, fontSize: 44, color: "var(--piece-text)", marginBottom: 32 }}>
        Vivir aqui
      </span>
      <Ellipsis
        lines={8}
        style={{ fontSize: 32, lineHeight: 1.5, color: "var(--piece-text)" }}
      >
        {texts.lifestyleParagraph ?? texts.description}
      </Ellipsis>
      {texts.highlights.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 32 }}>
          {texts.highlights.slice(0, 3).map((highlight) => (
            <span key={highlight} style={{ fontSize: 26, color: "var(--piece-secondary)", fontWeight: 600 }}>
              ✓ {highlight}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Slide 5: contacto + CTA. */
function Slide5({ brand, view, texts }: CarouselSlideProps) {
  return (
    <div
      style={{
        padding: SAFE_MARGIN,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        boxSizing: "border-box",
        justifyContent: "center",
        alignItems: "center",
        gap: 28,
        background: "var(--piece-surface)",
      }}
    >
      <SlideNumber slide={5} />
      <BrandLogo brand={brand} maxHeight={72} />
      <span
        style={{
          fontFamily: "var(--font-piece-display)",
          fontWeight: 700,
          fontSize: 40,
          textAlign: "center",
          color: "var(--piece-text)",
        }}
      >
        {texts.cta}
      </span>
      <span style={{ fontSize: 28, color: "var(--piece-text-muted)" }}>{view.agent.name}</span>
      <span
        style={{
          fontFamily: "var(--font-piece-display)",
          fontWeight: 700,
          fontSize: 32,
          color: "var(--piece-on-primary)",
          background: "var(--piece-primary)",
          borderRadius: "var(--piece-radius-lg)",
          padding: "14px 28px",
        }}
      >
        {view.agent.phone}
      </span>
    </div>
  );
}

const SLIDES: Record<CarouselSlideProps["slide"], (props: CarouselSlideProps) => React.JSX.Element> = {
  1: Slide1,
  2: Slide2,
  3: Slide3,
  4: Slide4,
  5: Slide5,
};

export function CarouselSlide(props: CarouselSlideProps) {
  const pieceId = `carousel-${props.slide}` as const;
  const Slide = SLIDES[props.slide];
  return (
    <PieceCanvas pieceId={pieceId} brand={props.brand}>
      <Slide {...props} />
    </PieceCanvas>
  );
}
