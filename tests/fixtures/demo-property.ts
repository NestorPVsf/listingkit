/**
 * Fixture compartido por los E2E de render (Fase 4.1, TDD). Basado en la
 * Propiedad 1 de docs/research/propiedades-demo.md (Piso Centro Alicante) —
 * datos DEMO/ficticios, ver aviso en ese documento.
 *
 * `privateAddress` incluye un CENTINELA (`SENTINEL-PRIVATE-4f9c2b1a`) además
 * del texto real, para que el test de fuga de datos en PDF pueda buscar una
 * cadena inconfundible y no depender de coincidencias parciales con el resto
 * del contenido público.
 */
import type { APIRequestContext } from "@playwright/test";

export const PRIVATE_ADDRESS_SENTINEL = "SENTINEL-PRIVATE-4f9c2b1a";

export const DEMO_PRIVATE_ADDRESS = `Calle Alfonso el Sabio 14, 3º A, 03001 Alicante (${PRIVATE_ADDRESS_SENTINEL})`;

/** PNG 1x1 válido (rojo), suficiente para que Sharp/Chromium lo decodifiquen. */
const SENTINEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export interface DemoPropertyPayloadOptions {
  readonly photoAssetIds: readonly string[];
  readonly primaryPhotoAssetId: string;
}

export function demoPropertyPayload({
  photoAssetIds,
  primaryPhotoAssetId,
}: DemoPropertyPayloadOptions) {
  return {
    internalName: "Piso Alfonso el Sabio — Centro (demo E2E)",
    operation: "sale" as const,
    propertyType: "apartment" as const,
    price: 245_000,
    currency: "EUR" as const,
    city: "Alicante",
    district: "Centro",
    publicAddress: "Centro, cerca C/ Alfonso el Sabio",
    privateAddress: DEMO_PRIVATE_ADDRESS,
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
    condition: "renovation-needed" as const,
    constructionYear: 1978,
    energyCertificate: { rating: "D" as const },
    description:
      "Piso luminoso de 3 habitaciones en pleno Centro de Alicante, a 5 minutos " +
      "andando de la Explanada. Cocina reformada en 2019 y balcón orientado sur.",
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
    photoAssetIds,
    primaryPhotoAssetId,
    explicitlyAllowedClaims: [],
  };
}

/**
 * Sube 5 fotos sentinela vía POST /api/assets (contrato asumido, ver cabecera
 * de los specs E2E) y devuelve los AssetRef.id resultantes. 5 fotos porque el
 * carrusel exige exactamente 5 (minItems/maxItems del catálogo, ADR).
 */
export async function uploadDemoPhotos(
  request: APIRequestContext,
): Promise<string[]> {
  const buffer = Buffer.from(SENTINEL_PNG_BASE64, "base64");
  const ids: string[] = [];

  for (let index = 0; index < 5; index += 1) {
    const response = await request.post("/api/assets", {
      multipart: {
        file: {
          name: `demo-photo-${index + 1}.png`,
          mimeType: "image/png",
          buffer,
        },
        kind: "image",
      },
    });

    if (!response.ok()) {
      throw new Error(
        `POST /api/assets falló (${response.status()}) subiendo demo-photo-${index + 1}.png`,
      );
    }

    const body = (await response.json()) as { id: string };
    ids.push(body.id);
  }

  return ids;
}
