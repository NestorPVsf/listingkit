/**
 * Helpers genericos de ensamblado de texto. Sin conocimiento del nicho
 * (nada de "piso"/"habitaciones" aqui) — eso vive en `niches/*`.
 */

type MaybeText = string | null | undefined | false;

/** Une piezas de texto con un separador, omitiendo huecos (undefined/null/false/""),
 * sin dejar espacios dobles ni separadores huerfanos. */
export function joinSentences(parts: readonly MaybeText[], separator = " "): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .map((part) => part.trim())
    .join(separator)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Igual que `joinSentences` pero pensado para separadores tipo ", " o " · ". */
export function joinList(parts: readonly MaybeText[], separator = ", "): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .map((part) => part.trim())
    .join(separator);
}

/** "a, b, c" -> "a, b y c" (estilo es-ES para listas). */
export function joinWithAnd(items: readonly string[]): string {
  const clean = items.filter((item) => item.trim().length > 0);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} y ${clean[clean.length - 1]}`;
}

/** Trunca en el ultimo espacio antes de `maxLength` para no cortar una palabra a medias. */
export function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  const safe = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
  return `${safe.trimEnd()}…`;
}

export function capitalize(text: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const CURRENCY_SYMBOLS: Record<"EUR" | "USD" | "GBP", string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

/** Venta -> "245.000 €" (es-ES). Alquiler -> "900 €/mes". */
export function formatPriceLabel(
  amount: number,
  currency: "EUR" | "USD" | "GBP",
  pricePeriod?: "month",
): string {
  const formattedNumber = new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 0,
  }).format(amount);
  const base = `${formattedNumber} ${CURRENCY_SYMBOLS[currency]}`;
  return pricePeriod === "month" ? `${base}/mes` : base;
}
