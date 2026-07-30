/**
 * Pieza 5 (spec.md): Email HTML responsive <=600px, estilos inline, tablas
 * (compatibilidad Outlook/Gmail/Apple Mail — nada de flexbox/grid), version
 * texto plano. Funcion PURA: mismos argumentos -> mismo resultado, sin I/O.
 *
 * Firma alineada con el patron de plantillas existente (BasePieceProps:
 * view/brand/texts/photos, ver templates/types.ts) pero devuelve strings en
 * vez de JSX porque el renderer de email no usa Playwright (no hay browser
 * que capturar) — ver lib/infrastructure/render/email-renderer.ts.
 *
 * Regla dura #1 de spec.md ya se cumple por construccion: `view` es
 * `PublicPropertyView`, que nunca contiene `privateAddress`/`internalName`.
 */
import type { PublicPropertyView } from "../public-view";
import type { PieceBrand, PieceTexts, PiecePhoto } from "../templates/types";
import { escapeHtml } from "./escape-html";

export interface PropertyEmailOutput {
  readonly subject: string;
  readonly preheader: string;
  readonly html: string;
  readonly text: string;
}

const MAX_WIDTH = 600;
const PHOTO_HEIGHT = 360;

function buildSubject(texts: Readonly<PieceTexts>): string {
  return texts.headline.includes(texts.priceLabel)
    ? texts.headline
    : `${texts.headline} — ${texts.priceLabel}`;
}

function buildPreheader(texts: Readonly<PieceTexts>): string {
  return texts.metrics.slice(0, 3).join(" · ");
}

function bulletproofButton(
  href: string | undefined,
  label: string,
  brand: Readonly<PieceBrand>,
): string {
  const safeHref = escapeHtml(href ?? "#");
  const safeLabel = escapeHtml(label);
  const bg = brand.colors.primary;
  const color = brand.colors.onPrimary;
  return `
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="10%" strokecolor="${bg}" fillcolor="${bg}">
  <w:anchorlock/>
  <center style="color:${color};font-family:sans-serif;font-size:16px;font-weight:bold;">${safeLabel}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-->
  <a href="${safeHref}" target="_blank" style="background-color:${bg};border-radius:6px;color:${color};display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:48px;text-align:center;text-decoration:none;width:220px;-webkit-text-size-adjust:none;">${safeLabel}</a>
  <!--<![endif]-->`;
}

