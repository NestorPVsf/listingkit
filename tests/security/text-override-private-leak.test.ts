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

/**
 * La red no puede cerrarse sobre el propio usuario.
 *
 * Lo destapo la reescritura con IA sobre la propiedad demo, pero el editor
 * manual tenia el mismo fallo desde el principio: la direccion privada suele
 * EMPEZAR por la zona ("Centro, Alicante — C/ Tal, 3º B"), asi que el tramo
 * anterior a la primera coma era "Centro" y cualquier titular que dijera
 * "Centro" se rechazaba como fuga. El titular mas normal del mundo.
 */
describe("no confunde lo publicado con lo privado", () => {
  const PROPIEDAD = {
    privateAddress:
      "Centro, Alicante — cerca C/ Alfonso el Sabio, 3ª planta con ascensor",
    internalName: "Piso reforma Centro",
    publicAddress: "Centro, Alicante (cerca C/ Alfonso el Sabio)",
    city: "Alicante",
    district: "Centro",
  };

  it("deja pasar la zona que el propio operador publica", () => {
    expect(
      assertPublicTextOverride("Piso de 3 hab. en el Centro de Alicante", PROPIEDAD),
    ).toBe("Piso de 3 hab. en el Centro de Alicante");
  });

  it("deja pasar la direccion PUBLICA entera", () => {
    // Es literalmente el campo que existe para publicarse.
    expect(
      assertPublicTextOverride(`Piso en ${PROPIEDAD.publicAddress}`, PROPIEDAD),
    ).toContain("Alfonso el Sabio");
  });

  it("y sigue cazando la direccion privada completa, que es el accidente real", () => {
    // Lo que hay que impedir es el copia-pega del campo interno: la planta y
    // el portal no estan en la version publica, asi que la forma completa
    // nunca se cuela por la excepcion de arriba.
    expect(() =>
      assertPublicTextOverride(`Piso en ${PROPIEDAD.privateAddress}`, PROPIEDAD),
    ).toThrow(TextOverrideRejected);
  });

  it("sin campos publicos declarados se comporta como antes", () => {
    // Compatibilidad: los tres endpoints pasan la fila entera, pero un
    // consumidor que solo tenga los campos privados no debe perder proteccion.
    expect(() =>
      assertPublicTextOverride("Piso en Centro", {
        privateAddress: PROPIEDAD.privateAddress,
      }),
    ).toThrow(TextOverrideRejected);
  });
});
