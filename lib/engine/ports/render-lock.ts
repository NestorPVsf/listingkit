/**
 * Exclusion entre procesos al renderizar una entidad — segunda mitad de F-05.
 *
 * La cola de `create-app.ts` deduplica y pone techo, pero vive en memoria: solo
 * protege DENTRO de un proceso. Con dos instancias —un despliegue solapado
 * basta— las dos rendetizaban la misma propiedad a la vez.
 *
 * El lease **caduca solo**. Es lo que evita el fallo clasico de los locks: un
 * proceso que muere a mitad de render dejaria la entidad bloqueada para
 * siempre, y arreglarlo requeriria entrar a mano en la base de datos.
 */
export interface RenderLock {
  /**
   * Intenta tomar la entidad para este job. Devuelve `false` si otro job la
   * tiene y su lease sigue vivo. Volver a pedirlo con el MISMO `jobId` renueva
   * el lease en vez de fallar: un reintento del mismo trabajo no es un
   * conflicto.
   */
  acquire(entityId: string, jobId: string, ttlMs: number): Promise<boolean>;

  /** Libera solo si el lease sigue siendo de este job. */
  release(entityId: string, jobId: string): Promise<void>;
}

/**
 * Lock en memoria, para tests y para composiciones donde no hay base de datos.
 * Da la exclusion dentro del proceso, que es exactamente lo que ya daba la cola
 * — util para probar el comportamiento del motor, inutil como candado real.
 */
export function createInMemoryRenderLock(): RenderLock {
  const leases = new Map<string, { jobId: string; expiresAt: number }>();

  return {
    async acquire(entityId, jobId, ttlMs) {
      const ahora = Date.now();
      const actual = leases.get(entityId);
      if (actual && actual.expiresAt > ahora && actual.jobId !== jobId) {
        return false;
      }
      leases.set(entityId, { jobId, expiresAt: ahora + ttlMs });
      return true;
    },

    async release(entityId, jobId) {
      if (leases.get(entityId)?.jobId === jobId) leases.delete(entityId);
    },
  };
}
