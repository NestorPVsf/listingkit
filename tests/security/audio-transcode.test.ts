/**
 * Recodificación del audio subido.
 *
 * Hasta ahora el audio era la única subida que entraba **cruda**: hasta 50 MB
 * por archivo, dos por propiedad, y sin que nadie mirase su contenido (las
 * fotos llevan desde el principio su recodificación con sharp). Tres cosas se
 * prueban aquí, y las tres se rompen en silencio si nadie las vigila:
 *
 * 1. **Que el buffer original NUNCA llega al disco.** Es el motivo entero del
 *    cambio. Si alguien devuelve el buffer de entrada en vez del recodificado,
 *    todo lo demás sigue pasando.
 * 2. **Que la puerta se cierra si FFmpeg falla.** Un archivo que no es audio no
 *    puede quedarse en `uploads/assets` con un `.m4a` en el nombre.
 * 3. **Que los flags que sostienen el contrato siguen ahí.** Quitar
 *    `-map_metadata -1` no rompe ninguna pantalla: solo devuelve al asset las
 *    etiquetas del archivo original —y a veces el nombre de quien lo grabó—.
 *
 * El transcodificador se inyecta. La llamada real a FFmpeg se verifica a mano
 * con un archivo de verdad, igual que el resto del pipeline de vídeo: lo que se
 * prueba aquí es el almacén.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { assetsDir } from "@/lib/infrastructure/storage/upload-paths";
import {
  AUDIO_MAX_SECONDS,
  AUDIO_OUTPUT_EXTENSION,
  AUDIO_OUTPUT_MEDIA_TYPE,
  ffmpegAudioArgs,
} from "@/lib/infrastructure/files/transcode-audio";
import { storeAudioUpload } from "@/lib/infrastructure/files/local-asset-store";

const CRUDO = Buffer.from("ORIGINAL-CRUDO-QUE-NO-DEBE-PERSISTIRSE".repeat(64));
const RECODIFICADO = Buffer.from("m4a-recodificado");

const DIRECTORIO = assetsDir();
const guardados: string[] = [];

function archivo(bytes: Buffer, nombre = "narracion.wav", tipo = "audio/wav"): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

/**
 * Todo lo que hay ahora mismo en el directorio de assets. Vuelve a ser una
 * afirmación fuerte —«no queda NADA nuevo»— porque desde que `UPLOADS_DIR` es
 * configurable esto ya no es el directorio del usuario compartido con otros
 * ficheros de test: filtrar por extensión dejaba pasar un `.json` huérfano.
 */
const enDisco = async (): Promise<readonly string[]> =>
  await readdir(DIRECTORIO).catch(() => []);

afterAll(async () => {
  await Promise.all(
    guardados.flatMap((id) => [
      rm(path.join(DIRECTORIO, `${id}${AUDIO_OUTPUT_EXTENSION}`), { force: true }),
      rm(path.join(DIRECTORIO, `${id}.json`), { force: true }),
    ]),
  );
});

