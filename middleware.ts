import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  configuredPasswordHash,
  isAuthEnforced,
  verifySession,
} from "@/lib/auth/operator-session";

/**
 * El candado, aplicado en un unico sitio.
 *
 * Rutas EXENTAS y por que cada una — la lista corta es la que importa, porque
 * cada excepcion es una puerta:
 *
 * - `/login` y `/api/auth/*`: obvio, si no no hay forma de entrar.
 * - `/preview/*`: tiene su PROPIO control (token efimero firmado, ligado a
 *   pieza y propiedad). Playwright captura de ahi y no lleva cookie de sesion,
 *   asi que exigirsela romperia toda la generacion visual — que es justo el bug
 *   F-14 que ya nos costo una tarde.
 * - `/api/assets/*` y `/uploads/brand/*`: son los subrecursos que carga la
 *   pieza mientras se renderiza (fotos y logo). Las peticiones de subrecurso
 *   tampoco llevan la sesion. Se protegen por identificador opaco (UUID), que
 *   no es equivalente a autenticacion y esta anotado como tal en AUDIT.md.
 *
 * Sin `APP_PASSWORD_HASH` en produccion la aplicacion NO se abre: responde 503.
 * Fallar cerrado y ruidoso, porque una instalacion sin candado en una red es
 * exactamente el problema que este fichero existe para evitar.
 */
const EXENTAS = [
  "/login",
  "/api/auth",
  "/preview",
  "/api/assets",
  "/uploads/brand",
];

function estaExenta(pathname: string): boolean {
  return EXENTAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );
}

export function middleware(request: NextRequest): NextResponse {
  if (!isAuthEnforced()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (estaExenta(pathname)) return NextResponse.next();

  if (!configuredPasswordHash()) {
    return new NextResponse(
      "Esta instalacion no tiene contraseña de operador configurada.\n" +
        "Genera una con `npm run set-password` y ponla en APP_PASSWORD_HASH antes de servir la aplicacion.\n",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // Las APIs contestan 401 en vez de redirigir: un fetch que recibe el HTML del
  // login y lo intenta parsear como JSON da un error incomprensible.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  runtime: "nodejs",
  // Fuera los internos de Next y los ficheros estaticos: no son superficie de
  // datos y pasarlos por el middleware solo añade latencia a cada chunk.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
