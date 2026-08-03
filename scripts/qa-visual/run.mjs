/**
 * Orquesta un paquete completo de generacion para QA visual (Fase 4.7).
 * NO toca codigo de produccion. Usa el dev server real en :3000 + SQLite
 * directo (better-sqlite3) solo para crear/asociar los 2 Brand de prueba,
 * porque POST /api/properties no acepta brandId (ver create-app.ts).
 *
 * Uso: node scripts/qa-visual/run.mjs <presetId> <outDir>
 */
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const presetId = process.argv[2];
const outDir = process.argv[3];
if (!presetId || !outDir) {
  console.error("Uso: node run.mjs <presetId> <outDir>");
  process.exit(1);
}

const presetsFile = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "niches/inmobiliaria/brand-presets.json"), "utf-8"),
);
const preset = presetsFile.presets.find((p) => p.id === presetId);
if (!preset) throw new Error(`Preset ${presetId} no existe`);

fs.mkdirSync(outDir, { recursive: true });

// --- 1. Crear Brand en SQLite directo (mismo shape que onboarding actions.ts) ---
const db = new Database(path.join(process.cwd(), "prisma/dev.db"));
const brandId = randomUUID();
// Misma raiz que la app: si el servidor corre con UPLOADS_DIR y este script
// no lo mira, deja el logo donde nadie lo va a buscar.
const uploadsRoot = process.env.UPLOADS_DIR?.trim() || "uploads";
const logoDir = path.resolve(process.cwd(), uploadsRoot, "brand");
fs.mkdirSync(logoDir, { recursive: true });
const logoFileName = `qa-${presetId}.png`;
fs.copyFileSync(path.join(process.cwd(), "scripts/qa-visual/logo.png"), path.join(logoDir, logoFileName));
// Fix P0 aplicado: app/uploads/brand/[fileName]/route.ts sirve uploads/brand/
// directamente, ya no hace falta copiar a public/ para que el logo resuelva.
const now = new Date().toISOString();
db.prepare(
  `INSERT INTO Brand (id, nombre, logo, colores, tipografia, web, telefono, email, instagram, ctaHabitual, createdAt, updatedAt)
   VALUES (@id, @nombre, @logo, @colores, @tipografia, @web, @telefono, @email, @instagram, @cta, @now, @now)`,
).run({
  id: brandId,
  nombre: `QA ${preset.nombre ?? preset.id}`,
  logo: `/uploads/brand/${logoFileName}`,
  colores: JSON.stringify(preset.colores),
  tipografia: JSON.stringify(preset.tipografia),
  web: "https://qa-visual-demo.example",
  telefono: "+34 600 000 000",
  email: "qa@example.com",
  instagram: "@qa_demo",
  cta: preset.ctaHabitual ?? "Solicita visita",
  now,
});
console.log(`[brand] creado ${brandId} (preset ${presetId})`);

// --- 2. Subir 5 fotos reales (sinteticas reconocibles) via /api/assets ---
const photosDir = path.join(process.cwd(), "scripts/qa-visual/photos");
const photoIds = [];
for (let i = 1; i <= 5; i++) {
  const buf = fs.readFileSync(path.join(photosDir, `demo-${i}.jpg`));
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "image/jpeg" }), `demo-${i}.jpg`);
  form.append("kind", "image");
  const res = await fetch(`${BASE}/api/assets`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload asset ${i} fallo: ${res.status} ${await res.text()}`);
  const json = await res.json();
  photoIds.push(json.id);
}
console.log(`[assets] subidas ${photoIds.length} fotos`);

// --- 3. Crear property (payload del fixture E2E) ---
const payload = {
  internalName: `QA Visual ${presetId} — Piso Centro Alicante`,
  operation: "sale",
  propertyType: "apartment",
  price: 245000,
  currency: "EUR",
  city: "Alicante",
  district: "Centro",
  publicAddress: "Centro, cerca C/ Alfonso el Sabio",
  privateAddress: "Calle Alfonso el Sabio 14, 3º A, 03001 Alicante (QA-VISUAL-NO-SENTINEL)",
  builtAreaM2: 78,
  usableAreaM2: 72,
  bedrooms: 3,
  bathrooms: 1,
  floor: "3ª",
  elevator: true,
  terrace: false,
  balcony: true,
  garage: false,
  storageRoom: false,
  pool: false,
  garden: false,
  condition: "renovation-needed",
  constructionYear: 1978,
  energyCertificate: { rating: "D" },
  description:
    "Piso luminoso de 3 habitaciones en pleno Centro de Alicante, a 5 minutos " +
    "andando de la Explanada. Cocina reformada en 2019 y balcón orientado sur.",
  highlights: [
    "A 5 min andando de la Explanada de España",
    "Cocina reformada en 2019",
    "Balcón orientado sur",
    "Ascensor y portero automático",
    "Excelente comunicación (Renfe, TRAM, autobús urbano)",
  ],
  cta: "Solicita visita",
  listingUrl: "https://postiguethomes-demo.es/propiedad/centro-alicante-1",
  agent: {
    name: "Javier Roselló Ibáñez",
    phone: "+34 611 22 33 44",
    email: "javier.rosello@postiguethomes-demo.es",
  },
  agency: {
    name: "Postiguet Homes",
    website: "https://postiguethomes-demo.es",
  },
  photoAssetIds: photoIds,
  primaryPhotoAssetId: photoIds[0],
  explicitlyAllowedClaims: [],
};

const propRes = await fetch(`${BASE}/api/properties`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
if (!propRes.ok) throw new Error(`crear property fallo: ${propRes.status} ${await propRes.text()}`);
const { id: propertyId } = await propRes.json();
console.log(`[property] creada ${propertyId}`);

// --- 4. Asociar brand a la property (directo en SQLite, API no lo soporta) ---
db.prepare(`UPDATE Property SET brandId = ? WHERE id = ?`).run(brandId, propertyId);
db.close();
console.log(`[property] brandId asociado`);

// --- 5. Generate ---
const genRes = await fetch(`${BASE}/api/properties/${propertyId}/generate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
if (!genRes.ok) throw new Error(`generate fallo: ${genRes.status} ${await genRes.text()}`);
const { jobId } = await genRes.json();
console.log(`[generate] jobId ${jobId}`);

// --- 6. Poll ---
const deadline = Date.now() + 180_000;
let job;
while (Date.now() < deadline) {
  const r = await fetch(`${BASE}/api/render-jobs/${jobId}`);
  if (!r.ok) throw new Error(`poll fallo: ${r.status}`);
  job = await r.json();
  if (["done", "partial", "error"].includes(job.status)) break;
  await new Promise((res) => setTimeout(res, 2000));
}
if (!job) throw new Error("timeout esperando job");
console.log(`[job] status=${job.status}`);
fs.writeFileSync(path.join(outDir, "_job.json"), JSON.stringify(job, null, 2));

// --- 7. Descargar todos los artifacts ---
for (const task of job.tasks) {
  console.log(`  - ${task.piece.key}: ${task.status} (${task.artifacts.length} artifacts)`);
  for (const art of task.artifacts) {
    const dl = await fetch(`${BASE}/api/generated-pieces/${art.id}/download`);
    if (!dl.ok) {
      console.error(`    !! descarga fallo ${art.id}: ${dl.status}`);
      continue;
    }
    const buf = Buffer.from(await dl.arrayBuffer());
    const fname = art.fileName || `${task.piece.key}-${art.variant}`;
    fs.writeFileSync(path.join(outDir, fname), buf);
    console.log(`    -> ${fname} (${buf.byteLength} bytes)`);
  }
}
console.log(`[done] paquete en ${outDir}`);
