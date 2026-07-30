// Paso 7.3 PLAN.md — genera el paquete completo (6 piezas + ZIP) para las 3
// propiedades demo Postiguet Homes contra el dev server real (localhost:3000)
// y las copia a output/demo/<slug>/ con nombres legibles.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

const BASE_URL = "http://localhost:3000";
const OUT_ROOT = path.resolve(process.cwd(), "output/demo");

const SLUGS = {
  "[DEMO] Piso reforma en Centro Alicante — Postiguet Homes": "piso-centro-alicante",
  "[DEMO] Apartamento con vistas al mar en Playa de San Juan — Postiguet Homes":
    "apartamento-playa-san-juan",
  "[DEMO] Chalet con piscina en El Campello — Postiguet Homes": "chalet-el-campello",
};

// pieceKey del RenderTask -> nombre de archivo legible que copiamos
const PIECE_FILENAMES = {
  "property-sheet": "ficha-tecnica.pdf",
  "instagram-post": "post-instagram.png",
  "instagram-carousel": "carrusel", // multi-artifact, se numera
  "instagram-story": "story-instagram.png",
  "property-email": "email", // multi-artifact (html+txt)
  "vertical-video": "video-vertical.mp4",
};

function getDemoProperties() {
  const db = new Database(path.resolve(process.cwd(), "prisma/dev.db"), { readonly: true });
  const rows = db
    .prepare("SELECT id, internalName FROM Property WHERE internalName LIKE '[DEMO]%' ORDER BY internalName")
    .all();
  db.close();
  return rows;
}

async function triggerGenerate(propertyId) {
  const res = await fetch(`${BASE_URL}/api/properties/${propertyId}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`generate falló (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return body.jobId;
}

async function pollJob(jobId, { timeoutMs = 120_000, intervalMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE_URL}/api/render-jobs/${jobId}`);
    if (!res.ok) throw new Error(`GET render-jobs falló (${res.status})`);
    const job = await res.json();
    if (job.status === "done" || job.status === "partial" || job.status === "error") return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout esperando job ${jobId}`);
}

async function downloadArtifact(artifactId) {
  const res = await fetch(`${BASE_URL}/api/generated-pieces/${artifactId}/download`);
  if (!res.ok) throw new Error(`download artifact falló (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function downloadPackage(jobId) {
  const res = await fetch(`${BASE_URL}/api/render-jobs/${jobId}/package`);
  if (!res.ok) throw new Error(`download package falló (${res.status}): ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const properties = getDemoProperties();
  if (properties.length !== 3) {
    throw new Error(`Se esperaban 3 propiedades demo, encontradas ${properties.length}`);
  }

  const summary = [];

  for (const { id: propertyId, internalName } of properties) {
    const slug = SLUGS[internalName];
    if (!slug) throw new Error(`Sin slug mapeado para "${internalName}"`);
    const outDir = path.join(OUT_ROOT, slug);
    await mkdir(outDir, { recursive: true });

    console.log(`[${slug}] disparando generate...`);
    const jobId = await triggerGenerate(propertyId);
    console.log(`[${slug}] jobId=${jobId}, polling...`);
    const job = await pollJob(jobId);
    console.log(`[${slug}] job status=${job.status}`);

    const pieceResults = {};
    for (const task of job.tasks) {
      const pieceKey = task.piece.key;
      pieceResults[pieceKey] = { status: task.status, artifacts: task.artifacts.length };
      if (task.status !== "done") continue;

      if (pieceKey === "instagram-carousel") {
        for (const [idx, artifact] of task.artifacts.entries()) {
          const buf = await downloadArtifact(artifact.id);
          const fname = `carrusel-${String(idx + 1).padStart(2, "0")}.png`;
          await writeFile(path.join(outDir, fname), buf);
        }
      } else if (pieceKey === "property-email") {
        for (const artifact of task.artifacts) {
          const buf = await downloadArtifact(artifact.id);
          const ext = artifact.mediaType.includes("html") ? "html" : "txt";
          await writeFile(path.join(outDir, `email.${ext}`), buf);
        }
      } else {
        const fname = PIECE_FILENAMES[pieceKey] ?? `${pieceKey}.bin`;
        for (const artifact of task.artifacts) {
          const buf = await downloadArtifact(artifact.id);
          await writeFile(path.join(outDir, fname), buf);
        }
      }
    }

    console.log(`[${slug}] descargando ZIP...`);
    const zipBuf = await downloadPackage(jobId);
    await writeFile(path.join(outDir, `${slug}.zip`), zipBuf);

    summary.push({ slug, propertyId, jobId, jobStatus: job.status, pieceResults, zipBytes: zipBuf.byteLength });
  }

  await writeFile(
    path.join(OUT_ROOT, "gen-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
  console.log("Resumen escrito en output/demo/gen-summary.json");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("gen-demo-package falló:", err);
  process.exit(1);
});
