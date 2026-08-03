/**
 * Navegacion fija de la app.
 *
 * Antes no habia ninguna: los enlaces a Marca, Voz y Ayuda vivian en un `<nav>`
 * al FINAL del dashboard, o sea detras de la lista entera de propiedades — con
 * 340 filas, a 26.000 px de scroll del usuario. Existian y eran inalcanzables.
 */
"use client";

import Link from "next/link";
import { APP_NAME } from "@/lib/branding";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/dashboard", label: "Propiedades" },
  { href: "/import", label: "Importar" },
  { href: "/settings/brand", label: "Marca" },
  { href: "/settings/voice", label: "Voz y música" },
  { href: "/help", label: "Cómo funciona" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  // El login y el onboarding son pantallas de entrada: una barra de navegacion
  // ahi solo ofrece sitios donde todavia no se puede entrar.
  if (pathname === "/login" || pathname.startsWith("/onboarding")) return null;

  return (
    // Material translucido con el contenido pasando por debajo, no una franja
    // opaca que come 68 px de pantalla. Ver `.glass-bar` en globals.css.
    <header className="glass-bar sticky top-0 z-20">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-8 px-6 py-4">
        <Link
          href="/dashboard"
          className="font-display text-lg font-semibold tracking-tight text-foreground"
        >
          {APP_NAME}
        </Link>
        <nav aria-label="Principal" className="flex flex-1 items-center gap-1">
          {ENLACES.map((enlace) => {
            const activo =
              pathname === enlace.href || pathname.startsWith(`${enlace.href}/`);
            return (
              <Link
                key={enlace.href}
                href={enlace.href}
                aria-current={activo ? "page" : undefined}
                className={
                  activo
                    ? "rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
                    : "rounded-full px-4 py-2 text-sm font-medium text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
                }
              >
                {enlace.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/properties/new"
          // El testid viaja con la accion, no con el sitio: sigue siendo "el
          // enlace a nueva propiedad", ahora en la barra en vez del dashboard.
          data-testid="new-property-link"
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          Nueva propiedad
        </Link>
      </div>
    </header>
  );
}
