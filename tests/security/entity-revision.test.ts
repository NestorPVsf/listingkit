/**
 * F-06: un trabajo de render se ejecuta sobre la version de la entidad con la
 * que nacio, o no se ejecuta.
 *
 * Dos mitades, y las dos se prueban aqui:
 *
 * 1. El guardian (`assertEntityRevision`) — que detecte el desajuste y de un
 *    diagnostico util en vez de dejar pasar.
 * 2. Que la revision SUBA de verdad cuando cambia algo que altera las piezas.
 *    Sin esto el guardian es decoracion: comparar 1 contra 1 siempre pasa. Se
 *    invocan los handlers REALES contra Prisma real — replicar aqui la
 *    transaccion de la ruta seria un test que se prueba a si mismo.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postPhotoOrder } from "@/app/api/properties/[propertyId]/photo-order/route";
import { POST as postPieceText } from "@/app/api/properties/[propertyId]/piece-text/route";
import { assertEntityRevision } from "@/lib/engine/entity-revision";
import { EngineError } from "@/lib/engine/errors";
import { prisma } from "@/lib/prisma";

describe("assertEntityRevision", () => {
  it("deja pasar cuando la version coincide", () => {
    expect(() => assertEntityRevision(4, 4)).not.toThrow();
  });

  it("deja pasar cuando no hay version que respetar (preview interactivo)", () => {
    // El preview de desarrollo no pertenece a ningun trabajo: no hay nada
    // contra lo que comparar, y exigirlo cerraria la superficie de diseño.
    expect(() => assertEntityRevision(4, undefined)).not.toThrow();
  });

  it("corta cuando la entidad avanzo, con un error que se puede leer", () => {
    try {
      assertEntityRevision(5, 4);
      expect.unreachable("deberia haber lanzado");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(EngineError);
      const engineError = error as EngineError;
      expect(engineError.code).toBe("ENTITY_REVISION_CHANGED");
      // No reintentable: reintentar compararia contra la misma revision vieja.
      expect(engineError.retryable).toBe(false);
      expect(engineError.technicalDetails).toContain("esperada=4");
      expect(engineError.technicalDetails).toContain("actual=5");
    }
  });

  it("corta tambien si la entidad va POR DETRAS de lo esperado", () => {
    // No deberia ocurrir, pero la condicion es "distinto", no "mayor": un `>`
    // aqui dejaria pasar en silencio cualquier restauracion o rollback.
    expect(() => assertEntityRevision(3, 4)).toThrow(EngineError);
  });
});

describe("la revision sube con lo que cambia las piezas", () => {
  let propertyId: string;
  let photoIds: readonly string[];

  const params = () => ({ params: Promise.resolve({ propertyId }) });
  const body = (data: unknown) =>
    new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify(data),
    });

  async function revisionActual(): Promise<number> {
    const row = await prisma.property.findUniqueOrThrow({
      where: { id: propertyId },
      select: { revision: true },
    });
    return row.revision;
  }

  beforeEach(async () => {
    const marca = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const row = await prisma.property.create({
      data: {
        internalName: "Test revision",
        operation: "sale",
        propertyType: "apartment",
        price: 240_000,
        currency: "EUR",
        city: "Alicante",
        privateAddress: "Calle Privada 1",
        builtAreaM2: 90,
        bedrooms: 3,
        bathrooms: 2,
        condition: "good",
        description: "Piso de prueba para el control de version.",
        highlights: ["uno"],
        cta: "Llama",
        agentName: "Ana",
        agentPhone: "600000000",
        agentEmail: "ana@example.com",
        agencyName: "Agencia",
        primaryPhotoAssetId: `rev-a-${marca}`,
        photos: {
          create: [
            { id: `rev-a-${marca}`, path: "a.jpg", order: 0, esMain: true },
            { id: `rev-b-${marca}`, path: "b.jpg", order: 1 },
          ],
        },
      },
      select: { id: true, photos: { select: { id: true }, orderBy: { order: "asc" } } },
    });
    propertyId = row.id;
    photoIds = row.photos.map((photo) => photo.id);
  });

  afterEach(async () => {
    await prisma.property.delete({ where: { id: propertyId } });
  });

  it("una propiedad recien creada nace en la revision 1", async () => {
    expect(await revisionActual()).toBe(1);
  });

  it("reordenar fotos sube la revision aunque no se toque la fila Property", async () => {
    // El caso que `updatedAt` no habria detectado NUNCA: reordenar escribe en
    // PropertyPhoto, no en Property. Y decide que foto sale en cada pieza, asi
    // que es exactamente un cambio de version.
    const response = await postPhotoOrder(
      body({ orderedPhotoIds: [...photoIds].reverse() }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(await revisionActual()).toBe(2);
  });

  it("cambiar la foto principal sube la revision", async () => {
    const response = await postPhotoOrder(
      body({
        orderedPhotoIds: [...photoIds],
        primaryPhotoId: photoIds[1],
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(await revisionActual()).toBe(2);
  });

  it("guardar un titular editado sube la revision", async () => {
    // El titular editado se aplica a TODAS las piezas de imagen/PDF al
    // renderizar, asi que guardarlo cambia lo que sale por la impresora.
    await prisma.generatedPiece.create({
      data: { propertyId, pieceKey: "instagram-post", path: "post.png" },
    });

    const response = await postPieceText(
      body({ pieceKey: "instagram-post", text: "Un titular nuevo" }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(await revisionActual()).toBe(2);
  });

  it("un cuerpo invalido no mueve la revision", async () => {
    // Que no suba por las buenas importa tanto como que suba: cada subida
    // invalida los trabajos en curso.
    const response = await postPhotoOrder(body({ orderedPhotoIds: [] }), params());

    expect(response.status).toBe(400);
    expect(await revisionActual()).toBe(1);
  });

  it("un reorden que no cuadra con las fotos de la propiedad no mueve la revision", async () => {
    const response = await postPhotoOrder(
      body({ orderedPhotoIds: ["foto-de-otra-propiedad"] }),
      params(),
    );

    expect(response.status).toBe(400);
    expect(await revisionActual()).toBe(1);
  });
});
