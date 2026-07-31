import type { RenderLock } from "@/lib/engine/ports/render-lock";
import { prisma } from "@/lib/prisma";

/**
 * Lease de render sobre la tabla `RenderLease`.
 *
 * La adquisicion es un **compare-and-swap**, no un "leer y luego escribir": el
 * `updateMany` filtra por la condicion Y escribe en la misma sentencia, asi que
 * dos procesos que lleguen a la vez no pueden ganar los dos. Un `findFirst`
 * seguido de `update` tendria justo la carrera que este fichero existe para
 * evitar.
 */
export function createPrismaRenderLock(): RenderLock {
  return {
    async acquire(entityId, jobId, ttlMs) {
      const ahora = new Date();
      const expiresAt = new Date(ahora.getTime() + ttlMs);

      // Caso normal: existe fila y esta libre (caducada) o ya es nuestra.
      const tomado = await prisma.renderLease.updateMany({
        where: {
          entityId,
          OR: [{ expiresAt: { lt: ahora } }, { jobId }],
        },
        data: { jobId, expiresAt },
      });
      if (tomado.count > 0) return true;

      // No habia fila. `create` falla por clave unica si otro proceso la creo
      // entre medias — que es exactamente la respuesta correcta: no es nuestra.
      try {
        await prisma.renderLease.create({ data: { entityId, jobId, expiresAt } });
        return true;
      } catch {
        return false;
      }
    },

    async release(entityId, jobId) {
      // Filtrado por jobId: si nuestro lease ya caduco y lo tomo otro, no se lo
      // quitamos de debajo.
      await prisma.renderLease.deleteMany({ where: { entityId, jobId } });
    },
  };
}
