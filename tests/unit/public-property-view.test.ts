/**
 * TDD — Fase 2.1/2.4 del PLAN.md. TEST MÁS CRÍTICO del proyecto.
 *
 * Regla dura #1 de spec.md: "La dirección privada JAMÁS aparece en ninguna
 * pieza pública, en el ZIP, ni en `datos-propiedad.json`."
 *
 * `PublicPropertyView` es, según spec.md, la proyección de una `Property`
 * persistida (con id/timestamps) SIN `privateAddress` ni campos internos —
 * "el ÚNICO tipo que las plantillas de piezas públicas pueden recibir".
 *
 * Este archivo fallará en rojo por import inexistente hasta que `database`
 * implemente `niches/inmobiliaria/public-view.ts` en la tarea 2.4.
 *
 * DECISIÓN DE DISEÑO: se asume que `Property`
 * (persistida) extiende `PropertyInput` con `id`, `createdAt`, `updatedAt`.
 * Si el agente `database` modela `Property` distinto, solo hace falta ajustar
 * el tipo del fixture — los asserts de fuga de datos no cambian.
 */
import { describe, expect, it } from "vitest";
import {
  toPublicPropertyView,
  type Property,
  type PublicPropertyView,
} from "@/niches/inmobiliaria/public-view";

const PHOTO_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
] as const;

// Texto trampa: el nombre de calle de la dirección privada aparece TAMBIÉN,
// de forma legítima, en la descripción libre que escribió el agente. Filtrar
// debe borrar el CAMPO privateAddress completo, no perseguir substrings del
// texto libre del usuario.
const TRAP_STREET_NAME = "Alfonso el Sabio";
const PRIVATE_ADDRESS = `Calle ${TRAP_STREET_NAME} 14, 3º A, 03001 Alicante`;
const DESCRIPTION_WITH_TRAP =
  `Piso luminoso de 3 habitaciones muy cerca de la calle ${TRAP_STREET_NAME}, ` +
  "a 5 minutos andando de la Explanada. Cocina reformada en 2019.";

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
    privateAddress: PRIVATE_ADDRESS,
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
    description: DESCRIPTION_WITH_TRAP,
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
    ...overrides,
  } as Property;
}

describe("toPublicPropertyView — fuga de dirección privada (regla dura #1)", () => {
  it("el objeto resultante NO tiene la clave privateAddress", () => {
    const view = toPublicPropertyView(demoProperty());
    expect(view).not.toHaveProperty("privateAddress");
  });

  it("el objeto resultante NO tiene la clave internalName", () => {
    const view = toPublicPropertyView(demoProperty());
    expect(view).not.toHaveProperty("internalName");
  });

  it("JSON.stringify de la vista pública NO contiene la dirección privada completa", () => {
    const view = toPublicPropertyView(demoProperty());
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(PRIVATE_ADDRESS);
    // el número de piso/puerta es el dato realmente sensible, no el nombre de calle
    expect(serialized).not.toContain("14, 3º A");
  });

  it("JSON.stringify de la vista pública NO contiene el nombre interno", () => {
    const view = toPublicPropertyView(demoProperty());
    expect(JSON.stringify(view)).not.toContain("ficha interna");
  });

  it("no filtra la dirección privada ni con propiedades vacías/undefined", () => {
    const view = toPublicPropertyView(
      demoProperty({ publicAddress: undefined, district: undefined }),
    );
    expect(JSON.stringify(view)).not.toContain(PRIVATE_ADDRESS);
  });

  it("caso trampa: preserva el texto libre de la descripción del agente TAL CUAL, aunque comparta substring con la calle privada", () => {
    const view = toPublicPropertyView(demoProperty());
    // el texto libre del usuario no se toca ni se censura
    expect(view.description).toBe(DESCRIPTION_WITH_TRAP);
    expect(view.description).toContain(TRAP_STREET_NAME);
  });
});

describe("toPublicPropertyView — campos públicos presentes", () => {
  it("conserva los campos necesarios para las 6 piezas", () => {
    const view: PublicPropertyView = toPublicPropertyView(demoProperty());
    expect(view.city).toBe("Alicante");
    expect(view.district).toBe("Centro");
    expect(view.publicAddress).toBe("Centro, cerca C/ Alfonso el Sabio");
    expect(view.price).toBe(245_000);
    expect(view.operation).toBe("sale");
    expect(view.bedrooms).toBe(3);
    expect(view.bathrooms).toBe(1);
    expect(view.builtAreaM2).toBe(78);
    expect(view.highlights).toHaveLength(5);
    expect(view.cta).toBe("Solicita visita");
    expect(view.agent.name).toBe("Javier Roselló Ibáñez");
    expect(view.agency.name).toBe("Postiguet Homes");
    expect(view.photoAssetIds).toEqual([...PHOTO_IDS]);
    expect(view.primaryPhotoAssetId).toBe(PHOTO_IDS[0]);
  });

  it("omite publicAddress sin dejar huecos visibles cuando no existe", () => {
    const view = toPublicPropertyView(
      demoProperty({ publicAddress: undefined }),
    );
    expect(view.publicAddress).toBeUndefined();
  });

  it("omite district sin dejar huecos visibles cuando la ciudad no tiene zona", () => {
    const view = toPublicPropertyView(demoProperty({ district: undefined }));
    expect(view.district).toBeUndefined();
  });

  it("es idempotente: aplicar la proyección dos veces da el mismo resultado", () => {
    const property = demoProperty();
    const view1 = toPublicPropertyView(property);
    const view2 = toPublicPropertyView(property);
    expect(view1).toEqual(view2);
  });
});

describe("toPublicPropertyView — fuzzing ligero de valores centinela", () => {
  it.each([
    "SENTINEL-PRIVATE-4f9c2b1a",
    "no-publicar-esta-direccion",
    "PISO 4B PUERTA IZQUIERDA",
  ])("el centinela '%s' puesto en privateAddress no aparece en la vista pública", (sentinel) => {
    const view = toPublicPropertyView(
      demoProperty({ privateAddress: sentinel }),
    );
    expect(JSON.stringify(view)).not.toContain(sentinel);
  });
});
