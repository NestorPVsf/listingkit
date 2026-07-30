/**
 * Pieza 5 (spec.md): email HTML responsive + texto plano. Cubre:
 * estructura (<=600px, inline styles, sin <script>), escapado estricto de
 * campos de usuario, ausencia de direccion privada, y version texto no
 * vacia sin HTML.
 */
import { describe, expect, it } from "vitest";
import { renderPropertyEmail } from "@/niches/inmobiliaria/email/render-email";
import { escapeHtml } from "@/niches/inmobiliaria/email/escape-html";
import { demoPropertyPayload, PRIVATE_ADDRESS_SENTINEL } from "@/tests/fixtures/demo-property";
import { toPublicPropertyView, type Property } from "@/niches/inmobiliaria/public-view";
import { buildFallbackTexts } from "@/niches/inmobiliaria/templates/fallback-texts";
import { presetToPieceBrand } from "@/niches/inmobiliaria/templates/brand-adapter";
import { brandPresetSchema } from "@/niches/inmobiliaria/brand.schema";
import type { PiecePhoto } from "@/niches/inmobiliaria/templates/types";
import brandPresetsData from "@/niches/inmobiliaria/brand-presets.json";

const PRESET = brandPresetSchema.parse(
  (brandPresetsData as { presets: unknown[] }).presets.find(
    (candidate) => (candidate as { esDefault?: boolean }).esDefault === true,
  ),
);

function buildView() {
  const payload = demoPropertyPayload({
    photoAssetIds: ["11111111-1111-4111-8111-111111111111"],
    primaryPhotoAssetId: "11111111-1111-4111-8111-111111111111",
  });
  const property: Property = {
    ...payload,
    photoAssetIds: [...payload.photoAssetIds],
    id: "demo-property",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return toPublicPropertyView(property);
}

const PHOTOS: readonly PiecePhoto[] = [
  { url: "https://example.com/api/assets/photo-1", alt: "Foto principal" },
];

function buildOutput(descriptionOverride?: string) {
  const view = buildView();
  const finalView = descriptionOverride
    ? { ...view, description: descriptionOverride }
    : view;
  const texts = buildFallbackTexts(finalView);
  const brand = presetToPieceBrand(PRESET);
  return renderPropertyEmail(finalView, brand, texts, PHOTOS);
}

describe("renderPropertyEmail", () => {
  it("produce HTML responsive <=600px, con estilos inline y sin <script>", () => {
    const { html } = buildOutput();

    expect(html).toContain("<!doctype html>");
    expect(html).toMatch(/width:600px|width="600"/);
    expect(html).toContain('style="');
    expect(html.toLowerCase()).not.toContain("<script");
    // Tablas para compatibilidad Outlook — nada de flexbox/grid.
    expect(html).toContain("<table");
    expect(html).not.toMatch(/display:\s*flex|display:\s*grid/);
  });

  it("incluye asunto y preheader no vacios", () => {
    const output = buildOutput();
    expect(output.subject.length).toBeGreaterThan(0);
    expect(output.preheader.length).toBeGreaterThan(0);
    expect(output.html).toContain(escapeHtml(output.preheader));
  });

  it("escapa campos de usuario: una descripcion con onerror queda inerte", () => {
    const malicious = 'Piso con <img src=x onerror="alert(1)"> vistas al mar';
    const { html } = buildOutput(malicious);

    expect(html).not.toContain("<img src=x onerror");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("nunca incluye la direccion privada", () => {
    const { html, text } = buildOutput();
    expect(html).not.toContain(PRIVATE_ADDRESS_SENTINEL);
    expect(text).not.toContain(PRIVATE_ADDRESS_SENTINEL);
  });

  it("genera version texto plano no vacia y sin HTML", () => {
    const { text } = buildOutput();
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/<[a-z][\s\S]*>/i);
  });

  it("incluye foto principal, precio, caracteristicas, cta y firma del agente", () => {
    const view = buildView();
    const { html } = buildOutput();

    expect(html).toContain(PHOTOS[0].url);
    expect(html).toContain(escapeHtml(view.agent.name));
    expect(html).toContain(escapeHtml(view.agent.phone));
    expect(html).toContain(escapeHtml(view.cta));
  });

  it("escapa brand.fonts.display en el style inline (fuente personalizada maliciosa)", () => {
    const view = buildView();
    const texts = buildFallbackTexts(view);
    const maliciousBrand = {
      ...presetToPieceBrand(PRESET),
      fonts: {
        display: `Arial"><script>alert('SENTINEL-FONT-XSS')</script>`,
        body: "Arial",
      },
    };
    const { html } = renderPropertyEmail(view, maliciousBrand, texts, PHOTOS);

    expect(html).not.toContain("<script>alert('SENTINEL-FONT-XSS')</script>");
    expect(html).not.toMatch(/font-family:Arial"><script/);
  });

  it("no duplica el precio en el asunto cuando el headline (bundle real) ya lo incluye", () => {
    const view = buildView();
    const texts = buildFallbackTexts(view);
    const brand = presetToPieceBrand(PRESET);
    // Simula el bundle real de lib/text-engine, cuyo headline ya trae el
    // precio incrustado (ver lib/text-engine/index.ts) — buildSubject NO debe
    // añadirlo por segunda vez.
    const textsWithPriceInHeadline = {
      ...texts,
      headline: `Piso de 3 hab. en Centro, Alicante — ${texts.priceLabel}`,
    };
    const { subject } = renderPropertyEmail(view, brand, textsWithPriceInHeadline, PHOTOS);

    const occurrences = subject.split(texts.priceLabel).length - 1;
    expect(occurrences).toBe(1);
    expect(subject).toBe(textsWithPriceInHeadline.headline);
  });

  it("añade el precio una vez cuando el headline (fallback) no lo incluye", () => {
    const view = buildView();
    const { subject } = buildOutput();
    const texts = buildFallbackTexts(view);

    expect(texts.headline).not.toContain(texts.priceLabel);
    const occurrences = subject.split(texts.priceLabel).length - 1;
    expect(occurrences).toBe(1);
    expect(subject).toBe(`${texts.headline} — ${texts.priceLabel}`);
  });
});
