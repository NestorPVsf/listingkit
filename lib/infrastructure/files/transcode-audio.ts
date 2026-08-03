/**
 * Recodificacion del audio que se sube (narracion y musica de fondo).
 *
 * Hasta ahora el audio se guardaba **crudo**, tal cual llegaba: hasta 50 MB por
 * fichero y dos por propiedad. Era el mayor peso individual que quedaba en
 * disco, y ademas el unico tipo de subida que entraba sin que nadie mirase su
 * contenido — las fotos llevan desde el principio su recodificacion con sharp.
 *
 * Recodificar arregla tres cosas de una vez:
 *
 * 1. **Peso**: un WAV de 5 minutos son ~50 MB; ese mismo audio en AAC 128 kbps
 *    son ~4,8 MB. Y el tope de duracion pone un techo duro al fichero final,
 *    cosa que el tope de bytes de entrada no garantizaba (un MP3 de 50 MB puede
 *    durar horas).
 * 2. **Contenido**: hoy basta con declarar `audio/mpeg` en el formulario para
 *    que cualquier cosa se guarde en `uploads/assets`. FFmpeg no decodifica lo
 *    que no es audio, asi que la recodificacion hace de portero igual que sharp
 *    hace con las imagenes.
 * 3. **Metadatos**: las etiquetas ID3 y las caratulas embebidas viajan con el
 *    fichero (nombre del autor, del estudio, a veces del movil que grabo). Se
 *    descartan, en la misma linea que el EXIF de las fotos.
 *
 * La salida es SIEMPRE la misma: M4A/AAC a 48 kHz estereo. Es exactamente lo
 * que el filtro de audio del renderer de video pide (`aformat=sample_rates=
 * 48000:channel_layouts=stereo`), asi que al generar tampoco hay que convertir.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveFfmpegTools } from "@/lib/infrastructure/process/binary-resolver";
import { spawnWithTimeout } from "@/lib/infrastructure/process/spawn-with-timeout";

/** Contrato de salida. El almacen guarda esto, no lo que subio el operador. */
export const AUDIO_OUTPUT_MEDIA_TYPE = "audio/mp4";
export const AUDIO_OUTPUT_EXTENSION = ".m4a";

/**
 * Techo de duracion. El video dura 20-35 s, asi que 10 minutos es holgado para
 * cualquier uso real y acota el fichero final a ~9,6 MB pase lo que pase.
 * Se recorta en silencio en vez de rechazar: nadie sube una pista de una hora
 * esperando que suene entera en un reel.
 */
export const AUDIO_MAX_SECONDS = 600;

const AUDIO_BITRATE = "128k";
const TRANSCODE_TIMEOUT_MS = 120_000;

/** Inyectable para poder probar el almacen sin FFmpeg delante. */
export type AudioTranscoder = (input: Buffer) => Promise<Buffer>;

/**
 * Argumentos de FFmpeg. Funcion aparte y exportada porque cada uno de estos
 * flags sostiene una de las tres razones de existir del modulo, y un test los
 * vigila: quitar `-map_metadata -1` no rompe nada visible, solo vuelve a colar
 * las etiquetas del fichero original dentro del asset.
 */
export function ffmpegAudioArgs(
  inputPath: string,
  outputPath: string,
): readonly string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-v",
    "error",
    "-i",
    inputPath,
    // Solo la PRIMERA pista de audio: descarta pistas alternativas, video y
    // caratulas embebidas (una portada en un MP3 puede ocupar megabytes).
    "-map",
    "0:a:0",
    "-vn",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-c:a",
    "aac",
    "-b:a",
    AUDIO_BITRATE,
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    String(AUDIO_MAX_SECONDS),
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    "-y",
    outputPath,
  ];
}

/**
 * Recodifica el audio subido. Lanza `UPLOAD_AUDIO_INVALID` si FFmpeg no puede
 * decodificarlo y `UPLOAD_AUDIO_TRANSCODE_UNAVAILABLE` si no hay FFmpeg.
 *
 * Fallar al subir es preferible a aceptar el fichero: sin FFmpeg tampoco se
 * puede generar el video, que es lo unico para lo que sirve este audio. Mejor
 * enterarse con el operador delante que veinte minutos despues, dentro de una
 * generacion.
 */
export async function transcodeAudio(input: Buffer): Promise<Buffer> {
  let ffmpeg: string;
  try {
    ffmpeg = (await resolveFfmpegTools()).ffmpeg;
  } catch {
    throw new Error("UPLOAD_AUDIO_TRANSCODE_UNAVAILABLE");
  }

  // Fichero temporal y no una tuberia: FFmpeg necesita poder saltar por el
  // fichero de entrada para leer cabeceras, y el muxer de MP4 reescribe el
  // indice al final (`+faststart`), asi que tampoco vale una salida en stream.
  const directory = await mkdtemp(path.join(tmpdir(), "listingkit-audio-"));
  try {
    const inputPath = path.join(directory, "entrada");
    const outputPath = path.join(directory, `salida${AUDIO_OUTPUT_EXTENSION}`);
    await writeFile(inputPath, input);

    const result = await spawnWithTimeout(
      ffmpeg,
      ffmpegAudioArgs(inputPath, outputPath),
      TRANSCODE_TIMEOUT_MS,
    );
    if (result.timedOut || result.exitCode !== 0) {
      throw new Error("UPLOAD_AUDIO_INVALID");
    }

    // Si el muxer no llego a escribir nada, `readFile` falla. Que la salida sea
    // ademas no vacia lo comprueba el almacen, que es quien la persiste.
    return await readFile(outputPath).catch(() => {
      throw new Error("UPLOAD_AUDIO_INVALID");
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
