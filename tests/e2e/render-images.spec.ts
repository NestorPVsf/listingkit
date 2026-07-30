/**
 * TDD — Fase 4.1 del PLAN.md. Verifica las piezas de IMAGEN del RenderJob:
 * post 1080×1350, story 1080×1920 y carrusel = 5 PNGs 1080×1350 exactos.
 *
 * CONTRATO DE INVOCACIÓN: ver cabecera de tests/e2e/helpers.ts. Este spec
 * fallará (piezas no existen aún) hasta que el engine + rutas API estén
 * implementados — es el estado ROJO esperado de TDD para la Fase 4.
 */
import { expect, test } from "@playwright/test";
import sharp from "sharp";
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

test.describe("Render de imágenes — post, story y carrusel", () => {
  test("genera post 1080x1350, story 1080x1920 y carrusel de 5 PNGs 1080x1350", async ({
    request,
  }) => {
    const photoAssetIds = await uploadDemoPhotos(request);
    const payload = demoPropertyPayload({
      photoAssetIds,
      primaryPhotoAssetId: photoAssetIds[0]!,
    });

    const propertyId = await createDemoProperty(request, payload);
    const jobId = await triggerGenerate(request, propertyId);
    const job = await pollRenderJob(request, jobId);

    expect(job.status === "done" || job.status === "partial").toBe(true);

    // --- Post de Instagram: 1 PNG, 1080x1350 exacto ---
    const postTask = findTask(job, "instagram-post");
    expect(postTask.status).toBe("done");
    expect(postTask.artifacts).toHaveLength(1);
    const postArtifact = postTask.artifacts[0]!;
    expect(postArtifact.bytes).toBeGreaterThan(0);

    const postBuffer = await downloadArtifact(request, postArtifact.id);
    expect(postBuffer.byteLength).toBeGreaterThan(0);
    const postMeta = await sharp(postBuffer).metadata();
    expect(postMeta.width).toBe(1080);
    expect(postMeta.height).toBe(1350);
    expect(postMeta.format).toBe("png");

    // --- Story de Instagram: 1 PNG, 1080x1920 exacto ---
    const storyTask = findTask(job, "instagram-story");
    expect(storyTask.status).toBe("done");
    expect(storyTask.artifacts).toHaveLength(1);
    const storyArtifact = storyTask.artifacts[0]!;
    expect(storyArtifact.bytes).toBeGreaterThan(0);

    const storyBuffer = await downloadArtifact(request, storyArtifact.id);
    expect(storyBuffer.byteLength).toBeGreaterThan(0);
    const storyMeta = await sharp(storyBuffer).metadata();
    expect(storyMeta.width).toBe(1080);
    expect(storyMeta.height).toBe(1920);
    expect(storyMeta.format).toBe("png");

    // --- Carrusel: exactamente 5 PNGs, todos 1080x1350 exacto ---
    const carouselTask = findTask(job, "instagram-carousel");
    expect(carouselTask.status).toBe("done");
    expect(carouselTask.artifacts).toHaveLength(5);

    for (const artifact of carouselTask.artifacts) {
      expect(artifact.bytes).toBeGreaterThan(0);
      const buffer = await downloadArtifact(request, artifact.id);
      expect(buffer.byteLength).toBeGreaterThan(0);
      const meta = await sharp(buffer).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1350);
      expect(meta.format).toBe("png");
    }
  });
});
