/**
 * F-06: un trabajo de render se ejecuta sobre la version de la entidad con la
 * que nacio, o no se ejecuta.
 *
 * El motor toma un snapshot en `TemplateBindings`, pero quien pinta las piezas
 * son adaptadores que releen la fila viva (la ruta `/preview`, el compositor de
 * correo, el guion de video). Entre la primera pieza y la ultima pasan uno o dos
 * minutos: si alguien reordena las fotos o edita un titular a mitad, unas piezas
 * salian con los datos de antes y otras con los de despues, sin aviso — un juego
 * incoherente que ademas parecia correcto.
 *
 * La comprobacion vive en cada adaptador, dentro de la MISMA peticion que lee la
 * fila y la usa, para que no quede ventana entre comprobar y renderizar. Aqui
 * solo esta el error, para que los tres den el mismo diagnostico.
 */
import { EngineError } from "./errors";

/**
 * `expected === undefined` significa "no hay version que respetar" — es el caso
 * del preview interactivo en desarrollo, que no pertenece a ningun trabajo.
 */
export function assertEntityRevision(
  actual: number,
  expected: number | undefined,
): void {
  if (expected === undefined || actual === expected) return;

  throw new EngineError({
    code: "ENTITY_REVISION_CHANGED",
    cause:
      "La propiedad cambio despues de arrancar esta generacion, asi que las piezas no saldrian todas de la misma version.",
    solution:
      "Vuelve a generar: el juego completo se rehara con los datos actuales.",
    // No reintentable a proposito: reintentar volveria a comparar contra la
    // misma revision vieja y fallaria igual, tres veces seguidas.
    retryable: false,
    taskStatus: "blocked",
    technicalDetails: `esperada=${expected} actual=${actual}`,
  });
}
