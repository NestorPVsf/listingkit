/**
 * Que artefactos existen ya para una entidad, y donde.
 *
 * Nace de F-05. Hasta ahora los renderers escribian en rutas FIJAS
 * (`output/<entityId>/<fichero>`) y el empaquetador encontraba los ficheros por
 * convencion de nombre. Eso tenia dos problemas:
 *
 * - Dos procesos rendetizando la misma entidad se pisaban el fichero, y el
 *   `rm(final)` previo al `rename` dejaba una ventana en la que un lector veia
 *   el artefacto desaparecido.
 * - Regenerar una pieza cambiaba lo que descargaba un enlace antiguo: el
 *   identificador de artefacto apuntaba a una ruta mutable.
 *
 * Con rutas inmutables por job (`output/<entityId>/<jobId>/<fichero>`) la
 * convencion de nombre deja de servir para encontrar nada, asi que hace falta
 * preguntar: "de esta entidad, ¿cual es el ultimo artefacto de cada pieza?".
 * Esa pregunta es identica en todos los nichos — por eso es un puerto del motor
 * y no algo que cada vertical reimplemente a su manera.
 */
export interface StoredArtifact {
  readonly pieceKey: string;
  /** Nombre visible del fichero, tal y como entra en el ZIP. */
  readonly fileName: string;
  /** Ruta relativa al proyecto, inmutable una vez escrita. */
  readonly storageKey: string;
}

export interface ArtifactRegistry {
  /**
   * El artefacto mas reciente de cada `(pieza, nombre de fichero)` de la
   * entidad. Un carrusel devuelve sus cinco entradas; una pieza regenerada,
   * solo la ultima.
   */
  latestByEntity(entityId: string): Promise<readonly StoredArtifact[]>;
}
