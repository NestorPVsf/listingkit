/**
 * El E2E que faltaba: la ruta de render contra un build de PRODUCCION real.
 *
 * Por que existe, en dos incidentes reales de este proyecto:
 *
 * 1. **F-14**: `/preview/[pieceId]` devolvia 404 con `NODE_ENV=production` y
 *    Playwright captura de ahi, asi que toda la generacion visual fallaba
 *    fuera de `next dev`. Ni los 283 unitarios ni los 9 E2E lo vieron: los E2E
 *    arrancan el servidor de desarrollo.
 * 2. **El primer intento de arreglarlo** guardaba el secreto en una variable de
 *    modulo. En un build de produccion Next da instancias de modulo distintas a
 *    la page y al route handler, asi que cada lado firmaba con un secreto
 *    diferente. Todo verde, y las cuatro piezas visuales seguian fallando.
 *
 * Y por el hallazgo de la review cross-model: los tests del token solo probaban
 * criptografia, asi que borrar el control de acceso de la page dejaba la suite
 * entera en verde con la ruta abierta de par en par.
 *
 * Este spec corre contra `next build && next start` (proyecto `production` de
 * playwright.config.ts) y comprueba las dos mitades que importan: que la ruta
 * SIGUE FUNCIONANDO para el renderer, y que esta CERRADA para todo lo demas.
 */
import { expect, test } from "@playwright/test";
import {
  demoPropertyPayload,
  uploadDemoPhotos,
} from "../fixtures/demo-property";
import { createDemoProperty, pollRenderJob, triggerGenerate } from "./helpers";
import { PROD_OPERATOR_PASSWORD, PROD_PREVIEW_SECRET } from "./prod-server";
import { mintPreviewToken } from "../../lib/render-access/preview-token";

// El modulo lee el secreto de forma perezosa al firmar, asi que basta con
// dejarlo puesto antes del primer `mintPreviewToken`.
process.env.RENDER_PREVIEW_SECRET = PROD_PREVIEW_SECRET;

const PIEZA = "post-instagram";

async function crearPropiedad(request: Parameters<typeof createDemoProperty>[0]) {
  // Las APIs de negocio estan detras del candado de operador desde que se cerro
  // el bloqueante de autenticacion; /preview no, que tiene su propio token.
  const sesion = await request.post("/api/auth/session", {
    data: { password: PROD_OPERATOR_PASSWORD },
  });
  expect(sesion.ok(), "no se pudo abrir sesion de operador").toBe(true);

  const photoAssetIds = await uploadDemoPhotos(request);
  return createDemoProperty(
    request,
    demoPropertyPayload({
      photoAssetIds,
      primaryPhotoAssetId: photoAssetIds[0]!,
    }),
  );
}

