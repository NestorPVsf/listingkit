/**
 * Paso 6.1 del PLAN.md — fuzzing sistemático de fuga de `privateAddress` a
 * través de TODO el pipeline de texto que puede llegar a piezas públicas:
 *
 *   Property -> toPublicPropertyView -> generatePropertyTexts (bundle)
 *            -> propertyTextBundleToPieceTexts (PieceTexts)
 *            -> renderPropertyEmail (HTML + texto plano)
 *
 * Regla dura #1 de spec.md: "La dirección privada JAMÁS aparece en ninguna
 * pieza pública". Este archivo NO repite los tests ya cubiertos por
 * `tests/unit/public-property-view.test.ts` (esos ya verifican
 * `toPublicPropertyView` de forma exhaustiva) — aquí el foco es la cadena
 * COMPLETA hasta el email renderizado, con centinelas que incluyen casos
 * trampa: unicode, saltos de línea, y dirección privada como substring de la
 * pública.
 */
import { describe, expect, it } from "vitest";
import { generatePropertyTexts } from "@/lib/text-engine";
import { propertyTextBundleToPieceTexts } from "@/niches/inmobiliaria/piece-texts-adapter";
import { renderPropertyEmail } from "@/niches/inmobiliaria/email/render-email";
import {
  toPublicPropertyView,
  type Property,
} from "@/niches/inmobiliaria/public-view";
import type { PieceBrand, PiecePhoto } from "@/niches/inmobiliaria/templates/types";

const PHOTO_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
] as const;

const BRAND: PieceBrand = {
  name: "Postiguet Homes",
  logoUrl: null,
  colors: {
    background: "#ffffff",
    surface: "#f5f5f5",
    text: "#111111",
    textMuted: "#666666",
    primary: "#0a5f38",
    secondary: "#0a5f38",
    onPrimary: "#ffffff",
    border: "#dddddd",
  },
  fonts: { display: "Georgia", body: "Arial" },
  radii: { sm: "4px", md: "8px", lg: "16px" },
  contact: {
    website: "https://postiguethomes-demo.es",
    phone: "+34 611 22 33 44",
    email: "javier.rosello@postiguethomes-demo.es",
  },
};

const PHOTOS: readonly PiecePhoto[] = PHOTO_IDS.map((id, index) => ({
  url: `/uploads/photos/${id}.jpg`,
  alt: `Foto ${index + 1}`,
}));

interface SentinelCase {
  readonly label: string;
  readonly sentinel: string;
  /** publicAddress deliberadamente comparte texto con el centinela (trampa). */
  readonly publicAddress?: string;
}

// Centinelas trampa: el string COMPLETO nunca debe aparecer en piezas
// públicas, aunque fragmentos legítimos (nombre de calle) sí puedan
// coincidir con el texto libre/publicAddress.
const SENTINEL_CASES: readonly SentinelCase[] = [
  {
    label: "sentinela simple",
    sentinel: "SENTINEL-PRIVATE-4f9c2b1a",
  },
  {
    label: "sentinela como substring de la dirección pública (trampa)",
    sentinel: "Calle Alfonso el Sabio 14 3izq SENTINEL-TRAMPA-88",
    publicAddress: "Centro, cerca C/ Alfonso el Sabio",
  },
  {
    label: "sentinela con caracteres unicode",
    sentinel: "SENTINEL-Ñoño-地址-🏠-Puerta 3ºB",
  },
  {
    label: "sentinela con saltos de línea embebidos",
    sentinel: "SENTINEL-MULTILINE\nPiso 3\nPuerta B\r\nNo publicar",
  },
  {
    label: "sentinela con comillas y HTML embebido (doble check XSS+leak)",
    sentinel: `SENTINEL-HTML-<script>alert(1)</script>-"quoted"`,
  },
];

function demoProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-fuzz-0001",
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    internalName: "Ficha interna — NO publicar",
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
      "Piso luminoso de 3 habitaciones muy cerca de la calle Alfonso el Sabio.",
    highlights: [
      "A 5 min andando de la Explanada de España",
      "Cocina reformada en 2019",
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
    ...overrides,
  } as Property;
}

