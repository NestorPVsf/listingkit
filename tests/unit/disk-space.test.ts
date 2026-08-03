/**
 * Aviso de disco lleno.
 *
 * Lo que se prueba es el borde: un aviso que salta antes de tiempo se ignora a
 * la tercera vez, y uno que salta tarde no sirve de nada. También que un fallo
 * al medir NO se convierte en un aviso —«no lo sé» y «queda poco» son cosas
 * distintas y confundirlas asusta al operador sin motivo—.
 */
import { describe, expect, it } from "vitest";
import {
  DISK_CRITICAL_RATIO,
  DISK_WARNING_RATIO,
  diskLevel,
  readDiskSpace,
  type StatfsLike,
} from "@/lib/infrastructure/storage/disk-space";

const BLOQUE = 4096;
const TOTAL_BLOQUES = 1_000_000; // ~4 GB

/** Un `statfs` de mentira con la proporción libre que se le pida. */
function conLibre(proporcion: number) {
  return async (): Promise<StatfsLike> => ({
    bsize: BLOQUE,
    blocks: TOTAL_BLOQUES,
    bavail: Math.round(TOTAL_BLOQUES * proporcion),
  });
}

describe("readDiskSpace", () => {
  it("convierte bloques a bytes", async () => {
    const espacio = await readDiskSpace("/cualquiera", conLibre(0.25));

    expect(espacio).not.toBeNull();
    expect(espacio!.totalBytes).toBe(TOTAL_BLOQUES * BLOQUE);
    expect(espacio!.freeBytes).toBe(TOTAL_BLOQUES * 0.25 * BLOQUE);
    expect(espacio!.freeRatio).toBeCloseTo(0.25, 5);
  });

  it("usa bavail y no bfree: la reserva del sistema no es espacio disponible", async () => {
    // Un ext4 reserva un 5% para root. Contarlo como libre es prometer un
    // margen que la aplicación no puede usar. `bfree` está aquí a propósito:
    // si alguien cambia el campo que se lee, este test lo delata.
    const conReserva = {
      bsize: BLOQUE,
      blocks: TOTAL_BLOQUES,
      bavail: 100_000,
      bfree: 150_000,
    };
    const espacio = await readDiskSpace("/cualquiera", async () => conReserva);

    expect(espacio!.freeBytes).toBe(100_000 * BLOQUE);
  });

  it("devuelve null si no se puede medir, en vez de fingir un 0%", async () => {
    const espacio = await readDiskSpace("/cualquiera", async () => {
      throw new Error("EPERM");
    });

    expect(espacio).toBeNull();
  });

  it("devuelve null ante cifras imposibles", async () => {
    const cero = await readDiskSpace("/x", async () => ({
      bsize: BLOQUE,
      blocks: 0,
      bavail: 0,
    }));
    const negativo = await readDiskSpace("/x", async () => ({
      bsize: -1,
      blocks: TOTAL_BLOQUES,
      bavail: 10,
    }));
    const infinito = await readDiskSpace("/x", async () => ({
      bsize: BLOQUE,
      blocks: Number.POSITIVE_INFINITY,
      bavail: 10,
    }));

    expect([cero, negativo, infinito]).toEqual([null, null, null]);
  });

  it("no deja que la proporción se pase de 1", async () => {
    const espacio = await readDiskSpace("/x", async () => ({
      bsize: BLOQUE,
      blocks: 100,
      bavail: 120,
    }));

    expect(espacio!.freeRatio).toBe(1);
  });
});

describe("diskLevel — dónde está exactamente la raya", () => {
  const nivelCon = async (proporcion: number) =>
    diskLevel((await readDiskSpace("/x", conLibre(proporcion)))!);

  it("no avisa con espacio de sobra", async () => {
    expect(await nivelCon(0.5)).toBe("ok");
  });

  it("justo en el 15% todavía NO avisa", async () => {
    expect(await nivelCon(DISK_WARNING_RATIO)).toBe("ok");
  });

  it("por debajo del 15% avisa", async () => {
    expect(await nivelCon(DISK_WARNING_RATIO - 0.001)).toBe("warning");
    expect(await nivelCon(0.1)).toBe("warning");
  });

  it("justo en el 5% sigue siendo aviso, no alarma", async () => {
    expect(await nivelCon(DISK_CRITICAL_RATIO)).toBe("warning");
  });

  it("por debajo del 5% cambia el tono", async () => {
    expect(await nivelCon(DISK_CRITICAL_RATIO - 0.001)).toBe("critical");
    expect(await nivelCon(0)).toBe("critical");
  });
});
