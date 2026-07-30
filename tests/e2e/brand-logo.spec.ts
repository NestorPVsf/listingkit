/**
 * Regresion P0 (Fase QA 2026-07-29): un logo de marca real subido en
 * `uploads/brand/` debe servirse via `GET /uploads/brand/[fileName]` (route
 * handler nuevo) y el render de piezas con marca real no debe fallar por
 * 404 en `image.decode()` (ver lib/infrastructure/render/playwright-renderer.ts).
 *
 * `POST /api/properties` no acepta `brandId` (niches/inmobiliaria/schema.ts +
 * app/api/properties/route.ts) — igual que scripts/qa-visual/run.mjs, este
 * test crea el Brand y asocia `brandId` a la Property directo via Prisma
 * (corre en Node, puede importar server-side modules).
 */
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import {
  demoPropertyPayload,
  uploadDemoPhotos,
} from "../fixtures/demo-property";
import {
  createDemoProperty,
  downloadArtifact,
  findTask,
  pollRenderJob,
  triggerGenerate,
} from "./helpers";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "brand");
const LOGO_FIXTURE = path.resolve(process.cwd(), "scripts/qa-visual/logo.png");

test.describe("Render con logo de marca real", () => {
  test("Brand con logo real: la URL del logo devuelve 200 y el post se renderiza sin fallar", async ({
    request,
    baseURL,
  }) => {
    const logoFileName = `e2e-brand-logo-${randomUUID()}.png`;
    mkdirSync(UPLOAD_DIR, { recursive: true });
    copyFileSync(LOGO_FIXTURE, path.join(UPLOAD_DIR, logoFileName));
    const logoPath = `/uploads/brand/${logoFileName}`;

    const brand = await prisma.brand.create({
      data: {
        nombre: "E2E Brand Logo Test",
        logo: logoPath,
        colores: {
          background: "#FAF7F0",
          surface: "#FFFFFF",
          text: "#1A1815",
          textMuted: "#6B6558",
          primary: "#C1440E",
          secondary: "#2F5D3A",
          onPrimary: "#FFFFFF",
          border: "#E5DFD0",
        },
        tipografia: {
          display: { familia: "Fraunces", pesos: [600, 700] },
          body: { familia: "Inter", pesos: [400, 500, 600] },
        },
        web: "https://e2e-brand-logo.example",
        telefono: "+34 600 000 000",
        email: "e2e@example.com",
        instagram: "@e2e_demo",
        ctaHabitual: "Solicita visita",
      },
    });

    // La URL del logo debe responder 200 (fix P0 — antes daba 404 al no
    // existir ninguna ruta que sirviera /uploads/brand/*).
    const logoResponse = await request.get(logoPath);
    expect(logoResponse.ok()).toBe(true);
    expect(logoResponse.headers()["content-type"]).toBe("image/png");

    const photoAssetIds = await uploadDemoPhotos(request);
    const payload = demoPropertyPayload({
      photoAssetIds,
      primaryPhotoAssetId: photoAssetIds[0]!,
    });
    const propertyId = await createDemoProperty(request, payload);

    await prisma.property.update({
      where: { id: propertyId },
      data: { brandId: brand.id },
    });

    const jobId = await triggerGenerate(request, propertyId);
    const job = await pollRenderJob(request, jobId);

    expect(job.status === "done" || job.status === "partial").toBe(true);

    const postTask = findTask(job, "instagram-post");
    expect(postTask.status).toBe("done");
    expect(postTask.artifacts).toHaveLength(1);
    const artifact = postTask.artifacts[0]!;
    expect(artifact.bytes).toBeGreaterThan(0);

    const buffer = await downloadArtifact(request, artifact.id);
    expect(buffer.byteLength).toBeGreaterThan(0);

    void baseURL;
  });
});
