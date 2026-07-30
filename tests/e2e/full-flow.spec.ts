/**
 * TDD — Fase 5.1 del PLAN.md. E2E del flujo completo de USUARIO por la UI
 * (dashboard → nueva propiedad → formulario 35 campos → subir fotos → guardar
 * → estados de generación → preview → edición/regeneración de 1 pieza →
 * descarga individual → descarga ZIP), más los flujos de error del
 * formulario. La UI de estas vistas AÚN NO EXISTE (Fase 5.2-5.5 del PLAN.md
 * están pendientes) — este spec debe fallar ROJO LIMPIO por navegación o
 * `data-testid` inexistentes, nunca por error de sintaxis/parseo.
 *
 * ---------------------------------------------------------------------------
 * CONTRATO DE SELECTORES (data-testid) — VINCULANTE para quien implemente la
 * UI de la Fase 5. Cualquier cambio de nombre debe actualizar este spec.
 * ---------------------------------------------------------------------------
 *
 * Dashboard (`/dashboard`):
 *   - `new-property-link`        Link/botón "Nueva propiedad" → navega a /properties/new
 *   - `property-history-item-<propertyId>`  Fila del historial de propiedades
 *
 * Formulario de propiedad (`/properties/new`, también reutilizado en edición):
 *   - `property-form`            Elemento <form> raíz
 *   - `field-<name>`             Un input/select/textarea por cada campo de
 *                                 `propertyInputSchema` (niches/inmobiliaria/schema.ts),
 *                                 usando el nombre EXACTO de la propiedad Zod, p.ej.:
 *                                 field-internalName, field-operation, field-propertyType,
 *                                 field-price, field-currency, field-pricePeriod,
 *                                 field-city, field-district, field-publicAddress,
 *                                 field-privateAddress, field-builtAreaM2, field-usableAreaM2,
 *                                 field-bedrooms, field-bathrooms, field-floor,
 *                                 field-elevator, field-terrace, field-balcony, field-garage,
 *                                 field-storageRoom, field-pool, field-garden, field-condition,
 *                                 field-constructionYear, field-energyCertificate.rating,
 *                                 field-energyCertificate.identifier, field-description,
 *                                 field-highlights.<index>, field-cta, field-listingUrl,
 *                                 field-agent.name, field-agent.phone, field-agent.email,
 *                                 field-agency.name, field-agency.website
 *   - `field-error-<name>`       Mensaje de error accesible asociado a `field-<name>`
 *                                 (referenciado por aria-describedby)
 *   - `photo-upload`             Input de subida de fotos (múltiple, 3-20)
 *   - `photo-thumbnail-<index>`  Miniatura de cada foto subida, en orden
 *   - `set-primary-photo-<index>` Botón "usar como foto principal" por miniatura
 *   - `photo-upload-error`       Error accesible cuando faltan fotos (<3) o exceden límites
 *   - `draft-autosave-indicator` Indicador visible de autoguardado de borrador
 *   - `submit-property`          Botón submit del formulario completo
 *
 * Generación / estados de RenderJob (tras submit, o en `/properties/<id>`):
 *   - `generation-screen`        Contenedor de la pantalla de estados de generación
 *   - `job-status-<pieceKey>`    Estado visible de una pieza (`pending|rendering|done|error`),
 *                                 pieceKey = clave del catálogo (p.ej. `pdf-ficha`,
 *                                 `instagram-post`, `instagram-carousel`, `instagram-story`,
 *                                 `email`, `video`)
 *   - `job-error-cause-<pieceKey>`    Texto de causa del error (regla dura del spec)
 *   - `job-error-solution-<pieceKey>` Texto de solución/remedio del error
 *   - `retry-<pieceKey>`          Botón de reintento por pieza en error
 *
 * Vista previa (`/properties/<id>/preview` o `/preview-result/<id>`):
 *   - `piece-card-<pieceKey>`     Tarjeta de la pieza generada, con preview visual
 *   - `edit-piece-<pieceKey>`     Botón/acción "editar texto" de una pieza
 *   - `piece-text-editor-<pieceKey>`  Editor de texto embebido tras `edit-piece-*`
 *   - `save-piece-edit-<pieceKey>`    Guarda el texto editado (sin regenerar aún)
 *   - `regenerate-<pieceKey>`     Botón "regenerar SOLO esta pieza"
 *   - `download-<pieceKey>`       Descarga el artefacto individual de la pieza
 *   - `download-zip`             Descarga el ZIP completo de la propiedad
 *   - `reorder-photo-<index>`    Control de reordenar fotos (drag handle o botones ↑/↓)
 *   - `photo-order-list`         Contenedor ordenable de fotos de la propiedad
 *
 * ---------------------------------------------------------------------------
 * CONTRATO DE ENDPOINT ASUMIDO PARA EL ZIP (aún no existe en app/api/ — Fase
 * 6.2 del PLAN.md está pendiente; verificado con `find app/api` antes de
 * escribir este spec):
 *
 *   GET /api/render-jobs/{jobId}/package
 *     → 200, Content-Type: application/zip
 *     Contenido esperado según spec.md (regla dura #1 y criterios de
 *     finalización): las 6 piezas + `README.txt` + `datos-propiedad.json`
 *     (proyección PÚBLICA — JAMÁS debe contener `privateAddress` ni
 *     `internalName`, ver `toPublicPropertyInput` en niches/inmobiliaria/schema.ts).
 *
 * Este spec usa ese endpoint. Si el implementador prefiere otra ruta (p.ej.
 * colgada de `/api/properties/{id}/package`), debe actualizar este archivo
 * a la vez que implementa — es el mismo contrato de "quien cambia el nombre,
 * actualiza el spec" que rige los `data-testid` de arriba.
 * ---------------------------------------------------------------------------
 */
