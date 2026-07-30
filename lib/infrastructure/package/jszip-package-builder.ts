/**
 * `PackageBuilder`: el ZIP que descarga el cliente con todas las piezas de una
 * entidad.
 *
 * Los binarios (pdf/png/mp4) se copian de `output/<entityId>/` — misma
 * convencion de nombre plano que escriben playwright-renderer.ts y
 * email-renderer.ts. Si una pieza pedida no tiene artefacto "done" en
 * `job.tasks` NI fichero en disco, se incluye un marcador minimo para no romper
 * el contrato de nombres y se anota en `README.txt` + `manifest.omittedPieces`:
 * lo que falta se declara, nunca desaparece en silencio.
 *
 * Este modulo NO conoce ningun vertical. Que ficheros produce cada pieza, como
 * se llama el ZIP y que textos extra lleva lo aporta el nicho a traves de un
 * `NichePackagePlan`, y **se resuelve por `job.nicheId`**. Antes estaba escrito
 * a mano aqui junto a consultas a `prisma.property`, asi que con un segundo
 * nicho registrado un `entityId` coincidente metia datos de una propiedad en el
 * ZIP de otro vertical (hallazgo F-13 de la review adversarial).
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
import { EngineError } from "@/lib/engine/errors";
import type { PackageBuilder } from "@/lib/engine/ports/package-builder";
import type { NichePackagePlan } from "./niche-package-plan";

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

function buildReadme(params: {
  readonly plan: NichePackagePlan;
  readonly entityId: string;
  readonly jobId: string;
  readonly includedFiles: readonly string[];
  readonly omittedPieces: readonly { readonly pieceKey: PieceKey; readonly reason: string }[];
}): string {
  const lines = [
    params.plan.readmeTitle,
    "=".repeat(params.plan.readmeTitle.length),
    "",
    `${params.plan.entityLabel}: ${params.entityId}`,
    `Trabajo de generación: ${params.jobId}`,
    "",
    "Contenido de este ZIP:",
    ...Object.entries(params.plan.fileDescriptions).map(
      ([fileName, description]) => `- ${fileName}: ${description}`,
    ),
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

/**
 * Un plan por nicho. La clave es `job.nicheId`, no una constante: sin eso, con
 * dos verticales registrados el ZIP de uno podia salir con los ficheros del
 * otro (F-13).
 */
export function createJszipPackageBuilder(
  plans: Readonly<Record<string, NichePackagePlan>>,
): PackageBuilder {
  return {
  async build(job: Readonly<RenderJob>): Promise<Package> {
    const plan = plans[job.nicheId];
    if (!plan) {
      throw new EngineError({
        code: "NICHE_PACKAGE_PLAN_MISSING",
        cause: `El nicho "${job.nicheId}" no declara como empaquetar sus piezas.`,
        solution:
          "Registra su NichePackagePlan en la raiz de composicion antes de generar el ZIP.",
        retryable: false,
      });
    }
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
    const requestedKeys = Object.keys(plan.pieceFiles);
    const pieceKeysInThisJob = new Set(
      job.tasks.length > 0
        ? job.tasks.map((task) => task.piece.key)
        : job.request.requestedPieceKeys,
    );
    const zip = new JSZip();
    const manifestFiles: PackageManifest["files"][number][] = [];
    const omittedPieces: PackageManifest["omittedPieces"][number][] = [];

    for (const pieceKey of requestedKeys) {
      const specs = plan.pieceFiles[pieceKey];
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

    const textFiles = await plan.extraFiles(job);

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
      plan,
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
      fileName: `${plan.packageNamePrefix}-${entitySegment}.zip`,
      storageKey,
      mediaType: "application/zip",
      bytes: fileStats.size,
      sha256: createHash("sha256").update(zipBuffer).digest("hex"),
      manifest,
    };
  },
  };
}
