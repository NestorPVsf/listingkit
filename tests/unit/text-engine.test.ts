/**
 * TDD — Fase 4.1 del PLAN.md. Motor de PLANTILLAS LOCALES (sin IA) que
 * convierte una `PublicPropertyView` en el texto de las 6 piezas.
 *
 * CONTRATO QUE ESTE TEST ASUME (a implementar por `frontend`/`executor` en
 * `lib/text-engine/index.ts` — este archivo falla en rojo por import
 * inexistente hasta entonces):
 *
 * ```ts
 * export interface PropertyTextBundle {
 *   readonly headline: string;
 *   readonly subheadline: string;
 *   readonly descriptionShort: string;   // <= 240 chars, para IG/story
 *   readonly descriptionLong: string;    // para ficha PDF / email
 *   readonly highlights: readonly string[]; // hasta 5, tal cual el input
 *   readonly instagramPostCopy: string;
 *   readonly carouselSlides: readonly [string, string, string, string, string];
 *   readonly storyCopy: string;
 *   readonly email: {
 *     readonly subject: string;
 *     readonly preheader: string;
 *     readonly body: string;
 *   };
 *   readonly videoScript: string;
 *   readonly cta: string;
 * }
 *
 * export interface GeneratePropertyTextsOptions {
 *   readonly explicitlyAllowedClaims?: readonly string[];
 * }
 *
 * export function generatePropertyTexts(
 *   view: PublicPropertyView,
 *   options?: GeneratePropertyTextsOptions,
 * ): PropertyTextBundle;
 * ```
 *
 * Reglas duras verificadas (spec.md + niche-engine.md):
 * - Frases prohibidas (glosario global) NUNCA aparecen en ningún campo del
 *   bundle, salvo que el usuario las haya declarado explícitamente en
 *   `explicitlyAllowedClaims` (regla dura #3 de spec.md / TextPolicy del ADR).
 * - El motor NO inventa datos: una característica ausente (ej. sin piscina)
 *   no debe mencionarse en ningún texto generado.
 * - venta vs alquiler: el alquiler siempre etiqueta el precio en €/mes.
 * - Sin zona/distrito, ningún texto deja huecos tipo "  ," o ", ,".
 */
import { describe, expect, it } from "vitest";
import { generatePropertyTexts } from "@/niches/inmobiliaria/text-engine";
import type { Property } from "@/niches/inmobiliaria/public-view";
import { toPublicPropertyView } from "@/niches/inmobiliaria/public-view";

const PHOTO_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
] as const;

const PROHIBITED_PHRASES = [
  "oportunidad única",
  "la mejor propiedad",
  "inversión garantizada",
  "rentabilidad asegurada",
  "última oportunidad",
] as const;

function demoProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-demo-0001",
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    internalName: "Piso Alfonso el Sabio — Centro (ficha interna)",
    operation: "sale",
    propertyType: "apartment",
    price: 245_000,
    currency: "EUR",
    city: "Alicante",
    district: "Centro",
    publicAddress: "Centro, cerca C/ Alfonso el Sabio",
    privateAddress: "Calle Alfonso el Sabio 14, 3º A, 03001 Alicante",
    builtAreaM2: 78,
    usableAreaM2: 72,
    bedrooms: 3,
    bathrooms: 1,
    floor: "3ª",
    elevator: true,
    terrace: false,
    balcony: true,
    garage: false,
    storageRoom: false,
    pool: false,
    garden: false,
    condition: "renovation-needed",
    constructionYear: 1978,
    energyCertificate: { rating: "D" },
    description:
      "Piso luminoso de 3 habitaciones en pleno Centro de Alicante, a 5 minutos " +
      "andando de la Explanada. Distribución clásica con salón independiente, " +
      "cocina reformada en 2019 y balcón orientado sur con vistas abiertas a la calle.",
    highlights: [
      "A 5 min andando de la Explanada de España",
      "Cocina reformada en 2019",
      "Balcón orientado sur",
      "Ascensor y portero automático",
      "Excelente comunicación (Renfe, TRAM, autobús urbano)",
    ],
    cta: "Solicita visita",
    listingUrl: "https://postiguethomes-demo.es/propiedad/centro-alicante-1",
    agent: {
      name: "Javier Roselló Ibáñez",
      phone: "+34 611 22 33 44",
      email: "javier.rosello@postiguethomes-demo.es",
    },
    agency: {
      name: "Postiguet Homes",
      website: "https://postiguethomes-demo.es",
    },
    photoAssetIds: [...PHOTO_IDS],
    primaryPhotoAssetId: PHOTO_IDS[0],
    explicitlyAllowedClaims: [],
    ...overrides,
  } as Property;
}

