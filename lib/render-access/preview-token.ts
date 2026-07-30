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

/**
 * Una captura tiene 90 s de techo y el token se acuña justo antes de navegar,
 * asi que 2 min sobran. Estaba en 5: la review cross-model señalo que el token
 * viaja en la URL y es reutilizable mientras viva, asi que la ventana util de
 * una URL filtrada (access log, APM, Referer) es exactamente el TTL. No hay
 * nonce ni consumo unico — decision consciente, ver §"replay" en AUDIT.md.
 */
const TOKEN_TTL_MS = 2 * 60_000;

/**
 * Un secreto configurado tiene que ser un secreto. `RENDER_PREVIEW_SECRET=x`
 * se aceptaba, y con una sola URL filtrada el mensaje, la caducidad y el HMAC
 * son conocidos: probar un diccionario offline es trivial. 32 caracteres es el
 * minimo razonable para 128+ bits de entropia en base64/hex.
 */
const MIN_CONFIGURED_SECRET_LENGTH = 32;

/**
 * Forma canonica exigida: caducidad decimal sin ceros a la izquierda, un unico
 * punto y 64 hex en minusculas. Sin esto se colaban variantes equivalentes
 * (`1.7850003e12`, ceros delante, espacios) y sufijos despues de la firma,
 * porque `Buffer.from(x, "hex")` ignora lo que no es hexadecimal. No permitian
 * cambiar el alcance —va firmado— pero rompen la identidad del token y con
 * ella cualquier deduplicacion, redaccion o revocacion futura.
 */
const CANONICAL_TOKEN = /^(0|[1-9]\d*)\.([0-9a-f]{64})$/;

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
    if (configured.length < MIN_CONFIGURED_SECRET_LENGTH) {
      // Falla al arrancar y no en silencio: un secreto debil aqui es peor que
      // ninguno, porque da sensacion de proteccion.
      throw new Error(
        `RENDER_PREVIEW_SECRET_TOO_WEAK: minimo ${MIN_CONFIGURED_SECRET_LENGTH} caracteres`,
      );
    }
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

  const canonical = CANONICAL_TOKEN.exec(token);
  if (!canonical) return false;

  const expiresAt = Number(canonical[1]);
  if (!Number.isSafeInteger(expiresAt)) return false;
  // Caducado, o con una vida mas larga de la que este servidor acuña nunca.
  // Lo segundo no es forjable (la caducidad va firmada), pero acota el daño si
  // el secreto se filtra: un token con caducidad en 2099 deja de servir.
  if (expiresAt <= now || expiresAt > now + TOKEN_TTL_MS) return false;

  const provided = Buffer.from(canonical[2] as string, "hex");
  const expected = Buffer.from(sign(scope, expiresAt), "hex");
  // Longitudes distintas hacen explotar timingSafeEqual, asi que se comprueba
  // antes; no filtra nada util porque la longitud de la firma es fija.
  if (provided.length !== expected.length || provided.length === 0) return false;

  return timingSafeEqual(provided, expected);
}

export interface PreviewAccessRequest {
  readonly isProduction: boolean;
  readonly isDemo: boolean;
  readonly pieceId: string;
  readonly propertyId?: string;
  readonly token?: string;
}

/**
 * La decision de acceso a la ruta de render, como funcion pura.
 *
 * Vivia como un `if` dentro de la page, y la review cross-model puso el dedo en
 * la llaga: los tests solo ejercitaban las funciones criptograficas, asi que
 * borrar ese bloque —o mover la consulta a Prisma por delante— dejaba la suite
 * entera en verde con la ruta abierta. Aqui la politica se pueda probar caso a
 * caso; la page se limita a obedecer.
 *
 * En desarrollo se deja pasar a proposito: es la superficie con la que se
 * trabaja el diseño de las piezas (`scripts/qa-visual`, `?demo=1`). Por eso
 * `next dev` no debe exponerse a una red.
 */
export function isPreviewAccessAllowed(
  request: Readonly<PreviewAccessRequest>,
  now: number = Date.now(),
): boolean {
  if (!request.isProduction) return true;

  // El modo demo pinta datos de muestra y solo sirve para diseñar: en
  // produccion es superficie sin ninguna razon de ser.
  if (request.isDemo) return false;
  if (!request.propertyId) return false;

  return verifyPreviewToken(
    request.token,
    { pieceId: request.pieceId, propertyId: request.propertyId },
    now,
  );
}
