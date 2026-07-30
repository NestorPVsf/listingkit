/**
 * Root layout PROPIO de /preview (patron Next.js "multiple root layouts"):
 * NO hereda app/(main)/layout.tsx, por tanto ni sus fuentes (Fraunces/Inter
 * de la UI de la app) ni globals.css/Tailwind. Cada pieza trae su propia
 * fuente de marca via <link> (ver templates/brand-adapter.ts googleFontsHref)
 * y sus estilos inline. Reset a 0 para que el body mida EXACTAMENTE las
 * dimensiones de la pieza (paso 4.2 del PLAN.md: "sin scroll, sin margenes
 * de user-agent").
 *
 * Esta ruta SI existe en produccion desde el cierre de F-14: Playwright captura
 * de aqui, asi que devolver 404 en prod dejaba al sistema sin generacion visual
 * fuera de `next dev`. El control de acceso vive en la page, que es quien ve
 * los searchParams y puede validar el token de render.
 */
export default function PreviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        {/*
          El token de render viaja en la URL. Sin esto, la politica por defecto
          (`strict-origin-when-cross-origin`) manda la URL COMPLETA —token
          incluido— en la cabecera Referer de cada foto que carga la pieza
          (`/api/assets/...`), y de ahi al access log. Detectado en la review
          cross-model del control de acceso.
        */}
        <meta name="referrer" content="no-referrer" />
      </head>
      <body style={{ margin: 0, padding: 0, border: 0, minWidth: 0, minHeight: 0 }}>
        {children}
      </body>
    </html>
  );
}
