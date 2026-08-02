/**
 * La reescritura con IA, por donde puede hacer daño.
 *
 * Un modelo escribiendo anuncios inmobiliarios no falla poniéndose feo: falla
 * inventando. "A 5 minutos de la playa", "120 m²" cuando son 98, "tres
 * dormitorios" cuando hay dos. En España eso es publicidad engañosa y responde
 * la agencia. El prompt PIDE que no invente; este validador lo COMPRUEBA, que
 * no es lo mismo — por eso los tests atacan al validador y no al prompt.
 *
 * El proveedor es un doble que devuelve lo que le digamos: aquí no se prueba
 * que un modelo real se porte bien (no se puede), se prueba que da igual cómo
 * se porte.
 */
import { describe, expect, it } from "vitest";
import {
  extractNumbers,
  findInventedNumbers,
  RewriteRejected,
  rewriteWithAi,
  type AiProvider,
} from "@/lib/text-engine/ai-rewrite";
import { realEstateTextPolicy } from "@/niches/inmobiliaria/text-policy";

const HECHOS = {
  Precio: "245000 EUR",
  "Superficie construida": "78 m²",
  Habitaciones: 3,
  Baños: 1,
  Ciudad: "Alicante",
} as const;

const ORIGINAL =
  "Piso de 3 habitaciones y 1 baño en el Centro de Alicante, 78 m² construidos. 245.000 €.";

function proveedorQueDevuelve(texto: string): AiProvider {
  return { enabled: true, generate: async () => texto };
}

const peticion = (original: string) => ({
  original,
  tone: "neutral" as const,
  facts: HECHOS,
  policy: realEstateTextPolicy,
  maxLength: 420,
  locale: "es-ES",
});

describe("extractNumbers — normaliza para poder comparar", () => {
  it("iguala separadores de miles y decimales", () => {
    // "245.000 €" y "245000" son el mismo numero. Sin esto, cada precio
    // formateado pareceria una invencion.
    expect(extractNumbers("245.000 €")).toEqual(["245000"]);
    expect(extractNumbers("98,5 m²")).toEqual(["985"]);
    expect(extractNumbers("1.ª planta")).toEqual(["1"]);
  });

  it("no ve numeros donde no los hay", () => {
    expect(extractNumbers("Piso luminoso en zona tranquila")).toEqual([]);
  });
});

describe("findInventedNumbers — la regla que sostiene todo", () => {
  it("acepta los numeros que ya estaban en el original", () => {
    expect(
      findInventedNumbers(ORIGINAL, "3 habitaciones, 1 baño, 78 m². 245.000 €.", HECHOS),
    ).toEqual([]);
  });

  it("acepta un dato verificado aunque no estuviera en el original", () => {
    // Reordenar o completar con datos de la ficha es legitimo; inventar, no.
    expect(findInventedNumbers("Piso en Alicante", "Piso de 3 hab. en Alicante", HECHOS))
      .toEqual([]);
  });

  it("caza la distancia inventada, que es el caso tipico", () => {
    expect(
      findInventedNumbers(ORIGINAL, `${ORIGINAL} A 5 minutos de la playa.`, HECHOS),
    ).toEqual(["5"]);
  });

  it("caza una superficie cambiada", () => {
    const inventados = findInventedNumbers(
      ORIGINAL,
      "Piso de 3 habitaciones y 1 baño en Alicante, 120 m² construidos. 245.000 €.",
      HECHOS,
    );
    expect(inventados).toContain("120");
  });

  it("caza un año de construccion sacado de la manga", () => {
    expect(
      findInventedNumbers(ORIGINAL, `${ORIGINAL} Construido en 2015.`, HECHOS),
    ).toEqual(["2015"]);
  });

  it("no se deja engañar por el formato del numero inventado", () => {
    // "1.200" y "1200" son el mismo numero: normalizar sirve en los dos
    // sentidos, no solo para perdonar.
    expect(findInventedNumbers(ORIGINAL, `${ORIGINAL} Comunidad 1.200 €/año.`, HECHOS))
      .toEqual(["1200"]);
  });
});

describe("rewriteWithAi — la salida pasa o no pasa", () => {
  it("devuelve la reescritura cuando se porta bien", async () => {
    const limpio = "Piso de 3 habitaciones y 1 baño en Alicante. 78 m². 245.000 €.";
    await expect(
      rewriteWithAi(proveedorQueDevuelve(limpio), peticion(ORIGINAL)),
    ).resolves.toBe(limpio);
  });

  it("rechaza la sugerencia ENTERA si inventa un numero", async () => {
    // No se recorta ni se parchea: si invento una vez, el resto tampoco es de
    // fiar. Y el error dice QUE numero, para que el operador decida.
    const conInvento = `${ORIGINAL} A solo 5 minutos de la playa.`;
    try {
      await rewriteWithAi(proveedorQueDevuelve(conInvento), peticion(ORIGINAL));
      expect.unreachable("deberia haber rechazado");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(RewriteRejected);
      const rechazo = error as RewriteRejected;
      expect(rechazo.code).toBe("AI_INVENTED_NUMBERS");
      expect(rechazo.offendingNumbers).toEqual(["5"]);
    }
  });

  it("quita las frases prohibidas en vez de rechazar", async () => {
    // Mismo trato que al texto de plantilla: la frase se cae, el texto vive.
    const conFrase = "Oportunidad única: piso de 3 habitaciones en Alicante.";
    const resultado = await rewriteWithAi(
      proveedorQueDevuelve(conFrase),
      peticion(ORIGINAL),
    );
    expect(resultado.toLowerCase()).not.toContain("oportunidad única");
    expect(resultado).toContain("piso de 3 habitaciones");
  });

  it("rechaza una respuesta vacia y una que se pasa de largo", async () => {
    await expect(
      rewriteWithAi(proveedorQueDevuelve("   "), peticion(ORIGINAL)),
    ).rejects.toMatchObject({ code: "AI_EMPTY_RESPONSE" });

    await expect(
      rewriteWithAi(proveedorQueDevuelve("a".repeat(500)), peticion(ORIGINAL)),
    ).rejects.toMatchObject({ code: "AI_TOO_LONG" });
  });

  it("no llama al proveedor si la IA esta apagada", async () => {
    let llamado = false;
    const apagado: AiProvider = {
      enabled: false,
      generate: async () => {
        llamado = true;
        return "lo que sea";
      },
    };

    await expect(rewriteWithAi(apagado, peticion(ORIGINAL))).rejects.toMatchObject({
      code: "AI_DISABLED",
    });
    // Que no lance basta para el usuario; que no LLAME es lo que garantiza que
    // una instalacion sin IA no manda datos de propiedades a ningun sitio.
    expect(llamado).toBe(false);
  });
});
