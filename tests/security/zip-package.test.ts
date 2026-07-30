/**
 * Paso 6.1 del PLAN.md — contrato de seguridad del ZIP de empaquetado
 * (fase 6.2, TODAVÍA NO implementada). Este archivo debe fallar en ROJO
 * LIMPIO por import inexistente hasta que 6.2 cree
 * `lib/infrastructure/package/jszip-package-builder.ts` (ruta prevista en
 * `.specs/active/inmocontent-os/plan.md` línea ~182 y `docs/stack-decisions.md`).
 *
 * Contrato esperado (de `lib/engine/ports/package-builder.ts` +
 * `lib/engine/contracts.ts`):
 *
 *   export const jszipPackageBuilder: PackageBuilder = {
 *     async build(job: Readonly<RenderJob>): Promise<Package> { ... }
 *   };
 *
 * `Package.manifest` (PackageManifest) enumera cada archivo con
 * pieceKey/path/mediaType/bytes/sha256; el ZIP en sí se localiza vía
 * `Package.storageKey` (streaming a disco, ver ADR — no se asume el ZIP
 * completo en memoria).
 *
 * Reglas duras verificadas aquí (spec.md #1, #6 y plan.md fase 6):
 * 1. El ZIP contiene EXACTAMENTE los 10 archivos esperados (piezas + json +
 *    readme; el vídeo es condicional a si se generó).
 * 2. `datos-propiedad.json` es la proyección pública (sin privateAddress).
 * 3. Ningún archivo del ZIP contiene el centinela de dirección privada.
 * 4. Los nombres de entrada del ZIP no permiten zip-slip (rutas absolutas
 *    ni `../`).
 *
 * IMPLEMENTADOR (6.2): importa `buildPackage`/`jszipPackageBuilder` desde
 * `@/lib/infrastructure/package/jszip-package-builder` implementando
 * `PackageBuilder` de `@/lib/engine/ports/package-builder`. Este test usa
 * JSZip (ya instalado, ver package.json devDependencies) para abrir el
 * buffer resultante y verificar la lista de entradas — ajusta el import de
 * quien produce el `Buffer`/`Uint8Array` del ZIP si el diseño final expone
 * una función más directa (p.ej. `buildPackageBuffer(job): Promise<Buffer>`)
 * en vez de pasar por `Package.storageKey` + lectura de disco.
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createJszipPackageBuilder } from "@/lib/infrastructure/package/jszip-package-builder";
import { inmobiliariaPackagePlan } from "@/niches/inmobiliaria/package/plan";

// El empaquetador ya no es un singleton con el vertical dentro: se le pasa el
// plan del nicho, resuelto por `job.nicheId`.
const jszipPackageBuilder = createJszipPackageBuilder({
  inmobiliaria: inmobiliariaPackagePlan,
});
import type { RenderJob } from "@/lib/engine/contracts";

const PRIVATE_ADDRESS_SENTINEL = "SENTINEL-PRIVATE-4f9c2b1a";

const EXPECTED_ENTRY_NAMES = [
  "ficha-tecnica.pdf",
  "post-instagram.png",
  "carrusel-01.png",
  "carrusel-02.png",
  "carrusel-03.png",
  "carrusel-04.png",
  "carrusel-05.png",
  "story-instagram.png",
  "email.html",
  "email.txt",
  "copy-instagram.txt",
  "guion-video.txt",
  "datos-propiedad.json",
  "README.txt",
] as const;

// video-vertical.mp4 es condicional (solo si el job lo generó) — se
// verifica por separado en el caso "con vídeo".

function buildFixtureJob(overrides: Partial<RenderJob> = {}): RenderJob {
  return {
    id: "job-fixture-0001",
    nicheId: "inmobiliaria",
    entityId: "prop-fixture-0001",
    entityRevision: 1,
    status: "done",
    request: {
      requestedPieceKeys: [
        "property-sheet",
        "instagram-post",
        "instagram-carousel",
        "instagram-story",
        "property-email",
      ],
      priority: "normal",
      correlationId: "corr-fixture-0001",
    },
    bindings: {
      nicheId: "inmobiliaria",
      nicheVersion: "1.0.0",
      entityId: "prop-fixture-0001",
      entityRevision: 1,
      locale: "es-ES",
      variables: {},
      brand: {
        name: "Postiguet Homes",
        logoAssetId: "44444444-4444-4444-8444-444444444444",
        colors: {
          primary: "#0a5f38",
          secondary: "#0a5f38",
          background: "#ffffff",
          text: "#111111",
        },
        fonts: { heading: "Georgia", body: "Arial" },
        contact: { website: "https://postiguethomes-demo.es" },
      },
      assets: [],
      legalFindings: [],
      createdAt: "2026-07-29T10:00:00.000Z",
    },
    tasks: [],
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    ...overrides,
  } as RenderJob;
}

async function loadZipBuffer(storageKeyOrBuffer: unknown): Promise<Buffer> {
  // El diseño final decide si Package.storageKey es una ruta de disco o el
  // builder expone el buffer directamente. Este helper acepta ambos para no
  // acoplar el test a una decisión de implementación que aún no existe.
  if (Buffer.isBuffer(storageKeyOrBuffer)) {
    return storageKeyOrBuffer;
  }
  if (typeof storageKeyOrBuffer === "string") {
    const { readFile } = await import("node:fs/promises");
    return readFile(storageKeyOrBuffer);
  }
  throw new Error(
    "No se pudo resolver el buffer del ZIP desde Package.storageKey — ajustar loadZipBuffer en zip-package.test.ts según la implementación real de 6.2.",
  );
}

describe("PackageBuilder (jszipPackageBuilder) — contrato del ZIP", () => {
  it("el ZIP contiene exactamente los ficheros esperados (sin vídeo)", async () => {
    const job = buildFixtureJob();
    const pkg = await jszipPackageBuilder.build(job);

    expect(pkg.mediaType).toBe("application/zip");

    const zipBuffer = await loadZipBuffer(pkg.storageKey);
    const zip = await JSZip.loadAsync(zipBuffer);
    const entryNames = Object.keys(zip.files).sort();

    expect(entryNames.sort()).toEqual([...EXPECTED_ENTRY_NAMES].sort());
  });

  it("incluye video-vertical.mp4 cuando el job solicitó la pieza de vídeo", async () => {
    const job = buildFixtureJob({
      request: {
        requestedPieceKeys: [
          "property-sheet",
          "instagram-post",
          "instagram-carousel",
          "instagram-story",
          "property-email",
          "vertical-video",
        ],
        priority: "normal",
        correlationId: "corr-fixture-0002",
      },
    });
    const pkg = await jszipPackageBuilder.build(job);
    const zipBuffer = await loadZipBuffer(pkg.storageKey);
    const zip = await JSZip.loadAsync(zipBuffer);

    expect(Object.keys(zip.files)).toContain("video-vertical.mp4");
  });

  it("datos-propiedad.json es la proyección pública: NO contiene privateAddress ni internalName", async () => {
    const job = buildFixtureJob();
    const pkg = await jszipPackageBuilder.build(job);
    const zipBuffer = await loadZipBuffer(pkg.storageKey);
    const zip = await JSZip.loadAsync(zipBuffer);

    const jsonEntry = zip.file("datos-propiedad.json");
    expect(jsonEntry).not.toBeNull();
    const jsonText = await jsonEntry!.async("string");

    expect(jsonText).not.toContain(PRIVATE_ADDRESS_SENTINEL);
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("privateAddress");
    expect(parsed).not.toHaveProperty("internalName");
  });

  it("ningún archivo del ZIP contiene el centinela de dirección privada", async () => {
    const job = buildFixtureJob();
    const pkg = await jszipPackageBuilder.build(job);
    const zipBuffer = await loadZipBuffer(pkg.storageKey);
    const zip = await JSZip.loadAsync(zipBuffer);

    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      // Piezas binarias (pdf/png/mp4) se leen como buffer; texto como string.
      const isTextEntry = /\.(txt|html|json)$/i.test(name);
      const content = isTextEntry
        ? await entry.async("string")
        : (await entry.async("nodebuffer")).toString("latin1");
      expect(content, `entrada ${name} no debe contener el centinela`).not.toContain(
        PRIVATE_ADDRESS_SENTINEL,
      );
    }
  });

  it("los nombres de entrada del ZIP no permiten zip-slip (sin rutas absolutas ni ../)", async () => {
    const job = buildFixtureJob();
    const pkg = await jszipPackageBuilder.build(job);
    const zipBuffer = await loadZipBuffer(pkg.storageKey);
    const zip = await JSZip.loadAsync(zipBuffer);

    for (const name of Object.keys(zip.files)) {
      expect(name.includes(".."), `entrada ${name} contiene ..`).toBe(false);
      expect(
        /^([/\\]|[a-zA-Z]:\\)/.test(name),
        `entrada ${name} es una ruta absoluta`,
      ).toBe(false);
    }
  });

  it("el manifest declara cada archivo con pieceKey/path/mediaType/bytes/sha256 coherentes con el ZIP real", async () => {
    const job = buildFixtureJob();
    const pkg = await jszipPackageBuilder.build(job);
    const zipBuffer = await loadZipBuffer(pkg.storageKey);
    const zip = await JSZip.loadAsync(zipBuffer);

    expect(pkg.manifest.files.length).toBeGreaterThan(0);
    for (const fileEntry of pkg.manifest.files) {
      expect(Object.keys(zip.files)).toContain(fileEntry.path);
      expect(fileEntry.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(fileEntry.bytes).toBeGreaterThan(0);
    }
  });
});
