import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type { AssetRef } from "@/lib/engine/contracts";
import {
  photoUploadSchema,
  sanitizeFileName,
} from "@/lib/infrastructure/files/upload-contract";
import {
  AUDIO_OUTPUT_EXTENSION,
  AUDIO_OUTPUT_MEDIA_TYPE,
  transcodeAudio,
  type AudioTranscoder,
} from "@/lib/infrastructure/files/transcode-audio";

const imageAssetMetadataSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal("image"),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileName: z.string().min(1),
  storageKey: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const audioAssetMetadataSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal("audio"),
  mediaType: z.enum([
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
  ]),
  fileName: z.string().min(1),
  storageKey: z.string().min(1),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const storedAssetMetadataSchema = z.discriminatedUnion("kind", [
  imageAssetMetadataSchema,
  audioAssetMetadataSchema,
]);

export type StoredImageAsset = z.infer<typeof imageAssetMetadataSchema>;
export type StoredAudioAsset = z.infer<typeof audioAssetMetadataSchema>;
export type StoredAsset = z.infer<typeof storedAssetMetadataSchema>;

const MEDIA_BY_FORMAT = {
  jpeg: { mediaType: "image/jpeg", extension: ".jpg" },
  png: { mediaType: "image/png", extension: ".png" },
  webp: { mediaType: "image/webp", extension: ".webp" },
} as const;

function assetDirectory(): string {
  return path.resolve(process.cwd(), "uploads", "assets");
}

function assertAssetId(assetId: string): string {
  return z.string().uuid().parse(assetId);
}

function metadataPath(assetId: string): string {
  return path.join(assetDirectory(), `${assertAssetId(assetId)}.json`);
}

function sanitizeUploadName(fileName: string): string {
  const checked = sanitizeFileName(fileName);
  const cleaned = checked
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/g, "")
    .trim();
  if (!cleaned) {
    throw new Error("UPLOAD_FILE_NAME_INVALID");
  }
  return cleaned;
}

