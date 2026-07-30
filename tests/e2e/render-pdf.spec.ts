/**
 * TDD — Fase 4.1 del PLAN.md. Verifica la ficha técnica PDF: se genera,
 * pesa >0 bytes y su texto extraído NO contiene la dirección privada
 * (regla dura #1 de spec.md).
 *
 * Extracción de texto del PDF con **`unpdf`** (basado en pdf.js, sin
 * dependencias nativas, funciona en Node puro) — elegido sobre `pdf-parse`
 * por ser más simple de invocar (API `extractText` async) y estar mantenido
 * activamente. Añadido como devDependency solo para tests.
 *
 * CONTRATO DE INVOCACIÓN: ver cabecera de tests/e2e/helpers.ts.
 */
import { expect, test } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";
import {
  DEMO_PRIVATE_ADDRESS,
  PRIVATE_ADDRESS_SENTINEL,
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

test.describe("Render de ficha técnica PDF", () => {
  test("genera un PDF >0 bytes sin la dirección privada en su texto", async ({
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

    const pdfTask = findTask(job, "property-sheet");
    expect(pdfTask.status).toBe("done");
    expect(pdfTask.artifacts).toHaveLength(1);

    const artifact = pdfTask.artifacts[0]!;
    expect(artifact.mediaType).toBe("application/pdf");
    expect(artifact.bytes).toBeGreaterThan(0);

    const pdfBuffer = await downloadArtifact(request, artifact.id);
    expect(pdfBuffer.byteLength).toBeGreaterThan(0);
    // magic bytes de PDF ("%PDF")
    expect(pdfBuffer.subarray(0, 4).toString("latin1")).toBe("%PDF");

    const pdfDocument = await getDocumentProxy(new Uint8Array(pdfBuffer));
    const { text } = await extractText(pdfDocument, { mergePages: true });

    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain(DEMO_PRIVATE_ADDRESS);
    expect(text).not.toContain(PRIVATE_ADDRESS_SENTINEL);
    expect(text).not.toContain("14, 3º A");
  });
});
