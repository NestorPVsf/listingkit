/**
 * F-05, segunda mitad: exclusion entre PROCESOS al renderizar una entidad.
 *
 * La cola de `create-app.ts` deduplica y pone techo, pero vive en memoria: solo
 * protege dentro de su proceso. Con dos instancias —un despliegue solapado
 * basta— las dos rendetizaban la misma propiedad a la vez, escribiendo sobre
 * los mismos ficheros.
 *
 * Se prueba contra la implementacion REAL de Prisma, no contra un doble: lo que
 * hay que verificar es justamente que el compare-and-swap de la base de datos
 * no deja ganar a dos, y un doble en memoria no probaria nada de eso.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPrismaRenderLock } from "@/lib/infrastructure/db/render-lock.prisma";
import { prisma } from "@/lib/prisma";

const ENTIDAD = "prop-lease-test-0001";
const OTRA_ENTIDAD = "prop-lease-test-0002";
const TTL = 60_000;

const lock = createPrismaRenderLock();

async function limpiar() {
  await prisma.renderLease.deleteMany({
    where: { entityId: { in: [ENTIDAD, OTRA_ENTIDAD] } },
  });
}

beforeEach(limpiar);
afterEach(limpiar);

describe("lease de render — dos procesos no rendetizan la misma entidad", () => {
  it("el primero entra y el segundo no", async () => {
    expect(await lock.acquire(ENTIDAD, "job-a", TTL)).toBe(true);
    expect(await lock.acquire(ENTIDAD, "job-b", TTL)).toBe(false);
  });

  it("dos peticiones simultaneas: gana exactamente una", async () => {
    // El caso que un `findFirst` + `update` no aguantaria.
    const resultados = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        lock.acquire(ENTIDAD, `job-${i}`, TTL),
      ),
    );
    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it("el mismo job puede repetir: renovar no es conflicto", async () => {
    expect(await lock.acquire(ENTIDAD, "job-a", TTL)).toBe(true);
    expect(await lock.acquire(ENTIDAD, "job-a", TTL)).toBe(true);
  });

  it("no bloquea otras entidades", async () => {
    expect(await lock.acquire(ENTIDAD, "job-a", TTL)).toBe(true);
    expect(await lock.acquire(OTRA_ENTIDAD, "job-b", TTL)).toBe(true);
  });

  it("al liberar, otro job entra", async () => {
    await lock.acquire(ENTIDAD, "job-a", TTL);
    await lock.release(ENTIDAD, "job-a");
    expect(await lock.acquire(ENTIDAD, "job-b", TTL)).toBe(true);
  });

  it("liberar un lease ajeno no se lo quita a su dueño", async () => {
    await lock.acquire(ENTIDAD, "job-a", TTL);

    await lock.release(ENTIDAD, "job-b");

    expect(await lock.acquire(ENTIDAD, "job-c", TTL)).toBe(false);
  });

  it("caduca solo: un proceso muerto no bloquea la entidad para siempre", async () => {
    // Es la propiedad que hace usable un lock en un sistema real. Sin ella,
    // un crash a mitad de render exigiria entrar a mano en la base de datos.
    expect(await lock.acquire(ENTIDAD, "job-muerto", -1_000)).toBe(true);
    expect(await lock.acquire(ENTIDAD, "job-vivo", TTL)).toBe(true);
  });

  it("no deja basura: liberar borra la fila", async () => {
    await lock.acquire(ENTIDAD, "job-a", TTL);
    await lock.release(ENTIDAD, "job-a");

    const filas = await prisma.renderLease.count({ where: { entityId: ENTIDAD } });
    expect(filas).toBe(0);
  });
});
