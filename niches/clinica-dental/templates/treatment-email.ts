/**
 * Plantilla 2/2 del PoC dental: email HTML.
 *
 * Igual que el poster, consume solo `TemplateBindings<TreatmentBindings>`. El
 * escapado y el ancho maximo de 600px son los mismos criterios que en el email
 * inmobiliario, pero el codigo no se comparte a proposito: cada nicho es dueño
 * de sus plantillas. Lo que se comparte es el CONTRATO, no el HTML.
 */
import type { TemplateBindings } from "@/lib/engine/contracts";
import type { TreatmentBindings } from "../bindings";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Solo https: en href, misma regla que cerro F-04 en el email inmobiliario. */
function safeHref(url: string | null): string | null {
  return url && /^https:\/\//i.test(url) ? escapeHtml(url) : null;
}

export function renderTreatmentEmail(
  bindings: TemplateBindings<TreatmentBindings>,
): string {
  const v = bindings.variables;
  const brand = bindings.brand;
  const bookingUrl = safeHref(v.bookingUrl);

  const includes = v.includes
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  const ctaBlock = bookingUrl
    ? `<p style="margin:24px 0"><a href="${bookingUrl}" style="background:${escapeHtml(brand.colors.primary)};color:${escapeHtml(brand.colors.background)};padding:12px 20px;text-decoration:none;display:inline-block">${escapeHtml(v.cta)}</a></p>`
    : `<p style="margin:24px 0;font-weight:600">${escapeHtml(v.cta)}</p>`;

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>${escapeHtml(v.headline)}</title></head>
<body style="margin:0;padding:24px;background:#f4f4f4">
  <table role="presentation" width="600" style="max-width:600px;margin:0 auto;background:${escapeHtml(brand.colors.background)};color:${escapeHtml(brand.colors.text)};font-family:Arial,sans-serif">
    <tr><td style="padding:32px">
      <h1 style="margin:0 0 8px;font-size:26px">${escapeHtml(v.headline)}</h1>
      <p style="margin:0 0 16px;font-size:18px;color:${escapeHtml(brand.colors.primary)}">${escapeHtml(v.priceLabel)} (${escapeHtml(v.priceDetail)})</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6">${escapeHtml(v.summary)}</p>
      <p style="margin:0 0 8px;font-size:15px"><strong>${escapeHtml(v.planLabel)}</strong></p>
      <ul style="margin:0 0 16px;padding-left:20px;font-size:15px">${includes}</ul>
      ${ctaBlock}
      <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
      <p style="margin:0;font-size:13px">${escapeHtml(v.clinicLine)}</p>
      <p style="margin:0;font-size:13px">${escapeHtml(v.professionalLine)}</p>
      <p style="margin:12px 0 0;font-size:12px;color:#666">${escapeHtml(v.legalNotice)}</p>
    </td></tr>
  </table>
</body>
</html>`;
}
