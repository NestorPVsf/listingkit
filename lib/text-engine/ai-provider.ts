/**
 * Punto de extension opcional para generacion de texto asistida por IA.
 * v1 es 100% plantillas locales deterministas — este proveedor NUNCA se
 * invoca desde `generatePropertyTexts` todavia. Existe solo para que una
 * fase futura pueda enchufar un modelo real sin tocar el contrato del
 * motor.
 *
 * Reglas de la interfaz (impuestas por diseño, no solo documentadas):
 * - `enabled` debe ser `false` salvo que una implementacion concreta la
 *   active a proposito.
 * - Cualquier implementacion real vive server-only: la API key sale de
 *   una variable de entorno de servidor, nunca se expone al cliente.
 */
export interface AiProvider {
  readonly enabled: boolean;
  readonly generate: (prompt: string) => Promise<string>;
}

/**
 * Implementacion no-op: documenta el contrato sin ejecutar ninguna
 * llamada externa. Sirve de default seguro mientras no exista un
 * proveedor real.
 *
 * ponytail: no se implementa un provider real en v1 — YAGNI hasta que el
 * PLAN.md lo pida explicitamente.
 */
export const noopAiProvider: AiProvider = {
  enabled: false,
  generate: async () => {
    throw new Error(
      "AiProvider no implementado en v1: el motor de texto usa solo plantillas locales.",
    );
  },
};
