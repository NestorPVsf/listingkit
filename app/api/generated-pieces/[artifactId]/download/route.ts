import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { outputRoot } from "@/lib/infrastructure/storage/output-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DownloadRouteContext {
  readonly params: Promise<{ readonly artifactId: string }>;
}

const MEDIA_TYPE_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".html": "text/html",
  ".txt": "text/plain",
};

function mediaType(filePath: string): string {
  return (
    MEDIA_TYPE_BY_EXT[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream"
  );
}

/**
 * F-04: el email es un `.html` y la UI lo previsualiza inline (`?inline=1`).
 * Servido tal cual, era un documento activo same-origin: un `listingUrl` con
 * esquema `javascript:` en el CTA, o cualquier contenido activo que se colara
 * en la plantilla, se ejecutaba con el origen de la app —que no tiene auth—.
 * `sandbox` sin `allow-scripts` ni `allow-same-origin` lo deja en un origen
 * opaco: se ve, no actua.
 *
 * Solo para HTML: el visor de PDF de Chrome deja de funcionar dentro de un
 * documento sandboxed, y las cabeceras CSP se ignoran en subrecursos
 * (<img>, <video>), asi que ahi no aportan nada.
 */
function activeContentHeaders(filePath: string): Record<string, string> {
  if (path.extname(filePath).toLowerCase() !== ".html") {
    return {};
  }
  return {
    "Content-Security-Policy":
      "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
  };
}

export async function GET(
  request: Request,
  context: DownloadRouteContext,
): Promise<Response> {
  const { artifactId } = await context.params;
  const artifact = await prisma.generatedPiece.findUnique({
    where: { id: artifactId },
  });
  if (!artifact) {
    return Response.json({ error: "ARTIFACT_NOT_FOUND" }, { status: 404 });
  }

  const absolutePath = path.resolve(process.cwd(), artifact.path);
  // La raiz sale del modulo comun, no escrita a mano: era la QUINTA copia de
  // esta comprobacion y la unica que no se actualizo al hacerla configurable,
  // asi que en los tests toda descarga daba 404.
  const relative = path.relative(outputRoot(), absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return Response.json({ error: "ARTIFACT_PATH_INVALID" }, { status: 404 });
  }

  // `?inline=1` sirve el contenido para visualizarlo embebido (img/iframe/video
  // del preview) SIN Content-Disposition: attachment — asi los previews no
  // disparan descargas fantasma que interferirian con los botones de descarga.
  const inline = new URL(request.url).searchParams.get("inline") === "1";

  try {
    const bytes = await readFile(absolutePath);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mediaType(absolutePath),
        "Content-Length": String(bytes.byteLength),
        ...(inline
          ? {}
          : {
              "Content-Disposition": `attachment; filename="${path.basename(absolutePath)}"`,
            }),
        ...activeContentHeaders(absolutePath),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "ARTIFACT_NOT_FOUND" }, { status: 404 });
  }
}
