import { createNicheRegistry } from "@/lib/engine/niche-registry";
import { clinicaDentalNiche } from "./clinica-dental";
import { inmobiliariaNiche } from "./inmobiliaria";

/**
 * `clinica-dental` es el PoC de generalizacion de la Fase 8.2: comparte motor,
 * registro y contratos con inmobiliaria, y ninguna de las dos sabe de la otra.
 * Registrado a proposito para que el segundo vertical se compile y se valide en
 * cada build, no solo en un test aislado.
 *
 * OJO: solo llega hasta la planificacion del job (schema → proyeccion publica →
 * bindings → gate legal → piezas). Persistencia y renderers siguen atados a
 * inmobiliaria — ver AUDIT.md, es el trabajo pendiente para hacerlo vendible.
 */
export const nicheRegistry = createNicheRegistry([
  inmobiliariaNiche,
  clinicaDentalNiche,
]);
