import path from "node:path";
import type {
  ArtifactRegistry,
  StoredArtifact,
} from "@/lib/engine/ports/artifact-registry";
import { prisma } from "@/lib/prisma";

/**
 * Implementacion sobre la tabla `GeneratedPiece`, que ya se escribe en cada
 * `save()` del repositorio de jobs: cada render inserta una fila nueva por
 * artefacto, asi que la tabla es de por si un historico.
 *
 * "El ultimo de cada fichero" y no "el ultimo de cada pieza": un carrusel son
 * cinco ficheros bajo la misma `pieceKey`, y quedarse solo con el mas reciente
 * dejaria cuatro fuera del ZIP.
 */
export function createPrismaArtifactRegistry(): ArtifactRegistry {
  return {
    async latestByEntity(entityId) {
      const filas = await prisma.generatedPiece.findMany({
        where: { propertyId: entityId },
        orderBy: { createdAt: "desc" },
        select: { pieceKey: true, path: true },
      });

      const ultimos = new Map<string, StoredArtifact>();
      for (const fila of filas) {
        const fileName = path.basename(fila.path);
        const clave = `${fila.pieceKey}::${fileName}`;
        // `findMany` viene de mas reciente a mas antiguo: la primera que se ve
        // de cada clave es la buena.
        if (!ultimos.has(clave)) {
          ultimos.set(clave, {
            pieceKey: fila.pieceKey,
            fileName,
            storageKey: fila.path,
          });
        }
      }
      return [...ultimos.values()];
    },
  };
}
