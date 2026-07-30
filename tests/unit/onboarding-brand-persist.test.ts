/**
 * Regresion del bug de doble codificacion JSON en Brand.colores/tipografia
 * (2026-07-30): `persistBrand` (extraida de app/(main)/(setup)/onboarding/actions.ts,
 * mismo codigo que ejecuta el wizard de onboarding) guardaba estos campos Json
 * de Prisma con JSON.stringify() extra. El seed (prisma/seed.ts) siempre guardo
 * objetos planos, así que el bug solo afectaba a marcas creadas por el wizard
 * real — de ahi que el seed funcionara y el wizard rompiera el render.
 *
 * Este test usa la SQLite real (misma DB que prisma/seed.ts, ver lib/prisma.ts):
 * 1. Crea una Brand con la MISMA funcion que usa el server action del wizard.
 * 2. Verifica que la fila en DB no quedo doble-codificada (columna es objeto,
 *    no string) y que brandConfigSchema la vuelve a parsear sin problema.
 * 3. Asocia la Brand a una Property y ejecuta el flujo REAL de
 *    `loadEmailPieceData` (igual que hace text-override-plumbing.test.ts) para
 *    confirmar que el pipeline completo de render de email resuelve colores
 *    con esa marca sin lanzar excepcion.
 */
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { persistBrand } from "@/app/(main)/(setup)/onboarding/actions";
import { brandConfigSchema } from "@/niches/inmobiliaria/brand.schema";
import brandPresetsData from "@/niches/inmobiliaria/brand-presets.json";
import { loadEmailPieceData } from "@/niches/inmobiliaria/email/load-piece-data";
import { demoPropertyPayload } from "@/tests/fixtures/demo-property";

const preset = brandPresetsData.presets[0]!;

describe("persistBrand (wizard de onboarding) — persistencia de colores/tipografia", () => {
  const createdBrandIds: string[] = [];
  const createdPropertyIds: string[] = [];

  afterAll(async () => {
    for (const id of createdPropertyIds) {
      await prisma.property.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of createdBrandIds) {
      await prisma.brand.delete({ where: { id } }).catch(() => undefined);
    }
  });

  it("guarda colores/tipografia como objeto plano, no como string doble-codificado", async () => {
    const brandInput = brandConfigSchema.parse({
      nombre: `Test Wizard ${randomUUID()}`,
      logo: "/uploads/brand/test-logo.png",
      colores: preset.colores,
      tipografia: {
        display: { familia: preset.tipografia.display.familia, pesos: preset.tipografia.display.pesos },
        body: { familia: preset.tipografia.body.familia, pesos: preset.tipografia.body.pesos },
      },
      web: "https://test-wizard.example.com",
      telefono: "+34600000000",
      email: "wizard@test.example.com",
      instagram: "testwizard",
      ctaHabitual: "Contactanos",
    });

    const created = await persistBrand(brandInput);
    createdBrandIds.push(created.id);

    const row = await prisma.brand.findUniqueOrThrow({ where: { id: created.id } });

    // El bug guardaba un string JSON; una fila sana es un objeto.
    expect(typeof row.colores).not.toBe("string");
    expect(typeof row.tipografia).not.toBe("string");

    const reparsed = brandConfigSchema.safeParse({
      nombre: row.nombre,
      logo: row.logo,
      colores: row.colores,
      tipografia: row.tipografia,
      web: row.web ?? undefined,
      telefono: row.telefono ?? undefined,
      email: row.email ?? undefined,
      instagram: row.instagram ?? undefined,
      ctaHabitual: row.ctaHabitual ?? undefined,
    });
    expect(reparsed.success).toBe(true);
    expect(reparsed.success && reparsed.data.colores).toEqual(brandInput.colores);
  });

  it("una marca creada por el wizard funciona en el flujo real de render de email", async () => {
    const brandInput = brandConfigSchema.parse({
      nombre: `Test Wizard Email ${randomUUID()}`,
      logo: "/uploads/brand/test-logo-2.png",
      colores: preset.colores,
      tipografia: {
        display: { familia: preset.tipografia.display.familia, pesos: preset.tipografia.display.pesos },
        body: { familia: preset.tipografia.body.familia, pesos: preset.tipografia.body.pesos },
      },
    });
    const brand = await persistBrand(brandInput);
    createdBrandIds.push(brand.id);

    const payload = demoPropertyPayload({ photoAssetIds: [], primaryPhotoAssetId: "" });
    const property = await prisma.property.create({
      data: {
        internalName: payload.internalName,
        operation: payload.operation,
        propertyType: payload.propertyType,
        price: payload.price,
        currency: payload.currency,
        city: payload.city,
        district: payload.district,
        publicAddress: payload.publicAddress,
        privateAddress: payload.privateAddress,
        builtAreaM2: payload.builtAreaM2,
        usableAreaM2: payload.usableAreaM2,
        bedrooms: payload.bedrooms,
        bathrooms: payload.bathrooms,
        floor: payload.floor,
        elevator: payload.elevator,
        terrace: payload.terrace,
        balcony: payload.balcony,
        garage: payload.garage,
        storageRoom: payload.storageRoom,
        pool: payload.pool,
        garden: payload.garden,
        condition: payload.condition,
        constructionYear: payload.constructionYear,
        energyCertificateRating: payload.energyCertificate?.rating,
        description: payload.description,
        highlights: payload.highlights,
        cta: payload.cta,
        listingUrl: payload.listingUrl,
        agentName: payload.agent.name,
        agentPhone: payload.agent.phone,
        agentEmail: payload.agent.email,
        agencyName: payload.agency.name,
        agencyWebsite: payload.agency.website,
        brandId: brand.id,
      },
    });
    createdPropertyIds.push(property.id);

    // Antes del fix, esto NO lanzaba porque brandConfigToPieceBrand no valida
    // con zod — pero brand.colors quedaba con valores `undefined` (leer
    // propiedades de un string no arroja, JSON.parse silenciosamente ausente),
    // rompiendo el render con colores en blanco. Verificamos que resuelve al
    // valor REAL del preset, no a undefined.
    const emailData = await loadEmailPieceData(property.id, "http://localhost:3000");
    expect(emailData).not.toBeNull();
    expect(emailData?.brand.colors.primary).toBe(preset.colores.primary);
    expect(emailData?.brand.colors.background).toBe(preset.colores.background);
  });
});
