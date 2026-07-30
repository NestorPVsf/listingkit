/**
 * Utilidades compartidas entre las 4 familias de plantillas. Todo lo visual
 * usa `PieceBrand` (colores/fuentes de la marca activa), nunca los tokens de
 * la UI de la app (.claude/design/DESIGN.md: "las piezas usan la marca
 * activa, no el estilo de la app").
 */
import type { CSSProperties, ReactNode } from "react";
import type { PieceBrand } from "./types";

export const PIECE_DIMENSIONS = {
  "post-instagram": { width: 1080, height: 1350, unit: "px" as const },
  "story-instagram": { width: 1080, height: 1920, unit: "px" as const },
  "carousel-1": { width: 1080, height: 1350, unit: "px" as const },
  "carousel-2": { width: 1080, height: 1350, unit: "px" as const },
  "carousel-3": { width: 1080, height: 1350, unit: "px" as const },
  "carousel-4": { width: 1080, height: 1350, unit: "px" as const },
  "carousel-5": { width: 1080, height: 1350, unit: "px" as const },
  "ficha-pdf": { width: 210, height: 297, unit: "mm" as const },
} as const;

export type PieceId = keyof typeof PIECE_DIMENSIONS;

export function isPieceId(value: string): value is PieceId {
  return value in PIECE_DIMENSIONS;
}

/** CSS vars de marca — cada plantilla las consume via var(--piece-*). */
export function brandCssVars(brand: PieceBrand): CSSProperties {
  return {
    "--piece-bg": brand.colors.background,
    "--piece-surface": brand.colors.surface,
    "--piece-text": brand.colors.text,
    "--piece-text-muted": brand.colors.textMuted,
    "--piece-primary": brand.colors.primary,
    "--piece-secondary": brand.colors.secondary,
    "--piece-on-primary": brand.colors.onPrimary,
    "--piece-border": brand.colors.border,
    "--piece-radius-sm": brand.radii.sm,
    "--piece-radius-md": brand.radii.md,
    "--piece-radius-lg": brand.radii.lg,
    "--font-piece-display": `"${brand.fonts.display}", serif`,
    "--font-piece-body": `"${brand.fonts.body}", sans-serif`,
  } as CSSProperties;
}

interface PieceCanvasProps {
  readonly pieceId: PieceId;
  readonly brand: PieceBrand;
  readonly children: ReactNode;
}

/**
 * Lienzo raiz de una pieza: fija dimensiones EXACTAS (sin overflow, sin
 * márgenes UA) y expone las CSS vars de marca. Usado dentro de la ruta de
 * preview, que ya resetea `html, body` a 0 margin (ver app/preview/layout.tsx).
 */
export function PieceCanvas({ pieceId, brand, children }: PieceCanvasProps) {
  const dimensions = PIECE_DIMENSIONS[pieceId];
  return (
    <div
      data-piece-canvas={pieceId}
      style={{
        ...brandCssVars(brand),
        width: `${dimensions.width}${dimensions.unit}`,
        height: `${dimensions.height}${dimensions.unit}`,
        position: "relative",
        overflow: "hidden",
        background: "var(--piece-bg)",
        color: "var(--piece-text)",
        fontFamily: "var(--font-piece-body)",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

/** Trunca visualmente con elipsis CSS — nunca corta el contenido real. */
export function Ellipsis({
  children,
  lines = 1,
  style,
}: {
  readonly children: ReactNode;
  readonly lines?: number;
  readonly style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
        overflow: "hidden",
        wordBreak: "break-word",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Ratio ancho:alto maximo razonable para el footprint del badge de logo. */
const LOGO_BOX_ASPECT_RATIO = 4;

export function BrandLogo({
  brand,
  maxHeight = 48,
}: {
  readonly brand: PieceBrand;
  readonly maxHeight?: number;
}) {
  if (brand.logoUrl) {
    // Caja de tamano FIJO (ambas dimensiones, no solo max-*): sin esto, un
    // <img> sin box explicito colapsa a su tamano natural y objectFit:contain
    // se vuelve un no-op — el logo "flota" diminuto en vez de ocupar el
    // footprint de badge pretendido.
    return (
      <div
        style={{
          height: maxHeight,
          width: Math.min(maxHeight * LOGO_BOX_ASPECT_RATIO, 220),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- pieza estatica renderizada fuera de Next Image (sirve para PDF/PNG offline) */}
        <img
          src={brand.logoUrl}
          alt={brand.name}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
    );
  }
  return (
    <span
      style={{
        fontFamily: "var(--font-piece-display)",
        fontWeight: 600,
        fontSize: maxHeight * 0.55,
        color: "var(--piece-text)",
      }}
    >
      {brand.name}
    </span>
  );
}
