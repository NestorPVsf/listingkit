/**
 * Reescritura de texto asistida por IA, con la salida verificada.
 *
 * El riesgo de un modelo escribiendo anuncios inmobiliarios no es que quede
 * feo: es que invente. "A 5 minutos de la playa", "120 m²" cuando son 98, "tres
 * dormitorios" cuando hay dos. En España eso es publicidad engañosa y responde
 * la agencia, no el proveedor del modelo. Asi que el modelo aqui **no genera,
 * reescribe**, y lo que devuelve pasa por tres filtros antes de que nadie lo
 * vea.
 *
 * El filtro que hace el trabajo de verdad es el numerico, y su regla es
 * deliberadamente estrecha:
 *
 *   una reescritura no puede introducir un numero que no estuviera ya en el
 *   texto original o entre los datos verificados de la propiedad.
 *
 * No hace falta entender la frase para cazar la invencion: basta con que
 * aparezca un 5 donde no habia ningun 5. Es barato, es determinista y no
 * depende de que otro modelo juzgue al primero.
 *
 * Lo que NO cubre, dicho claro: una invencion sin numeros ("muy luminoso",
 * "zona tranquila") pasa el filtro. Por eso la sugerencia se le PROPONE al
 * operador y no se guarda sola — la ultima verificacion es humana, y esa parte
 * es de diseño, no una limitacion pendiente de arreglar.
 */
import { sanitizeProhibitedPhrases, type TextPolicy } from "./policy";

export interface AiProvider {
  readonly enabled: boolean;
  readonly generate: (prompt: string, signal?: AbortSignal) => Promise<string>;
}

export type RewriteRejectionCode =
  | "AI_DISABLED"
  | "AI_EMPTY_RESPONSE"
  | "AI_TOO_LONG"
  | "AI_INVENTED_NUMBERS";

export class RewriteRejected extends Error {
  readonly code: RewriteRejectionCode;
  /** Los numeros inventados, para poder decir cual sin adivinar. */
  readonly offendingNumbers?: readonly string[];

  constructor(code: RewriteRejectionCode, offendingNumbers?: readonly string[]) {
    super(code);
    this.name = "RewriteRejected";
    this.code = code;
    this.offendingNumbers = offendingNumbers;
  }
}

export type RewriteTone = "neutral" | "cercano" | "sobrio";

export interface RewriteRequest {
  /** El texto que ya existe. La IA lo reescribe; nunca parte de cero. */
  readonly original: string;
  readonly tone: RewriteTone;
  /**
   * Datos verificados de la entidad (precio, m², habitaciones…). Solo se usan
   * como base de hechos permitidos: el prompt los da y el validador los exige.
   */
  readonly facts: Readonly<Record<string, string | number | null | undefined>>;
  readonly policy: TextPolicy;
  readonly explicitlyAllowedClaims?: readonly string[];
  readonly maxLength: number;
  readonly locale: string;
  /**
   * Comprobacion adicional del vertical sobre el texto ya saneado. Se ejecuta
   * ANTES del filtro numerico a proposito: si el modelo ha colado la direccion
   * privada, eso es lo que hay que decirle al operador. La direccion lleva
   * numeros (portal, piso, codigo postal), asi que el filtro numerico la
   * cazaria igual — pero informando de "se ha inventado datos", que es un
   * diagnostico peor y sugiere una accion distinta.
   *
   * El motor no sabe que es un dato privado; el nicho si. Por eso viaja como
   * funcion y no como regla aqui dentro.
   */
  readonly assertAllowed?: (text: string) => void;
}

/**
 * Todos los numeros de un texto, normalizados para poder compararlos.
 *
 * "245.000 €" y "245000" son el mismo numero, y "1.ª planta" es un 1. Se
 * quitan separadores de miles (punto en es-ES) y se conserva la parte decimal
 * como digitos: 98,5 -> "985" comparado contra "98,5" -> "985". Es tosco a
 * proposito — un falso positivo obliga a revisar a mano, que es barato; un
 * falso negativo publica un dato inventado, que no lo es.
 */
