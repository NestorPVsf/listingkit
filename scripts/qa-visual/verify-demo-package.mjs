// Paso 7.3 PLAN.md — verificación técnica de las 18 piezas + 3 ZIPs de las
// 3 propiedades demo. Dimensiones (sharp), PDF (unpdf: texto + QR presentes,
// SIN dirección privada), vídeo (ffprobe: 1080x1920, 20-35s, h264), ZIP
// (jszip: 15 entradas + datos-propiedad.json limpio).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import JSZip from "jszip";
import { extractText } from "unpdf";

const execFileAsync = promisify(execFile);
const FFPROBE =
  "ffprobe";

const OUT_ROOT = path.resolve(process.cwd(), "output/demo");

const PROPERTIES = [
  { slug: "piso-centro-alicante", privateAddressFragment: "C/ Alfonso el Sabio, 3ª planta con ascensor (dirección interna demo)" },
  { slug: "apartamento-playa-san-juan", privateAddressFragment: "2ª línea de playa, 6ª planta (dirección interna demo)" },
  { slug: "chalet-el-campello", privateAddressFragment: "dirección interna demo" },
];

const EXPECTED_ZIP_ENTRIES = [
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
  "video-vertical.mp4",
].sort();

const results = [];

function record(slug, check, ok, detail) {
  results.push({ slug, check, ok, detail });
  console.log(`${ok ? "OK  " : "FAIL"} [${slug}] ${check}${detail ? " — " + detail : ""}`);
}

async function verifyImage(slug, fileName, expectedW, expectedH) {
  const buf = await readFile(path.join(OUT_ROOT, slug, fileName));
  const meta = await sharp(buf).metadata();
  const ok = meta.width === expectedW && meta.height === expectedH;
  record(slug, `${fileName} dimensiones ${expectedW}x${expectedH}`, ok, `real=${meta.width}x${meta.height}`);
}

async function verifyPdf(slug, privateAddressFragment) {
  const filePath = path.join(OUT_ROOT, slug, "ficha-tecnica.pdf");
  const buf = await readFile(filePath);
  const { totalPages, text } = await extractText(new Uint8Array(buf), { mergePages: true });
  const hasText = typeof text === "string" && text.trim().length > 100;
  record(slug, "ficha-tecnica.pdf tiene texto extraíble", hasText, `chars=${text?.length ?? 0}, pages=${totalPages}`);

  const leaksPrivateAddress = text.includes(privateAddressFragment);
  record(slug, "ficha-tecnica.pdf SIN dirección privada", !leaksPrivateAddress);

  // QR: unpdf no decodifica imágenes; verificamos presencia de un XObject de
  // imagen embebida como proxy (el QR se renderiza como <img> en la plantilla).
  const rawText = buf.toString("latin1");
  const hasImageXObject = /\/Subtype\s*\/Image/.test(rawText);
  record(slug, "ficha-tecnica.pdf contiene imagen embebida (QR/foto)", hasImageXObject);
}

async function verifyVideo(slug) {
  const filePath = path.join(OUT_ROOT, slug, "video-vertical.mp4");
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,codec_name,duration",
    "-of", "json",
    filePath,
  ]);
  const data = JSON.parse(stdout);
  const stream = data.streams?.[0] ?? {};
  const w = stream.width;
  const h = stream.height;
  const codec = stream.codec_name;
  const duration = parseFloat(stream.duration ?? "0");

  record(slug, "video-vertical.mp4 1080x1920", w === 1080 && h === 1920, `real=${w}x${h}`);
  record(slug, "video-vertical.mp4 codec h264", codec === "h264", `real=${codec}`);
  record(slug, "video-vertical.mp4 duración 20-35s", duration >= 20 && duration <= 35, `real=${duration.toFixed(2)}s`);
}

async function verifyEmail(slug) {
  const html = await readFile(path.join(OUT_ROOT, slug, "email.html"), "utf8");
  const txt = await readFile(path.join(OUT_ROOT, slug, "email.txt"), "utf8");
  const htmlOk = html.includes("<table") && html.length > 500;
  record(slug, "email.html tiene estructura de tablas", htmlOk, `bytes=${html.length}`);
  const txtOk = txt.trim().length > 100;
  record(slug, "email.txt tiene contenido", txtOk, `bytes=${txt.length}`);
}

async function verifyZip(slug) {
  const zipPath = path.join(OUT_ROOT, slug, `${slug}.zip`);
  const buf = await readFile(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.keys(zip.files).sort();
  const entriesOk = JSON.stringify(entries) === JSON.stringify(EXPECTED_ZIP_ENTRIES);
  record(slug, "ZIP tiene las 15 entradas esperadas", entriesOk, entriesOk ? "" : `real=${entries.join(",")}`);

  const jsonEntry = zip.file("datos-propiedad.json");
  const jsonText = await jsonEntry.async("string");
  const parsed = JSON.parse(jsonText);
  const noLeak = !("privateAddress" in parsed) && !("internalName" in parsed);
  record(slug, "datos-propiedad.json sin privateAddress/internalName", noLeak);

  const priceFormatted = typeof parsed.price === "number" || /€/.test(JSON.stringify(parsed));
  record(slug, "datos-propiedad.json tiene precio", priceFormatted, `price=${JSON.stringify(parsed.price)}`);
}

async function main() {
  for (const { slug, privateAddressFragment } of PROPERTIES) {
    console.log(`\n=== ${slug} ===`);
    await verifyImage(slug, "post-instagram.png", 1080, 1350);
    await verifyImage(slug, "story-instagram.png", 1080, 1920);
    for (let i = 1; i <= 5; i++) {
      await verifyImage(slug, `carrusel-${String(i).padStart(2, "0")}.png`, 1080, 1350);
    }
    await verifyPdf(slug, privateAddressFragment);
    await verifyVideo(slug);
    await verifyEmail(slug);
    await verifyZip(slug);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n\nTOTAL: ${results.length} checks, ${failed.length} fallos`);
  if (failed.length > 0) {
    console.log("FALLOS:");
    for (const f of failed) console.log(` - [${f.slug}] ${f.check} ${f.detail ?? ""}`);
  }
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(
      path.join(OUT_ROOT, "verify-results.json"),
      JSON.stringify(results, null, 2),
      "utf8",
    ),
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("verify-demo-package falló:", err);
  process.exit(1);
});