export async function storeImageUpload(file: File): Promise<AssetRef> {
  const safeFileName = sanitizeUploadName(file.name);
  const declared = photoUploadSchema.parse({
    fileName: safeFileName,
    mediaType: file.type,
    bytes: file.size,
  });
  const buffer = Buffer.from(await file.arrayBuffer());
  const imageMetadata = await sharp(buffer, {
    limitInputPixels: 40_000_000,
  }).metadata();
  const format =
    imageMetadata.format && imageMetadata.format in MEDIA_BY_FORMAT
      ? (imageMetadata.format as keyof typeof MEDIA_BY_FORMAT)
      : null;
  if (!format || !imageMetadata.width || !imageMetadata.height) {
    throw new Error("UPLOAD_IMAGE_INVALID");
  }

  const actual = MEDIA_BY_FORMAT[format];
  if (actual.mediaType !== declared.mediaType) {
    throw new Error("UPLOAD_MEDIA_TYPE_MISMATCH");
  }

  // Recodificamos SIEMPRE en vez de guardar el buffer original: las fotos de
  // inmuebles suelen traer EXIF con GPS y comentarios internos, y las piezas
  // publicas (email, ZIP) sirven el asset tal cual. `rotate()` aplica la
  // orientacion EXIF ANTES de descartarla, y sharp no copia metadata a la
  // salida salvo que se pida con `withMetadata()`, que aqui nunca usamos.
  const sanitized = await recodeWithoutMetadata(buffer, format);
  const sanitizedMetadata = await sharp(sanitized).metadata();
  if (!sanitizedMetadata.width || !sanitizedMetadata.height) {
    throw new Error("UPLOAD_IMAGE_INVALID");
  }

  const id = randomUUID();
  const storageFileName = `${id}${actual.extension}`;
  const storageKey = path
    .join("uploads", "assets", storageFileName)
    .replaceAll("\\", "/");
  const metadata: StoredImageAsset = {
    id,
    kind: "image",
    mediaType: actual.mediaType,
    fileName: safeFileName,
    storageKey,
    width: sanitizedMetadata.width,
    height: sanitizedMetadata.height,
    bytes: sanitized.byteLength,
    sha256: createHash("sha256").update(sanitized).digest("hex"),
  };
  const bytesToPersist = sanitized;
  const directory = assetDirectory();
  const temporarySuffix = randomUUID();
  const temporaryBinary = path.join(directory, `${id}.${temporarySuffix}.tmp`);
  const temporaryMetadata = path.join(
    directory,
    `${id}.${temporarySuffix}.json.tmp`,
  );
  const finalBinary = path.join(directory, storageFileName);
  const finalMetadata = metadataPath(id);

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryBinary, bytesToPersist, { flag: "wx" });
    await writeFile(
      temporaryMetadata,
      `${JSON.stringify(metadata)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await rename(temporaryBinary, finalBinary);
    await rename(temporaryMetadata, finalMetadata);
  } catch (error: unknown) {
    await Promise.all([
      rm(temporaryBinary, { force: true }),
      rm(temporaryMetadata, { force: true }),
    ]);
    throw error;
  }

  return metadata;
}

/** Lado largo maximo tras la recodificacion. Suficiente para 1080x1920 con margen. */
const MAX_IMAGE_DIMENSION = 2560;

/**
 * Devuelve la imagen re-codificada en su mismo formato, SIN metadata
 * (EXIF/GPS/IPTC) y con el lado largo acotado. Nunca amplia una imagen pequena.
 * sharp no copia metadata a la salida salvo `withMetadata()`, que aqui no usamos.
 */
async function recodeWithoutMetadata(
  buffer: Buffer,
  format: keyof typeof MEDIA_BY_FORMAT,
): Promise<Buffer> {
  const pipeline = sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });

  switch (format) {
    case "jpeg":
      return pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    case "png":
      return pipeline.png({ compressionLevel: 9 }).toBuffer();
    case "webp":
      return pipeline.webp({ quality: 82 }).toBuffer();
    default:
      throw new Error("UPLOAD_IMAGE_INVALID");
  }
}

/** Tope de la SUBIDA. Lo que acaba en disco es la version recodificada. */
const MAX_AUDIO_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function storeAudioUpload(
  file: File,
  transcode: AudioTranscoder = transcodeAudio,
): Promise<AssetRef> {
  const safeFileName = sanitizeUploadName(file.name);
  // El tipo declarado solo decide si aceptamos la subida; el fichero que se
  // guarda es siempre M4A/AAC, lo mandara quien lo mandara.
  audioAssetMetadataSchema.shape.mediaType.parse(file.type);
  if (file.size <= 0 || file.size > MAX_AUDIO_UPLOAD_BYTES) {
    throw new Error("UPLOAD_AUDIO_SIZE_INVALID");
  }

  // Nunca se persiste el buffer original: pesa hasta 50 MB, arrastra etiquetas
  // del fichero de origen y nadie ha comprobado que sea audio de verdad.
  const recodificado = await transcode(Buffer.from(await file.arrayBuffer()));
  // Un resultado vacio pasaria hasta el disco y solo se notaria al LEER el
  // asset: `bytes` positivo es parte del schema, asi que el JSON guardado ya no
  // valida y el audio queda ilegible para siempre. Lo destapo el test.
  if (recodificado.byteLength === 0) {
    throw new Error("UPLOAD_AUDIO_INVALID");
  }
  const id = randomUUID();
  const storageFileName = `${id}${AUDIO_OUTPUT_EXTENSION}`;
  const storageKey = path
    .join("uploads", "assets", storageFileName)
    .replaceAll("\\", "/");
  const metadata: StoredAudioAsset = {
    id,
    kind: "audio",
    mediaType: AUDIO_OUTPUT_MEDIA_TYPE,
    fileName: safeFileName,
    storageKey,
    bytes: recodificado.byteLength,
    sha256: createHash("sha256").update(recodificado).digest("hex"),
  };
  const directory = assetDirectory();
  const temporarySuffix = randomUUID();
  const temporaryBinary = path.join(directory, `${id}.${temporarySuffix}.tmp`);
  const temporaryMetadata = path.join(
    directory,
    `${id}.${temporarySuffix}.json.tmp`,
  );
  const finalBinary = path.join(directory, storageFileName);
  const finalMetadata = metadataPath(id);

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryBinary, recodificado, { flag: "wx" });
    await writeFile(
      temporaryMetadata,
      `${JSON.stringify(metadata)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await rename(temporaryBinary, finalBinary);
    await rename(temporaryMetadata, finalMetadata);
  } catch (error: unknown) {
    await Promise.all([
      rm(temporaryBinary, { force: true }),
      rm(temporaryMetadata, { force: true }),
    ]);
    throw error;
  }

  return metadata;
}

export async function getStoredAsset(
  assetId: string,
): Promise<StoredImageAsset> {
  const serialized = await readFile(metadataPath(assetId), "utf8");
  const parsed: unknown = JSON.parse(serialized);
  return imageAssetMetadataSchema.parse(parsed);
}

export async function getStoredAudioAsset(
  assetId: string,
): Promise<StoredAudioAsset> {
  const serialized = await readFile(metadataPath(assetId), "utf8");
  const parsed: unknown = JSON.parse(serialized);
  return audioAssetMetadataSchema.parse(parsed);
}

async function getAnyStoredAsset(assetId: string): Promise<StoredAsset> {
  const serialized = await readFile(metadataPath(assetId), "utf8");
  const parsed: unknown = JSON.parse(serialized);
  return storedAssetMetadataSchema.parse(parsed);
}

function absoluteAssetPath(metadata: StoredAsset): string {
  const absolutePath = path.resolve(process.cwd(), metadata.storageKey);
  const relative = path.relative(assetDirectory(), absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("ASSET_PATH_OUTSIDE_STORAGE");
  }
  return absolutePath;
}

export async function resolveStoredAudioAssetPath(
  assetId: string,
): Promise<string> {
  return absoluteAssetPath(await getStoredAudioAsset(assetId));
}

export async function readStoredAsset(
  assetId: string,
): Promise<{
  readonly metadata: StoredImageAsset;
  readonly bytes: Buffer;
}> {
  const metadata = await getStoredAsset(assetId);
  const absolutePath = absoluteAssetPath(metadata);
  return {
    metadata,
    bytes: await readFile(absolutePath),
  };
}

export async function readAnyStoredAsset(
  assetId: string,
): Promise<{
  readonly metadata: StoredAsset;
  readonly bytes: Buffer;
}> {
  const metadata = await getAnyStoredAsset(assetId);
  return {
    metadata,
    bytes: await readFile(absoluteAssetPath(metadata)),
  };
}
