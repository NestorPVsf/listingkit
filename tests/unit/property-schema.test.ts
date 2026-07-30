/**
 * TDD — Fase 2.1 del PLAN.md de InmoContent OS.
 *
 * Estos tests DEBEN fallar en rojo por import inexistente (`niches/inmobiliaria/`
 * aun no existe). El agente `database` implementará el schema en 2.2 respetando
 * los contratos de `docs/architecture/niche-engine.md` ("Schema de la instancia
 * inmobiliaria" + "Contratos TypeScript del core").
 *
 * Fixtures basadas en las 3 propiedades demo de `docs/research/propiedades-demo.md`
 * (Postiguet Homes, ficticias).
 *
 * NOTA para quien implemente: `energyCertificate.rating` en este test set incluye
 * "en-tramite" y "exento" ademas de A-G (obligatorio real en España, ley 2013).
 * El ejemplo de codigo del ADR solo lista A-G — es una extension deliberada que
 * el agente database debe reconciliar, no un error de este test.
 */
import { describe, expect, it } from "vitest";
import {
  propertyInputSchema,
  toPublicPropertyInput,
  type PropertyInput,
} from "@/niches/inmobiliaria/schema";
import {
  photoUploadSchema,
  sanitizeFileName,
} from "@/lib/infrastructure/files/upload-contract";

// ---------------------------------------------------------------------------
// Fixture base — Propiedad 1 demo: "Piso reforma en Centro Alicante"
// ---------------------------------------------------------------------------

const PHOTO_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
] as const;

function validPropertyInput(
  overrides: Partial<PropertyInput> = {},
): PropertyInput {
  return {
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
      "andando de la Explanada. Cocina reformada en 2019 y balcón orientado sur. " +
      "Edificio con ascensor y portero automático.",
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
  } as PropertyInput;
}

// ---------------------------------------------------------------------------
// 1. Happy path — ~35 campos
// ---------------------------------------------------------------------------

