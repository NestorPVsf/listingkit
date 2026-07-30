/**
 * Adapta las dos formas de marca del repo (preset español de brand-presets.json
 * y BrandConfig de brand.schema.ts) al shape neutro `PieceBrand` que consumen
 * las plantillas. Mantiene las plantillas ignorantes de cual origen se uso.
 */
import type { BrandPreset, BrandConfig } from "../brand.schema";
import type { PieceBrand } from "./types";

export function presetToPieceBrand(preset: BrandPreset): PieceBrand {
  return {
    name: preset.nombre,
    logoUrl: null,
    colors: preset.colores,
    fonts: {
      display: preset.tipografia.display.familia,
      body: preset.tipografia.body.familia,
    },
    radii: preset.radios,
    contact: {},
  };
}

export function brandConfigToPieceBrand(brand: BrandConfig): PieceBrand {
  return {
    name: brand.nombre,
    logoUrl: brand.logo,
    colors: brand.colores,
    fonts: {
      display: brand.tipografia.display.familia,
      body: brand.tipografia.body.familia,
    },
    // BrandConfig no persiste radios (son propiedad del preset elegido en el
    // onboarding, no de la agencia); md razonable por defecto si faltara.
    radii: { sm: "4px", md: "8px", lg: "12px" },
    contact: {
      website: brand.web,
      phone: brand.telefono,
      email: brand.email,
      instagram: brand.instagram,
    },
  };
}

/** Todas las familias del catalogo (brand-presets.json), para <link> de Google Fonts. */
export const GOOGLE_FONT_QUERY: Record<string, string> = {
  Fraunces: "Fraunces:wght@400;500;600;700",
  Inter: "Inter:wght@400;500;600",
  "Space Grotesk": "Space+Grotesk:wght@500;700",
  "Playfair Display": "Playfair+Display:wght@600;700",
  "Work Sans": "Work+Sans:wght@300;400;500",
  Fredoka: "Fredoka:wght@500;600",
  "Nunito Sans": "Nunito+Sans:wght@400;600;700",
};

export function googleFontsHref(brand: PieceBrand): string | null {
  const families = Array.from(
    new Set([brand.fonts.display, brand.fonts.body]),
  )
    .map((family) => GOOGLE_FONT_QUERY[family])
    .filter((query): query is string => Boolean(query));

  if (families.length === 0) return null;

  return `https://fonts.googleapis.com/css2?${families
    .map((family) => `family=${family}`)
    .join("&")}&display=swap`;
}