test.describe("Ruta de render en produccion — abierta al renderer, cerrada al resto", () => {
  test("un token valido para esa pieza y propiedad renderiza la pieza", async ({
    page,
    request,
  }) => {
    const propertyId = await crearPropiedad(request);
    const token = mintPreviewToken({ pieceId: PIEZA, propertyId, revision: 1 });

    const response = await page.goto(
      `/preview/${PIEZA}?propertyId=${propertyId}&rev=1&rt=${token}`,
    );

    expect(response?.status()).toBe(200);
    // No basta con el 200: la pieza tiene que estar realmente montada, que es
    // lo que Playwright espera para capturar.
    await expect(page.locator("[data-piece-canvas]")).toBeVisible();
  });

  test("sin token, con token invalido, de otra propiedad o caducado devuelve 404", async ({
    page,
    request,
  }) => {
    const propertyId = await crearPropiedad(request);
    const base = `/preview/${PIEZA}?propertyId=${propertyId}&rev=1`;
    const caducado = mintPreviewToken(
      { pieceId: PIEZA, propertyId, revision: 1 },
      Date.now() - 10 * 60_000,
    );
    const deOtraPropiedad = mintPreviewToken({
      pieceId: PIEZA,
      propertyId: "otra-propiedad-cualquiera",
      revision: 1,
    });
    const deOtraPieza = mintPreviewToken({
      pieceId: "ficha-pdf",
      propertyId,
      revision: 1,
    });
    const deOtraRevision = mintPreviewToken({
      pieceId: PIEZA,
      propertyId,
      revision: 2,
    });

    const casos: readonly (readonly [string, string])[] = [
      ["sin token", base],
      ["token inventado", `${base}&rt=99999999999999.deadbeef`],
      ["token vacio", `${base}&rt=`],
      ["token caducado", `${base}&rt=${caducado}`],
      ["token de otra propiedad", `${base}&rt=${deOtraPropiedad}`],
      ["token de otra pieza", `${base}&rt=${deOtraPieza}`],
      ["token de otra revision", `${base}&rt=${deOtraRevision}`],
      // Y al reves: token bueno, `rev` cambiado a mano en la URL.
      [
        "rev manipulado",
        `/preview/${PIEZA}?propertyId=${propertyId}&rev=2&rt=${mintPreviewToken({
          pieceId: PIEZA,
          propertyId,
          revision: 1,
        })}`,
      ],
    ];

    for (const [caso, url] of casos) {
      const response = await page.goto(url);
      expect(response?.status(), `${caso} deberia dar 404`).toBe(404);
      await expect(
        page.locator("[data-piece-canvas]"),
        `${caso} no debe montar la pieza`,
      ).toHaveCount(0);
    }
  });

  test("si la propiedad cambia, el render de la version anterior deja de servirse (F-06)", async ({
    page,
    request,
  }) => {
    // El defecto: los renderers releen la fila viva, asi que editar la
    // propiedad a mitad de una generacion hacia que unas piezas salieran con
    // los datos de antes y otras con los de despues. Sin ruido, sin aviso, y
    // con el juego completo aparentando estar bien.
    //
    // Reproducirlo cronometrando una edicion contra un render de dos minutos
    // seria un test que falla cuando le apetece. Esto comprueba lo mismo en el
    // punto exacto donde se decide: la peticion que lee la fila y la pinta.
    await request.post("/api/auth/session", {
      data: { password: PROD_OPERATOR_PASSWORD },
    });
    // Las fotos se crean con `id: asset.id` (ver app/api/properties/route.ts),
    // asi que los ids subidos sirven tal cual para reordenar.
    const photoAssetIds = await uploadDemoPhotos(request);
    const propertyId = await createDemoProperty(
      request,
      demoPropertyPayload({
        photoAssetIds,
        primaryPhotoAssetId: photoAssetIds[0]!,
      }),
    );
    const url = (revision: number) =>
      `/preview/${PIEZA}?propertyId=${propertyId}&rev=${revision}&rt=${mintPreviewToken({
        pieceId: PIEZA,
        propertyId,
        revision,
      })}`;

    // Recien creada: revision 1, y la pieza se pinta.
    expect((await page.goto(url(1)))?.status()).toBe(200);

    // Reordenar las fotos cambia que foto sale en cada pieza — el caso real.
    const invertidas = [...photoAssetIds].reverse();
    const reorden = await request.post(
      `/api/properties/${propertyId}/photo-order`,
      { data: { orderedPhotoIds: invertidas, primaryPhotoId: invertidas[0] } },
    );
    expect(reorden.ok(), "no se pudo reordenar las fotos").toBe(true);

    // Lo que importa: el trabajo que arranco con la revision 1 ya no puede
    // pintar. Antes de F-06 esto devolvia 200 con los datos NUEVOS, y de ahi
    // salia el juego mezclado.
    expect(
      (await page.goto(url(1)))?.status(),
      "la revision vieja deberia estar cerrada",
    ).toBe(404);

    // Contraste: la version actual si sirve. Sin esto, el assert de arriba
    // pasaria aunque la ruta hubiera quedado rota del todo.
    expect((await page.goto(url(2)))?.status()).toBe(200);
    await expect(page.locator("[data-piece-canvas]")).toBeVisible();
  });

  test("el modo demo no existe en produccion", async ({ page }) => {
    const response = await page.goto(`/preview/${PIEZA}?demo=1`);
    expect(response?.status()).toBe(404);
  });

  test("la peticion RSC tampoco entrega la pieza sin token", async ({ request }) => {
    const propertyId = await crearPropiedad(request);
    const url = `/preview/${PIEZA}?propertyId=${propertyId}&rev=1`;

    // La navegacion cliente de Next no pide el documento, pide el payload RSC.
    // Si el control estuviera solo en el render del HTML, esta via se colaria.
    //
    // OJO con el codigo de estado: una respuesta RSC de una ruta que llama a
    // `notFound()` es **200**, porque Next señaliza el not-found DENTRO del
    // payload (`NEXT_HTTP_ERROR_FALLBACK`) para que el cliente pinte el
    // boundary. Aqui lo que hay que afirmar es el contenido, no el status —
    // este test empezo exigiendo 404 y el 200 era correcto.
    const sinToken = await request.get(url, { headers: { RSC: "1" } });
    const cuerpoSinToken = await sinToken.text();

    expect(cuerpoSinToken).toContain("NEXT_HTTP_ERROR_FALLBACK");
    expect(cuerpoSinToken).not.toContain("data-piece-canvas");
    // Ni rastro de los datos de la propiedad en el payload.
    expect(cuerpoSinToken).not.toContain("Alicante");

    // Contraste: con token valido el payload SI trae la pieza. Sin esto, los
    // asserts de arriba pasarian aunque la ruta devolviese siempre vacio.
    const token = mintPreviewToken({ pieceId: PIEZA, propertyId, revision: 1 });
    const conToken = await request.get(`${url}&rt=${token}`, {
      headers: { RSC: "1" },
    });
    const cuerpoConToken = await conToken.text();

    expect(cuerpoConToken).toContain("data-piece-canvas");
    expect(cuerpoConToken).not.toContain("NEXT_HTTP_ERROR_FALLBACK");
  });

  test("genera las 6 piezas: la ruta de render funciona de verdad en produccion", async ({
    request,
  }) => {
    test.setTimeout(180_000);

    const propertyId = await crearPropiedad(request);
    const jobId = await triggerGenerate(request, propertyId);
    const job = await pollRenderJob(request, jobId, { timeoutMs: 150_000 });

    // Este es el assert que habria cazado F-14: con la ruta en 404, las cuatro
    // piezas visuales acaban en `error` y el job en `partial`.
    expect(
      job.tasks.filter((task) => task.status === "done").length,
      `piezas fallidas: ${job.tasks
        .filter((task) => task.status !== "done")
        .map((task) => `${task.piece.key}=${task.status}`)
        .join(", ")}`,
    ).toBe(job.tasks.length);
    expect(job.status).toBe("done");
  });
});
