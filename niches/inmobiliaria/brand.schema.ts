/**
 * Schema Zod de marca (Brand) — Fase 3.3 del PLAN.md de InmoContent OS.
 *
 * Dos schemas distintos porque representan cosas distintas:
 * - `brandPresetSchema`: valida un preset TAL CUAL viene en
 *   `niches/inmobiliaria/brand-presets.json` (claves en español, incluye
 *   metadatos de diseño como `contrasteAA`, `radios`, `notasDeUso`).
 * - `brandConfigSchema`: valida la marca de UNA agencia concreta tras el
 *   onboarding (preset resuelto + datos de contacto). Persiste en la tabla
 *   Brand (prisma/schema.prisma).
 *
 * `resolveBrand` construye la segunda a partir de la primera + overrides.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Catalogo de tipografias — las 7 familias reales usadas por los 4 presets
// de brand-presets.json. Familias fuera de catalogo requieren `esCustom: true`.
// ---------------------------------------------------------------------------

const KNOWN_FONT_FAMILIES = new Set([
  "Fraunces",
  "Inter",
  "Space Grotesk",
  "Playfair Display",
  "Work Sans",
  "Fredoka",
  "Nunito Sans",
]);

// ---------------------------------------------------------------------------
// Primitivas compartidas
// ---------------------------------------------------------------------------

const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color debe ser hex (#RGB o #RRGGBB).");

const coloresSchema = z.object({
  background: hexColorSchema,
  surface: hexColorSchema,
  text: hexColorSchema,
  textMuted: hexColorSchema,
  primary: hexColorSchema,
  secondary: hexColorSchema,
  onPrimary: hexColorSchema,
  border: hexColorSchema,
});

// Logo servido siempre desde uploads/brand/ (ver sanitizeFileName en
// niches/inmobiliaria/schema.ts) — el regex por si solo ya excluye traversal,
// rutas absolutas ajenas y extensiones no soportadas.
//
// SVG queda FUERA a proposito (F-03 de la review adversarial): un SVG es un
// documento activo. Servido same-origin desde /uploads/brand/<archivo>.svg,
// su <script> podia leer el borrador de propiedad de localStorage —que incluye
// privateAddress e internalName— y llamar a las APIs. Solo raster recodificado.
const LOGO_PATH_REGEX = /^\/uploads\/brand\/[^/\\]+\.(png|webp|jpg)$/;

const logoSchema = z
  .string()
  .trim()
  .min(1, "El logo es obligatorio tras el onboarding.")
  .regex(LOGO_PATH_REGEX, "Logo debe vivir en /uploads/brand/ con formato png, webp o jpg.");

// Telefono español: prefijo +34 opcional + 9 digitos empezando por 6/7/8/9.
// Los espacios son solo de formato visual, se ignoran para validar.
const SPANISH_PHONE_REGEX = /^(\+34)?[6789]\d{8}$/;

const telefonoSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ""))
  .refine((value) => SPANISH_PHONE_REGEX.test(value), {
    message: "Telefono debe ser un numero español valido (+34 opcional + 9 digitos).",
  });

// z.string().email() de zod v4 no exige TLD (acepta "falta@dominio") —
// usamos un regex explicito que si lo exige.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailSchema = z
  .string()
  .trim()
  .min(1, "El email es obligatorio.")
  .refine((value) => EMAIL_REGEX.test(value), { message: "Email invalido." });

const instagramSchema = z
  .string()
  .trim()
  .transform((value) => (value.startsWith("@") ? value.slice(1) : value))
  .refine((value) => /^[a-zA-Z0-9._]{1,30}$/.test(value), {
    message: "Usuario de Instagram invalido (sin espacios ni simbolos).",
  });

const fontEntrySchema = z
  .object({
    familia: z.string().trim().min(1),
    pesos: z.array(z.number().int().positive()).min(1),
    esCustom: z.boolean().optional(),
  })
  .refine(
    (entry) => entry.esCustom === true || KNOWN_FONT_FAMILIES.has(entry.familia),
    {
      message:
        "Familia fuera del catalogo de presets — declara esCustom: true si es deliberado.",
      path: ["familia"],
    },
  );

const tipografiaSchema = z.object({
  display: fontEntrySchema,
  body: fontEntrySchema,
});

// ---------------------------------------------------------------------------
// brandConfigSchema — marca resuelta de una agencia (post-onboarding)
// ---------------------------------------------------------------------------

export const brandConfigSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre de la agencia es obligatorio."),
  logo: logoSchema,
  colores: coloresSchema,
  tipografia: tipografiaSchema,
  web: z.string().trim().url("URL invalida.").optional(),
  telefono: telefonoSchema.optional(),
  email: emailSchema.optional(),
  instagram: instagramSchema.optional(),
  ctaHabitual: z
    .string()
    .trim()
    .max(40, "CTA demasiado largo (maximo 40 caracteres).")
    .optional(),
});

export type BrandConfig = z.infer<typeof brandConfigSchema>;

// ---------------------------------------------------------------------------
// normalizeBrandJsonField — defensa contra doble codificacion legacy
// ---------------------------------------------------------------------------
// Brand.colores/tipografia son campos Json de Prisma; deben persistirse como
// objeto plano. Un bug historico en el wizard de onboarding los guardaba con
// JSON.stringify() extra, dejando un STRING en vez de objeto en la columna.
// Esta funcion normaliza en el punto de lectura (parsea una vez si llega
// string) para que filas legacy doble-codificadas sigan funcionando sin
// necesitar una migracion de datos.
export function normalizeBrandJsonField<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

// ---------------------------------------------------------------------------
// brandPresetSchema — preset TAL CUAL en brand-presets.json (claves español)
// ---------------------------------------------------------------------------

const presetFontEntrySchema = z.object({
  familia: z.string().trim().min(1),
  pesos: z.array(z.number().int().positive()).min(1),
  uso: z.string().trim().min(1),
});

const contrasteEntrySchema = z.object({
  ratio: z.string(),
  cumple: z.boolean(),
});

export const brandPresetSchema = z
  .object({
    id: z.string().trim().min(1),
    nombre: z.string().trim().min(1),
    esDefault: z.boolean(),
    descripcion: z.string().trim().min(1),
    colores: coloresSchema,
    contrasteAA: z.record(z.string(), contrasteEntrySchema),
    tipografia: z.object({
      display: presetFontEntrySchema,
      body: presetFontEntrySchema,
    }),
    radios: z.object({ sm: z.string(), md: z.string(), lg: z.string() }),
    espaciadoBase: z.string(),
    escalaEspaciado: z.array(z.number()),
    notasDeUso: z.record(z.string(), z.string()),
  })
  .passthrough();

export type BrandPreset = z.infer<typeof brandPresetSchema>;

// ---------------------------------------------------------------------------
// resolveBrand — merge profundo preset + overrides (colores/tipografia
// se fusionan clave a clave; el resto de overrides pisan al preset)
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = merged[key];
    merged[key] =
      isPlainObject(value) && isPlainObject(baseValue)
        ? deepMerge(baseValue, value)
        : value;
  }
  return merged;
}

export function resolveBrand(
  preset: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return deepMerge(preset, overrides);
}

// ---------------------------------------------------------------------------
// meetsContrastAA — WCAG 2.x contraste relativo, umbral AA texto normal (4.5:1)
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const value = parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number): number => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function meetsContrastAA(foreground: string, background: string): boolean {
  const l1 = relativeLuminance(hexToRgb(foreground));
  const l2 = relativeLuminance(hexToRgb(background));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return ratio >= 4.5;
}
