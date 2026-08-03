/**
 * Importacion desde el feed del CRM. Dos pasos, y estan separados a proposito.
 *
 *   POST /api/import            (multipart, campo `feed`)  -> INFORME. No escribe.
 *   POST /api/import  { commit: true, externalIds: [...] } -> escribe lo elegido.
 *
 * El primero es lo que se le enseña a la agencia con su propio fichero delante:
 * "esto es lo que entraria y esto es lo que falta". Nadie confirma una
 * importacion masiva a ciegas, y menos sobre su cartera real.
 */
import { prisma } from "@/lib/prisma";
import { importCandidates } from "@/niches/inmobiliaria/import/execute";
import { readKyeroFeed, type ImportDefaults } from "@/niches/inmobiliaria/import/kyero";

export const runtime = "nodejs";
/** Descargar fotos de N propiedades es lento por naturaleza. */
export const maxDuration = 300;

const MAX_FEED_BYTES = 20 * 1024 * 1024;

/**
 * Los datos que el feed no trae salen de la marca configurada. Si no hay marca
 * no se puede importar: sin agente ni telefono el esquema no valida, y
 * rellenarlo con inventos seria peor.
 */
async function defaultsDeLaMarca(): Promise<
  { defaults: ImportDefaults; brandId: string } | null
> {
  const brand = await prisma.brand.findFirst({ orderBy: { createdAt: "asc" } });
  if (!brand || !brand.telefono || !brand.email) return null;
  return {
    brandId: brand.id,
    defaults: {
      agencyName: brand.nombre,
      agentName: brand.nombre,
      agentPhone: brand.telefono,
      agentEmail: brand.email,
      cta: brand.ctaHabitual ?? "Solicita visita",
      ...(brand.web ? { agencyWebsite: brand.web } : {}),
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const marca = await defaultsDeLaMarca();
  if (!marca) {
    return Response.json(
      {
        error: "BRAND_INCOMPLETE",
        detail:
          "Configura la marca con teléfono y email antes de importar: el feed no trae esos datos y sin ellos la propiedad no es válida.",
      },
      { status: 409 },
    );
  }

  const tipo = request.headers.get("content-type") ?? "";

  // --- Paso 2: confirmar. Llega el XML otra vez junto a los ids elegidos, para
  // --- no guardar el informe en sesion ni fiarse de un estado del cliente.
  if (tipo.includes("application/json")) {
    let cuerpo: { feed?: unknown; externalIds?: unknown };
    try {
      cuerpo = (await request.json()) as typeof cuerpo;
    } catch {
      return Response.json({ error: "BODY_INVALID" }, { status: 400 });
    }
    if (typeof cuerpo.feed !== "string" || !Array.isArray(cuerpo.externalIds)) {
      return Response.json({ error: "BODY_INVALID" }, { status: 400 });
    }

    const elegidos = new Set(cuerpo.externalIds.map(String));
    const informe = readKyeroFeed(cuerpo.feed, marca.defaults);
    const seleccion = informe.candidates.filter((c) => elegidos.has(c.externalId));

    const resumen = await importCandidates(seleccion, marca.brandId);
    return Response.json(resumen, { status: 200 });
  }

  // --- Paso 1: informe.
  let xml: string;
  try {
    const formulario = await request.formData();
    const fichero = formulario.get("feed");
    if (!(fichero instanceof File)) {
      return Response.json({ error: "FEED_MISSING" }, { status: 400 });
    }
    if (fichero.size > MAX_FEED_BYTES) {
      return Response.json({ error: "FEED_TOO_LARGE" }, { status: 413 });
    }
    xml = await fichero.text();
  } catch {
    return Response.json({ error: "FEED_INVALID" }, { status: 400 });
  }

  try {
    const informe = readKyeroFeed(xml, marca.defaults);
    if (informe.total === 0) {
      return Response.json(
        {
          error: "FEED_EMPTY",
          detail:
            "No se ha encontrado ninguna propiedad. ¿Es un XML de portal (formato Kyero)?",
        },
        { status: 422 },
      );
    }
    return Response.json(informe, { status: 200 });
  } catch {
    // El mensaje del parser puede traer trozos del fichero del cliente.
    return Response.json({ error: "FEED_UNREADABLE" }, { status: 422 });
  }
}

/** Para que la pantalla sepa si hay marca antes de dejar subir nada. */
export async function GET(): Promise<Response> {
  const marca = await defaultsDeLaMarca();
  return Response.json({ ready: marca !== null }, { status: 200 });
}
