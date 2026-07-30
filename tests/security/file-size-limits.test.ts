/**
 * Paso 6.1 del PLAN.md — límites de tamaño/tipo en la subida de fotos
 * (`photoUploadSchema`, lib/infrastructure/files/upload-contract.ts). Regla dura #6 de
 * spec.md / plan.md: "Fotos grandes agotan memoria" se mitiga con límite
 * 10MB + dimensiones máximas; este archivo verifica el límite de bytes en
 * el schema Zod, que es la primera línea de defensa antes de que Sharp
 * toque el buffer.
 */
import { describe, expect, it } from "vitest";
import { photoUploadSchema } from "@/lib/infrastructure/files/upload-contract";

const TEN_MB = 10 * 1024 * 1024;

describe("photoUploadSchema — límite de tamaño (10MB)", () => {
  it("rechaza un archivo de 10MB + 1 byte", () => {
    const result = photoUploadSchema.safeParse({
      fileName: "salon.jpg",
      mediaType: "image/jpeg",
      bytes: TEN_MB + 1,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un archivo notablemente mayor (50MB)", () => {
    const result = photoUploadSchema.safeParse({
      fileName: "salon.jpg",
      mediaType: "image/jpeg",
      bytes: 50 * 1024 * 1024,
    });
    expect(result.success).toBe(false);
  });

  it("acepta un archivo de exactamente 10MB (límite inclusive)", () => {
    const result = photoUploadSchema.safeParse({
      fileName: "salon.jpg",
      mediaType: "image/jpeg",
      bytes: TEN_MB,
    });
    expect(result.success).toBe(true);
  });

  it("acepta un archivo de 10MB - 1 byte", () => {
    const result = photoUploadSchema.safeParse({
      fileName: "salon.jpg",
      mediaType: "image/jpeg",
      bytes: TEN_MB - 1,
    });
    expect(result.success).toBe(true);
  });

  it("rechaza bytes negativos", () => {
    const result = photoUploadSchema.safeParse({
      fileName: "salon.jpg",
      mediaType: "image/jpeg",
      bytes: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza bytes cero", () => {
    const result = photoUploadSchema.safeParse({
      fileName: "salon.jpg",
      mediaType: "image/jpeg",
      bytes: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza bytes no finitos (Infinity)", () => {
    const result = photoUploadSchema.safeParse({
      fileName: "salon.jpg",
      mediaType: "image/jpeg",
      bytes: Number.POSITIVE_INFINITY,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza mediaType fuera del enum permitido (fingerprint falsificado grosero)", () => {
    const result = photoUploadSchema.safeParse({
      fileName: "salon.png",
      mediaType: "application/octet-stream",
      bytes: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza fileName vacío", () => {
    const result = photoUploadSchema.safeParse({
      fileName: "",
      mediaType: "image/jpeg",
      bytes: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza fileName de más de 255 caracteres", () => {
    const result = photoUploadSchema.safeParse({
      fileName: `${"a".repeat(252)}.jpg`, // 256 chars
      mediaType: "image/jpeg",
      bytes: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("acepta fileName de exactamente 255 caracteres", () => {
    const result = photoUploadSchema.safeParse({
      fileName: `${"a".repeat(251)}.jpg`, // 255 chars
      mediaType: "image/jpeg",
      bytes: 1024,
    });
    expect(result.success).toBe(true);
  });

  it(
    "HALLAZGO (documentado, no forzado) — el schema valida el mediaType " +
      "DECLARADO por el cliente (enum), no el contenido real del archivo. " +
      "Un .png con extensión falsa pero mediaType='image/png' pasaría el " +
      "schema aunque los bytes reales sean, p.ej., un ejecutable. La " +
      "verificación de magic bytes/decode real la hace Sharp más adelante " +
      "en local-asset-store.ts (falla al decodificar), pero eso ocurre " +
      "DESPUÉS de pasar photoUploadSchema — dejar constancia para 6.2: " +
      "considerar validar magic bytes antes o junto al schema si se quiere " +
      "rechazar temprano sin gastar CPU de Sharp en payloads hostiles.",
    () => {
      const result = photoUploadSchema.safeParse({
        fileName: "logo-falso.png",
        mediaType: "image/png", // declarado, no verificado contra bytes reales
        bytes: 1024,
      });
      // El schema per se NO detecta la falsificación — esto es esperado y
      // se documenta como hallazgo, no como fallo de este test.
      expect(result.success).toBe(true);
    },
  );
});
