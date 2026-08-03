/**
 * Retención de artefactos.
 *
 * Hay una regla que no se puede romper y es la razón de que estos tests existan:
 * **nunca se borra un directorio que contenga la versión vigente de una pieza.**
 *
 * El ZIP no se arma con los ficheros del último trabajo, sino con el último
 * artefacto de CADA pieza. Si regeneras solo el post, su fichero vive en un
 * directorio nuevo mientras la ficha PDF sigue en el viejo. Podar por antigüedad
 * sin mirar eso deja el ZIP incompleto — que es exactamente el bug crítico que
 * costó introducir el registro de artefactos.
 *
 * Se usa el disco de verdad, en un directorio temporal: lo que se prueba es que
 * se borran ficheros, y con un doble del sistema de archivos no se probaría nada.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ArtifactRegistry, StoredArtifact } from "@/lib/engine/ports/artifact-registry";
import { pruneEntityArtifacts } from "@/lib/infrastructure/storage/prune-artifacts";

const ENTIDAD = "prop-poda";
let raiz: string;

/** Registro falso: devuelve los artefactos vigentes que le digamos. */
function registro(artefactos: readonly StoredArtifact[]): ArtifactRegistry {
  return { latestByEntity: async () => artefactos };
}

/** `storageKey` tal y como lo escriben los renderers: relativo al proyecto. */
function claveDe(job: string, fichero: string): string {
  return path
    .relative(process.cwd(), path.join(raiz, ENTIDAD, job, fichero))
    .replaceAll("\\", "/");
}

async function crearTrabajo(job: string, ficheros: readonly string[], bytes = 1024) {
  const dir = path.join(raiz, ENTIDAD, job);
  await mkdir(dir, { recursive: true });
  for (const fichero of ficheros) {
    await writeFile(path.join(dir, fichero), Buffer.alloc(bytes));
  }
  // mtime separadas para que el orden por antigüedad sea determinista.
  await new Promise((r) => setTimeout(r, 12));
}

const trabajosEnDisco = async () =>
  (await readdir(path.join(raiz, ENTIDAD), { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

beforeEach(async () => {
  raiz = await mkdtemp(path.join(tmpdir(), "poda-"));
  process.env.RENDER_OUTPUT_DIR = raiz;
});

afterEach(async () => {
  delete process.env.RENDER_OUTPUT_DIR;
  await rm(raiz, { recursive: true, force: true });
});

describe("pruneEntityArtifacts", () => {
  it("no toca nada cuando hay pocas generaciones", async () => {
    for (const job of ["j1", "j2", "j3"]) await crearTrabajo(job, ["post.png"]);

    const resultado = await pruneEntityArtifacts(ENTIDAD, registro([]), 3);

    expect(resultado.removedDirs).toBe(0);
    expect(await trabajosEnDisco()).toEqual(["j1", "j2", "j3"]);
  });

  it("conserva las 3 más recientes y borra las viejas", async () => {
    for (const job of ["j1", "j2", "j3", "j4", "j5"]) {
      await crearTrabajo(job, ["post.png"]);
    }

    const resultado = await pruneEntityArtifacts(ENTIDAD, registro([]), 3);

    expect(resultado.removedDirs).toBe(2);
    expect(resultado.freedBytes).toBeGreaterThan(0);
    expect(await trabajosEnDisco()).toEqual(["j3", "j4", "j5"]);
  });

  it("NUNCA borra el directorio de una pieza vigente, por vieja que sea", async () => {
    // El escenario real: se generó todo en j1 y luego se regeneró SOLO el post
    // cuatro veces. La ficha PDF sigue viviendo en j1 y el ZIP la necesita.
    await crearTrabajo("j1", ["ficha.pdf", "post.png"]);
    for (const job of ["j2", "j3", "j4", "j5"]) await crearTrabajo(job, ["post.png"]);

    const vigentes: StoredArtifact[] = [
      { pieceKey: "property-sheet", fileName: "ficha.pdf", storageKey: claveDe("j1", "ficha.pdf") },
      { pieceKey: "instagram-post", fileName: "post.png", storageKey: claveDe("j5", "post.png") },
    ];

    await pruneEntityArtifacts(ENTIDAD, registro(vigentes), 3);

    const quedan = await trabajosEnDisco();
    // j1 sobrevive por ser vigente aunque sea la más antigua de todas.
    expect(quedan).toContain("j1");
    expect(quedan).toContain("j5");
    // Y de las superadas (j2, j3, j4) se conservan las 3 => no se borra ninguna.
    expect(quedan).toEqual(["j1", "j2", "j3", "j4", "j5"]);
  });

  it("las vigentes NO consumen las plazas de conservación", async () => {
    // Con `keep=1`: j1 se salva por vigente, y de las superadas se guarda 1.
    await crearTrabajo("j1", ["ficha.pdf"]);
    for (const job of ["j2", "j3", "j4"]) await crearTrabajo(job, ["post.png"]);

    const vigentes: StoredArtifact[] = [
      { pieceKey: "property-sheet", fileName: "ficha.pdf", storageKey: claveDe("j1", "ficha.pdf") },
    ];

    await pruneEntityArtifacts(ENTIDAD, registro(vigentes), 1);

    expect(await trabajosEnDisco()).toEqual(["j1", "j4"]);
  });

  it("es idempotente: repetirla no borra de más", async () => {
    for (const job of ["j1", "j2", "j3", "j4", "j5"]) await crearTrabajo(job, ["post.png"]);

    await pruneEntityArtifacts(ENTIDAD, registro([]), 3);
    const segunda = await pruneEntityArtifacts(ENTIDAD, registro([]), 3);

    expect(segunda.removedDirs).toBe(0);
    expect(await trabajosEnDisco()).toHaveLength(3);
  });

  it("no explota con una entidad que no tiene nada en disco", async () => {
    const resultado = await pruneEntityArtifacts("no-existe", registro([]), 3);
    expect(resultado).toEqual({ removedDirs: 0, freedBytes: 0, keptDirs: 0 });
  });

  it("si el registro falla no borra nada, en vez de arrasar", async () => {
    // Sin saber qué está vigente, borrar por antigüedad podría llevarse la
    // ficha PDF que sostiene el ZIP. Ante la duda, no se toca.
    for (const job of ["j1", "j2", "j3", "j4", "j5"]) await crearTrabajo(job, ["post.png"]);
    const registroRoto: ArtifactRegistry = {
      latestByEntity: async () => {
        throw new Error("base caida");
      },
    };

    await pruneEntityArtifacts(ENTIDAD, registroRoto, 3);

    expect(await trabajosEnDisco()).toHaveLength(5);
  });
});
