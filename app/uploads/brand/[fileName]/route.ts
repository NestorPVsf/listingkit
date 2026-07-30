import { readFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeFileName } from "@/lib/infrastructure/files/upload-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BrandAssetRouteContext {
  readonly params: Promise<{ readonly fileName: string }>;
}

// Sin `.svg` (F-03): un SVG servido same-origin es un documento activo con
// acceso a localStorage —donde vive el borrador de propiedad con
// privateAddress— y a las APIs. La ingesta solo acepta raster recodificado
// (ver storeBrandLogo en app/(main)/(setup)/onboarding/actions.ts).
const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function GET(
  _request: Request,
  context: BrandAssetRouteContext,
): Promise<Response> {
  const { fileName } = await context.params;

  let validatedFileName: string;
  try {
    validatedFileName = sanitizeFileName(fileName);
  } catch {
    return Response.json({ error: "BRAND_ASSET_NOT_FOUND" }, { status: 404 });
  }

  const mediaType = MEDIA_TYPES[path.extname(validatedFileName).toLowerCase()];
  if (!mediaType) {
    return Response.json({ error: "BRAND_ASSET_NOT_FOUND" }, { status: 404 });
  }

  const uploadsDir = path.resolve(process.cwd(), "uploads", "brand");
  const absolutePath = path.resolve(uploadsDir, validatedFileName);
  const relative = path.relative(uploadsDir, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return Response.json({ error: "BRAND_ASSET_NOT_FOUND" }, { status: 404 });
  }

  try {
    const bytes = await readFile(absolutePath);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mediaType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=3600, must-revalidate",
        // Cinturon y tirantes sobre la allowlist de arriba: aunque algun dia
        // se cuele un fichero con contenido activo, el navegador no lo
        // reinterpreta (nosniff) ni lo ejecuta (sandbox sin allow-scripts).
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return Response.json({ error: "BRAND_ASSET_NOT_FOUND" }, { status: 404 });
  }
}
