/**
 * Despacha cada RenderTask al RendererPort registrado para su
 * `piece.renderer` al adaptador registrado en bootstrap.
 * Existe para no tocar playwright-renderer.ts (restriccion del brief) y para
 * Los kinds sin adaptador siguen devolviendo NOT_IMPLEMENTED.
 * Las sub-sesiones se abren de forma perezosa (solo si el job las necesita)
 * y se DEDUPLICAN por instancia de RendererPort (no por kind): si "pdf" e
 * "image" apuntan al MISMO createPlaywrightRenderer(...), un job que pida
 * ambos tipos de pieza reutiliza un unico browser/pagina, igual que antes
 * de introducir este composite. Se cierran todas al finalizar el job.
 */
import type { RenderJob, RenderTask, RendererKind } from "@/lib/engine/contracts";
import { EngineError } from "@/lib/engine/errors";
import type { RendererPort, RenderSession } from "@/lib/engine/ports/renderer";

export type RendererByKind = Partial<Record<RendererKind, RendererPort>>;

export function createCompositeRenderer(renderers: RendererByKind): RendererPort {
  return {
    async open(job: Readonly<RenderJob>): Promise<RenderSession> {
      const sessionsByPort = new Map<RendererPort, Promise<RenderSession>>();

      const sessionFor = (kind: RendererKind): Promise<RenderSession> => {
        const port = renderers[kind];
        if (!port) {
          return Promise.reject(
            new EngineError({
              code: "NOT_IMPLEMENTED",
              cause: `El renderer "${kind}" no esta implementado en este paso.`,
              solution: "Completa la fase correspondiente antes de reintentar.",
              retryable: false,
              taskStatus: "blocked",
            }),
          );
        }
        const existing = sessionsByPort.get(port);
        if (existing) return existing;

        const opened = port.open(job);
        sessionsByPort.set(port, opened);
        return opened;
      };

      return {
        async render(currentJob: Readonly<RenderJob>, task: Readonly<RenderTask>) {
          const session = await sessionFor(task.piece.renderer);
          return session.render(currentJob, task);
        },
        async close() {
          await Promise.all(
            Array.from(sessionsByPort.values()).map(async (sessionPromise) => {
              const session = await sessionPromise;
              await session.close();
            }),
          );
        },
      };
    },
  };
}
