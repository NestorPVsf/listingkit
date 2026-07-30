/**
 * PoC de generalizacion (Fase 8.2): segundo vertical montado sobre el MISMO
 * motor, sin tocar una linea de `lib/engine/`.
 *
 * Una clinica dental no tiene direcciones privadas, pero tiene su equivalente:
 * notas clinicas del caso y el coste interno del tratamiento. Ninguno de los
 * dos puede acabar en un poster de Instagram. La mecanica es identica a la de
 * inmobiliaria — proyeccion publica por allowlist explicita — y eso es
 * justamente lo que se quiere demostrar: el motor no sabe de pisos ni de
 * muelas, sabe de "entidad con campos privados que produce piezas".
 */
import { z } from "zod";

const TREATMENT_CATEGORIES = [
  "implantologia",
  "ortodoncia",
  "estetica",
  "periodoncia",
  "odontopediatria",
  "prevencion",
] as const;

/** Colegiado: 2 digitos de provincia + 4-6 de numero (formato del RGCOE). */
const LICENSE_REGEX = /^\d{2}-?\d{4,6}$/;

export const treatmentInputSchema = z.object({
  // --- privado: nunca sale publicado -------------------------------------
  /** Codigo interno de la clinica ("ORTO-INV-2026-Q3"). */
  internalCode: z.string().trim().min(1).max(80),
  /** Notas clinicas del caso de referencia. Dato de salud: jamas publicable. */
  caseNotes: z.string().trim().max(4_000).optional(),
  /** Coste real para la clinica. Margen comercial: jamas publicable. */
  internalCostEur: z.number().nonnegative().optional(),

  // --- publico ------------------------------------------------------------
  treatmentName: z.string().trim().min(3).max(80),
  category: z.enum(TREATMENT_CATEGORIES),
  summary: z.string().trim().min(20).max(600),
  priceFromEur: z.number().positive(),
  priceIncludesVat: z.boolean(),
  priceIncludes: z.array(z.string().trim().min(1)).min(1).max(8),
  sessions: z.number().int().positive().max(60),
  sessionMinutes: z.number().int().positive().max(480),
  financingAvailable: z.boolean(),
  /** TAE obligatoria si se anuncia financiacion (Ley 16/2011). */
  financingApr: z.number().nonnegative().optional(),
  clinic: z.object({
    name: z.string().trim().min(1),
    city: z.string().trim().min(1),
    phone: z.string().trim().min(9),
    email: z.string().trim().email(),
    bookingUrl: z
      .string()
      .trim()
      .url()
      .refine((value) => /^https:\/\//i.test(value), {
        message: "La URL de reserva debe empezar por https://",
      })
      .optional(),
  }),
  /** Profesional responsable: el RD 1907/1996 exige identificarlo. */
  professional: z.object({
    name: z.string().trim().min(1),
    licenseNumber: z
      .string()
      .trim()
      .regex(LICENSE_REGEX, "Numero de colegiado invalido (formato NN-NNNNNN)."),
  }),
  cta: z.string().trim().min(1).max(60),
  photoAssetIds: z.array(z.string().uuid()).min(1).max(10),
  primaryPhotoAssetId: z.string().uuid(),
  /** Afirmaciones que la clinica declara poder acreditar documentalmente. */
  explicitlyAllowedClaims: z.array(z.string().trim().min(1)).default([]),
});

export type TreatmentInput = z.infer<typeof treatmentInputSchema>;

/**
 * Allowlist publica POR INCLUSION, igual que `PublicPropertyView`. Los tres
 * campos privados de arriba no estan aqui, y su ausencia es deliberada: un
 * campo nuevo en el schema no se publica hasta que alguien lo anade a mano.
 */
export type PublicTreatmentInput = Omit<
  TreatmentInput,
  "internalCode" | "caseNotes" | "internalCostEur"
>;

export const toPublicTreatmentInput = (
  input: Readonly<TreatmentInput>,
): PublicTreatmentInput => ({
  treatmentName: input.treatmentName,
  category: input.category,
  summary: input.summary,
  priceFromEur: input.priceFromEur,
  priceIncludesVat: input.priceIncludesVat,
  priceIncludes: input.priceIncludes,
  sessions: input.sessions,
  sessionMinutes: input.sessionMinutes,
  financingAvailable: input.financingAvailable,
  financingApr: input.financingApr,
  clinic: input.clinic,
  professional: input.professional,
  cta: input.cta,
  photoAssetIds: input.photoAssetIds,
  primaryPhotoAssetId: input.primaryPhotoAssetId,
  explicitlyAllowedClaims: input.explicitlyAllowedClaims,
});
