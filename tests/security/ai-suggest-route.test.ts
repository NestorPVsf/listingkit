/**
 * La ruta de sugerencia, de punta a punta con el proveedor simulado.
 *
 * Los tests de `ai-rewrite` prueban el validador aislado. Esto prueba lo otro,
 * que es donde se rompen las cosas: que los hechos permitidos salgan de la
 * propiedad REAL (y no de una lista inventada en el test), que el guardarraíl
 * de datos privados se aplique también a lo que escribe el modelo, y que un
 * fallo del proveedor no devuelva su mensaje crudo al navegador.
 *
 * Se sustituye `fetch`, no el proveedor: así se ejercita también el adaptador
 * HTTP y el mapeo de errores, que es código que si no nadie mira.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as sugerir } from "@/app/api/properties/[propertyId]/piece-text/suggest/route";
import { prisma } from "@/lib/prisma";

const DIRECCION_PRIVADA = "Calle Secreta 14, 3º B, 03001 Alicante";

let propertyId: string;
let fetchOriginal: typeof globalThis.fetch;

function respuestaDelModelo(texto: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: texto } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const peticion = (text: string) =>
  new Request("http://localhost/test", {
    method: "POST",
    body: JSON.stringify({ text }),
  });

const contexto = () => ({ params: Promise.resolve({ propertyId }) });

beforeEach(async () => {
  process.env.AI_TEXT_ENABLED = "1";
  process.env.AI_TEXT_API_KEY = "clave-de-prueba";
  process.env.AI_TEXT_MODEL = "modelo-de-prueba";
  fetchOriginal = globalThis.fetch;

  const row = await prisma.property.create({
    data: {
      internalName: "Test IA",
      operation: "sale",
      propertyType: "apartment",
      price: 245_000,
      currency: "EUR",
      city: "Alicante",
      district: "Centro",
      privateAddress: DIRECCION_PRIVADA,
      builtAreaM2: 78,
      bedrooms: 3,
      bathrooms: 1,
      condition: "good",
      description: "Piso en el centro.",
      highlights: ["luminoso"],
      cta: "Solicita visita",
      agentName: "Ana",
      agentPhone: "600000000",
      agentEmail: "ana@example.com",
      agencyName: "Agencia",
    },
    select: { id: true },
  });
  propertyId = row.id;
});

afterEach(async () => {
  globalThis.fetch = fetchOriginal;
  delete process.env.AI_TEXT_ENABLED;
  delete process.env.AI_TEXT_API_KEY;
  delete process.env.AI_TEXT_MODEL;
  await prisma.property.delete({ where: { id: propertyId } }).catch(() => undefined);
});

describe("POST /piece-text/suggest", () => {
  it("devuelve la reescritura cuando respeta los datos de la ficha", async () => {
    globalThis.fetch = vi.fn(async () =>
      respuestaDelModelo("Piso de 3 habitaciones y 1 baño en Centro, Alicante. 78 m²."),
    ) as unknown as typeof fetch;

    const response = await sugerir(peticion("Piso de 3 hab. en Alicante, 78 m²."), contexto());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { suggestion: string };
    expect(body.suggestion).toContain("3 habitaciones");
  });

  it("rechaza si se inventa un dato que no está en la propiedad", async () => {
    // 250 m² no aparece ni en el original ni en la ficha (son 78). Los hechos
    // permitidos salen de la propiedad de verdad: si el mapeo se rompiera, este
    // test se caeria en vez de pasar por casualidad.
    globalThis.fetch = vi.fn(async () =>
      respuestaDelModelo("Espectacular piso de 250 m² en Alicante."),
    ) as unknown as typeof fetch;

    const response = await sugerir(peticion("Piso de 78 m² en Alicante."), contexto());

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string; invented: string[] };
    expect(body.error).toBe("AI_INVENTED_NUMBERS");
    expect(body.invented).toContain("250");
  });

  it("no deja pasar la dirección privada aunque la escriba el modelo", async () => {
    // Un modelo no merece mas confianza que un copia-pega: mismo filtro (F-01).
    globalThis.fetch = vi.fn(async () =>
      respuestaDelModelo(`Piso en ${DIRECCION_PRIVADA}. Una joya.`),
    ) as unknown as typeof fetch;

    const response = await sugerir(peticion("Piso en el centro."), contexto());

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("AI_LEAKS_PRIVATE_DATA");
  });

  it("no filtra el mensaje crudo del proveedor si falla", async () => {
    // El cuerpo de error de una API puede traer la key o rutas del servidor.
    globalThis.fetch = vi.fn(async () =>
      new Response("clave sk-secreta-123 invalida", { status: 401 }),
    ) as unknown as typeof fetch;

    const response = await sugerir(peticion("Piso en el centro."), contexto());
    const crudo = await response.text();

    expect(response.status).toBe(502);
    expect(crudo).not.toContain("sk-secreta-123");
    expect(crudo).toContain("AI_PROVIDER_HTTP_401");
  });

  it("con la IA apagada contesta 409 y NO llama a nadie", async () => {
    delete process.env.AI_TEXT_ENABLED;
    const espia = vi.fn();
    globalThis.fetch = espia as unknown as typeof fetch;

    const response = await sugerir(peticion("Piso en el centro."), contexto());

    expect(response.status).toBe(409);
    // Lo que garantiza que una instalacion sin IA no manda datos de las
    // propiedades de su cliente a ningun servidor de terceros.
    expect(espia).not.toHaveBeenCalled();
  });
});