function renderMetricsRow(metrics: readonly string[]): string {
  if (metrics.length === 0) return "";
  const cells = metrics
    .map(
      (metric) =>
        `<td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#333333;padding:8px 6px;">${escapeHtml(metric)}</td>`,
    )
    .join("");
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>${cells}</tr>
  </table>`;
}

function renderHighlights(highlights: readonly string[]): string {
  if (highlights.length === 0) return "";
  const rows = highlights
    .map(
      (item) =>
        `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#444444;padding:2px 0;">• ${escapeHtml(item)}</td></tr>`,
    )
    .join("");
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${rows}
  </table>`;
}

function contactLine(brand: Readonly<PieceBrand>): string {
  const parts = [brand.contact.phone, brand.contact.email, brand.contact.website].filter(
    (value): value is string => Boolean(value),
  );
  return parts.map(escapeHtml).join(" · ");
}

export function renderPropertyEmail(
  view: Readonly<PublicPropertyView>,
  brand: Readonly<PieceBrand>,
  texts: Readonly<PieceTexts>,
  photos: readonly PiecePhoto[],
): PropertyEmailOutput {
  const subject = buildSubject(texts);
  const preheader = buildPreheader(texts);
  const mainPhoto = photos[0];
  const location = texts.publicLocation;
  const agentEmail = view.agent.email;
  const ctaHref = view.listingUrl;

  const html = `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(subject)}</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style>
  body, table, td { font-family: Arial, Helvetica, sans-serif; }
  body { margin: 0; padding: 0; background-color: ${brand.colors.background}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  img { border: 0; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  table { border-collapse: collapse !important; }
  @media (max-width: 620px) {
    .email-container { width: 100% !important; }
    .email-fluid { width: 100% !important; max-width: 100% !important; }
  }
  @media (prefers-color-scheme: dark) {
    .email-bg { background-color: #1c1c1e !important; }
    .email-surface { background-color: #2c2c2e !important; }
    .email-text { color: #f2f2f2 !important; }
    .email-muted { color: #b0b0b0 !important; }
  }
</style>
</head>
<body class="email-bg" style="margin:0;padding:0;background-color:${brand.colors.background};">
  <div style="display:none;font-size:1px;color:${brand.colors.background};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${brand.colors.background};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="email-container" width="${MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:${MAX_WIDTH}px;max-width:${MAX_WIDTH}px;background-color:${brand.colors.surface};border-radius:${brand.radii.md};overflow:hidden;">
          <tr>
            <td align="center" style="padding:20px 24px;">
              <span style="font-family:${escapeHtml(brand.fonts.display)},Georgia,serif;font-size:20px;font-weight:700;color:${brand.colors.text};">${escapeHtml(brand.name)}</span>
            </td>
          </tr>
          ${
            mainPhoto
              ? `<tr>
            <td>
              <img src="${escapeHtml(mainPhoto.url)}" width="${MAX_WIDTH}" height="${PHOTO_HEIGHT}" alt="${escapeHtml(mainPhoto.alt)}" style="display:block;width:100%;max-width:${MAX_WIDTH}px;height:${PHOTO_HEIGHT}px;object-fit:cover;" />
            </td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="email-text" style="font-family:${escapeHtml(brand.fonts.display)},Georgia,serif;font-size:24px;font-weight:700;color:${brand.colors.text};padding-bottom:8px;">
                    ${escapeHtml(texts.headline)}
                  </td>
                </tr>
                ${
                  location
                    ? `<tr><td class="email-muted" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${brand.colors.textMuted};padding-bottom:12px;">${escapeHtml(location)}</td></tr>`
                    : ""
                }
                <tr>
                  <td style="padding-bottom:16px;">
                    <span style="display:inline-block;background-color:${brand.colors.primary};color:${brand.colors.onPrimary};font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;padding:8px 16px;border-radius:${brand.radii.sm};">${escapeHtml(texts.priceLabel)}</span>
                  </td>
                </tr>
                <tr><td style="padding-bottom:12px;">${renderMetricsRow(texts.metrics)}</td></tr>
                <tr>
                  <td class="email-text" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:${brand.colors.text};padding-bottom:16px;">
                    ${escapeHtml(texts.description)}
                  </td>
                </tr>
                ${
                  texts.highlights.length > 0
                    ? `<tr><td style="padding-bottom:16px;">${renderHighlights(texts.highlights)}</td></tr>`
                    : ""
                }
                <tr>
                  <td align="center" style="padding:8px 0 20px 0;">
                    ${bulletproofButton(ctaHref, texts.cta, brand)}
                  </td>
                </tr>
                <tr>
                  <td style="border-top:1px solid ${brand.colors.border};padding-top:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="email-text" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:${brand.colors.text};">
                          ${escapeHtml(view.agent.name)}
                        </td>
                      </tr>
                      <tr>
                        <td class="email-muted" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${brand.colors.textMuted};">
                          ${escapeHtml(view.agent.phone)} · <a href="mailto:${escapeHtml(agentEmail)}" style="color:${brand.colors.primary};text-decoration:none;">${escapeHtml(agentEmail)}</a>
                        </td>
                      </tr>
                      <tr>
                        <td class="email-muted" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${brand.colors.textMuted};padding-top:4px;">
                          ${escapeHtml(view.agency.name)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px;background-color:${brand.colors.background};">
              <span class="email-muted" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${brand.colors.textMuted};">${contactLine(brand)}</span>
              ${
                texts.legalNotice
                  ? `<div class="email-muted" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${brand.colors.textMuted};padding-top:6px;">${escapeHtml(texts.legalNotice)}</div>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    texts.headline,
    texts.priceLabel,
    location ?? "",
    texts.metrics.join(" · "),
    "",
    texts.description,
    "",
    ...(texts.highlights.length > 0 ? [texts.highlights.map((item) => `- ${item}`).join("\n")] : []),
    "",
    `${texts.cta}${ctaHref ? `: ${ctaHref}` : ""}`,
    "",
    "--",
    view.agent.name,
    `${view.agent.phone} · ${agentEmail}`,
    view.agency.name,
  ].filter((line) => line !== undefined);

  const text = textLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return { subject, preheader, html, text };
}
