/**
 * Seed real — Fase 7.1/7.2 del PLAN.md de InmoContent OS.
 *
 * Puebla la marca demo "Postiguet Homes" (docs/research/inmobiliaria-x.md,
 * preset `cercana-familiar` recomendado en docs/design/brand-presets.md) y
 * sus 3 propiedades demo (docs/research/propiedades-demo.md) con 5 fotos
 * placeholder reales cada una, generadas en el mismo storage que usa la app
 * (uploads/assets + uploads/brand) para que el render funcione de verdad.
 *
 * IDEMPOTENTE: upsert por `internalName` (Property) / `nombre` (Brand) y por
 * la clave compuesta (propertyId, order) para las fotos (@@unique en el
 * schema) — reejecutable sin duplicar filas ni ficheros.
 *
 * No usa alias `@/...`: `node prisma/seed.ts` corre con type-stripping nativo
 * de Node, que NO resuelve `paths` de tsconfig (solo bundler/tsc lo hacen).
 * Por eso reimplementa aqui, en minimo, el mismo contrato de
 * lib/infrastructure/files/local-asset-store.ts (metadata JSON +
 * binario) en vez de importarlo.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { propertyInputSchema, type PropertyInput } from "../niches/inmobiliaria/schema.ts";
import { brandConfigSchema, brandPresetSchema } from "../niches/inmobiliaria/brand.schema.ts";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
const ASSETS_DIR = path.join(UPLOADS_ROOT, "assets");
const BRAND_DIR = path.join(UPLOADS_ROOT, "brand");

// ---------------------------------------------------------------------------
// UUID deterministico (namespace por seed string) — idempotencia real: el
// mismo contenido siempre produce el mismo id/fichero, sin acumular huerfanos
// en re-ejecuciones. Formato v4 valido (zod .uuid() lo acepta).
// ---------------------------------------------------------------------------
function deterministicUuid(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function generatePlaceholderPng(
  width: number,
  height: number,
  from: string,
  to: string,
): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${from}"/>
        <stop offset="1" stop-color="${to}"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Escribe binario + metadata JSON en uploads/assets/, mismo contrato que
 * StoredImageAsset de local-asset-store.ts, y devuelve el assetId (uuid).
 */
async function seedImageAsset(seedKey: string, buffer: Buffer): Promise<string> {
  const id = deterministicUuid(seedKey);
  const storageFileName = `${id}.png`;
  const storageKey = path.join("uploads", "assets", storageFileName).replaceAll("\\", "/");
  const metadata = await sharp(buffer).metadata();
  const record = {
    id,
    kind: "image" as const,
    mediaType: "image/png" as const,
    fileName: `${seedKey.split("/").pop()}.png`,
    storageKey,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    bytes: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };

  await mkdir(ASSETS_DIR, { recursive: true });
  await writeFile(path.join(ASSETS_DIR, storageFileName), buffer);
  await writeFile(path.join(ASSETS_DIR, `${id}.json`), `${JSON.stringify(record)}\n`, "utf8");

  return id;
}

async function seedBrandLogo(): Promise<string> {
  await mkdir(BRAND_DIR, { recursive: true });
  const fileName = "postiguet-homes-demo-logo.png";
  const buffer = await generatePlaceholderPng(400, 160, "#B84826", "#357064");
  await writeFile(path.join(BRAND_DIR, fileName), buffer);
  return `/uploads/brand/${fileName}`;
}

// ---------------------------------------------------------------------------
// Marca demo — Postiguet Homes, preset cercana-familiar (docs/design/brand-presets.md)
// ---------------------------------------------------------------------------
const BRAND_NAME = "[DEMO] Postiguet Homes";

async function loadPreset(presetId: string) {
  const raw = await readFile(
    path.resolve(process.cwd(), "niches/inmobiliaria/brand-presets.json"),
    "utf8",
  );
  const parsed: unknown = JSON.parse(raw);
  const presets = (parsed as { presets: unknown[] }).presets;
  const match = presets.find((p) => (p as { id?: string }).id === presetId);
  return brandPresetSchema.parse(match);
}

// ---------------------------------------------------------------------------
// 3 propiedades demo — docs/research/propiedades-demo.md (ficticias, marcadas [DEMO])
// ---------------------------------------------------------------------------
const AGENCY = { name: "Postiguet Homes", website: "https://postiguethomes-demo.es" };

