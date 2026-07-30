import type { RenderJob } from "../contracts";

export interface RenderJobRepository {
  create(job: RenderJob): Promise<void>;
  get(jobId: string): Promise<RenderJob | null>;
  save(job: RenderJob): Promise<void>;
  /**
   * Cierra como error retryable los jobs que siguen "pending"/"rendering" y
   * llevan sin tocarse desde `staleBefore`. La cola vive en memoria: si el
   * proceso muere, sus jobs se quedan en ese estado para siempre y la UI los
   * sondea eternamente (F-11). Devuelve cuantos ha reclamado.
   */
  reclaimStale(staleBefore: string): Promise<number>;
}
