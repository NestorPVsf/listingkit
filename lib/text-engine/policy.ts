/**
 * Motor generico de politica de texto: censura frases prohibidas salvo
 * excepcion explicita. Ver docs/architecture/niche-engine.md ("Politica de
 * texto inmobiliaria") para el `TextPolicy` completo del ADR; esta version
 * es el subconjunto que el motor de texto necesita para hacer cumplir la
 * regla dura #3 de spec.md.
 *
 * Defensa en profundidad: esta funcion se aplica sobre el resultado FINAL
 * de cada campo del bundle, no solo se confia en que las plantillas nunca
 * escriban una frase prohibida — un campo libre (ej. la descripcion que
 * escribe el agente) puede colar una por accidente.
 */
export interface TextPolicy {
  readonly prohibitedPhrases: readonly string[];
  readonly normalizeForComparison: (value: string) => string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPhraseRegex(phrase: string): RegExp {
  const words = phrase.trim().split(/\s+/).map(escapeRegExp);
  return new RegExp(words.join("\\s+"), "gi");
}

/** Limpia los huecos que deja quitar una frase a medio texto, sin tocar
 * puntuacion legitima de frases que no fueron tocadas. */
function cleanupAfterRemoval(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,;:])/g, "$1")
    .replace(/,\s*,+/g, ",")
    .replace(/^[\s,;:]+/, "")
    .replace(/[\s,;:]+$/, "")
    .trim();
}

/**
 * Elimina toda ocurrencia de una frase prohibida (insensible a
 * mayusculas/espacios) salvo que este en `explicitlyAllowedClaims` — en
 * cuyo caso esa frase concreta se deja pasar tal cual.
 */
export function sanitizeProhibitedPhrases(
  text: string,
  policy: TextPolicy,
  explicitlyAllowedClaims: readonly string[] = [],
): string {
  if (!text) return text;
  const allowed = new Set(
    explicitlyAllowedClaims.map((claim) => policy.normalizeForComparison(claim)),
  );
  let result = text;
  for (const phrase of policy.prohibitedPhrases) {
    if (allowed.has(policy.normalizeForComparison(phrase))) continue;
    result = result.replace(buildPhraseRegex(phrase), "");
  }
  return result === text ? text : cleanupAfterRemoval(result);
}