describe("propertyInputSchema — happy path (demo Postiguet Homes)", () => {
  it("valida una propiedad completa con los ~35 campos", () => {
    const result = propertyInputSchema.safeParse(validPropertyInput());
    expect(result.success).toBe(true);
  });

  it("expone al menos 30 claves top-level en el fixture de referencia", () => {
    expect(Object.keys(validPropertyInput()).length).toBeGreaterThanOrEqual(30);
  });

  it("acepta un chalet con parcela y 2 plantas (propiedad demo 3)", () => {
    const chalet = validPropertyInput({
      propertyType: "house",
      price: 495_000,
      city: "El Campello",
      district: "Muchavista",
      bedrooms: 4,
      bathrooms: 3,
      builtAreaM2: 210,
      usableAreaM2: 195,
      pool: true,
      garden: true,
      garage: true,
      constructionYear: 2011,
      energyCertificate: { rating: "B" },
      floor: undefined,
    });
    expect(propertyInputSchema.safeParse(chalet).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Precio — obligatorio y positivo
// ---------------------------------------------------------------------------

describe("propertyInputSchema — precio", () => {
  it("rechaza precio negativo", () => {
    const result = propertyInputSchema.safeParse(
      validPropertyInput({ price: -1 }),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza precio cero", () => {
    const result = propertyInputSchema.safeParse(
      validPropertyInput({ price: 0 }),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza precio ausente", () => {
    const { price: _price, ...withoutPrice } = validPropertyInput();
    const result = propertyInputSchema.safeParse(withoutPrice);
    expect(result.success).toBe(false);
  });

  it("rechaza precio no finito (Infinity/NaN)", () => {
    expect(
      propertyInputSchema.safeParse(validPropertyInput({ price: Infinity }))
        .success,
    ).toBe(false);
    expect(
      propertyInputSchema.safeParse(validPropertyInput({ price: Number.NaN }))
        .success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Validación cruzada venta/alquiler
// ---------------------------------------------------------------------------

describe("propertyInputSchema — validación cruzada operation/pricePeriod", () => {
  it("alquiler requiere pricePeriod = 'month'", () => {
    const result = propertyInputSchema.safeParse(
      validPropertyInput({ operation: "rent", price: 900 }),
    );
    expect(result.success).toBe(false);
  });

  it("alquiler con pricePeriod = 'month' es válido y etiqueta €/mes", () => {
    const result = propertyInputSchema.safeParse(
      validPropertyInput({
        operation: "rent",
        price: 900,
        pricePeriod: "month",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("venta NO admite pricePeriod", () => {
    const result = propertyInputSchema.safeParse(
      validPropertyInput({ operation: "sale", pricePeriod: "month" }),
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Fotos — 3 a 20, foto principal debe pertenecer a la galería
// ---------------------------------------------------------------------------

describe("propertyInputSchema — límites de fotos", () => {
  it("rechaza menos de 3 fotos", () => {
    const result = propertyInputSchema.safeParse(
      validPropertyInput({
        photoAssetIds: PHOTO_IDS.slice(0, 2),
        primaryPhotoAssetId: PHOTO_IDS[0],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("acepta exactamente 3 fotos (mínimo)", () => {
    const result = propertyInputSchema.safeParse(validPropertyInput());
    expect(result.success).toBe(true);
  });

  it("acepta 20 fotos (máximo)", () => {
    const twenty = Array.from(
      { length: 20 },
      (_, i) => `${String(i + 1).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    const result = propertyInputSchema.safeParse(
      validPropertyInput({
        photoAssetIds: twenty,
        primaryPhotoAssetId: twenty[0],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rechaza 21 fotos (excede el máximo)", () => {
    const twentyOne = Array.from(
      { length: 21 },
      (_, i) => `${String(i + 1).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    const result = propertyInputSchema.safeParse(
      validPropertyInput({
        photoAssetIds: twentyOne,
        primaryPhotoAssetId: twentyOne[0],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza foto principal que no pertenece a la galería", () => {
    const result = propertyInputSchema.safeParse(
      validPropertyInput({
        primaryPhotoAssetId: "99999999-9999-4999-8999-999999999999",
      }),
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Formatos de imagen y límite de tamaño (10MB) — asset de subida
// ---------------------------------------------------------------------------

describe("photoUploadSchema — formatos JPG/PNG/WebP y límite 10MB", () => {
  const baseUpload = {
    fileName: "salon-luminoso.jpg",
    mediaType: "image/jpeg",
    bytes: 2 * 1024 * 1024,
  };

  it("acepta image/jpeg", () => {
    expect(photoUploadSchema.safeParse(baseUpload).success).toBe(true);
  });

  it("acepta image/png", () => {
    expect(
      photoUploadSchema.safeParse({
        ...baseUpload,
        fileName: "salon.png",
        mediaType: "image/png",
      }).success,
    ).toBe(true);
  });

  it("acepta image/webp", () => {
    expect(
      photoUploadSchema.safeParse({
        ...baseUpload,
        fileName: "salon.webp",
        mediaType: "image/webp",
      }).success,
    ).toBe(true);
  });

  it("rechaza formatos no soportados (image/gif)", () => {
    expect(
      photoUploadSchema.safeParse({
        ...baseUpload,
        fileName: "salon.gif",
        mediaType: "image/gif",
      }).success,
    ).toBe(false);
  });

  it("acepta un archivo justo en el límite de 10MB", () => {
    expect(
      photoUploadSchema.safeParse({ ...baseUpload, bytes: 10 * 1024 * 1024 })
        .success,
    ).toBe(true);
  });

  it("rechaza un archivo que excede 10MB", () => {
    expect(
      photoUploadSchema.safeParse({
        ...baseUpload,
        bytes: 10 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
  });

  it("rechaza tamaño cero o negativo", () => {
    expect(photoUploadSchema.safeParse({ ...baseUpload, bytes: 0 }).success).toBe(
      false,
    );
    expect(
      photoUploadSchema.safeParse({ ...baseUpload, bytes: -100 }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Certificado energético — A-G + "en trámite" / "exento"
// ---------------------------------------------------------------------------

describe("propertyInputSchema — certificado energético", () => {
  it.each(["A", "B", "C", "D", "E", "F", "G"] as const)(
    "acepta calificación %s",
    (rating) => {
      const result = propertyInputSchema.safeParse(
        validPropertyInput({ energyCertificate: { rating } }),
      );
      expect(result.success).toBe(true);
    },
  );

  it("acepta 'en-tramite' como estado válido (obligatorio legal, aún sin emitir)", () => {
    const result = propertyInputSchema.safeParse(
      validPropertyInput({
        energyCertificate: { rating: "en-tramite" },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("acepta 'exento' como estado válido", () => {
    const result = propertyInputSchema.safeParse(
      validPropertyInput({ energyCertificate: { rating: "exento" } }),
    );
    expect(result.success).toBe(true);
  });

  it("rechaza una calificación inventada fuera de A-G/en-tramite/exento", () => {
    const result = propertyInputSchema.safeParse(
      validPropertyInput({
        energyCertificate: { rating: "Z" as never },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("el certificado energético es opcional (no bloquea, solo advierte en UI)", () => {
    const { energyCertificate: _cert, ...withoutCert } = validPropertyInput();
    const result = propertyInputSchema.safeParse(withoutCert);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Campos opcionales — dirección pública, zona/distrito
// ---------------------------------------------------------------------------

describe("propertyInputSchema — campos opcionales", () => {
  it("acepta ausencia de dirección pública", () => {
    const { publicAddress: _pub, ...withoutPublicAddress } =
      validPropertyInput();
    expect(
      propertyInputSchema.safeParse(withoutPublicAddress).success,
    ).toBe(true);
  });

  it("acepta ausencia de zona/distrito (ciudad sin barrio)", () => {
    const { district: _district, ...withoutDistrict } = validPropertyInput();
    expect(propertyInputSchema.safeParse(withoutDistrict).success).toBe(true);
  });

  it("privateAddress SIGUE siendo obligatoria aunque publicAddress falte", () => {
    const { publicAddress: _pub, privateAddress: _priv, ...rest } =
      validPropertyInput();
    const result = propertyInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Sanitización de nombres de archivo
// ---------------------------------------------------------------------------

describe("sanitizeFileName — nombres de archivo peligrosos", () => {
  it("rechaza path traversal '../'", () => {
    expect(() => sanitizeFileName("../../etc/passwd.jpg")).toThrow();
  });

  it("rechaza path traversal codificado '..%2f'", () => {
    expect(() => sanitizeFileName("..%2f..%2fsecret.png")).toThrow();
  });

  it("rechaza null bytes", () => {
    expect(() => sanitizeFileName("salon.jpg\u0000.exe")).toThrow();
  });

  it("rechaza nombres reservados de Windows (CON, NUL, PRN, COM1...)", () => {
    for (const reserved of ["CON.jpg", "NUL.png", "PRN.webp", "COM1.jpg"]) {
      expect(() => sanitizeFileName(reserved)).toThrow();
    }
  });

  it("rechaza separadores de ruta absoluta", () => {
    expect(() => sanitizeFileName("/etc/passwd.jpg")).toThrow();
    expect(() => sanitizeFileName("C:\\Windows\\system32.jpg")).toThrow();
  });

  it("acepta un nombre de archivo normal", () => {
    expect(sanitizeFileName("salon-luminoso-01.jpg")).toBe(
      "salon-luminoso-01.jpg",
    );
  });

  it("acepta unicode razonable (acentos) sin lanzar", () => {
    expect(() => sanitizeFileName("habitación-principal.png")).not.toThrow();
  });

  it("rechaza nombres de archivo que superan 255 caracteres", () => {
    const tooLong = `${"a".repeat(252)}.jpg`; // 256 caracteres
    expect(tooLong.length).toBeGreaterThan(255);
    expect(() => sanitizeFileName(tooLong)).toThrow();
  });

  it("acepta un nombre de archivo justo en el límite de 255 caracteres", () => {
    const atLimit = `${"a".repeat(251)}.jpg`; // 255 caracteres exactos
    expect(atLimit.length).toBe(255);
    expect(() => sanitizeFileName(atLimit)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 9. toPublicPropertyInput — no debe filtrar internalName ni privateAddress
// ---------------------------------------------------------------------------

describe("toPublicPropertyInput", () => {
  it("elimina internalName y privateAddress del resultado", () => {
    const input = validPropertyInput();
    const publicInput = toPublicPropertyInput(input);
    expect(publicInput).not.toHaveProperty("internalName");
    expect(publicInput).not.toHaveProperty("privateAddress");
  });

  it("conserva el resto de campos públicos intactos", () => {
    const input = validPropertyInput();
    const publicInput = toPublicPropertyInput(input);
    expect(publicInput.city).toBe(input.city);
    expect(publicInput.price).toBe(input.price);
    expect(publicInput.description).toBe(input.description);
  });
});
