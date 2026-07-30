/**
 * Paso 6.2 del PLAN.md — implementación del `PackageBuilder` (ZIP
 * descargable con todas las piezas de una propiedad). Contrato exacto en
 * `tests/security/zip-package.test.ts`.
 *
 * Estrategia: los binarios (pdf/png/mp4) se copian de `output/<entityId>/`
 * (misma convención de nombre plano que escriben playwright-renderer.ts y
 * email-renderer.ts); si una pieza solicitada no tiene artefacto "done" en
 * `job.tasks` NI el archivo existe en disco (job aún no ejecutado por el
 * pipeline real, como en el fixture de test), se genera un marcador mínimo
 * para no romper el contrato de nombres y se anota en `README.txt` +
 * `manifest.omittedPieces`.
 *
 * Los textos (copy-instagram.txt/guion-video.txt) y `datos-propiedad.json`
 * se derivan de `PublicPropertyView` — el MISMO tipo que ya usan
 * email-renderer.ts/load-piece-data.ts (video), duplicando a propósito la
 * carga de Property vía Prisma (patrón ya establecido en este módulo,
 * ver comentario de `niches/inmobiliaria/email/load-piece-data.ts`).
 * `PublicPropertyView` EXCLUYE `privateAddress`/`internalName` por
 * construcción (allowlist de campos) — no hay forma de que se filtren.
 * Si la propiedad no existe (fixture aislado sin DB real), se cae a una
 * vista mínima sintética construida solo con los datos públicos ya
 * presentes en `job.bindings` (nunca con datos privados: el binding map
 * jamás incluye privateAddress/internalName — regla dura #1 de spec.md).
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type {
  Package,
  PackageManifest,
  PieceKey,
  RenderArtifact,
  RenderJob,
} from "@/lib/engine/contracts";
import type { PackageBuilder } from "@/lib/engine/ports/package-builder";
import { generatePropertyTexts } from "@/lib/text-engine";
import { prisma } from "@/lib/prisma";
import { propertyTextBundleToPieceTexts } from "@/niches/inmobiliaria/piece-texts-adapter";
import { resolveTextOverride } from "@/niches/inmobiliaria/apply-text-override";
import type { PublicPropertyView } from "@/niches/inmobiliaria/public-view";
import { storedPropertyToPublicView } from "@/niches/inmobiliaria/persistence/public-view-mapper";

interface PieceFileSpec {
  readonly fileName: string;
  readonly mediaType: string;
}

const PIECE_FILES: Record<string, readonly PieceFileSpec[]> = {
  "property-sheet": [{ fileName: "ficha-tecnica.pdf", mediaType: "application/pdf" }],
  "instagram-post": [{ fileName: "post-instagram.png", mediaType: "image/png" }],
  "instagram-carousel": Array.from({ length: 5 }, (_, index) => ({
    fileName: `carrusel-${String(index + 1).padStart(2, "0")}.png`,
    mediaType: "image/png",
  })),
  "instagram-story": [{ fileName: "story-instagram.png", mediaType: "image/png" }],
  "property-email": [
    { fileName: "email.html", mediaType: "text/html" },
    { fileName: "email.txt", mediaType: "text/plain" },
  ],
  "vertical-video": [{ fileName: "video-vertical.mp4", mediaType: "video/mp4" }],
};

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

function safeSegment(value: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`PACKAGE_SEGMENT_INVALID:${value}`);
  }
  return value;
}

function outputPath(...segments: readonly string[]): string {
  const root = path.resolve(process.cwd(), "output");
  const candidate = path.resolve(root, ...segments);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("OUTPUT_PATH_OUTSIDE_ROOT");
  }
  return candidate;
}

async function readArtifactBuffer(
  job: Readonly<RenderJob>,
  fileName: string,
): Promise<Buffer | null> {
  const doneArtifacts: readonly RenderArtifact[] = job.tasks
    .filter((task) => task.status === "done")
    .flatMap((task) => task.artifacts);
  const artifact = doneArtifacts.find((candidate) => candidate.fileName === fileName);
  if (artifact) {
    try {
      return await readFile(path.resolve(process.cwd(), artifact.storageKey));
    } catch {
      // El artefacto está registrado pero el fichero ya no existe en disco —
      // cae al intento por convención de abajo.
    }
  }
  // Convención de playwright-renderer.ts/email-renderer.ts: nombre plano bajo
  // output/<entityId>/<fileName>, aunque el task no lo tuviera registrado.
  try {
    const entitySegment = safeSegment(job.entityId);
    return await readFile(outputPath(entitySegment, fileName));
  } catch {
    return null;
  }
}

function placeholderBuffer(fileName: string, mediaType: string): Buffer {
  return Buffer.from(
    `Marcador temporal: "${fileName}" (${mediaType}) todavia no estaba disponible en el momento de generar el ZIP.`,
    "utf8",
  );
}

function buildFallbackView(job: Readonly<RenderJob>): PublicPropertyView {
  const contact = job.bindings.brand.contact;
  return {
    id: job.entityId,
    operation: "sale",
    propertyType: "apartment",
    price: 0,
    currency: "EUR",
    city: job.bindings.brand.name || "",
    builtAreaM2: 0,
    bedrooms: 0,
    bathrooms: 0,
    elevator: false,
    terrace: false,
    balcony: false,
    garage: false,
    storageRoom: false,
    pool: false,
    garden: false,
    condition: "good",
    description: "",
    highlights: [],
    cta: "Contactar",
    agent: {
      name: job.bindings.brand.name || "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
    },
    agency: {
      name: job.bindings.brand.name || "",
      website: contact.website,
    },
    photoAssetIds: [],
    primaryPhotoAssetId: "",
  };
}

async function loadPublicView(job: Readonly<RenderJob>): Promise<PublicPropertyView> {
  const property = await prisma.property.findUnique({
    where: { id: job.entityId },
    // Con las fotos: `datos-propiedad.json` declaraba `photoAssetIds: []`
    // aunque la propiedad tuviera 12 fotos, porque esta consulta era la unica
    // de las cuatro copias del mapeo que no hacia el join.
    include: { photos: { orderBy: { order: "asc" } } },
  });
  if (!property) {
    return buildFallbackView(job);
  }
  return storedPropertyToPublicView(property);
}

/** Override de texto editado por el usuario (regenerate-piece/route.ts), si existe. */
async function loadTextOverride(
  entityId: string,
  pieceKey: string,
): Promise<string | undefined> {
  try {
    return await resolveTextOverride(entityId, pieceKey);
  } catch {
    return undefined;
  }
}