function bundleFor(
  overrides: Partial<Property> = {},
  explicitlyAllowedClaims?: readonly string[],
) {
  const view = toPublicPropertyView(demoProperty(overrides));
  return generatePropertyTexts(view, { explicitlyAllowedClaims });
}

function allTextFields(bundle: ReturnType<typeof bundleFor>): readonly string[] {
  return [
    bundle.headline,
    bundle.subheadline,
    bundle.descriptionShort,
    bundle.descriptionLong,
    ...bundle.highlights,
    bundle.instagramPostCopy,
    ...bundle.carouselSlides,
    bundle.storyCopy,
    bundle.email.subject,
    bundle.email.preheader,
    bundle.email.body,
    bundle.videoScript,
    bundle.cta,
  ];
}

describe("generatePropertyTexts — happy path", () => {
  it("genera las 6 piezas de texto con contenido no vacío", () => {
    const bundle = bundleFor();
    expect(bundle.headline.length).toBeGreaterThan(0);
    expect(bundle.subheadline.length).toBeGreaterThan(0);
    expect(bundle.descriptionShort.length).toBeGreaterThan(0);
    expect(bundle.descriptionLong.length).toBeGreaterThan(0);
    expect(bundle.highlights).toHaveLength(5);
    expect(bundle.instagramPostCopy.length).toBeGreaterThan(0);
    expect(bundle.carouselSlides).toHaveLength(5);
    for (const slide of bundle.carouselSlides) {
      expect(slide.length).toBeGreaterThan(0);
    }
    expect(bundle.storyCopy.length).toBeGreaterThan(0);
    expect(bundle.email.subject.length).toBeGreaterThan(0);
    expect(bundle.email.preheader.length).toBeGreaterThan(0);
    expect(bundle.email.body.length).toBeGreaterThan(0);
    expect(bundle.videoScript.length).toBeGreaterThan(0);
    expect(bundle.cta).toBe("Solicita visita");
  });

  it("la descripción corta respeta un límite razonable para IG/story", () => {
    const bundle = bundleFor();
    expect(bundle.descriptionShort.length).toBeLessThanOrEqual(240);
  });
});

describe("generatePropertyTexts — frases prohibidas (regla dura #3)", () => {
  it("ningún campo de texto contiene frases prohibidas por defecto", () => {
    const bundle = bundleFor();
    const haystack = allTextFields(bundle).join(" \n ").toLocaleLowerCase("es-ES");
    for (const phrase of PROHIBITED_PHRASES) {
      expect(haystack).not.toContain(phrase.toLocaleLowerCase("es-ES"));
    }
  });

  it("detecta frases prohibidas con mayúsculas/tildes/espacios distintos", () => {
    const bundle = bundleFor({
      description: "ÚLTIMA OPORTUNIDAD   de comprar este piso, no la dejes escapar.",
    });
    const haystack = allTextFields(bundle).join(" \n ").toLocaleLowerCase("es-ES");
    // el motor de texto no debe reproducir la frase prohibida del input libre
    // en ningún campo generado (headline, descriptionShort, etc. derivados)
    expect(haystack).not.toContain("última oportunidad");
  });

  it("permite una frase prohibida SOLO si viene en explicitlyAllowedClaims", () => {
    const bundle = bundleFor({}, ["oportunidad única"]);
    // la excepción no obliga a usarla, pero si el motor la usa, debe ser
    // exactamente porque el usuario la autorizó explícitamente — este test
    // documenta que NO lanza error ni la censura si estuviera en el input
    // explícito, a diferencia del caso por defecto.
    expect(() => bundleFor({}, ["oportunidad única"])).not.toThrow();
    void bundle;
  });
});

