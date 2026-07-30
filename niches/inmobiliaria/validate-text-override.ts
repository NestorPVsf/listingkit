/**
 * Guardarrail de F-01 (review adversarial, severidad high).
 *
 * `PublicPropertyView` garantiza que ni `privateAddress` ni `internalName`
 * llegan a una plantilla... por la via normal. El editor de textos es la puerta
 * de atras: el operador escribe a mano el titular de una pieza, ese string se
 * persiste tal cual y sustituye al titular DESPUES de la proyeccion publica.
 * Copiar y pegar la direccion completa en el titular de un post de Instagram es
 * un accidente de oficina de lo mas normal.
 *
 * Aqui comparamos el texto contra los valores privados de esa propiedad con una
 * normalizacion tolerante (mayusculas, tildes, puntuacion y espacios raros).
 *
 * Que NO cubre, dicho explicitamente: no detecta la direccion reescrita a mano
 * ("c/ Secreta doce"), ni valores privados de menos de 5 caracteres utiles
 * (un internalName tipo "A1" haria saltar la alarma en cualquier frase). Es una
 * red de seguridad contra el copia-pega, no una prueba matematica.
 */

export const MAX_TEXT_OVERRIDE_LENGTH = 5_000;

/** Por debajo de esto, el valor privado es demasiado generico para comparar. */
const MIN_COMPARABLE_LENGTH = 5;

export type TextOverrideErrorCode =
  | "TEXT_OVERRIDE_EMPTY"
  | "TEXT_OVERRIDE_TOO_LONG"
  | "TEXT_OVERRIDE_LEAKS_PRIVATE_DATA";

export type PrivateField = "privateAddress" | "internalName";

export class TextOverrideRejected extends Error {
  readonly code: TextOverrideErrorCode;
  readonly field?: PrivateField;

  constructor(code: TextOverrideErrorCode, field?: PrivateField) {
    super(code);
    this.name = "TextOverrideRejected";
    this.code = code;
    this.field = field;
  }
}

export interface PrivatePropertyFields {
  readonly privateAddress?: string | null;
  readonly internalName?: string | null;
}

/** minusculas, sin tildes, sin puntuacion y con espacios colapsados. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Del valor privado sacamos varias formas comparables: la completa y el tramo
 * anterior a la primera coma (en una direccion, "calle y numero" — que es
 * justo el trozo que se pega suelto).
 */
function comparableForms(value: string): readonly string[] {
  const forms = new Set<string>();
  for (const candidate of [value, value.split(",")[0] ?? ""]) {
    const normalized = normalize(candidate);
    if (normalized.length >= MIN_COMPARABLE_LENGTH) {
      forms.add(normalized);
    }
  }
  return [...forms];
}

/**
 * Devuelve el texto ya recortado si es publicable. Lanza `TextOverrideRejected`
 * en cualquier otro caso.
 */
export function assertPublicTextOverride(
  text: string,
  privateFields: Readonly<PrivatePropertyFields>,
): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new TextOverrideRejected("TEXT_OVERRIDE_EMPTY");
  }
  if (trimmed.length > MAX_TEXT_OVERRIDE_LENGTH) {
    throw new TextOverrideRejected("TEXT_OVERRIDE_TOO_LONG");
  }

  const haystack = normalize(trimmed);
  const fields: readonly (readonly [PrivateField, string | null | undefined])[] = [
    ["privateAddress", privateFields.privateAddress],
    ["internalName", privateFields.internalName],
  ];

  for (const [field, value] of fields) {
    if (!value) continue;
    for (const form of comparableForms(value)) {
      if (haystack.includes(form)) {
        throw new TextOverrideRejected("TEXT_OVERRIDE_LEAKS_PRIVATE_DATA", field);
      }
    }
  }

  return trimmed;
}
