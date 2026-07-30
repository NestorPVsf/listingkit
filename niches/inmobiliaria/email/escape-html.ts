/**
 * Escapado estricto para interpolar campos de usuario en HTML literal.
 * Necesario aqui porque el email NO se renderiza via JSX/React (que ya
 * escapa por defecto) — es un string HTML construido a mano para no
 * depender de Playwright (spec.md pieza 5: sin navegador para el email).
 */
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
