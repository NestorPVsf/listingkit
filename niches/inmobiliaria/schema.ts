/**
 * Schema Zod de la instancia inmobiliaria — ver docs/architecture/niche-engine.md
 * ("Schema de la instancia inmobiliaria"). Vive fuera de `lib/engine/`: el core
 * no conoce `Property` ni ningun campo inmobiliario.
 *
 * Extension deliberada sobre el ejemplo del ADR: `energyCertificate.rating`
 * admite "en-tramite" y "exento" ademas de A-G, porque el certificado energetico
 * es obligatorio en anuncios en Espana desde 2013 y ambos estados son legales
 * (ver docs/research/propiedades-demo.md + tests/unit/property-schema.test.ts).
 */
import { z } from "zod";

const assetIdSchema = z.string().uuid();
/**
 * F-04 (review adversarial): `z.string().url()` acepta `javascript:` y `data:`,
 * y ese valor acaba como `href` del CTA en el email. El escapado HTML no
 * neutraliza protocolos activos, asi que el filtro va aqui, en la entrada.
 */
const urlSchema = z
  .string()
  .url()
  .refine((value) => /^https:\/\//i.test(value), {
    message: "La URL debe empezar por https://",
  });

export const propertyInputSchema = z
  .object({
    internalName: z.string().trim().min(1).max(120),
    operation: z.enum(["sale", "rent"]),
    propertyType: z.enum([
      "apartment",
      "house",
      "penthouse",
      "studio",
      "commercial",
      "land",
    ]),
    price: z.number().finite().positive(),
    currency: z.enum(["EUR", "USD", "GBP"]).default("EUR"),
    pricePeriod: z.enum(["month"]).optional(),
    city: z.string().trim().min(1).max(80),
    district: z.string().trim().max(80).optional(),
    publicAddress: z.string().trim().max(160).optional(),
    privateAddress: z.string().trim().min(1).max(240),
    builtAreaM2: z.number().finite().positive(),
    usableAreaM2: z.number().finite().positive().optional(),
    bedrooms: z.number().int().min(0).max(30),
    bathrooms: z.number().int().min(0).max(30),
    floor: z.string().trim().max(20).optional(),
    elevator: z.boolean(),
    terrace: z.boolean(),
    balcony: z.boolean(),
    garage: z.boolean(),
    storageRoom: z.boolean(),
    pool: z.boolean(),
    garden: z.boolean(),
    condition: z.enum(["new", "excellent", "good", "renovation-needed"]),
    constructionYear: z.number().int().min(1800).max(2100).optional(),
    energyCertificate: z
      .object({
        rating: z.enum([
          "A",
          "B",
          "C",
          "D",
          "E",
          "F",
          "G",
          "en-tramite",
          "exento",
        ]),
        identifier: z.string().trim().max(80).optional(),
      })
      .optional(),
    description: z.string().trim().min(1).max(5_000),
    highlights: z.array(z.string().trim().min(1).max(100)).max(5),
    cta: z.string().trim().min(1).max(140),
    listingUrl: urlSchema.optional(),
    agent: z.object({
      name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(5).max(30),
      email: z.string().email(),
    }),
    agency: z.object({
      name: z.string().trim().min(1).max(120),
      website: urlSchema.optional(),
    }),
    photoAssetIds: z.array(assetIdSchema).min(3).max(20),
    primaryPhotoAssetId: assetIdSchema,
    musicAssetId: assetIdSchema.optional(),
    narrationAssetId: assetIdSchema.optional(),
    explicitlyAllowedClaims: z.array(z.string().trim().min(1)).default([]),
  })
  .superRefine((value, context) => {
    if (value.operation === "rent" && value.pricePeriod !== "month") {
      context.addIssue({
        code: "custom",
        path: ["pricePeriod"],
        message: "El alquiler debe declarar el periodo mensual.",
      });
    }

    if (value.operation === "sale" && value.pricePeriod !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["pricePeriod"],
        message: "Una venta no admite periodo de precio.",
      });
    }

    if (!value.photoAssetIds.includes(value.primaryPhotoAssetId)) {
      context.addIssue({
        code: "custom",
        path: ["primaryPhotoAssetId"],
        message: "La foto principal debe pertenecer a la galeria.",
      });
    }
  });

export type PropertyInput = z.infer<typeof propertyInputSchema>;

export type PublicPropertyInput = Omit<
  PropertyInput,
  "internalName" | "privateAddress"
>;

/**
 * Elimina los campos internos ANTES de que el resolver de bindings pueda
 * tocarlos (principio del ADR: "toPublicInput se ejecuta inmediatamente
 * despues de Zod y antes de resolver bindings").
 */
export const toPublicPropertyInput = (
  input: Readonly<PropertyInput>,
): PublicPropertyInput => {
  const { internalName, privateAddress, ...publicInput } = input;
  void internalName;
  void privateAddress;
  return publicInput;
};