import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import {
  demoPropertyPayload,
  DEMO_PRIVATE_ADDRESS,
  PRIVATE_ADDRESS_SENTINEL,
} from "../fixtures/demo-property";

const DEMO_PHOTO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const PIECE_KEYS = [
  "pdf-ficha",
  "instagram-post",
  "instagram-carousel",
  "instagram-story",
  "email",
  "video",
] as const;

/** Rellena el formulario de 35 campos con los datos de la fixture demo. */
async function fillPropertyForm(page: Page): Promise<void> {
  const demo = demoPropertyPayload({
    photoAssetIds: [],
    primaryPhotoAssetId: "",
  });

  await page.getByTestId("field-internalName").fill(demo.internalName);
  await page.getByTestId("field-operation").selectOption(demo.operation);
  await page.getByTestId("field-propertyType").selectOption(demo.propertyType);
  await page.getByTestId("field-price").fill(String(demo.price));
  await page.getByTestId("field-currency").selectOption(demo.currency);
  await page.getByTestId("field-city").fill(demo.city);
  await page.getByTestId("field-district").fill(demo.district ?? "");
  await page
    .getByTestId("field-publicAddress")
    .fill(demo.publicAddress ?? "");
  await page.getByTestId("field-privateAddress").fill(demo.privateAddress);
  await page.getByTestId("field-builtAreaM2").fill(String(demo.builtAreaM2));
  await page
    .getByTestId("field-usableAreaM2")
    .fill(String(demo.usableAreaM2 ?? ""));
  await page.getByTestId("field-bedrooms").fill(String(demo.bedrooms));
  await page.getByTestId("field-bathrooms").fill(String(demo.bathrooms));
  await page.getByTestId("field-floor").fill(demo.floor ?? "");
  await setCheckbox(page, "field-elevator", demo.elevator);
  await setCheckbox(page, "field-terrace", demo.terrace);
  await setCheckbox(page, "field-balcony", demo.balcony);
  await setCheckbox(page, "field-garage", demo.garage);
  await setCheckbox(page, "field-storageRoom", demo.storageRoom);
  await setCheckbox(page, "field-pool", demo.pool);
  await setCheckbox(page, "field-garden", demo.garden);
  await page.getByTestId("field-condition").selectOption(demo.condition);
  await page
    .getByTestId("field-constructionYear")
    .fill(String(demo.constructionYear ?? ""));
  await page
    .getByTestId("field-energyCertificate.rating")
    .selectOption(demo.energyCertificate?.rating ?? "en-tramite");
  await page.getByTestId("field-description").fill(demo.description);
  for (const [index, highlight] of demo.highlights.entries()) {
    await page.getByTestId(`field-highlights.${index}`).fill(highlight);
  }
  await page.getByTestId("field-cta").fill(demo.cta);
  await page.getByTestId("field-listingUrl").fill(demo.listingUrl ?? "");
  await page.getByTestId("field-agent.name").fill(demo.agent.name);
  await page.getByTestId("field-agent.phone").fill(demo.agent.phone);
  await page.getByTestId("field-agent.email").fill(demo.agent.email);
  await page.getByTestId("field-agency.name").fill(demo.agency.name);
  await page
    .getByTestId("field-agency.website")
    .fill(demo.agency.website ?? "");
}

