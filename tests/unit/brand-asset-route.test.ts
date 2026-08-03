/**
 * Route handler `app/uploads/brand/[fileName]/route.ts` (fix P0 — logos de
 * marca 404): verifica que sirve un logo real con 200/Content-Type correcto
 * y que rechaza cualquier intento de path traversal con 404 (nunca 500,
 * nunca lee fuera de `uploads/brand/`).
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Raiz propia de ESTE fichero. Vitest ejecuta los ficheros de test en
// paralelo, asi que compartir `uploads-test-unit` entre todos revive el
// falso fallo que este aislamiento venia a matar: un test veia aparecer
// ficheros de otro y acusaba al almacen de dejar basura.
process.env.UPLOADS_DIR = "uploads-test-unit/brand-asset-route";

import { brandDir } from "@/lib/infrastructure/storage/upload-paths";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/uploads/brand/[fileName]/route";

const UPLOAD_DIR = brandDir();
const FIXTURE_NAME = `test-${randomUUID()}.png`;
// PNG 1x1 válido (rojo) — mismo fixture que tests/fixtures/demo-property.ts.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function makeContext(fileName: string) {
  return { params: Promise.resolve({ fileName }) };
}

describe("GET /uploads/brand/[fileName]", () => {
  beforeAll(async () => {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, FIXTURE_NAME), PNG_BYTES);
  });

  afterAll(async () => {
    await rm(path.join(UPLOAD_DIR, FIXTURE_NAME), { force: true });
  });

  it("sirve un logo real existente con 200 y Content-Type image/png", async () => {
    const response = await GET(new Request("http://localhost/uploads/brand/x"), makeContext(FIXTURE_NAME));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.byteLength).toBe(PNG_BYTES.byteLength);
  });

  it("devuelve 404 (nunca 500) para un archivo inexistente", async () => {
    const response = await GET(new Request("http://localhost/uploads/brand/x"), makeContext("no-existe.png"));
    expect(response.status).toBe(404);
  });

  it.each([
    "../../../etc/passwd",
    "..%2f..%2fetc%2fpasswd",
    "%2e%2e%2fsecret.png",
    "..\\..\\windows.png",
  ])("rechaza path traversal %s con 404, nunca lee fuera de uploads/brand", async (malicious) => {
    const response = await GET(new Request("http://localhost/uploads/brand/x"), makeContext(malicious));
    expect(response.status).toBe(404);
  });

  it.each(["logo.exe", "logo.gif", "logo.html"])(
    "rechaza extensiones no soportadas (fuera de png/webp/jpg) con 404: %s",
    async (fileName) => {
      const response = await GET(new Request("http://localhost/uploads/brand/x"), makeContext(fileName));
      expect(response.status).toBe(404);
    },
  );

  // F-03: aunque quede un .svg de una instalacion antigua en uploads/brand/,
  // la ruta ya no lo sirve — nunca llega a ejecutarse como documento activo.
  it("nunca sirve un .svg, ni existiendo en disco", async () => {
    const svgName = "legacy-logo.svg";
    await writeFile(
      path.join(UPLOAD_DIR, svgName),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      "utf8",
    );
    try {
      const response = await GET(new Request("http://localhost/uploads/brand/x"), makeContext(svgName));
      expect(response.status).toBe(404);
    } finally {
      await rm(path.join(UPLOAD_DIR, svgName), { force: true });
    }
  });

  it("sirve el PNG con cabeceras que impiden tratarlo como documento activo", async () => {
    const response = await GET(new Request("http://localhost/uploads/brand/x"), makeContext(FIXTURE_NAME));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
  });
});
