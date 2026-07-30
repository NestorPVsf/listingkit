import { notFound } from "next/navigation";

/**
 * Root layout PROPIO de /preview (patron Next.js "multiple root layouts"):
 * NO hereda app/(main)/layout.tsx, por tanto ni sus fuentes (Fraunces/Inter
 * de la UI de la app) ni globals.css/Tailwind. Cada pieza trae su propia
 * fuente de marca via <link> (ver templates/brand-adapter.ts googleFontsHref)
 * y sus estilos inline. Reset a 0 para que el body mida EXACTAMENTE las
 * dimensiones de la pieza (paso 4.2 del PLAN.md: "sin scroll, sin margenes
 * de user-agent").
 *
 * DEV-only: 404 real en produccion (build de Vercel/prod no debe exponer
 * esta ruta).
 */
export default function PreviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0, border: 0, minWidth: 0, minHeight: 0 }}>
        {children}
      </body>
    </html>
  );
}