describe("storeAudioUpload — recodificación", () => {
  let previos: readonly string[] = [];
  beforeEach(async () => {
    previos = await enDisco();
  });

  /** Lo que este test dejó, sin contar lo que ya había de otros. */
  const nuevos = async (): Promise<readonly string[]> =>
    (await enDisco()).filter((nombre) => !previos.includes(nombre));

  it("guarda el audio recodificado y NUNCA el original", async () => {
    const asset = await storeAudioUpload(archivo(CRUDO), async () => RECODIFICADO);
    guardados.push(asset.id);

    const binario = path.join(DIRECTORIO, `${asset.id}${AUDIO_OUTPUT_EXTENSION}`);
    const bytes = await readFile(binario);

    expect(bytes.equals(RECODIFICADO)).toBe(true);
    expect(bytes.includes("ORIGINAL-CRUDO")).toBe(false);
    expect(asset.bytes).toBe(RECODIFICADO.byteLength);
  });

  it("declara el tipo real de lo guardado, no el que subió el operador", async () => {
    // Sube un WAV; en disco hay un M4A. Si la metadata siguiera diciendo
    // "audio/wav", quien lo sirva mandaría una cabecera falsa.
    const asset = await storeAudioUpload(
      archivo(CRUDO, "voz.wav", "audio/wav"),
      async () => RECODIFICADO,
    );
    guardados.push(asset.id);

    expect(asset.mediaType).toBe(AUDIO_OUTPUT_MEDIA_TYPE);
    expect(asset.storageKey.endsWith(AUDIO_OUTPUT_EXTENSION)).toBe(true);
    // El nombre que puso el operador sí se conserva: es lo que ve en pantalla.
    expect(asset.fileName).toBe("voz.wav");
  });

  it("el hash y el tamaño describen el archivo que está en disco", async () => {
    const asset = await storeAudioUpload(archivo(CRUDO), async () => RECODIFICADO);
    guardados.push(asset.id);

    expect(asset.sha256).toBe(
      createHash("sha256").update(RECODIFICADO).digest("hex"),
    );
    expect(asset.sha256).not.toBe(
      createHash("sha256").update(CRUDO).digest("hex"),
    );
  });

  it("si FFmpeg no puede decodificarlo, no queda NADA en disco", async () => {
    await expect(
      storeAudioUpload(archivo(CRUDO), async () => {
        throw new Error("UPLOAD_AUDIO_INVALID");
      }),
    ).rejects.toThrow("UPLOAD_AUDIO_INVALID");

    expect(await nuevos()).toEqual([]);
  });

  it("una salida vacía tampoco se guarda", async () => {
    // Pasaba: se escribía el .m4a de cero bytes con su JSON al lado, y el fallo
    // solo aparecía al LEER el asset, porque el schema exige `bytes` positivo.
    // Un archivo ilegible para siempre y ningún error en el momento de subirlo.
    await expect(
      storeAudioUpload(archivo(CRUDO), async () => Buffer.alloc(0)),
    ).rejects.toThrow("UPLOAD_AUDIO_INVALID");

    expect(await nuevos()).toEqual([]);
  });

  it("rechaza por tamaño ANTES de gastar CPU recodificando", async () => {
    let llamado = false;
    const grande = archivo(CRUDO);
    Object.defineProperty(grande, "size", { value: 50 * 1024 * 1024 + 1 });

    await expect(
      storeAudioUpload(grande, async () => {
        llamado = true;
        return RECODIFICADO;
      }),
    ).rejects.toThrow("UPLOAD_AUDIO_SIZE_INVALID");

    expect(llamado).toBe(false);
    expect(await nuevos()).toEqual([]);
  });

  it("sigue rechazando tipos que no son audio", async () => {
    await expect(
      storeAudioUpload(
        archivo(CRUDO, "factura.pdf", "application/pdf"),
        async () => RECODIFICADO,
      ),
    ).rejects.toThrow();
  });
});

describe("ffmpegAudioArgs — el contrato de la recodificación", () => {
  const args = ffmpegAudioArgs("/tmp/entrada", "/tmp/salida.m4a");
  const par = (bandera: string): string | undefined => {
    const indice = args.indexOf(bandera);
    return indice === -1 ? undefined : args[indice + 1];
  };

  it("descarta los metadatos del archivo original", () => {
    // ID3 con autor, estudio, a veces el modelo del móvil que grabó.
    expect(par("-map_metadata")).toBe("-1");
    expect(par("-map_chapters")).toBe("-1");
  });

  it("se queda solo con la primera pista de audio", () => {
    // `-vn` tira la carátula embebida (megabytes de JPEG dentro de un MP3) y
    // `-map 0:a:0` descarta pistas alternativas... y hace fallar a FFmpeg si el
    // archivo no tiene audio ninguno, que es la validación de contenido.
    expect(par("-map")).toBe("0:a:0");
    expect(args).toContain("-vn");
  });

  it("acota la duración, que es lo que acota el tamaño de verdad", () => {
    // El límite de 50 MB de entrada no dice nada del resultado: un MP3 de 50 MB
    // puede durar horas. Este `-t` sí pone techo al archivo final.
    expect(par("-t")).toBe(String(AUDIO_MAX_SECONDS));
  });

  it("sale en el formato que el renderer de vídeo ya espera", () => {
    expect(par("-c:a")).toBe("aac");
    expect(par("-f")).toBe("mp4");
    expect(par("-ar")).toBe("48000");
    expect(par("-ac")).toBe("2");
  });

  it("el destino es el último argumento y la entrada va tras -i", () => {
    expect(args.at(-1)).toBe("/tmp/salida.m4a");
    expect(par("-i")).toBe("/tmp/entrada");
  });
});
