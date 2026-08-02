/**
 * Propone una reescritura del texto de una pieza. No la guarda.
 *
 * Esa distincion es el diseño, no una limitacion: la sugerencia vuelve al
 * editor, el operador la lee y decide. El validador automatico caza numeros
 * inventados, que es lo caro y lo objetivo; lo que no puede juzgar —si "zona
 * tranquila" es verdad— lo juzga quien conoce el piso.
 *
 * Cadena de comprobaciones sobre la salida del modelo, en este orden:
 *   1. Frases prohibidas de la politica del nicho (se quitan).
 *   2. Numeros que no estaban en el original ni en los datos verificados
 *      (se RECHAZA la sugerencia entera; ver lib/text-engine/ai-rewrite.ts).
 *   3. El mismo guardarrail de datos privados que un texto escrito a mano
 *      (F-01). Un modelo no tiene por que ser mas de fiar que un copia-pega.
 */
import { z } from "zod";
import { createHttpAiProvider } from "@/lib/infrastructure/ai/http-provider";
import {
  RewriteRejected,
  rewriteWithAi,
  type RewriteTone,
} from "@/lib/text-engine/ai-rewrite";
import { prisma } from "@/lib/prisma";
import { propertyFactsForAi } from "@/niches/inmobiliaria/ai-facts";
import { storedPropertyToPublicView } from "@/niches/inmobiliaria/persistence/public-view-mapper";
import { realEstateTextPolicy } from "@/niches/inmobiliaria/text-policy";
import {
  assertPublicTextOverride,
  MAX_TEXT_OVERRIDE_LENGTH,
  TextOverrideRejected,
} from "@/niches/inmobiliaria/validate-text-override";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_SUGERENCIA = 420;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_OVERRIDE_LENGTH),
  tone: z.enum(["neutral", "cercano", "sobrio"]).default("neutral"),
});

interface RouteContext {
  readonly params: Promise<{ readonly propertyId: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { propertyId } = await context.params;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "BODY_INVALID" }, { status: 400 });
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { photos: { orderBy: { order: "asc" } } },
  });
  if (!property) {
    return Response.json({ error: "PROPERTY_NOT_FOUND" }, { status: 404 });
  }

  const provider = createHttpAiProvider();
  if (!provider.enabled) {
    return Response.json(
      {
        error: "AI_DISABLED",
        detail:
          "La reescritura con IA está desactivada. Actívala con AI_TEXT_ENABLED=1 en la configuración del servidor.",
      },
      { status: 409 },
    );
  }

  const view = storedPropertyToPublicView(property);

  let sugerencia: string;
  try {
    sugerencia = await rewriteWithAi(provider, {
      original: parsed.text,
      tone: parsed.tone as RewriteTone,
      facts: propertyFactsForAi(view),
      policy: realEstateTextPolicy,
      explicitlyAllowedClaims: Array.isArray(property.explicitlyAllowedClaims)
        ? (property.explicitlyAllowedClaims as string[])
        : [],
      maxLength: MAX_SUGERENCIA,
      locale: "es-ES",
      // El mismo filtro que un texto tecleado a mano (F-01). Un modelo no
      // merece mas confianza que un copia-pega.
      assertAllowed: (texto) => {
        assertPublicTextOverride(texto, property);
      },
    });
  } catch (error: unknown) {
    if (error instanceof TextOverrideRejected) {
      return Response.json(
        { error: "AI_LEAKS_PRIVATE_DATA", field: error.field },
        { status: 422 },
      );
    }
    if (error instanceof RewriteRejected) {
      return Response.json(
        {
          error: error.code,
          // Que numeros se invento: sin esto el operador solo sabe que "algo
          // fallo" y no puede decidir si reintentar o escribirlo a mano.
          invented: error.offendingNumbers,
        },
        { status: 422 },
      );
    }
    const crudo = error instanceof Error ? error.message : String(error);
    // Igual que en la subida de assets (F-10): solo codigos estables nuestros.
    // El mensaje del proveedor puede arrastrar la key o rutas del servidor.
    const detail = /^[A-Z][A-Z0-9_]{2,63}$/.test(crudo) ? crudo : "AI_REQUEST_FAILED";
    return Response.json({ error: "AI_REQUEST_FAILED", detail }, { status: 502 });
  }

  return Response.json({ suggestion: sugerencia }, { status: 200 });
}
