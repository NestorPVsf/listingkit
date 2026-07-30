/**
 * Contrato de entrada al filesystem: que tiene que cumplir un fichero para que
 * lo aceptemos, antes de escribirlo.
 *
 * - `sanitizeFileName`: path traversal, bytes nulos, rutas absolutas y nombres
 *   reservados de Windows.
 * - `photoUploadSchema`: formato declarado y tope de tamaño.
 *
 * Ambos vivian en `niches/inmobiliaria/schema.ts` y ninguno sabe nada de pisos.
 * Que la infraestructura generica importase del vertical para poder guardar un
 * fichero invertia la direccion de dependencias de la ADR
 * (`docs/architecture/niche-engine.md`): el nicho depende del motor, nunca al
 * reves. Un vertical nuevo hereda estas garantias sin copiar nada.
 */
import { z } from "zod";

const RESERVED_WINDOWS_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

const TRAVERSAL_OR_ENCODED_SEPARATOR = /\.\.|%2e%2e|%2f|%5c/i;
const ABSOLUTE_PATH_PREFIX = /^([/\\]|[a-zA-Z]:\\)/;

export function sanitizeFileName(fileName: string): string {
  if (fileName.includes("\u0000")) {
    throw new Error("Nombre de archivo invalido: contiene un byte nulo.");
  }

  if (TRAVERSAL_OR_ENCODED_SEPARATOR.test(fileName)) {
    throw new Error(
      "Nombre de archivo invalido: secuencia de path traversal detectada.",
    );
  }

  if (ABSOLUTE_PATH_PREFIX.test(fileName)) {
    throw new Error("Nombre de archivo invalido: ruta absoluta no permitida.");
  }

  if (fileName.length > 255) {
    throw new Error(
      "Nombre de archivo invalido: supera el limite de 255 caracteres.",
    );
  }

  const baseName = fileName.split(/[/\\]/).pop() ?? fileName;
  const nameWithoutExtension = baseName.split(".")[0]?.toUpperCase() ?? "";

  if (RESERVED_WINDOWS_NAMES.has(nameWithoutExtension)) {
    throw new Error(
      `Nombre de archivo invalido: "${nameWithoutExtension}" es un nombre reservado de Windows.`,
    );
  }

  return fileName;
}

export const photoUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  bytes: z
    .number()
    .finite()
    .positive()
    .max(10 * 1024 * 1024, "El archivo supera el limite de 10MB."),
});

export type PhotoUpload = z.infer<typeof photoUploadSchema>;
