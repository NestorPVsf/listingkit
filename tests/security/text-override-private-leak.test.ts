/**
 * Regresion de F-01 (review adversarial, severidad high):
 *
 * `PublicPropertyView` garantiza por tipos que privateAddress/internalName no
 * llegan a una plantilla, pero el editor de textos entra DESPUES de esa
 * proyeccion: lo que el operador escribe sustituye al titular y acaba en el
 * PNG, el PDF, el email y los .txt del ZIP. Copiar la direccion completa en el
 * titular de un post era, hasta el fix, una fuga en un solo paso.
 */
import { describe, expect, it } from "vitest";
import {
  assertPublicTextOverride,
  MAX_TEXT_OVERRIDE_LENGTH,
  TextOverrideRejected,
} from "@/niches/inmobiliaria/validate-text-override";

const PROPERTY = {
  privateAddress: "Calle Secreta 12, 3B, 03001 Alicante",
  internalName: "PISO-CENTRO-2026-014",
};

function rejection(text: string): TextOverrideRejected {
  try {
    assertPublicTextOverride(text, PROPERTY);
  } catch (error: unknown) {
    if (error instanceof TextOverrideRejected) return error;
    throw error;
  }
  throw new Error(`El texto deberia haber sido rechazado: ${text}`);
}

describe("assertPublicTextOverride — la direccion privada no vuelve por el editor", () => {
  it("rechaza la direccion privada copiada literal", () => {
    const error = rejection(`Piso reformado en ${PROPERTY.privateAddress}. Ven a verlo.`);
    expect(error.code).toBe("TEXT_OVERRIDE_LEAKS_PRIVATE_DATA");
    expect(error.field).toBe("privateAddress");
  });

  it("rechaza solo el tramo calle + numero (lo que se pega suelto)", () => {
    expect(rejection("Vive en Calle Secreta 12 desde 249.000 EUR").field).toBe(
      "privateAddress",
    );
  });

  it("no se deja engañar por mayusculas, tildes ni puntuacion", () => {
    expect(rejection("CALLE  SECRETA, 12 — oportunidad").field).toBe("privateAddress");
    expect(rejection("cállé secretá 12!!!").field).toBe("privateAddress");
  });

  it("rechaza la referencia interna de la agencia", () => {
    const error = rejection("Ref. PISO-CENTRO-2026-014 — 3 dormitorios");
    expect(error.field).toBe("internalName");
  });

  it("acepta un titular publico normal y lo devuelve recortado", () => {
    const result = assertPublicTextOverride(
      "  Luminoso 3 dormitorios a 5 minutos del Postiguet  ",
      PROPERTY,
    );
    expect(result).toBe("Luminoso 3 dormitorios a 5 minutos del Postiguet");
  });

  it("acepta mencionar la zona publica, que no es dato privado", () => {
    expect(
      assertPublicTextOverride("Centro de Alicante, junto al mercado", PROPERTY),
    ).toContain("Alicante");
  });

  it("limita el tamaño del texto", () => {
    expect(rejection("a".repeat(MAX_TEXT_OVERRIDE_LENGTH + 1)).code).toBe(
      "TEXT_OVERRIDE_TOO_LONG",
    );
  });

  it("rechaza el texto vacio o solo espacios", () => {
    expect(rejection("   \n  ").code).toBe("TEXT_OVERRIDE_EMPTY");
  });

  it("no salta con valores privados vacios o nulos", () => {
    expect(
      assertPublicTextOverride("Titular cualquiera", {
        privateAddress: null,
        internalName: undefined,
      }),
    ).toBe("Titular cualquiera");
  });

  it("ignora valores privados demasiado cortos para comparar sin falsos positivos", () => {
    // Un internalName "A1" haria saltar la alarma en casi cualquier frase.
    expect(
      assertPublicTextOverride("Atico A1 con vistas", {
        privateAddress: null,
        internalName: "A1",
      }),
    ).toBe("Atico A1 con vistas");
  });
});
