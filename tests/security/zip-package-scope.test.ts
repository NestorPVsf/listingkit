/**
 * Regresion del bug CRITICO detectado en la review pre-ship (eje CORRECTNESS):
 *
 * El ZIP se construia a partir de `job.tasks`. Tras regenerar UNA pieza, el
 * cliente se queda con el jobId de esa regeneracion (tasks = [esa pieza]), asi
 * que "Descargar todo (ZIP)" devolvia un paquete con UNA sola pieza y omitia en
 * silencio las otras 14 entradas, que seguian existiendo en disco.
 *
 * El paquete describe LA PROPIEDAD, no un job concreto.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { jszipPackageBuilder } from "@/lib/infrastructure/package/jszip-package-builder";
import type { RenderJob } from "@/lib/engine/contracts";

const ENTITY_ID = "prop-scope-regression-0001";
const OUTPUT_DIR = path.resolve(process.cwd(), "output", ENTITY_ID);

/** Las 14 entradas de las 5 piezas no-video, tal y como quedan en disco. */
const FILES_ON_DISK = [
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
];

function buildJob(overrides: Partial<RenderJob> = {}): RenderJob {
  return {
    id: "job-scope-0001",
    nicheId: "inmobiliaria",
    entityId: ENTITY_ID,
    entityRevision: 1,
    status: "done",
    request: {
      requestedPieceKeys: [],
      priority: "normal",
      correlationId: "corr-scope-0001",
    },
    bindings: {
      nicheId: "inmobiliaria",
      nicheVersion: "1.0.0",
      entityId: ENTITY_ID,
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
      createdAt: "2026-07-30T10:00:00.000Z",
    },
    tasks: [],
    createdAt: "2026-07-30T10:00:00.000Z",
    updatedAt: "2026-07-30T10:00:00.000Z",
    ...overrides,
  } as RenderJob;
}

/** Job de regeneracion de una sola pieza: exactamente el caso que rompia. */
function singlePieceRegenerationJob(): RenderJob {
  return buildJob({
    id: "job-scope-regen-0002",
    request: {
      requestedPieceKeys: ["instagram-post"],
      priority: "normal",
      correlationId: "corr-scope-0002",
    },
    tasks: [
      {
        id: "task-regen-0001",
        piece: { key: "instagram-post", renderer: "image" },
        status: "done",
        attempt: 1,
        artifacts: [],
      },
    ],
  } as unknown as Partial<RenderJob>);
}

async function entryNames(storageKeyOrBuffer: unknown): Promise<string[]> {
  const buffer = Buffer.isBuffer(storageKeyOrBuffer)
    ? storageKeyOrBuffer
    : await (await import("node:fs/promises")).readFile(
        String(storageKeyOrBuffer),
      );
  const zip = await JSZip.loadAsync(buffer);
  return Object.keys(zip.files);
}

beforeAll(async () => {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all(
    FILES_ON_DISK.map((name) =>
      writeFile(path.join(OUTPUT_DIR, name), `contenido de ${name}`, "utf8"),
    ),
  );
});

afterAll(async () => {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
});

describe("ZIP — alcance por propiedad, no por job", () => {
  it("tras regenerar UNA pieza, el ZIP sigue incluyendo todas las de la propiedad", async () => {
    const pkg = await jszipPackageBuilder.build(singlePieceRegenerationJob());
    const names = await entryNames(pkg.storageKey ?? pkg);

    for (const expected of FILES_ON_DISK) {
      expect(names, `falta ${expected} en el ZIP`).toContain(expected);
    }
  });

  it("el ZIP de una regeneracion parcial no se queda en una sola pieza", async () => {
    const pkg = await jszipPackageBuilder.build(singlePieceRegenerationJob());
    const names = await entryNames(pkg.storageKey ?? pkg);
    const binarios = names.filter(
      (name) => !name.endsWith(".txt") && !name.endsWith(".json"),
    );

    expect(binarios.length).toBeGreaterThan(1);
  });

  it("no inventa entradas de piezas que la propiedad nunca genero", async () => {
    const pkg = await jszipPackageBuilder.build(singlePieceRegenerationJob());
    const names = await entryNames(pkg.storageKey ?? pkg);

    // El video no existe en disco ni se pidio en este job.
    expect(names).not.toContain("video-vertical.mp4");
  });
});