const PROPERTIES: ReadonlyArray<{
  slug: string;
  input: Omit<PropertyInput, "photoAssetIds" | "primaryPhotoAssetId">;
}> = [
  {
    slug: "piso-centro-alicante",
    input: {
      internalName: "[DEMO] Piso reforma en Centro Alicante — Postiguet Homes",
      operation: "sale",
      propertyType: "apartment",
      price: 245_000,
      currency: "EUR",
      city: "Alicante",
      district: "Centro",
      publicAddress: "Centro, Alicante (cerca C/ Alfonso el Sabio)",
      privateAddress:
        "Centro, Alicante — cerca C/ Alfonso el Sabio, 3ª planta con ascensor (dirección interna demo)",
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
      energyCertificate: { rating: "D", identifier: "9872301YH2497S0001AB" },
      description:
        "Piso luminoso de 3 habitaciones en pleno Centro de Alicante, a 5 minutos andando de la Explanada. Distribución clásica con salón independiente, cocina reformada en 2019 y balcón orientado sur con vistas abiertas a la calle. Ideal para vivir todo el año o como inversión de alquiler por su ubicación céntrica y buena comunicación con Renfe y TRAM. Edificio con ascensor y portero automático.",
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
      agency: AGENCY,
      explicitlyAllowedClaims: [],
    },
  },
  {
    slug: "apartamento-playa-san-juan",
    input: {
      internalName: "[DEMO] Apartamento con vistas al mar en Playa de San Juan — Postiguet Homes",
      operation: "sale",
      propertyType: "apartment",
      price: 385_000,
      currency: "EUR",
      city: "Alicante",
      district: "Playa de San Juan",
      publicAddress: "Playa de San Juan, Alicante (2ª línea de playa)",
      privateAddress: "Playa de San Juan, Alicante — 2ª línea de playa, 6ª planta (dirección interna demo)",
      builtAreaM2: 98,
      usableAreaM2: 92,
      bedrooms: 2,
      bathrooms: 2,
      floor: "6ª",
      elevator: true,
      terrace: true,
      balcony: false,
      garage: true,
      storageRoom: true,
      pool: true,
      garden: false,
      condition: "excellent",
      constructionYear: 2005,
      energyCertificate: { rating: "C", identifier: "4521098XH3521N0002FG" },
      description:
        "Apartamento de 2 dormitorios en última planta a 250m de la playa de San Juan, con terraza de 15m² y vistas parciales al mar. Urbanización con piscina comunitaria, garaje y trastero incluidos en el precio. Zona con gran demanda tanto de comprador nacional como internacional por su cercanía a la playa y a los servicios (supermercados, restaurantes, farmacia a pie).",
      highlights: [
        "A 250m de la playa de San Juan",
        "Terraza de 15m² con vistas al mar",
        "Garaje y trastero incluidos",
        "Última planta, sin vecinos arriba",
        "Piscina comunitaria",
      ],
      cta: "Solicita visita",
      listingUrl: "https://postiguethomes-demo.es/propiedad/playa-san-juan-1",
      agent: {
        name: "Anna Kowalski Vidal",
        phone: "+34 622 44 55 66",
        email: "anna.kowalski@postiguethomes-demo.es",
      },
      agency: AGENCY,
      explicitlyAllowedClaims: [],
    },
  },
  {
    slug: "chalet-el-campello",
    input: {
      internalName: "[DEMO] Chalet con piscina en El Campello — Postiguet Homes",
      operation: "sale",
      propertyType: "house",
      price: 495_000,
      currency: "EUR",
      city: "El Campello",
      district: "Muchavista / Els Bassars",
      publicAddress: "Urbanización Muchavista/Els Bassars, El Campello",
      privateAddress: "Urbanización Muchavista/Els Bassars, El Campello (dirección interna demo)",
      builtAreaM2: 210,
      usableAreaM2: 195,
      bedrooms: 4,
      bathrooms: 3,
      floor: undefined,
      elevator: false,
      terrace: false,
      balcony: false,
      garage: true,
      storageRoom: false,
      pool: true,
      garden: true,
      condition: "excellent",
      constructionYear: 2011,
      energyCertificate: { rating: "B", identifier: "1234567AB1234C0003HJ" },
      description:
        "Chalet independiente de 4 habitaciones en zona residencial tranquila de El Campello, a 10 minutos en coche de la playa y del centro del pueblo. Parcela de 400m² con piscina privada, jardín y garaje para 2 vehículos. Solárium en la última planta con vistas parciales al mar, ideal para familias que buscan espacio y tranquilidad sin renunciar a la cercanía de la costa. Eficiencia energética B gracias a placas solares para agua caliente y suelo radiante.",
      highlights: [
        "Piscina privada y parcela de 400m²",
        "Solárium con vistas parciales al mar",
        "Garaje para 2 coches",
        "Certificado energético B (placas solares + suelo radiante)",
        "A 10 min de la playa y del centro de El Campello",
      ],
      cta: "Solicita visita",
      listingUrl: "https://postiguethomes-demo.es/propiedad/el-campello-1",
      agent: {
        name: "Marta Llorens Peña",
        phone: "+34 633 66 77 88",
        email: "marta.llorens@postiguethomes-demo.es",
      },
      agency: AGENCY,
      explicitlyAllowedClaims: [],
    },
  },
];

