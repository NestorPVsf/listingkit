import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  configuredPasswordHash,
  mintSession,
  verifyPassword,
} from "@/lib/auth/operator-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Entrar. Body: `{ "password": "..." }`.
 *
 * Respuesta deliberadamente pobre: `{ ok: false }` y 401, sin distinguir entre
 * "no hay candado configurado" y "la contraseña no es". Un mensaje util aqui
 * solo ayuda a quien no deberia estar probando.
 */
export async function POST(request: Request): Promise<Response> {
  const stored = configuredPasswordHash();

  let password = "";
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null) {
      const candidate = (body as Record<string, unknown>).password;
      if (typeof candidate === "string") password = candidate;
    }
  } catch {
    // cuerpo ilegible: se trata como intento fallido, sin ruido
  }

  if (!stored || password.length === 0 || !verifyPassword(password, stored)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, mintSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return Response.json({ ok: true }, { status: 200 });
}

/** Salir. */
export async function DELETE(): Promise<Response> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true }, { status: 200 });
}
