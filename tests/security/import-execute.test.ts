/**
 * La fase que ESCRIBE de la importación, contra Prisma real.
 *
 * Dos propiedades que importan más que "crea filas":
 *
 * 1. **Entera o nada.** Si fallan las fotos no se escribe una ficha a medias:
 *    media propiedad en la cartera es peor que ninguna, porque nadie la revisa
 *    hasta que sale mal publicada.
 * 2. **Un fallo no tumba el lote.** De 40 propiedades, 3 con el CDN caído no
 *    pueden obligar a repetir las 37 buenas.
 *
 * `fetch` se sustituye para devolver imágenes de verdad —generadas con sharp,
 * porque `storeImageUpload` las recodifica y rechazaría bytes falsos— sin salir
 * a la red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { importCandidates } from "@/niches/inmobiliaria/import/execute";
import { readKyeroFeed, type ImportDefaults } from "@/niches/inmobiliaria/import/kyero";
import { prisma } from "@/lib/prisma";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

const DEFAULTS: ImportDefaults = {
  agencyName: "Agencia Test",
  agentName: "Ana Test",
  agentPhone: "+34 600 00 00 00",
  agentEmail: "ana@example.com",
  cta: "Solicita visita",
};

function propiedad(id: string, fotos = 3): string {
  const imagenes = Array.from({ length: fotos }, (_, i) =>
    `<image id="${i}"><url>https://cdn.example.com/${id}-${i}.jpg</url></image>`,
  ).join("");
  return `<property>
    <id>${id}</id><ref>REF-${id}</ref>
    <price>245000</price><currency>EUR</currency><price_freq>sale</price_freq>
    <type>Apartment</type><town>Alicante</town><province>Alicante</province>
    <beds>3</beds><baths>1</baths><pool>0</pool>
    <surface_area><built>78</built></surface_area>
    <desc><es>Piso en el centro con mucha luz.</es></desc>
    <images>${imagenes}</images>
  </property>`;
}

const feed = (cuerpo: string) => `<?xml version="1.0"?><kyero>${cuerpo}</kyero>`;

let jpegValido: Buffer;

beforeEach(async () => {
  jpegValido = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#cccccc" },
  })
    .jpeg()
    .toBuffer();

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(new Uint8Array(jpegValido), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    ),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.property.deleteMany({ where: { externalRef: { startsWith: "T-" } } });
});

describe("importCandidates", () => {
  it("crea la propiedad con sus fotos", async () => {
    const informe = readKyeroFeed(feed(propiedad("T-1")), DEFAULTS);
    const resumen = await importCandidates(informe.candidates, null);

    expect(resumen.created).toBe(1);
    expect(resumen.failed).toBe(0);

    const fila = await prisma.property.findUnique({
      where: { externalRef: "T-1" },
      include: { photos: true },
    });
    expect(fila?.city).toBe("Alicante");
    expect(fila?.price).toBe(245_000);
    expect(fila?.photos).toHaveLength(3);
    // El feed no trae dirección exacta y eso tiene que quedar visible.
    expect(fila?.privateAddress).toContain("PENDIENTE");
  });

  it("reimportar el mismo feed ACTUALIZA, no duplica", async () => {
    // Es la razón de ser de `externalRef`: una agencia reimporta su fichero
    // cada semana y no puede acabar con la cartera multiplicada.
    const informe = readKyeroFeed(feed(propiedad("T-2")), DEFAULTS);
    await importCandidates(informe.candidates, null);
    const segunda = await importCandidates(informe.candidates, null);

    expect(segunda.updated).toBe(1);
    expect(segunda.created).toBe(0);
    expect(await prisma.property.count({ where: { externalRef: "T-2" } })).toBe(1);
  });

  it("al reimportar sube la revisión, porque cambian las piezas", async () => {
    const informe = readKyeroFeed(feed(propiedad("T-3")), DEFAULTS);
    await importCandidates(informe.candidates, null);
    await importCandidates(informe.candidates, null);

    const fila = await prisma.property.findUniqueOrThrow({
      where: { externalRef: "T-3" },
      select: { revision: true, photos: true },
    });
    expect(fila.revision).toBe(2);
    // Y las fotos se reemplazan, no se acumulan.
    expect(fila.photos).toHaveLength(3);
  });

  it("NO escribe una ficha a medias si no bajan las fotos suficientes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    const informe = readKyeroFeed(feed(propiedad("T-4")), DEFAULTS);
    const resumen = await importCandidates(informe.candidates, null);

    expect(resumen.failed).toBe(1);
    expect(resumen.results[0]!.reason).toMatch(/fotos/i);
    expect(await prisma.property.count({ where: { externalRef: "T-4" } })).toBe(0);
  });

  it("una propiedad que falla no tumba las demás del lote", async () => {
    // La que tiene 1 foto no llega al mínimo; la otra debe entrar igual.
    const informe = readKyeroFeed(
      feed(propiedad("T-5") + propiedad("T-6", 1)),
      DEFAULTS,
    );
    const resumen = await importCandidates(informe.candidates, null);

    expect(resumen.created).toBe(1);
    expect(resumen.failed).toBe(1);
    expect(await prisma.property.count({ where: { externalRef: "T-5" } })).toBe(1);
  });

  it("ni siquiera intenta las que el informe marcó como bloqueadas", async () => {
    const informe = readKyeroFeed(
      feed(propiedad("T-7").replace("<type>Apartment</type>", "<type>Cortijo</type>")),
      DEFAULTS,
    );
    const resumen = await importCandidates(informe.candidates, null);

    expect(resumen.failed).toBe(1);
    expect(resumen.results[0]!.reason).toContain("type");
    expect(fetch).not.toHaveBeenCalled();
  });
});
