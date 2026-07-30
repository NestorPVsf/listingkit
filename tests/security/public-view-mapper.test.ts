/**
 * Cierre de la pega QUALITY de la review: habia CUATRO copias escritas a mano
 * del mapeo fila-de-Prisma → `PublicPropertyView` (preview, email, video y
 * ZIP), y ya habian divergido — la del empaquetador emitia `photoAssetIds: []`
 * y se saltaba el fallback de foto principal.
 *
 * Ese mapeo ES la allowlist que decide que sale publicado. Ahora vive en un
 * unico sitio y este test lo vigila: si alguien anade un campo privado al
 * mapper, aqui salta.
 */
import { describe, expect, it } from "vitest";
import { storedPropertyToPublicView } from "@/niches/inmobiliaria/persistence/public-view-mapper";

const PRIVATE_ADDRESS = "Calle Secreta 12, 3B, 03001 Alicante";
const INTERNAL_NAME = "PISO-CENTRO-2026-014";

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "prop-1",
    internalName: INTERNAL_NAME,
    privateAddress: PRIVATE_ADDRESS,
    operation: "sale",
    propertyType: "apartment",
    price: 249_000,
    currency: "EUR",
    pricePeriod: null,
    city: "Alicante",
    district: "Centro",
    publicAddress: "Zona mercado central",
    builtAreaM2: 95,
    usableAreaM2: 88,
    bedrooms: 3,
    bathrooms: 2,
    floor: "3",
    elevator: true,
    terrace: true,
    balcony: false,
    garage: false,
    storageRoom: true,
    pool: false,
    garden: false,
    condition: "good",
    constructionYear: 1998,
    energyCertificateRating: "D",
    energyCertificateIdentifier: "ES-2026-0001",
    description: "Piso luminoso a cinco minutos del Postiguet.",
    highlights: ["Terraza", "Ascensor", "Trastero"],
    cta: "Escribenos para verlo",
    listingUrl: "https://postiguethomes-demo.es/piso-1",
    agentName: "Marta Ruiz",
    agentPhone: "+34611223344",
    agentEmail: "marta@postiguethomes-demo.es",
    agencyName: "Postiguet Homes",
    agencyWebsite: "https://postiguethomes-demo.es",
    primaryPhotoAssetId: null,
    musicAssetId: null,
    narrationAssetId: null,
    explicitlyAllowedClaims: [],
    createdAt: new Date("2026-07-30T10:00:00.000Z"),
    updatedAt: new Date("2026-07-30T10:00:00.000Z"),
    // Deliberadamente desordenadas: el orden lo marca `order`, no el array.
    photos: [
      { id: "photo-c", order: 2 },
      { id: "photo-a", order: 0 },
      { id: "photo-b", order: 1 },
    ],
    ...overrides,
  };
}

type MapperRow = Parameters<typeof storedPropertyToPublicView>[0];

describe("storedPropertyToPublicView — allowlist unica", () => {
  it("no deja pasar privateAddress ni internalName", () => {
    const view = storedPropertyToPublicView(storedRow() as unknown as MapperRow);
    const serialized = JSON.stringify(view);

    expect(serialized).not.toContain(PRIVATE_ADDRESS);
    expect(serialized).not.toContain(INTERNAL_NAME);
    expect("privateAddress" in view).toBe(false);
    expect("internalName" in view).toBe(false);
  });

  it("devuelve las fotos ordenadas por `order`, no por el orden del array", () => {
    const view = storedPropertyToPublicView(storedRow() as unknown as MapperRow);
    expect(view.photoAssetIds).toEqual(["photo-a", "photo-b", "photo-c"]);
  });

  it("cae a la primera foto cuando no hay principal marcada", () => {
    const view = storedPropertyToPublicView(storedRow() as unknown as MapperRow);
    expect(view.primaryPhotoAssetId).toBe("photo-a");
  });

  it("respeta la foto principal cuando existe", () => {
    const view = storedPropertyToPublicView(
      storedRow({ primaryPhotoAssetId: "photo-b" }) as unknown as MapperRow,
    );
    expect(view.primaryPhotoAssetId).toBe("photo-b");
  });

  it("funciona sin join de fotos (el empaquetador lee la fila sola)", () => {
    const { photos: _sinFotos, ...row } = storedRow();
    const view = storedPropertyToPublicView(row as unknown as MapperRow);

    expect(view.photoAssetIds).toEqual([]);
    expect(view.primaryPhotoAssetId).toBe("");
    expect(view.city).toBe("Alicante");
  });

  it("mapea el certificado energetico solo cuando hay calificacion", () => {
    const conCertificado = storedPropertyToPublicView(
      storedRow() as unknown as MapperRow,
    );
    expect(conCertificado.energyCertificate).toEqual({
      rating: "D",
      identifier: "ES-2026-0001",
    });

    const sinCertificado = storedPropertyToPublicView(
      storedRow({ energyCertificateRating: null }) as unknown as MapperRow,
    );
    expect(sinCertificado.energyCertificate).toBeUndefined();
  });

  it("normaliza los null de la base de datos a undefined", () => {
    const view = storedPropertyToPublicView(
      storedRow({ district: null, listingUrl: null }) as unknown as MapperRow,
    );
    expect(view.district).toBeUndefined();
    expect(view.listingUrl).toBeUndefined();
  });
});
