/**
 * Contrato de props de las plantillas de piezas (Paso 4.2 del PLAN.md).
 *
 * Regla dura (spec.md #1 + docs/architecture/niche-engine.md): las plantillas
 * SOLO reciben `PublicPropertyView` (niches/inmobiliaria/public-view.ts), NUNCA
 * `Property` ni `PropertyInput`. `privateAddress`/`internalName` no existen en
 * este contrato — no hay forma de que una plantilla los filtre por accidente.
 *
 * `PieceBrand` es la marca YA RESUELTA (preset + overrides de agencia) en un
 * shape neutro (claves en ingles) que las plantillas consumen directamente,
 * independiente de si el origen fue `brand-presets.json` (claves español) o
 * `BrandConfig` (niches/inmobiliaria/brand.schema.ts). El adaptador vive en
 * `./brand-adapter.ts`.
 *
 * `PieceTexts` es el bloque de texto que genera el text-engine (fase separada,
 * ver .specs/active/inmocontent-os/spec.md regla #2: "el sistema NO inventa
 * datos"). Las plantillas NUNCA hardcodean copy — todo texto llega por props.
 * Campos ausentes (ej. sin zona) deben omitirse en el binding, no rellenarse
 * con placeholder en la plantilla.
 */
import type { PublicPropertyView } from "../public-view";

export interface PieceBrand {
  readonly name: string;
  readonly logoUrl: string | null;
  readonly colors: {
    readonly background: string;
    readonly surface: string;
    readonly text: string;
    readonly textMuted: string;
    readonly primary: string;
    readonly secondary: string;
    readonly onPrimary: string;
    readonly border: string;
  };
  readonly fonts: {
    readonly display: string;
    readonly body: string;
  };
  readonly radii: {
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
  };
  readonly contact: {
    readonly website?: string;
    readonly phone?: string;
    readonly email?: string;
    readonly instagram?: string;
  };
}

/**
 * Bloques de texto por pieza. Cada campo es opcional cuando el dato de origen
 * puede faltar (regla "los datos ausentes se omiten, el motor no inventa").
 * El resolver de bindings (text-engine, fase posterior) es responsable de
 * truncar a los limites de `ToneProfile` (niche-engine.md) ANTES de pasar
 * aqui — las plantillas solo aplican truncado defensivo de layout (elipsis
 * CSS), nunca de contenido.
 */
export interface PieceTexts {
  /** "Piso en Centro, Alicante" — tipo + zona/ciudad */
  readonly headline: string;
  /** "245.000 €" o "850 €/mes" ya formateado */
  readonly priceLabel: string;
  /** "Centro, Alicante" — zona publica, puede faltar */
  readonly publicLocation?: string;
  /** ["3 hab.", "1 baño", "78 m²"] */
  readonly metrics: readonly string[];
  /** ["Ascensor", "Terraza", ...] traducidos, ya filtrados a los presentes */
  readonly featureLabels: readonly string[];
  readonly description: string;
  /** Hasta 5 destacados (spec.md) */
  readonly highlights: readonly string[];
  readonly cta: string;
  /** Slide 4 del carrusel: "estilo de vida / beneficios reales" */
  readonly lifestyleParagraph?: string;
  /** Aviso legal ficha PDF, p.ej. certificado energetico pendiente */
  readonly legalNotice?: string;
  /** "Verificar antes de publicar" (spec.md pieza 1) */
  readonly verificationNotice: string;
}

export interface PiecePhoto {
  readonly url: string;
  readonly alt: string;
}

export interface BasePieceProps {
  readonly view: PublicPropertyView;
  readonly brand: PieceBrand;
  readonly texts: PieceTexts;
  /** URLs ya resueltas (demo: placeholders locales; real: storage). */
  readonly photos: readonly PiecePhoto[];
}

export interface CarouselSlideProps extends BasePieceProps {
  readonly slide: 1 | 2 | 3 | 4 | 5;
}

export interface FichaPdfProps extends BasePieceProps {
  /** Data URI (image/png o image/svg+xml) del QR ya generado server-side. */
  readonly qrDataUrl: string | null;
}
