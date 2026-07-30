/**
 * Regresion de F-12 (review adversarial): `waitUntilReady` espera dentro de un
 * `page.evaluate()` a que TODAS las imagenes decodifiquen, y `evaluate` no
 * tiene timeout propio. Una foto que nunca responde dejaba la captura colgada
 * para siempre y, como la cola de render es serial y global, congelaba tambien
 * todos los trabajos posteriores: ni error, ni diagnostico, ni forma de salir
 * salvo reiniciar el proceso.
 *
 * Aqui montamos justo ese caso —un <img> cuya respuesta nunca llega— y
 * exigimos que la captura muera sola con un error retryable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { rm } from "node:fs/promises";
import path from "node:path";
import { createPlaywrightRenderer } from "@/lib/infrastructure/render/playwright-renderer";
import { EngineError } from "@/lib/engine/errors";
import type { RenderJob, RenderTask } from "@/lib/engine/contracts";

const ENTITY_ID = "prop-timeout-regression";
const OUTPUT_DIR = path.resolve(process.cwd(), "output", ENTITY_ID);

let server: Server;
let baseUrl: string;
/** Sockets de la peticion que dejamos colgada, para poder cerrarlos al final. */
const hangingResponses: Array<{ destroy(): void }> = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url?.startsWith("/foto-que-nunca-llega")) {
      // Ni respondemos ni cerramos: exactamente lo que hace un asset colgado.
      hangingResponses.push(response.socket ?? { destroy: () => undefined });
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      `<!doctype html><html><body><div data-piece-canvas>
         <img src="/foto-que-nunca-llega.png" alt="">
       </div></body></html>`,
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  for (const socket of hangingResponses) socket.destroy();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await rm(OUTPUT_DIR, { recursive: true, force: true });
});

function job(): RenderJob {
  return {
    id: "job-timeout-0001",
    nicheId: "inmobiliaria",
    entityId: ENTITY_ID,
    entityRevision: 1,
    status: "rendering",
    request: { requestedPieceKeys: [], priority: "normal", correlationId: "c1" },
    bindings: {} as RenderJob["bindings"],
    tasks: [],
    createdAt: "2026-07-30T10:00:00.000Z",
    updatedAt: "2026-07-30T10:00:00.000Z",
  };
}

const task = {
  id: "task-timeout-0001",
  piece: { key: "instagram-post", renderer: "image" },
  status: "rendering",
  attempt: 1,
  artifacts: [],
} as unknown as RenderTask;

describe("playwright renderer — techo duro por captura", () => {
  it(
    "aborta con error retryable en vez de colgarse cuando un asset no responde",
    async () => {
      const renderer = createPlaywrightRenderer({
        baseUrl,
        captureTimeoutMs: 3_000,
        resolvePlan: () => [
          {
            previewId: "post-instagram",
            fileName: "post-instagram.png",
            variant: "post",
            kind: "image",
            width: 1080,
            height: 1350,
          },
        ],
      });

      const session = await renderer.open(job());
      const startedAt = Date.now();
      try {
        await expect(session.render(job(), task)).rejects.toMatchObject({
          code: "PLAYWRIGHT_CAPTURE_TIMEOUT",
          retryable: true,
        });
      } finally {
        await session.close();
      }

      // Muere por el techo propio, no por agotar el timeout del test.
      expect(Date.now() - startedAt).toBeLessThan(20_000);
    },
    45_000,
  );

  it("el error de timeout no filtra el stderr ni rutas locales", async () => {
    const error = new EngineError({
      code: "PLAYWRIGHT_CAPTURE_TIMEOUT",
      cause: "La captura de \"post\" supero el techo de 3000 ms.",
      solution: "Revisa los assets de la propiedad y reintenta.",
      retryable: true,
    });
    expect(error.technicalDetails).toBeUndefined();
  });
});