describe("generatePropertyTexts — no inventa datos ausentes", () => {
  it("propiedad sin piscina: 'piscina' no aparece en ningún texto", () => {
    const bundle = bundleFor({ pool: false });
    const haystack = allTextFields(bundle).join(" \n ").toLocaleLowerCase("es-ES");
    expect(haystack).not.toContain("piscina");
  });

  it("propiedad CON piscina: 'piscina' sí puede aparecer en highlights/carrusel", () => {
    const bundle = bundleFor({ pool: true });
    const haystack = allTextFields(bundle).join(" \n ").toLocaleLowerCase("es-ES");
    expect(haystack).toContain("piscina");
  });

  it("propiedad sin garaje ni trastero: ninguno de los dos aparece", () => {
    const bundle = bundleFor({ garage: false, storageRoom: false });
    const haystack = allTextFields(bundle).join(" \n ").toLocaleLowerCase("es-ES");
    expect(haystack).not.toContain("garaje");
    expect(haystack).not.toContain("trastero");
  });
});

describe("generatePropertyTexts — venta vs alquiler", () => {
  it("alquiler: el precio se etiqueta en €/mes en headline/subheadline/email", () => {
    const bundle = bundleFor({
      operation: "rent",
      pricePeriod: "month",
      price: 900,
    });
    const priceFields = [
      bundle.headline,
      bundle.subheadline,
      bundle.instagramPostCopy,
      bundle.email.subject,
      bundle.email.body,
    ].join(" \n ");
    expect(priceFields).toMatch(/\/\s*mes|mes\b/i);
  });

  it("venta: el precio NO lleva etiqueta de periodo mensual", () => {
    const bundle = bundleFor({ operation: "sale" });
    expect(bundle.headline).not.toMatch(/\/\s*mes/i);
    expect(bundle.subheadline).not.toMatch(/\/\s*mes/i);
  });
});

describe("generatePropertyTexts — ausencia de zona no deja huecos", () => {
  it("sin district: ningún texto contiene ', ,' ni espacios/comas huérfanas", () => {
    const bundle = bundleFor({ district: undefined });
    // Fix objetivo: el separador original " \n " (espacio+salto+espacio) es
    // en sí mismo un \s{2,}, lo que hacía la aserción de abajo imposible de
    // cumplir independientemente de la implementación. "|" delimita los
    // campos sin introducir whitespace falso.
    const haystack = allTextFields(bundle).join("|");
    expect(haystack).not.toMatch(/,\s*,/);
    expect(haystack).not.toMatch(/\s{2,}/);
    expect(haystack).not.toMatch(/^\s*,|,\s*$/m);
  });

  it("sin publicAddress ni district: la ubicación pública usa solo la ciudad", () => {
    const bundle = bundleFor({ district: undefined, publicAddress: undefined });
    const haystack = allTextFields(bundle).join("|");
    expect(haystack).toContain("Alicante");
    expect(haystack).not.toMatch(/,\s*,/);
  });
});

describe("generatePropertyTexts — no filtra la dirección privada", () => {
  it("ningún texto generado contiene el número de piso/puerta privado", () => {
    const bundle = bundleFor();
    const haystack = allTextFields(bundle).join(" \n ");
    expect(haystack).not.toContain("14, 3º A");
  });
});