async function setCheckbox(
  page: Page,
  testId: string,
  checked: boolean,
): Promise<void> {
  const checkbox = page.getByTestId(testId);
  if (checked) {
    await checkbox.check();
  } else {
    await checkbox.uncheck();
  }
}

async function uploadFivePhotos(page: Page): Promise<void> {
  const buffer = Buffer.from(DEMO_PHOTO_PNG_BASE64, "base64");
  const files = Array.from({ length: 5 }, (_, index) => ({
    name: `demo-photo-${index + 1}.png`,
    mimeType: "image/png" as const,
    buffer,
  }));
  await page.getByTestId("photo-upload").setInputFiles(files);
}

/** Espera a que todas las piezas terminen en done o error (no se queda en pending/rendering). */
async function waitForAllPiecesSettled(
  page: Page,
  timeoutMs = 60_000,
): Promise<void> {
  for (const pieceKey of PIECE_KEYS) {
    await expect(page.getByTestId(`job-status-${pieceKey}`)).toHaveAttribute(
      "data-status",
      /done|error/,
      { timeout: timeoutMs },
    );
  }
}

test.describe("Flujo completo de usuario por la UI — InmoContent OS", () => {
  test("dashboard → nueva propiedad → formulario → fotos → generación → preview → descarga individual → descarga ZIP", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await page.getByTestId("new-property-link").click();
    await expect(page).toHaveURL(/\/properties\/new/);

    await expect(page.getByTestId("property-form")).toBeVisible();
    await fillPropertyForm(page);
    await uploadFivePhotos(page);

    // Autoguardado de borrador visible antes de enviar (spec.md regla dura #6).
    await expect(page.getByTestId("draft-autosave-indicator")).toBeVisible();

    await page.getByTestId("submit-property").click();

    // Pantalla de generación con estados pending → rendering → done por pieza.
    await expect(page.getByTestId("generation-screen")).toBeVisible();
    for (const pieceKey of PIECE_KEYS) {
      await expect(
        page.getByTestId(`job-status-${pieceKey}`),
      ).toHaveAttribute("data-status", /pending|rendering|done/);
    }
    await waitForAllPiecesSettled(page);

    // Vista previa muestra las piezas generadas.
    for (const pieceKey of PIECE_KEYS) {
      await expect(page.getByTestId(`piece-card-${pieceKey}`)).toBeVisible();
    }

    // Descarga individual de una pieza (PDF).
    const [individualDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-pdf-ficha").click(),
    ]);
    expect(individualDownload.suggestedFilename()).toMatch(/\.(pdf)$/i);

    // Descarga del ZIP completo — validar contenido interno.
    const [zipDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-zip").click(),
    ]);
    const zipPath = await zipDownload.path();
    expect(zipPath).toBeTruthy();

    const zipBuffer = await zipDownload.createReadStream().then(
      (stream) =>
        new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          stream!.on("data", (chunk) => chunks.push(chunk as Buffer));
          stream!.on("end", () => resolve(Buffer.concat(chunks)));
          stream!.on("error", reject);
        }),
    );

    const zip = await JSZip.loadAsync(zipBuffer);
    const entryNames = Object.keys(zip.files);

    expect(entryNames).toContain("README.txt");
    expect(entryNames).toContain("datos-propiedad.json");
    // Nombres de archivo por pieza según spec.md — al menos un artefacto por
    // clave. El nombre de fichero real dentro del ZIP usa la convención de
    // `jszip-package-builder.ts` (PIECE_FILES), que no coincide letra a letra
    // con el pieceKey de UI (p.ej. "ficha-tecnica.pdf" para "pdf-ficha") —
    // ese mapeo de nombres es el contrato verificado en
    // tests/security/zip-package.test.ts, NO se toca aquí.
    const PIECE_KEY_TO_ZIP_SUBSTRING: Record<(typeof PIECE_KEYS)[number], string> = {
      "pdf-ficha": "ficha-tecnica",
      "instagram-post": "post-instagram",
      "instagram-carousel": "carrusel-",
      "instagram-story": "story-instagram",
      email: "email",
      video: "video",
    };
    for (const pieceKey of PIECE_KEYS) {
      const substring = PIECE_KEY_TO_ZIP_SUBSTRING[pieceKey];
      const matching = entryNames.filter((name) => name.includes(substring));
      expect(matching.length).toBeGreaterThan(0);
    }

    const datosPropiedadEntry = zip.file("datos-propiedad.json");
    expect(datosPropiedadEntry).not.toBeNull();
    const datosPropiedadRaw = await datosPropiedadEntry!.async("string");

    // Regla dura #1 del spec: la dirección privada JAMÁS aparece en el ZIP.
    expect(datosPropiedadRaw).not.toContain(PRIVATE_ADDRESS_SENTINEL);
    expect(datosPropiedadRaw).not.toContain(DEMO_PRIVATE_ADDRESS);
    const datosPropiedad = JSON.parse(datosPropiedadRaw) as Record<
      string,
      unknown
    >;
    expect(datosPropiedad).not.toHaveProperty("privateAddress");
    expect(datosPropiedad).not.toHaveProperty("internalName");

    for (const [entryName, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const contentBuffer = await entry.async("nodebuffer");
      expect(
        contentBuffer.includes(PRIVATE_ADDRESS_SENTINEL),
        `El archivo "${entryName}" del ZIP no debe contener la dirección privada`,
      ).toBe(false);
    }
  });

  test("editar texto de una pieza en preview → regenerar SOLO esa pieza → las demás no cambian", async ({
    page,
  }) => {
    // Precondición: propiedad ya generada (reutiliza el flujo feliz hasta preview).
    await page.goto("/dashboard");
    await page.getByTestId("new-property-link").click();
    await fillPropertyForm(page);
    await uploadFivePhotos(page);
    await page.getByTestId("submit-property").click();
    await waitForAllPiecesSettled(page);

    const untouchedPieceKey = "email";
    const editedPieceKey = "instagram-post";

    const untouchedDownloadBefore = await downloadArtifactBuffer(
      page,
      untouchedPieceKey,
    );
    const editedDownloadBefore = await downloadArtifactBuffer(
      page,
      editedPieceKey,
    );

    await page.getByTestId(`edit-piece-${editedPieceKey}`).click();
    await page
      .getByTestId(`piece-text-editor-${editedPieceKey}`)
      .fill("Texto editado manualmente en el E2E de regeneración parcial.");
    await page.getByTestId(`save-piece-edit-${editedPieceKey}`).click();

    // Esperar `data-status` en /done|error/ NO sirve aqui: la pieza YA estaba en
    // "done" por la generacion inicial, asi que la asercion se cumplia al
    // instante y el test descargaba el fichero viejo antes de que la
    // regeneracion lo reescribiera (falso fallo intermitente, 2026-07-30).
    // Tomamos el jobId de la propia respuesta y lo sondeamos hasta estado final.
    const [regenerateResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/regenerate-piece") &&
          response.request().method() === "POST",
      ),
      page.getByTestId(`regenerate-${editedPieceKey}`).click(),
    ]);

    const { jobId: regenerationJobId } = (await regenerateResponse.json()) as {
      jobId: string;
    };
    expect(regenerationJobId, "la regeneracion debe devolver un jobId").toBeTruthy();

    await expect
      .poll(
        async () => {
          const status = await page.request.get(
            `/api/render-jobs/${regenerationJobId}`,
          );
          const body = (await status.json()) as { status?: string };
          return body.status ?? "unknown";
        },
        // La cola de render es serie (una tarea a la vez): esta regeneracion
        // puede esperar detras de la generacion completa anterior, que incluye
        // el video (~25 s). Margen amplio a proposito.
        { timeout: 150_000, intervals: [500] },
      )
      .toMatch(/done|partial|error/);

    const untouchedDownloadAfter = await downloadArtifactBuffer(
      page,
      untouchedPieceKey,
    );
    const editedDownloadAfter = await downloadArtifactBuffer(
      page,
      editedPieceKey,
    );

    expect(untouchedDownloadAfter.equals(untouchedDownloadBefore)).toBe(true);
    expect(editedDownloadAfter.equals(editedDownloadBefore)).toBe(false);

    // Endurecimiento (code-review 2026-07-30): el diff de bytes de arriba solo
    // prueba que el PNG cambió, no que cambió POR EL TEXTO EDITADO — podría
    // haber cambiado por metadata/timestamp incrustado y el assert seguiría
    // en verde con el bug de fontanería original. El contenido de un PNG no
    // es grepeable, pero copy-instagram.txt del ZIP se deriva del MISMO
    // override (GeneratedPiece.editableText de "instagram-post", ver
    // jszip-package-builder.ts) — es texto plano y prueba sin ambigüedad que
    // el override llegó hasta el pipeline de generación, no solo que "algo"
    // cambió en el binario.
    const [zipDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-zip").click(),
    ]);
    const zipBuffer = await zipDownload.createReadStream().then(
      (stream) =>
        new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          stream!.on("data", (chunk) => chunks.push(chunk as Buffer));
          stream!.on("end", () => resolve(Buffer.concat(chunks)));
          stream!.on("error", reject);
        }),
    );
    const zip = await JSZip.loadAsync(zipBuffer);
    const copyEntry = zip.file("copy-instagram.txt");
    expect(copyEntry).not.toBeNull();
    const copyContent = await copyEntry!.async("string");
    expect(copyContent).toContain(
      "Texto editado manualmente en el E2E de regeneración parcial.",
    );
  });

  test("formulario sin fotos muestra error accesible y no permite enviar", async ({
    page,
  }) => {
    await page.goto("/properties/new");
    await fillPropertyForm(page);
    await page.getByTestId("submit-property").click();

    await expect(page.getByTestId("photo-upload-error")).toBeVisible();
    await expect(page.getByTestId("photo-upload-error")).toHaveAttribute(
      "role",
      "alert",
    );
    await expect(page).toHaveURL(/\/properties\/new/);
  });

  test("precio negativo muestra error de campo accesible", async ({
    page,
  }) => {
    await page.goto("/properties/new");
    await fillPropertyForm(page);
    await page.getByTestId("field-price").fill("-100");
    await uploadFivePhotos(page);
    await page.getByTestId("submit-property").click();

    const priceError = page.getByTestId("field-error-price");
    await expect(priceError).toBeVisible();

    const priceField = page.getByTestId("field-price");
    await expect(priceField).toHaveAttribute("aria-invalid", "true");
    const describedBy = await priceField.getAttribute("aria-describedby");
    expect(describedBy).toContain("field-error-price");
  });
});

/**
 * Descarga el artefacto individual de una pieza y devuelve su contenido como
 * Buffer.
 *
 * Chromium headless no tiene visor de PDF: el `<iframe>` de preview de la
 * ficha técnica (`?inline=1`, sin Content-Disposition: attachment) igual
 * dispara un evento `download` espurio al cargar/recargar. Si ese evento
 * gana la carrera del `Promise.all` frente al click real, el test captura el
 * PDF en vez del artefacto pedido (bug confirmado: bytes idénticos al tamaño
 * de ficha-tecnica.pdf). Se filtra por URL para ignorar descargas que no
 * correspondan al `href` del botón clicado.
 */
async function downloadArtifactBuffer(
  page: Page,
  pieceKey: string,
): Promise<Buffer> {
  const link = page.getByTestId(`download-${pieceKey}`);
  const expectedHref = await link.getAttribute("href");
  const [download] = await Promise.all([
    page.waitForEvent("download", (candidate) =>
      expectedHref ? candidate.url().includes(expectedHref) : true,
    ),
    link.click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream!.on("data", (chunk) => chunks.push(chunk as Buffer));
    stream!.on("end", () => resolve(Buffer.concat(chunks)));
    stream!.on("error", reject);
  });
}
