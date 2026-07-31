/**
 * Cierre de F-14 (bloqueante nº1 del audit).
 *
 * `/preview/[pieceId]` devolvia 404 en produccion, y como Playwright captura
 * las piezas navegando a esa ruta, **toda generacion visual fallaba en prod**:
 * el unico runtime operativo era `next dev`, que no debe exponerse a una red.
 *
 * Abrirla sin mas no valia: la ruta pinta datos de una propiedad y v1 no tiene
 * auth, asi que seria un mirador publico de cualquier propiedad por id. El
 * acceso va con token efimero firmado y ligado a (pieza, propiedad).
 */
import { describe, expect, it } from "vitest";
import {
  isPreviewAccessAllowed,
  mintPreviewToken,
  verifyPreviewToken,
} from "@/lib/render-access/preview-token";

const SCOPE = {
  pieceId: "post-instagram",
  propertyId: "prop-1",
  revision: 7,
} as const;
const OTHER_PROPERTY = { ...SCOPE, propertyId: "prop-2" } as const;
const OTHER_PIECE = { ...SCOPE, pieceId: "ficha-pdf" } as const;
const OTHER_REVISION = { ...SCOPE, revision: 8 } as const;

describe("token de render — el renderer entra, un tercero no", () => {
  it("acepta el token recien acuñado para su pieza y su propiedad", () => {
    expect(verifyPreviewToken(mintPreviewToken(SCOPE), SCOPE)).toBe(true);
  });

  it("rechaza la ausencia de token", () => {
    expect(verifyPreviewToken(undefined, SCOPE)).toBe(false);
    expect(verifyPreviewToken("", SCOPE)).toBe(false);
  });

  it("no sirve para mirar OTRA propiedad", () => {
    const token = mintPreviewToken(SCOPE);
    expect(verifyPreviewToken(token, OTHER_PROPERTY)).toBe(false);
  });

  it("no sirve para OTRA pieza de la misma propiedad", () => {
    const token = mintPreviewToken(SCOPE);
    expect(verifyPreviewToken(token, OTHER_PIECE)).toBe(false);
  });

  it("no sirve para otra REVISION de la misma propiedad (F-06)", () => {
    // Sin esto, cambiar `rev` en la URL desactivaria el control de version y el
    // juego de piezas podria volver a salir con datos de dos momentos.
    const token = mintPreviewToken(SCOPE);
    expect(verifyPreviewToken(token, OTHER_REVISION)).toBe(false);
  });

  it("caduca a los 2 min, por encima del techo de 90 s de una captura", () => {
    const now = 1_785_000_000_000;
    const token = mintPreviewToken(SCOPE, now);

    expect(verifyPreviewToken(token, SCOPE, now + 90_000)).toBe(true);
    expect(verifyPreviewToken(token, SCOPE, now + 119_000)).toBe(true);
    expect(verifyPreviewToken(token, SCOPE, now + 121_000)).toBe(false);
  });

  it("rechaza una caducidad manipulada (la firma la cubre)", () => {
    const now = 1_785_000_000_000;
    const token = mintPreviewToken(SCOPE, now);
    const firma = token.slice(token.indexOf(".") + 1);

    // Alargar la vida del token a mano no cuela: la caducidad esta firmada.
    const estirado = `${now + 999 * 60_000}.${firma}`;
    expect(verifyPreviewToken(estirado, SCOPE, now + 60_000)).toBe(false);
  });

  it("rechaza basura, firmas cortas y formatos raros", () => {
    // OJO: la caducidad tiene que ser FUTURA en todos estos casos. La version
    // anterior de este test usaba 999999999999 (año 2001), asi que el token se
    // rechazaba por caducado y nunca se ejercitaba el parser de la firma — lo
    // señalo la review cross-model, y es un test que tranquilizaba sin probar.
    const vivo = Date.now() + 60_000;
    for (const malo of [
      "sin-punto",
      ".",
      ".abcdef",
      `${vivo}.`,
      `${vivo}.zz`,
      `${vivo}.00`,
      `${vivo}.${"a".repeat(63)}`,
      `${vivo}.${"a".repeat(65)}`,
      `${vivo}.${"A".repeat(64)}`,
      `${vivo}.${"a".repeat(64)}`,
    ]) {
      expect(verifyPreviewToken(malo, SCOPE), `deberia rechazar ${malo}`).toBe(false);
    }
  });

  it("exige forma canonica: sin sufijos, exponentes, ceros delante ni espacios", () => {
    const now = 1_785_000_000_000;
    const token = mintPreviewToken(SCOPE, now);
    const [caducidad, firma] = token.split(".") as [string, string];

    const variantes = [
      `${token}.sufijo`,              // Buffer.from(hex) ignoraba la cola
      `${token}zz`,
      ` ${token}`,
      `${token} `,
      `0${caducidad}.${firma}`,       // cero a la izquierda
      `+${caducidad}.${firma}`,
      `${Number(caducidad).toExponential()}.${firma}`,
      `${caducidad}.${firma.toUpperCase()}`,
    ];
    for (const variante of variantes) {
      expect(
        verifyPreviewToken(variante, SCOPE, now + 1_000),
        `deberia rechazar ${variante}`,
      ).toBe(false);
    }
  });

  it("rechaza una caducidad mas larga de la que este servidor acuña", () => {
    // No es forjable (va firmada), pero acota el daño si el secreto se filtra.
    const now = 1_785_000_000_000;
    expect(verifyPreviewToken(mintPreviewToken(SCOPE, now), SCOPE, now)).toBe(true);
    expect(
      verifyPreviewToken(mintPreviewToken(SCOPE, now + 60 * 60_000), SCOPE, now),
    ).toBe(false);
  });

  it("dos tokens de la misma pieza no son el mismo string (llevan caducidad)", () => {
    const a = mintPreviewToken(SCOPE, 1_785_000_000_000);
    const b = mintPreviewToken(SCOPE, 1_785_000_060_000);
    expect(a).not.toBe(b);
    expect(verifyPreviewToken(a, SCOPE, 1_785_000_000_001)).toBe(true);
    expect(verifyPreviewToken(b, SCOPE, 1_785_000_060_001)).toBe(true);
  });
});

