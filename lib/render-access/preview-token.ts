/**
 * Acceso a la ruta de render (`/preview/[pieceId]`) — cierre de F-14.
 *
 * El problema: Playwright captura las piezas navegando a `/preview/...`, pero
 * esa ruta devolvia 404 en `NODE_ENV=production`. Es decir, **toda generacion
 * visual fallaba en produccion** y el unico runtime operativo era `next dev`,
 * que no debe exponerse a una red. Era el bloqueante nº1 del audit.
 *
 * No basta con quitar el 404: la ruta pinta datos de una propiedad y la app de
 * v1 no tiene auth, asi que abrirla sin mas la convierte en un mirador publico
 * de cualquier propiedad por id. La solucion es un token efimero:
 *
 * - **Firmado** (HMAC-SHA256): no se puede fabricar sin el secreto.
 * - **Ligado a la pieza y a la propiedad**: un token valido para una captura no
 *   sirve para mirar otra propiedad.
 * - **Caduco** (5 min): muy por encima de los 90 s de techo de una captura, y
 *   muy por debajo de lo que dura una URL filtrada en un log.
 *
 * El secreto vive en `globalThis` salvo que se declare `RENDER_PREVIEW_SECRET`.
 *
 * **Y en `globalThis`, no en una variable de modulo, por una razon concreta**:
 * en un build de produccion Next empaqueta la page y el route handler en
 * bundles distintos, asi que cada uno recibe su PROPIA instancia del modulo.
 * Con un `let secreto` normal, el renderer firmaba con un secreto y la ruta
 * verificaba con otro — el token nunca casaba y las cuatro piezas visuales
 * fallaban con `PLAYWRIGHT_CAPTURE_FAILED` (comprobado contra `next start`
 * antes de dar el fix por bueno). `globalThis` si es unico por proceso; es el
 * mismo patron que ya usa `lib/bootstrap/create-app.ts` para la cola.
 *
 * Con varias instancias del servidor hay que fijar la variable de entorno: cada
 * proceso tiene su propio `globalThis` y las capturas cruzadas fallarian.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Holgado frente a los 90 s de techo por captura, corto frente a un log filtrado. */
const TOKEN_TTL_MS = 5 * 60_000;

export interface PreviewTokenScope {
  /** Identificador de la pieza en la URL (`post-instagram`, `ficha-pdf`...). */
  readonly pieceId: string;
  /** Entidad que se esta renderizando. */
  readonly propertyId: string;
}

type RuntimeGlobal = typeof globalThis & {
  __inmoPreviewSecret?: Buffer;
};

const runtimeGlobal = globalThis as RuntimeGlobal;

function secret(): Buffer {
  const configured = process.env.RENDER_PREVIEW_SECRET;
  if (configured && configured.length > 0) {
    return Buffer.from(configured, "utf8");
  }
  runtimeGlobal.__inmoPreviewSecret ??= randomBytes(32);
  return runtimeGlobal.__inmoPreviewSecret;
}

function sign(scope: Readonly<PreviewTokenScope>, expiresAt: number): string {
  return createHmac("sha256", secret())
    // Separador NUL escrito como escape, NO como byte crudo: un NUL literal
    // en el fuente vuelve el fichero "binario" para git y rompe los diffs.
    // Se usa NUL y no un espacio porque no puede aparecer dentro de un id,
    // asi que dos campos distintos nunca producen la misma cadena firmada.
    .update(`${scope.pieceId}\u0000${scope.propertyId}\u0000${expiresAt}`)
    .digest("hex");
}

/** Token con forma `<caducidad>.<firma>`. */
export function mintPreviewToken(
  scope: Readonly<PreviewTokenScope>,
  now: number = Date.now(),
): string {
  const expiresAt = now + TOKEN_TTL_MS;
  return `${expiresAt}.${sign(scope, expiresAt)}`;
}

export function verifyPreviewToken(
  token: string | undefined,
  scope: Readonly<PreviewTokenScope>,
  now: number = Date.now(),
): boolean {
  if (!token) return false;

  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;

  const provided = Buffer.from(token.slice(separator + 1), "hex");
  const expected = Buffer.from(sign(scope, expiresAt), "hex");
  // Longitudes distintas hacen explotar timingSafeEqual, asi que se comprueba
  // antes; no filtra nada util porque la longitud de la firma es fija.
  if (provided.length !== expected.length || provided.length === 0) return false;

  return timingSafeEqual(provided, expected);
}
