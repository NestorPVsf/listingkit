/**
 * Candado de operador: cierra el bloqueante "cualquiera con acceso a la red del
 * proceso opera la app entera".
 *
 * Es UN candado, no gestion de usuarios — v1 es monoinquilino por diseño. Lo
 * que se prueba aqui es que la llave no se pueda fabricar, ni reutilizar tras
 * cambiar la contraseña, ni estirar mas alla de su vida.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  configuredPasswordHash,
  hashPassword,
  isAuthEnforced,
  mintSession,
  verifyPassword,
  verifySession,
} from "@/lib/auth/operator-session";

const PASSWORD = "una frase larga de operador";
const HASH_ORIGINAL = hashPassword(PASSWORD);

function conHash(hash: string | undefined, fn: () => void): void {
  const previo = process.env.APP_PASSWORD_HASH;
  if (hash === undefined) delete process.env.APP_PASSWORD_HASH;
  else process.env.APP_PASSWORD_HASH = hash;
  try {
    fn();
  } finally {
    if (previo === undefined) delete process.env.APP_PASSWORD_HASH;
    else process.env.APP_PASSWORD_HASH = previo;
  }
}

afterEach(() => {
  delete process.env.APP_PASSWORD_HASH;
});

describe("contraseña de operador", () => {
  it("nunca guarda la contraseña, solo un hash con sal", () => {
    expect(HASH_ORIGINAL).not.toContain(PASSWORD);
    expect(HASH_ORIGINAL).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  it("dos hashes de la misma contraseña son distintos (sal aleatoria)", () => {
    expect(hashPassword(PASSWORD)).not.toBe(hashPassword(PASSWORD));
  });

  it("acepta la contraseña correcta y rechaza el resto", () => {
    expect(verifyPassword(PASSWORD, HASH_ORIGINAL)).toBe(true);
    expect(verifyPassword("otra cosa", HASH_ORIGINAL)).toBe(false);
    expect(verifyPassword("", HASH_ORIGINAL)).toBe(false);
    expect(verifyPassword(`${PASSWORD} `, HASH_ORIGINAL)).toBe(false);
  });

  it("no revienta con un hash corrupto o ausente: simplemente no valida", () => {
    for (const basura of ["", "scrypt$", "md5$aa$bb", "scrypt$zz$yy", "null"]) {
      expect(verifyPassword(PASSWORD, basura)).toBe(false);
    }
  });

  it("solo considera configurado un hash con el formato esperado", () => {
    conHash(undefined, () => expect(configuredPasswordHash()).toBeNull());
    conHash("no-es-un-hash", () => expect(configuredPasswordHash()).toBeNull());
    conHash(HASH_ORIGINAL, () =>
      expect(configuredPasswordHash()).toBe(HASH_ORIGINAL),
    );
  });
});

describe("sesion firmada", () => {
  it("acepta la sesion recien acuñada", () => {
    conHash(HASH_ORIGINAL, () => {
      expect(verifySession(mintSession())).toBe(true);
    });
  });

  it("sin candado configurado no valida ninguna sesion", () => {
    let token = "";
    conHash(HASH_ORIGINAL, () => {
      token = mintSession();
    });
    conHash(undefined, () => expect(verifySession(token)).toBe(false));
  });

  it("cambiar la contraseña invalida las sesiones vivas", () => {
    // La clave de firma se deriva del hash: es la propiedad que hace que
    // cambiar la contraseña porque sospechas algo sirva de verdad.
    let token = "";
    conHash(HASH_ORIGINAL, () => {
      token = mintSession();
      expect(verifySession(token)).toBe(true);
    });
    conHash(hashPassword("otra contraseña distinta"), () => {
      expect(verifySession(token)).toBe(false);
    });
  });

  it("caduca a las 12 horas", () => {
    conHash(HASH_ORIGINAL, () => {
      const now = 1_785_000_000_000;
      const token = mintSession(now);
      expect(verifySession(token, now + 11 * 60 * 60_000)).toBe(true);
      expect(verifySession(token, now + 13 * 60 * 60_000)).toBe(false);
    });
  });

  it("rechaza sesiones manipuladas, no canonicas y vacias", () => {
    conHash(HASH_ORIGINAL, () => {
      const now = 1_785_000_000_000;
      const token = mintSession(now);
      const [caducidad, firma] = token.split(".") as [string, string];

      const malas = [
        undefined,
        "",
        "sin-punto",
        `${caducidad}.${"0".repeat(64)}`,
        `${Number(caducidad) + 60_000}.${firma}`, // estirar la caducidad
        `${token}.sufijo`,
        `${token}zz`,
        `0${caducidad}.${firma}`,
        `${caducidad}.${firma.toUpperCase()}`,
      ];
      for (const mala of malas) {
        expect(verifySession(mala, now + 1_000), `deberia rechazar ${mala}`).toBe(
          false,
        );
      }
    });
  });
});

describe("donde aplica el candado", () => {
  it("se exige en produccion y se deja abierto en desarrollo", () => {
    // Mismo criterio que la ruta de render: en local es superficie de trabajo,
    // y un login en medio acaba con alguien desactivandolo "un momento".
    expect(isAuthEnforced()).toBe(process.env.NODE_ENV === "production");
  });
});