/**
 * La politica de acceso, caso a caso.
 *
 * Nace del hallazgo mas afilado de la review cross-model: los tests de arriba
 * solo prueban criptografia, asi que borrar el control de la page —o mover la
 * consulta a Prisma por delante— dejaba la suite en verde con la ruta abierta.
 * Sacando la decision a una funcion pura, al menos la politica esta cubierta.
 *
 * Lo que sigue SIN cubrir automaticamente: que la page llame a esta funcion
 * antes de tocar datos. Se verifico a mano contra `next start` (404 sin token,
 * 404 con token invalido, 404 en demo, 200 con token valido) y esta anotado
 * como hueco en AUDIT.md.
 */
describe("isPreviewAccessAllowed — politica de la ruta de render", () => {
  const AHORA = 1_785_000_000_000;
  const tokenValido = mintPreviewToken(SCOPE, AHORA);

  const enProduccion = (extra: Record<string, unknown> = {}) => ({
    isProduction: true,
    isDemo: false,
    pieceId: SCOPE.pieceId,
    propertyId: SCOPE.propertyId,
    revision: SCOPE.revision,
    token: tokenValido,
    ...extra,
  });

  it("en produccion deja pasar solo con un token valido para ese alcance", () => {
    expect(isPreviewAccessAllowed(enProduccion(), AHORA + 1_000)).toBe(true);
  });

  it("en produccion cierra sin token, con token de otra propiedad y caducado", () => {
    expect(isPreviewAccessAllowed(enProduccion({ token: undefined }), AHORA)).toBe(false);
    expect(isPreviewAccessAllowed(enProduccion({ token: "" }), AHORA)).toBe(false);
    expect(
      isPreviewAccessAllowed(enProduccion({ propertyId: "otra-propiedad" }), AHORA),
    ).toBe(false);
    expect(isPreviewAccessAllowed(enProduccion({ pieceId: "ficha-pdf" }), AHORA)).toBe(false);
    expect(isPreviewAccessAllowed(enProduccion(), AHORA + 5 * 60_000)).toBe(false);
  });

  it("en produccion el modo demo esta cerrado, aunque venga con token", () => {
    expect(isPreviewAccessAllowed(enProduccion({ isDemo: true }), AHORA + 1_000)).toBe(false);
  });

  it("en produccion exige propertyId: sin el no hay alcance que firmar", () => {
    expect(
      isPreviewAccessAllowed(enProduccion({ propertyId: undefined }), AHORA + 1_000),
    ).toBe(false);
  });

  it("en produccion exige revision, y la comprueba (F-06)", () => {
    expect(
      isPreviewAccessAllowed(enProduccion({ revision: undefined }), AHORA + 1_000),
    ).toBe(false);
    // Manipular `rev` en la URL rompe la firma: no hay forma de pedir la pieza
    // "como si" fuera de otra version.
    expect(isPreviewAccessAllowed(enProduccion({ revision: 8 }), AHORA + 1_000)).toBe(
      false,
    );
  });

  it("en desarrollo queda abierta a proposito (superficie de diseño)", () => {
    expect(
      isPreviewAccessAllowed({
        isProduction: false,
        isDemo: true,
        pieceId: SCOPE.pieceId,
      }),
    ).toBe(true);
    expect(
      isPreviewAccessAllowed({
        isProduction: false,
        isDemo: false,
        pieceId: SCOPE.pieceId,
        propertyId: SCOPE.propertyId,
      }),
    ).toBe(true);
  });
});

describe("secreto configurado", () => {
  it("rechaza un RENDER_PREVIEW_SECRET debil en vez de fingir que protege", () => {
    const previo = process.env.RENDER_PREVIEW_SECRET;
    process.env.RENDER_PREVIEW_SECRET = "x";
    try {
      expect(() => mintPreviewToken(SCOPE)).toThrow(/RENDER_PREVIEW_SECRET_TOO_WEAK/);
    } finally {
      if (previo === undefined) delete process.env.RENDER_PREVIEW_SECRET;
      else process.env.RENDER_PREVIEW_SECRET = previo;
    }
  });

  it("acepta un secreto de longitud suficiente y firma de forma estable", () => {
    const previo = process.env.RENDER_PREVIEW_SECRET;
    process.env.RENDER_PREVIEW_SECRET = "a".repeat(32);
    try {
      const token = mintPreviewToken(SCOPE, 1_785_000_000_000);
      expect(verifyPreviewToken(token, SCOPE, 1_785_000_001_000)).toBe(true);
    } finally {
      if (previo === undefined) delete process.env.RENDER_PREVIEW_SECRET;
      else process.env.RENDER_PREVIEW_SECRET = previo;
    }
  });
});
