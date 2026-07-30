/**
 * Candado de operador — cierra el bloqueante nº1 que quedaba en AUDIT.md:
 * "cualquiera con acceso a la red del proceso opera la app entera".
 *
 * ALCANCE, dicho claro: esto es UN candado, no gestion de usuarios. v1 es
 * monoinquilino por diseño (ver ADR): una instalacion = una agencia = una
 * contraseña de operador. Multi-inquilino con usuarios, roles e invitaciones es
 * otro producto, no el cierre de este bloqueante.
 *
 * Dos decisiones que conviene entender antes de tocar esto:
 *
 * 1. **La contraseña nunca se guarda, ni siquiera cifrada.** Se guarda un hash
 *    scrypt con sal (`scrypt$sal$hash`) en `APP_PASSWORD_HASH`. Se genera con
 *    `npm run set-password`, que no escribe en ningun sitio: imprime la linea
 *    para pegar en `.env`.
 * 2. **La clave que firma la sesion se deriva del propio hash.** Asi no hace
 *    falta un segundo secreto que alguien olvidaria configurar, y cambiar la
 *    contraseña invalida automaticamente todas las sesiones vivas — que es lo
 *    que uno espera al cambiarla porque sospecha algo.
 */
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_COOKIE = "inmo_operator";

/** Una jornada de trabajo: el operador no tiene que reautenticarse a media mañana. */
const SESSION_TTL_MS = 12 * 60 * 60_000;

const SCRYPT_KEY_LENGTH = 64;
const STORED_FORMAT = /^scrypt\$([0-9a-f]{32})\$([0-9a-f]{128})$/;
const CANONICAL_SESSION = /^(0|[1-9]\d*)\.([0-9a-f]{64})$/;

/** Hash almacenable de una contraseña. Formato: `scrypt$<sal>$<hash>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parsed = STORED_FORMAT.exec(stored ?? "");
  if (!parsed) return false;

  const salt = Buffer.from(parsed[1] as string, "hex");
  const expected = Buffer.from(parsed[2] as string, "hex");
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return timingSafeEqual(derived, expected);
}

/** El hash configurado, o `null` si la instalacion no tiene candado puesto. */
export function configuredPasswordHash(): string | null {
  const configured = process.env.APP_PASSWORD_HASH;
  return configured && STORED_FORMAT.test(configured) ? configured : null;
}

/**
 * Si el candado aplica a esta peticion.
 *
 * En desarrollo se deja abierto a proposito, igual que la ruta de render: es la
 * superficie local con la que se trabaja, y meter un login en medio solo
 * conseguiria que alguien lo desactivara "un momento" y se le olvidara.
 */
export function isAuthEnforced(): boolean {
  return process.env.NODE_ENV === "production";
}

function sessionKey(): Buffer {
  const hash = configuredPasswordHash();
  if (!hash) throw new Error("APP_PASSWORD_HASH_MISSING");
  // Derivada del hash: cambiar la contraseña invalida las sesiones vivas.
  return createHmac("sha256", "inmo-operator-session").update(hash).digest();
}

function sign(expiresAt: number): string {
  return createHmac("sha256", sessionKey())
    .update(String(expiresAt))
    .digest("hex");
}

export function mintSession(now: number = Date.now()): string {
  const expiresAt = now + SESSION_TTL_MS;
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function verifySession(
  token: string | undefined,
  now: number = Date.now(),
): boolean {
  if (!token) return false;
  if (!configuredPasswordHash()) return false;

  // Forma canonica exigida, misma disciplina que el token de render: sin esto
  // se cuelan variantes equivalentes y sufijos tras la firma.
  const canonical = CANONICAL_SESSION.exec(token);
  if (!canonical) return false;

  const expiresAt = Number(canonical[1]);
  if (!Number.isSafeInteger(expiresAt)) return false;
  if (expiresAt <= now || expiresAt > now + SESSION_TTL_MS) return false;

  const provided = Buffer.from(canonical[2] as string, "hex");
  const expected = Buffer.from(sign(expiresAt), "hex");
  if (provided.length !== expected.length || provided.length === 0) return false;

  return timingSafeEqual(provided, expected);
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1_000;