describe("Fuga de dirección privada — pipeline completo (view -> bundle -> PieceTexts -> email)", () => {
  it.each(SENTINEL_CASES)(
    "el centinela ($label) no sobrevive a ninguna etapa del pipeline",
    ({ sentinel, publicAddress }) => {
      const property = demoProperty({
        privateAddress: sentinel,
        ...(publicAddress ? { publicAddress } : {}),
      });

      const view = toPublicPropertyView(property);
      expect(JSON.stringify(view)).not.toContain(sentinel);

      const bundle = generatePropertyTexts(view);
      expect(JSON.stringify(bundle)).not.toContain(sentinel);

      const pieceTexts = propertyTextBundleToPieceTexts(bundle, view);
      expect(JSON.stringify(pieceTexts)).not.toContain(sentinel);

      const email = renderPropertyEmail(view, BRAND, pieceTexts, PHOTOS);
      expect(email.html).not.toContain(sentinel);
      expect(email.text).not.toContain(sentinel);
      expect(email.subject).not.toContain(sentinel);
      expect(email.preheader).not.toContain(sentinel);
    },
  );

  it("genera N propiedades sintéticas con centinelas distintos y ninguna fuga cruza a otra (aislamiento)", () => {
    const properties = SENTINEL_CASES.map((sentinelCase, index) =>
      demoProperty({
        id: `prop-fuzz-${index}`,
        privateAddress: sentinelCase.sentinel,
      }),
    );

    const renders = properties.map((property) => {
      const view = toPublicPropertyView(property);
      const bundle = generatePropertyTexts(view);
      const pieceTexts = propertyTextBundleToPieceTexts(bundle, view);
      const email = renderPropertyEmail(view, BRAND, pieceTexts, PHOTOS);
      return { view, bundle, pieceTexts, email };
    });

    renders.forEach((render, index) => {
      for (const sentinelCase of SENTINEL_CASES) {
        const serialized =
          JSON.stringify(render.view) +
          JSON.stringify(render.bundle) +
          JSON.stringify(render.pieceTexts) +
          render.email.html +
          render.email.text;
        expect(
          serialized,
          `render #${index} no debe contener el centinela de "${sentinelCase.label}"`,
        ).not.toContain(sentinelCase.sentinel);
      }
    });
  });

  it("internalName tampoco sobrevive al pipeline (campo interno, no solo privateAddress)", () => {
    const internalSentinel = "INTERNAL-ONLY-9f2e8a";
    const property = demoProperty({ internalName: internalSentinel });

    const view = toPublicPropertyView(property);
    const bundle = generatePropertyTexts(view);
    const pieceTexts = propertyTextBundleToPieceTexts(bundle, view);
    const email = renderPropertyEmail(view, BRAND, pieceTexts, PHOTOS);

    expect(JSON.stringify(view)).not.toContain(internalSentinel);
    expect(JSON.stringify(bundle)).not.toContain(internalSentinel);
    expect(JSON.stringify(pieceTexts)).not.toContain(internalSentinel);
    expect(email.html).not.toContain(internalSentinel);
    expect(email.text).not.toContain(internalSentinel);
  });

  it("el email escapa el centinela HTML en vez de dejarlo ejecutable (defensa en profundidad XSS)", () => {
    const xssSentinel = `<script>alert('SENTINEL-XSS')</script>`;
    const property = demoProperty({
      privateAddress: `Piso confidencial ${xssSentinel}`,
    });

    const view = toPublicPropertyView(property);
    const bundle = generatePropertyTexts(view);
    const pieceTexts = propertyTextBundleToPieceTexts(bundle, view);
    const email = renderPropertyEmail(view, BRAND, pieceTexts, PHOTOS);

    expect(email.html).not.toContain("<script>alert('SENTINEL-XSS')</script>");
  });
});
