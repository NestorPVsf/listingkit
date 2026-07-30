/**
 * RendererPort para la pieza "property-email" (spec.md pieza 5). A diferencia
 * de playwright-renderer.ts, NO necesita navegador: la plantilla ya es un
 * string HTML/texto (niches/inmobiliaria/email/render-email.ts). Este modulo
 * solo hace I/O (cargar datos, escribir a disco) — misma disciplina de
 * escritura atomica (tmp + rename) que el renderer Playwright, duplicada
 * aqui a proposito para no tocar ese archivo (restriccion del brief).
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RenderArtifact, RenderJob, RenderTask } from "@/lib/engine/contracts";
import { EngineError } from "@/lib/engine/errors";
import type { RendererPort, RenderSession } from "@/lib/engine/ports/renderer";
import { renderPropertyEmail } from "@/niches/inmobiliaria/email/render-email";
import { loadEmailPieceData } from "@/niches/inmobiliaria/email/load-piece-data";

export interface EmailRendererOptions {
  readonly baseUrl: string;
}

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new EngineError({
      code: "OUTPUT_SEGMENT_INVALID",
      cause: "El identificador de salida contiene caracteres no permitidos.",
      solution: "Usa identificadores internos alfanumericos.",
      retryable: false,
    });
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

async function writeArtifact(
  entitySegment: string,
  jobSegment: string,
  fileName: string,
  mediaType: string,
  content: string,
  pieceKey: string,
  variant: string,
): Promise<RenderArtifact> {
  const directory = outputPath(entitySegment);
  const temporaryDirectory = outputPath(entitySegment, `.tmp-${jobSegment}`);
  const finalPath = outputPath(entitySegment, fileName);
  const temporaryPath = outputPath(entitySegment, `.tmp-${jobSegment}`, `${randomUUID()}.tmp`);

  await mkdir(directory, { recursive: true });
  await mkdir(temporaryDirectory, { recursive: true });
  await writeFile(temporaryPath, content, "utf8");
  await rm(finalPath, { force: true });
  await rename(temporaryPath, finalPath);

  const [fileStats, bytes] = await Promise.all([stat(finalPath), readFile(finalPath)]);
  const storageKey = path.relative(process.cwd(), finalPath).replaceAll("\\", "/");

  return {
    id: randomUUID(),
    pieceKey,
    variant,
    fileName,
    storageKey,
    mediaType,
    bytes: fileStats.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function createEmailRenderer(options: EmailRendererOptions): RendererPort {
  return {
    async open(): Promise<RenderSession> {
      return {
        async render(job: Readonly<RenderJob>, task: Readonly<RenderTask>) {
          const data = await loadEmailPieceData(job.entityId, options.baseUrl);
          if (!data) {
            throw new EngineError({
              code: "ENTITY_NOT_FOUND",
              cause: "No existe la propiedad asociada a este trabajo.",
              solution: "Comprueba que la propiedad no se elimino antes de renderizar.",
              retryable: false,
              taskStatus: "blocked",
            });
          }

          const output = renderPropertyEmail(data.view, data.brand, data.texts, data.photos);
          const entitySegment = safeSegment(job.entityId);
          const jobSegment = safeSegment(job.id);

          const htmlArtifact = await writeArtifact(
            entitySegment,
            jobSegment,
            "email.html",
            "text/html",
            output.html,
            task.piece.key,
            "html",
          );
          const textArtifact = await writeArtifact(
            entitySegment,
            jobSegment,
            "email.txt",
            "text/plain",
            output.text,
            task.piece.key,
            "text",
          );

          return [htmlArtifact, textArtifact];
        },
        async close() {
          // sin recursos que liberar (sin browser, sin conexiones abiertas)
        },
      };
    },
  };
}
