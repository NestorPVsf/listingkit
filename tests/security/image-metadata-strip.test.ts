/**
 * F-02 (review adversarial): las fotos de inmuebles suelen traer EXIF con GPS.
 * Antes se guardaba el buffer original y el email servia ese asset tal cual, asi
 * que cualquier destinatario podia extraer las coordenadas del inmueble con un
 * lector EXIF — saltandose por completo la promesa "la direccion privada nunca
 * sale". La ingesta ahora recodifica y descarta toda la metadata.
 */
import { afterAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  readStoredAsset,
  storeImageUpload,
} from "@/lib/infrastructure/files/local-asset-store";

const storedIds: string[] = [];

/** JPEG con EXIF: coordenadas GPS + comentario con datos internos. */
async function jpegWithExifGps(): Promise<Buffer> {
  return sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
    .withMetadata({
      exif: {
        IFD0: {
          ImageDescription: "Calle Secreta 14, 3o B — NO PUBLICAR",
          Copyright: "Postiguet Homes",
        },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "38/1 20/1 4321/100",
          GPSLongitudeRef: "W",
          GPSLongitude: "0/1 28/1 5678/100",
        },
      },
    })
    .jpeg()
    .toBuffer();
}

function asFile(bytes: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

afterAll(async () => {
  await Promise.all(
    storedIds.flatMap((id) => [
      rm(path.resolve(process.cwd(), "uploads", "assets", `${id}.jpg`), {
        force: true,
      }),
      rm(path.resolve(process.cwd(), "uploads", "assets", `${id}.json`), {
        force: true,
      }),
    ]),
  );
});

describe("ingesta de imagenes — eliminacion de metadata", () => {
  it("el JPEG original lleva EXIF con GPS (control del test)", async () => {
    const original = await sharp(await jpegWithExifGps()).metadata();
    expect(original.exif).toBeDefined();
  });

  it("el asset almacenado no conserva EXIF ni GPS", async () => {
    const bytes = await jpegWithExifGps();
    const stored = await storeImageUpload(
      asFile(bytes, "fachada.jpg", "image/jpeg"),
    );
    storedIds.push(stored.id);

    const persisted = await readStoredAsset(stored.id);
    const metadata = await sharp(persisted.bytes).metadata();

    expect(metadata.exif).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("los bytes guardados no contienen la direccion incrustada en EXIF", async () => {
    const bytes = await jpegWithExifGps();
    const stored = await storeImageUpload(
      asFile(bytes, "salon.jpg", "image/jpeg"),
    );
    storedIds.push(stored.id);

    const persisted = await readStoredAsset(stored.id);
    const raw = persisted.bytes.toString("latin1");

    expect(raw).not.toContain("Calle Secreta");
    expect(raw).not.toContain("NO PUBLICAR");
  });

  it("la metadata registrada describe el derivado, no el original", async () => {
    const bytes = await jpegWithExifGps();
    const stored = await storeImageUpload(
      asFile(bytes, "cocina.jpg", "image/jpeg"),
    );
    storedIds.push(stored.id);

    const persisted = await readStoredAsset(stored.id);
    expect(persisted.metadata.bytes).toBe(persisted.bytes.byteLength);
    expect(persisted.metadata.width).toBe(800);
    expect(persisted.metadata.height).toBe(600);
  });

  it("acota el lado largo de imagenes enormes sin deformar", async () => {
    const huge = await sharp({
      create: {
        width: 5000,
        height: 2500,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .jpeg()
      .toBuffer();

    const stored = await storeImageUpload(
      asFile(huge, "panoramica.jpg", "image/jpeg"),
    );
    storedIds.push(stored.id);

    expect(stored.kind).toBe("image");
    if (stored.kind !== "image") return;
    expect(stored.width).toBe(2560);
    expect(stored.height).toBe(1280);
  });
});
