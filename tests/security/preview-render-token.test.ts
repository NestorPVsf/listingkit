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
  mintPreviewToken,
  verifyPreviewToken,
} from "@/lib/render-access/preview-token";

const SCOPE = { pieceId: "post-instagram", propertyId: "prop-1" } as const;
const OTHER_PROPERTY = { pieceId: "post-instagram", propertyId: "prop-2" } as const;
const OTHER_PIECE = { pieceId: "ficha-pdf", propertyId: "prop-1" } as const;

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

  it("caduca (5 min), muy por encima del techo de 90 s de una captura", () => {
    const now = 1_785_000_000_000;
    const token = mintPreviewToken(SCOPE, now);

    expect(verifyPreviewToken(token, SCOPE, now + 90_000)).toBe(true);
    expect(verifyPreviewToken(token, SCOPE, now + 4 * 60_000)).toBe(true);
    expect(verifyPreviewToken(token, SCOPE, now + 6 * 60_000)).toBe(false);
  });

  it("rechaza una caducidad manipulada (la firma la cubre)", () => {
    const now = 1_785_000_000_000;
    const token = mintPreviewToken(SCOPE, now);
    const firma = token.slice(token.indexOf(".") + 1);

    // Alargar la vida del token a mano no cuela: la caducidad esta firmada.
    const estirado = `${now + 999 * 60_000}.${firma}`;
    expect(verifyPreviewToken(estirado, SCOPE, now + 10 * 60_000)).toBe(false);
  });

  it("rechaza basura, firmas cortas y formatos raros", () => {
    for (const malo of [
      "sin-punto",
      ".",
      ".abcdef",
      "999999999999.",
      "999999999999.zz",
      "999999999999.00",
      `${Date.now() + 60_000}.${"a".repeat(64)}`,
    ]) {
      expect(verifyPreviewToken(malo, SCOPE), `deberia rechazar ${malo}`).toBe(false);
    }
  });

  it("dos tokens de la misma pieza no son el mismo string (llevan caducidad)", () => {
    const a = mintPreviewToken(SCOPE, 1_785_000_000_000);
    const b = mintPreviewToken(SCOPE, 1_785_000_060_000);
    expect(a).not.toBe(b);
    expect(verifyPreviewToken(a, SCOPE, 1_785_000_000_001)).toBe(true);
    expect(verifyPreviewToken(b, SCOPE, 1_785_000_060_001)).toBe(true);
  });
});
