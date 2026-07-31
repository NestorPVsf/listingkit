/**
 * Punto de entrada del nicho para el renderer de correo genérico.
 *
 * `lib/infrastructure/render/email-renderer.ts` sabe escribir ficheros de forma
 * atomica y traducir fallos a errores del motor; lo que NO sabe es que es una
 * propiedad. Esta funcion es la costura: carga los datos del vertical, aplica
 * su plantilla y devuelve html + texto. La raiz de composicion
 * (`lib/bootstrap/create-app.ts`) es quien la enchufa.
 */
import type { EmailContent } from "@/lib/infrastructure/render/email-renderer";
import { loadEmailPieceData } from "./load-piece-data";
import { renderPropertyEmail } from "./render-email";

export async function composePropertyEmail(
  entityId: string,
  baseUrl: string,
  expectedRevision?: number,
): Promise<EmailContent | null> {
  const data = await loadEmailPieceData(entityId, baseUrl, expectedRevision);
  if (!data) return null;

  const { html, text } = renderPropertyEmail(
    data.view,
    data.brand,
    data.texts,
    data.photos,
  );
  return { html, text };
}