function buildReadme(params: {
  readonly entityId: string;
  readonly jobId: string;
  readonly includedFiles: readonly string[];
  readonly omittedPieces: readonly { readonly pieceKey: PieceKey; readonly reason: string }[];
}): string {
  const lines = [
    "InmoContent OS — paquete de piezas generadas",
    "==============================================",
    "",
    `Propiedad: ${params.entityId}`,
    `Trabajo de generación: ${params.jobId}`,
    "",
    "Contenido de este ZIP:",
    "- ficha-tecnica.pdf: ficha técnica en PDF de la propiedad.",
    "- post-instagram.png: imagen para publicación única de Instagram.",
    "- carrusel-01.png .. carrusel-05.png: 5 imágenes para carrusel de Instagram.",
    "- story-instagram.png: imagen para historia de Instagram.",
    "- video-vertical.mp4: vídeo vertical (solo si se solicitó).",
    "- email.html / email.txt: email de la propiedad (HTML y texto plano).",
    "- copy-instagram.txt: texto de acompañamiento sugerido para Instagram.",
    "- guion-video.txt: guión sugerido para el vídeo vertical.",
    "- datos-propiedad.json: datos públicos de la propiedad (sin información interna/privada).",
    "",
  ];
  if (params.omittedPieces.length > 0) {
    lines.push("Piezas sin artefacto disponible en el momento de generar el ZIP:");
    for (const omitted of params.omittedPieces) {
      lines.push(`- ${omitted.pieceKey}: ${omitted.reason}`);
    }
    lines.push("");
  }
  lines.push(`Ficheros incluidos: ${params.includedFiles.join(", ")}`);
  return lines.join("\n");
}