const PHOTO_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ["#8a8578", "#6b6558"],
  ["#a89a86", "#8a7c68"],
  ["#7d8a7f", "#5f6b61"],
  ["#9a8a80", "#7a6b5d"],
  ["#87878a", "#6a6a6b"],
];

async function main(): Promise<void> {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  });
  const prisma = new PrismaClient({ adapter });

  try {
    // --- Brand -------------------------------------------------------------
    const preset = await loadPreset("cercana-familiar");
    const logoPath = await seedBrandLogo();
    const brandInput = brandConfigSchema.parse({
      nombre: BRAND_NAME,
      logo: logoPath,
      colores: preset.colores,
      tipografia: {
        display: { familia: preset.tipografia.display.familia, pesos: preset.tipografia.display.pesos },
        body: { familia: preset.tipografia.body.familia, pesos: preset.tipografia.body.pesos },
      },
      web: "https://postiguethomes-demo.es",
      telefono: "+34 965 00 00 00",
      email: "info@postiguethomes-demo.es",
      instagram: "postiguethomes",
      ctaHabitual: "Solicita visita",
    });

    const existingBrand = await prisma.brand.findFirst({ where: { nombre: BRAND_NAME } });
    const brandData = {
      nombre: brandInput.nombre,
      logo: brandInput.logo,
      colores: brandInput.colores,
      tipografia: brandInput.tipografia,
      web: brandInput.web,
      telefono: brandInput.telefono,
      email: brandInput.email,
      instagram: brandInput.instagram,
      ctaHabitual: brandInput.ctaHabitual,
    };
    const brand = existingBrand
      ? await prisma.brand.update({ where: { id: existingBrand.id }, data: brandData })
      : await prisma.brand.create({ data: brandData });
    console.log(`Brand OK — ${brand.nombre} (${brand.id})`);

    // --- Propiedades + fotos -------------------------------------------------
    for (const { slug, input: base } of PROPERTIES) {
      const photoAssetIds: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        const [from, to] = PHOTO_GRADIENTS[index]!;
        const buffer = await generatePlaceholderPng(800, 1000, from, to);
        const assetId = await seedImageAsset(`postiguet-homes/${slug}/foto-${index + 1}`, buffer);
        photoAssetIds.push(assetId);
      }

      const input = propertyInputSchema.parse({
        ...base,
        photoAssetIds,
        primaryPhotoAssetId: photoAssetIds[0],
      });

      const existingProperty = await prisma.property.findFirst({
        where: { internalName: input.internalName },
      });

      const propertyData = {
        brandId: brand.id,
        internalName: input.internalName,
        operation: input.operation,
        propertyType: input.propertyType,
        price: input.price,
        currency: input.currency,
        pricePeriod: input.pricePeriod,
        city: input.city,
        district: input.district,
        publicAddress: input.publicAddress,
        privateAddress: input.privateAddress,
        builtAreaM2: input.builtAreaM2,
        usableAreaM2: input.usableAreaM2,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        floor: input.floor,
        elevator: input.elevator,
        terrace: input.terrace,
        balcony: input.balcony,
        garage: input.garage,
        storageRoom: input.storageRoom,
        pool: input.pool,
        garden: input.garden,
        condition: input.condition,
        constructionYear: input.constructionYear,
        energyCertificateRating: input.energyCertificate?.rating,
        energyCertificateIdentifier: input.energyCertificate?.identifier,
        description: input.description,
        highlights: [...input.highlights],
        cta: input.cta,
        listingUrl: input.listingUrl,
        agentName: input.agent.name,
        agentPhone: input.agent.phone,
        agentEmail: input.agent.email,
        agencyName: input.agency.name,
        agencyWebsite: input.agency.website,
        primaryPhotoAssetId: input.primaryPhotoAssetId,
        explicitlyAllowedClaims: [...input.explicitlyAllowedClaims],
      };

      const property = existingProperty
        ? await prisma.property.update({ where: { id: existingProperty.id }, data: propertyData })
        : await prisma.property.create({ data: propertyData });

      for (const [index, assetId] of photoAssetIds.entries()) {
        await prisma.propertyPhoto.upsert({
          where: { propertyId_order: { propertyId: property.id, order: index } },
          update: { id: assetId, path: `${assetId}.png`, esMain: assetId === input.primaryPhotoAssetId },
          create: {
            id: assetId,
            propertyId: property.id,
            path: `${assetId}.png`,
            order: index,
            esMain: assetId === input.primaryPhotoAssetId,
          },
        });
      }

      console.log(`Property OK — ${property.internalName} (${property.id})`);
    }

    const propertyCount = await prisma.property.count({
      where: { internalName: { startsWith: "[DEMO]" } },
    });
    const photoCount = await prisma.propertyPhoto.count({
      where: { property: { internalName: { startsWith: "[DEMO]" } } },
    });
    console.log(`Resumen demo — ${propertyCount} propiedades, ${photoCount} fotos, brand ${brand.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Seed fallido:", error);
  process.exit(1);
});
