/**
 * Contrato entre un nicho y el empaquetador ZIP.
 *
 * El empaquetador sabe leer artefactos de disco, hashearlos, comprimirlos,
 * escribir el ZIP de forma atomica y declarar lo que falta. Lo que NO puede
 * saber es que una pieza `instagram-carousel` son cinco PNG numerados, que el
 * paquete lleva un `datos-propiedad.json`, ni como se llama el fichero que
 * recibe el cliente.
 *
 * Antes eso estaba escrito a mano dentro del empaquetador junto a consultas
 * directas a `prisma.property`, con dos consecuencias: rompia la regla de la
 * ADR (la infraestructura no conoce el vertical) y, con un segundo nicho
 * registrado, un `entityId` que coincidiese con una Property existente metia
 * datos de esa propiedad en el ZIP del otro nicho (hallazgo F-13 de la review
 * adversarial). Por eso los planes se resuelven **por `job.nicheId`**.
 */
import type { PieceKey, RenderJob } from "@/lib/engine/contracts";

/** Un fichero binario que produce una pieza. */
export interface PackageFileSpec {
  readonly fileName: string;
  readonly mediaType: string;
}

/** Un fichero de texto derivado de la entidad (copy, guion, datos-*.json). */
export interface PackageExtraFile {
  readonly fileName: string;
  readonly mediaType: string;
  readonly content: string;
  readonly pieceKey: PieceKey | "metadata" | "instructions";
}

export interface NichePackagePlan {
  /** Que ficheros produce cada pieza del catalogo. */
  readonly pieceFiles: Readonly<Record<string, readonly PackageFileSpec[]>>;
  /** Prefijo del ZIP que descarga el cliente: `<prefijo>-<entityId>.zip`. */
  readonly packageNamePrefix: string;
  /** Primera linea del README que va dentro del ZIP. */
  readonly readmeTitle: string;
  /** Como se llama la entidad en el README ("Propiedad", "Tratamiento"). */
  readonly entityLabel: string;
  /** Descripcion por nombre de fichero, para el README. */
  readonly fileDescriptions: Readonly<Record<string, string>>;
  /**
   * Ficheros de texto que dependen de los datos de la entidad. Es el unico
   * punto donde el nicho consulta su propia persistencia; el empaquetador solo
   * recibe strings ya compuestos.
   */
  extraFiles(job: Readonly<RenderJob>): Promise<readonly PackageExtraFile[]>;
}
