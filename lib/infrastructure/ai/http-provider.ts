/**
 * Proveedor de texto por HTTP, compatible con la API de chat de OpenAI.
 *
 * Sin SDK y sin vendedor fijo a proposito: el mismo adaptador vale para OpenAI,
 * OpenRouter, un gateway propio o un modelo local, cambiando una variable de
 * entorno. Una dependencia menos que mantener y una decision menos que tomar
 * ahora — quien instale elige.
 *
 * **Apagado por defecto.** Sin `AI_TEXT_ENABLED=1` el proveedor dice que no y
 * la aplicacion se comporta exactamente como antes. Y si esta encendido pero
 * mal configurado, falla al arrancar con el nombre de la variable que falta,
 * en vez de dar error en la cara del operador a mitad de una reescritura.
 *
 * La key vive SOLO en el servidor. Esta ruta no se importa desde ningun
 * componente de cliente; quien la use es un route handler.
 */
import type { AiProvider } from "@/lib/text-engine/ai-rewrite";

/** Techo de la llamada: un operador esperando no aguanta mas, y colgado menos. */
const TIMEOUT_MS = 20_000;

interface RespuestaChat {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

function exigir(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor || valor.trim().length === 0) {
    throw new Error(
      `${nombre}_MISSING: la reescritura con IA esta activada (AI_TEXT_ENABLED=1) pero falta ${nombre}.`,
    );
  }
  return valor.trim();
}

export function createHttpAiProvider(): AiProvider {
  const enabled = process.env.AI_TEXT_ENABLED === "1";

  return {
    enabled,

    async generate(prompt: string, signal?: AbortSignal): Promise<string> {
      if (!enabled) throw new Error("AI_TEXT_DISABLED");

      // Se leen aqui y no al construir el modulo: asi la app arranca aunque la
      // configuracion este a medias, y solo falla quien pulsa el boton.
      const baseUrl = process.env.AI_TEXT_BASE_URL?.trim() || "https://api.openai.com/v1";
      const apiKey = exigir("AI_TEXT_API_KEY");
      // Sin valor por defecto A PROPOSITO: un modelo por defecto envejece en
      // silencio y acaba apuntando a algo retirado. Que lo diga quien instala.
      const model = exigir("AI_TEXT_MODEL");

      const abort = new AbortController();
      const temporizador = setTimeout(() => abort.abort(), TIMEOUT_MS);
      signal?.addEventListener("abort", () => abort.abort(), { once: true });

      try {
        const respuesta = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            // Baja a proposito: esto reescribe un anuncio con datos reales, no
            // busca originalidad. Menos temperatura, menos ganas de adornar.
            temperature: 0.3,
            max_tokens: 700,
          }),
          signal: abort.signal,
        });

        if (!respuesta.ok) {
          // El cuerpo del error puede traer la key o rutas del servidor: se
          // registra el codigo y nada mas.
          throw new Error(`AI_PROVIDER_HTTP_${respuesta.status}`);
        }

        const cuerpo = (await respuesta.json()) as RespuestaChat;
        return cuerpo.choices?.[0]?.message?.content ?? "";
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("AI_PROVIDER_TIMEOUT");
        }
        throw error;
      } finally {
        clearTimeout(temporizador);
      }
    },
  };
}