export const jszipPackageBuilder: PackageBuilder = {
  async build(job: Readonly<RenderJob>): Promise<Package> {
    // El paquete describe LA PROPIEDAD, no un job concreto.
    //
    // Antes se derivaban las claves de `job.tasks`, y eso rompía el caso real
    // más común: tras regenerar UNA pieza, el cliente se queda con el jobId de
    // esa regeneración (tasks = [esa pieza]) y "Descargar todo" producía un ZIP
    // de una sola pieza, omitiendo en silencio las otras 14 entradas que sí
    // existían en disco (review CORRECTNESS, severidad crítica).
    //
    // Ahora se recorre el catálogo completo de piezas y se incluye lo que haya
    // disponible para la entidad; lo que falte se declara en
    // `manifest.omittedPieces` en vez de desaparecer sin rastro.
    const requestedKeys = Object.keys(PIECE_FILES);
    const pieceKeysInThisJob = new Set(
      job.tasks.length > 0
        ? job.tasks.map((task) => task.piece.key)
        : job.request.requestedPieceKeys,
    );
    const zip = new JSZip();
    const manifestFiles: PackageManifest["files"][number][] = [];
    const omittedPieces: PackageManifest["omittedPieces"][number][] = [];

    for (const pieceKey of requestedKeys) {
      const specs = PIECE_FILES[pieceKey];
      if (!specs) continue;
      for (const spec of specs) {
        const existing = await readArtifactBuffer(job, spec.fileName);

        // Pieza que esta propiedad nunca ha generado y que este job tampoco
        // pidió: no es una omisión, sencillamente no forma parte del paquete.
        if (!existing && !pieceKeysInThisJob.has(pieceKey)) continue;

        const buffer =
          existing ??
          (() => {
            omittedPieces.push({
              pieceKey,
              reason: "Artefacto no encontrado — se incluyó un marcador temporal.",
            });
            return placeholderBuffer(spec.fileName, spec.mediaType);
          })();

        zip.file(spec.fileName, buffer);
        manifestFiles.push({
          pieceKey,
          path: spec.fileName,
          mediaType: spec.mediaType,
          bytes: buffer.length,
          sha256: createHash("sha256").update(buffer).digest("hex"),
        });
      }
    }

    const view = await loadPublicView(job);
    const bundle = generatePropertyTexts(view);
    const pieceTexts = propertyTextBundleToPieceTexts(bundle, view);
    void pieceTexts; // reservado para futuras piezas; los campos usados hoy vienen del bundle directo.

    const instagramCopy =
      (await loadTextOverride(job.entityId, "instagram-post")) ?? bundle.instagramPostCopy;
    const videoScript =
      (await loadTextOverride(job.entityId, "vertical-video")) ?? bundle.videoScript;
    const propertyJson = JSON.stringify(view, null, 2);

    const textFiles: { readonly fileName: string; readonly content: string; readonly mediaType: string; readonly pieceKey: PieceKey | "metadata" | "instructions" }[] =
      [
        { fileName: "copy-instagram.txt", content: instagramCopy, mediaType: "text/plain", pieceKey: "instagram-post" },
        { fileName: "guion-video.txt", content: videoScript, mediaType: "text/plain", pieceKey: "vertical-video" },
        { fileName: "datos-propiedad.json", content: propertyJson, mediaType: "application/json", pieceKey: "metadata" },
      ];

    for (const file of textFiles) {
      const buffer = Buffer.from(file.content, "utf8");
      zip.file(file.fileName, buffer);
      manifestFiles.push({
        pieceKey: file.pieceKey,
        path: file.fileName,
        mediaType: file.mediaType,
        bytes: buffer.length,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      });
    }

    const readmeContent = buildReadme({
      entityId: job.entityId,
      jobId: job.id,
      includedFiles: Object.keys(zip.files),
      omittedPieces,
    });
    const readmeBuffer = Buffer.from(readmeContent, "utf8");
    zip.file("README.txt", readmeBuffer);
    manifestFiles.push({
      pieceKey: "instructions",
      path: "README.txt",
      mediaType: "text/plain",
      bytes: readmeBuffer.length,
      sha256: createHash("sha256").update(readmeBuffer).digest("hex"),
    });

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const entitySegment = safeSegment(job.entityId);
    const jobSegment = safeSegment(job.id);
    const directory = outputPath(entitySegment);
    const temporaryDirectory = outputPath(entitySegment, `.tmp-${jobSegment}`);
    const finalPath = outputPath(entitySegment, `package-${jobSegment}.zip`);
    const temporaryPath = outputPath(entitySegment, `.tmp-${jobSegment}`, `${randomUUID()}.tmp`);

    await mkdir(directory, { recursive: true });
    await mkdir(temporaryDirectory, { recursive: true });
    await writeFile(temporaryPath, zipBuffer);
    await rm(finalPath, { force: true });
    await rename(temporaryPath, finalPath);

    const fileStats = await stat(finalPath);
    const storageKey = path.relative(process.cwd(), finalPath).replaceAll("\\", "/");

    const manifest: PackageManifest = {
      formatVersion: 1,
      nicheId: job.nicheId,
      nicheVersion: job.bindings.nicheVersion,
      entityId: job.entityId,
      entityRevision: job.entityRevision,
      jobId: job.id,
      generatedAt: new Date().toISOString(),
      files: manifestFiles,
      omittedPieces,
    };

    return {
      id: randomUUID(),
      jobId: job.id,
      fileName: `propiedad-${entitySegment}.zip`,
      storageKey,
      mediaType: "application/zip",
      bytes: fileStats.size,
      sha256: createHash("sha256").update(zipBuffer).digest("hex"),
      manifest,
    };
  },
};