export function extractNumbers(text: string): readonly string[] {
  const crudos = text.match(/\d[\d.,]*/g) ?? [];
  return crudos
    .map((n) => n.replace(/[.,]/g, "").replace(/^0+(?=\d)/, ""))
    .filter((n) => n.length > 0);
}

function factsToNumbers(
  facts: RewriteRequest["facts"],
): ReadonlySet<string> {
  const permitidos = new Set<string>();
  for (const valor of Object.values(facts)) {
    if (valor === null || valor === undefined) continue;
    for (const n of extractNumbers(String(valor))) permitidos.add(n);
  }
  return permitidos;
}

/**
 * Comprueba que la reescritura no introduce numeros nuevos. Publica porque es
 * lo unico que hay que probar a fondo: el resto del pipeline es fontaneria.
 */
export function findInventedNumbers(
  original: string,
  rewritten: string,
  facts: RewriteRequest["facts"],
): readonly string[] {
  const permitidos = new Set([
    ...extractNumbers(original),
    ...factsToNumbers(facts),
  ]);
  const inventados = extractNumbers(rewritten).filter((n) => !permitidos.has(n));
  return [...new Set(inventados)];
}

function buildPrompt(request: Readonly<RewriteRequest>): string {
  const hechos = Object.entries(request.facts)
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== "")
    .map(([clave, valor]) => `- ${clave}: ${String(valor)}`)
    .join("\n");

  const tono = {
    neutral: "neutral y profesional",
    cercano: "cercano y cálido, tuteando",
    sobrio: "sobrio y contenido, sin adjetivos de más",
  }[request.tone];

  // El prompt describe la tarea, pero NO es la garantia: la garantia es el
  // validador de abajo. Un prompt es una peticion, no un control.
  return [
    `Reescribe el siguiente texto de un anuncio inmobiliario en ${request.locale}.`,
    `Tono: ${tono}. Máximo ${request.maxLength} caracteres.`,
    "",
    "REGLAS INNEGOCIABLES:",
    "1. No inventes ningún dato. No añadas cifras, distancias, tiempos, años ni",
    "   superficies que no estén en la lista de datos verificados o en el texto",
    "   original.",
    "2. No prometas rentabilidades, revalorizaciones ni exclusividad.",
    "3. No inventes servicios cercanos (playa, metro, colegios) que no aparezcan",
    "   en el texto original.",
    "4. Devuelve SOLO el texto reescrito, sin comillas ni explicaciones.",
    "",
    "DATOS VERIFICADOS DE LA PROPIEDAD:",
    hechos || "(ninguno)",
    "",
    "TEXTO ORIGINAL:",
    request.original,
  ].join("\n");
}

/**
 * Pide la reescritura y la valida. Devuelve el texto ya saneado, listo para
 * PROPONERSELO al operador — nunca para guardarlo sin que lo vea.
 */
export async function rewriteWithAi(
  provider: AiProvider,
  request: Readonly<RewriteRequest>,
  signal?: AbortSignal,
): Promise<string> {
  if (!provider.enabled) throw new RewriteRejected("AI_DISABLED");

  const crudo = (await provider.generate(buildPrompt(request), signal)).trim();
  if (crudo.length === 0) throw new RewriteRejected("AI_EMPTY_RESPONSE");

  // Frases prohibidas primero: son las de la politica del nicho y se quitan,
  // no se rechazan — es exactamente lo que ya se hace con el texto de plantilla.
  const saneado = sanitizeProhibitedPhrases(
    crudo,
    request.policy,
    request.explicitlyAllowedClaims ?? [],
  ).trim();

  if (saneado.length === 0) throw new RewriteRejected("AI_EMPTY_RESPONSE");
  if (saneado.length > request.maxLength) throw new RewriteRejected("AI_TOO_LONG");

  // Antes que lo numerico: ver el comentario de `assertAllowed`.
  request.assertAllowed?.(saneado);

  const inventados = findInventedNumbers(request.original, saneado, request.facts);
  if (inventados.length > 0) {
    throw new RewriteRejected("AI_INVENTED_NUMBERS", inventados);
  }

  return saneado;
}
