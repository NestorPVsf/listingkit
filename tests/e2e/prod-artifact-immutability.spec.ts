/**
 * El beneficio visible de F-05: un enlace de descarga antiguo sigue entregando
 * lo que entregaba.
 *
 * Antes, todos los jobs escribian en `output/<entityId>/<fichero>`. Regenerar
 * una pieza sobrescribia ese fichero, asi que un artefacto generado ayer —cuyo
 * identificador el cliente puede tener en un correo— empezaba a servir
 * contenido distinto sin que nadie lo tocara. Ademas el `rm(final)` previo al
 * `rename` dejaba una ventana en la que la descarga daba 404.
 *
 * Ahora cada job escribe en su propio directorio. Este test lo comprueba por la
 * via que le importa al cliente: descargando.
 */
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  demoPropertyPayload,
  uploadDemoPhotos,
} from "../fixtures/demo-property";
import {
  createDemoProperty,
  findTask,
  pollRenderJob,
  triggerGenerate,
} from "./helpers";
import { PROD_OPERATOR_PASSWORD } from "./prod-server";

const PIEZA = "instagram-post";

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test.describe("Artefactos inmutables en produccion", () => {
  test("regenerar una pieza no cambia lo que descarga un enlace anterior", async ({
    request,
  }) => {
    test.setTimeout(240_000);

    await request.post("/api/auth/session", {
      data: { password: PROD_OPERATOR_PASSWORD },
    });

    const photoAssetIds = await uploadDemoPhotos(request);
    const propertyId = await createDemoProperty(
      request,
      demoPropertyPayload({
        photoAssetIds,
        primaryPhotoAssetId: photoAssetIds[0]!,
      }),
    );

    // --- primera generacion ---
    const primerJob = await pollRenderJob(
      request,
      await triggerGenerate(request, propertyId),
      { timeoutMs: 150_000 },
    );
    const artefactoOriginal = findTask(primerJob, PIEZA)?.artifacts[0];
    expect(artefactoOriginal, "la primera generacion no produjo la pieza").toBeTruthy();

    const descargaOriginal = await request.get(
      `/api/generated-pieces/${artefactoOriginal!.id}/download`,
    );
    expect(descargaOriginal.status()).toBe(200);
    const bytesOriginales = Buffer.from(await descargaOriginal.body());
    const hashOriginal = sha256(bytesOriginales);

    // --- se regenera ESA pieza con otro texto ---
    const regeneracion = await request.post(
      `/api/properties/${propertyId}/regenerate-piece`,
      {
        data: {
          pieceKey: PIEZA,
          textOverride: "Titular distinto para forzar un render diferente",
        },
      },
    );
    expect(regeneracion.status()).toBe(202);
    const { jobId } = (await regeneracion.json()) as { jobId: string };
    const segundoJob = await pollRenderJob(request, jobId, { timeoutMs: 150_000 });

    const artefactoNuevo = findTask(segundoJob, PIEZA)?.artifacts[0];
    expect(artefactoNuevo, "la regeneracion no produjo la pieza").toBeTruthy();
    expect(artefactoNuevo!.id).not.toBe(artefactoOriginal!.id);

    // --- lo que importa: el enlace VIEJO sigue dando lo mismo ---
    const redescarga = await request.get(
      `/api/generated-pieces/${artefactoOriginal!.id}/download`,
    );
    expect(redescarga.status(), "el enlace antiguo deberia seguir vivo").toBe(200);
    expect(sha256(Buffer.from(await redescarga.body()))).toBe(hashOriginal);

    // Y el nuevo es realmente otro fichero, no el mismo con otro id: sin esto,
    // el assert de arriba pasaria aunque la regeneracion no hubiera hecho nada.
    const descargaNueva = await request.get(
      `/api/generated-pieces/${artefactoNuevo!.id}/download`,
    );
    expect(descargaNueva.status()).toBe(200);
    expect(sha256(Buffer.from(await descargaNueva.body()))).not.toBe(hashOriginal);
  });

  test("el ZIP sigue describiendo la propiedad tras regenerar una sola pieza", async ({
    request,
  }) => {
    test.setTimeout(240_000);

    await request.post("/api/auth/session", {
      data: { password: PROD_OPERATOR_PASSWORD },
    });

    const photoAssetIds = await uploadDemoPhotos(request);
    const propertyId = await createDemoProperty(
      request,
      demoPropertyPayload({
        photoAssetIds,
        primaryPhotoAssetId: photoAssetIds[0]!,
      }),
    );
    await pollRenderJob(request, await triggerGenerate(request, propertyId), {
      timeoutMs: 150_000,
    });

    // Regenerar UNA pieza deja un job cuyas tasks son solo esa. Con las rutas
    // fijas, el empaquetador encontraba el resto por convencion de nombre; ahora
    // tiene que resolverlo por el registro de artefactos. Si eso fallara, el
    // ZIP saldria con una sola pieza — que es el bug CRITICO que ya tuvimos.
    const regeneracion = await request.post(
      `/api/properties/${propertyId}/regenerate-piece`,
      { data: { pieceKey: PIEZA } },
    );
    const { jobId } = (await regeneracion.json()) as { jobId: string };
    await pollRenderJob(request, jobId, { timeoutMs: 150_000 });

    const paquete = await request.get(`/api/render-jobs/${jobId}/package`);
    expect(paquete.status()).toBe(200);

    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(Buffer.from(await paquete.body()));
    const nombres = Object.keys(zip.files);

    for (const esperado of [
      "ficha-tecnica.pdf",
      "post-instagram.png",
      "carrusel-01.png",
      "carrusel-05.png",
      "story-instagram.png",
      "email.html",
      "datos-propiedad.json",
    ]) {
      expect(nombres, `falta ${esperado} en el ZIP`).toContain(esperado);
    }
  });
});
