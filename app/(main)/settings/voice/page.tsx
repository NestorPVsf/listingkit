"use client";

import { useEffect, useState } from "react";

/**
 * Configuracion de voz y musica por defecto para los videos (Fase 5.4).
 *
 * - TTSProvider: "sin-voz" (sin locucion) o "narracion-propia" (subir audio).
 * - Musica de fondo por defecto para los videos.
 *
 * Las preferencias se guardan en localStorage (preferencia de UI de la
 * agencia) y los audios se suben como assets (kind: "audio"). Persistirlas en
 * BD requeriria un campo nuevo en Brand — fuera del alcance de la Fase 5.
 */

const TTS_STORAGE_KEY = "inmocontent:tts-provider";
const MUSIC_STORAGE_KEY = "inmocontent:default-music-asset";
const NARRATION_STORAGE_KEY = "inmocontent:default-narration-asset";

type TtsChoice = "sin-voz" | "narracion-propia";

/**
 * El audio se recodifica al subirlo, asi que hay fallos nuevos que el operador
 * puede arreglar solo — y uno, el de FFmpeg, que no. Traducirlos aqui evita el
 * "revisa el formato" generico, que no dice nada cuando el formato esta bien.
 */
function motivo(detalle: string | undefined): string {
  switch (detalle) {
    case "UPLOAD_AUDIO_SIZE_INVALID":
      return "El archivo supera los 50 MB.";
    case "UPLOAD_AUDIO_INVALID":
      return "El archivo no se puede leer como audio.";
    case "UPLOAD_AUDIO_TRANSCODE_UNAVAILABLE":
      return "Falta FFmpeg en el servidor; sin él tampoco se puede generar el vídeo.";
    default:
      return "Revisa el formato: se aceptan MP3, WAV, M4A, AAC y OGG.";
  }
}

export default function VoiceSettingsPage() {
  const [tts, setTts] = useState<TtsChoice>("sin-voz");
  const [musicName, setMusicName] = useState<string | null>(null);
  const [narrationName, setNarrationName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedTts = window.localStorage.getItem(TTS_STORAGE_KEY);
    if (savedTts === "sin-voz" || savedTts === "narracion-propia") setTts(savedTts);
    setMusicName(window.localStorage.getItem(MUSIC_STORAGE_KEY));
    setNarrationName(window.localStorage.getItem(NARRATION_STORAGE_KEY));
  }, []);

  function handleTtsChange(choice: TtsChoice) {
    setTts(choice);
    window.localStorage.setItem(TTS_STORAGE_KEY, choice);
    setMessage("Preferencia de voz guardada.");
  }

  async function uploadAudio(file: File, storageKey: string, setName: (name: string) => void) {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", "audio");
    try {
      const response = await fetch("/api/assets", { method: "POST", body: formData });
      if (!response.ok) {
        const cuerpo = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        setError(`No se pudo subir "${file.name}". ${motivo(cuerpo?.detail)}`);
        return;
      }
      const asset = (await response.json()) as { id: string };
      window.localStorage.setItem(storageKey, `${asset.id}:${file.name}`);
      setName(`${asset.id}:${file.name}`);
      setMessage(`Audio "${file.name}" guardado.`);
    } catch {
      setError("Error de red al subir el audio.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="mb-10">
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-foreground-muted">
          Configuración
        </p>
        <h1 className="font-display text-4xl font-semibold text-foreground">Voz y música</h1>
        <p className="mt-2 text-foreground-muted">
          Valores por defecto para los vídeos generados. Si no hay proveedor de
          voz configurado, el vídeo se genera sin locución y se indica
          claramente (nunca se simula que lleva voz).
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          Los audios se recomprimen al subirlos (M4A, 48 kHz) y se les quitan las
          etiquetas del archivo original. Se aceptan hasta 50 MB y se usan los
          primeros 10 minutos.
        </p>
      </header>

      {error ? (
        <p role="alert" className="mb-6 text-sm font-medium text-primary">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mb-6 text-sm font-medium text-secondary">
          {message}
        </p>
      ) : null}

      <section aria-label="Proveedor de voz" className="mb-12">
        <h2 className="mb-3 font-display text-2xl font-semibold text-foreground">
          Locucion (TTSProvider)
        </h2>
        <div className="grid gap-3">
          <label className="flex cursor-pointer items-start gap-3 border border-border bg-surface p-4">
            <input
              type="radio"
              name="tts-provider"
              value="sin-voz"
              checked={tts === "sin-voz"}
              onChange={() => handleTtsChange("sin-voz")}
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-foreground">Sin voz</span>
              <span className="block text-sm text-foreground-muted">
                El vídeo lleva solo música y texto en pantalla.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 border border-border bg-surface p-4">
            <input
              type="radio"
              name="tts-provider"
              value="narracion-propia"
              checked={tts === "narracion-propia"}
              onChange={() => handleTtsChange("narracion-propia")}
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-foreground">Subir narración propia</span>
              <span className="block text-sm text-foreground-muted">
                Usa un audio tuyo como locución del vídeo.
              </span>
            </span>
          </label>
        </div>

        {tts === "narracion-propia" ? (
          <div className="mt-4">
            <label htmlFor="narration-upload" className="mb-1 block text-sm font-medium text-foreground">
              Audio de narración
            </label>
            <input
              id="narration-upload"
              type="file"
              accept="audio/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAudio(file, NARRATION_STORAGE_KEY, setNarrationName);
              }}
              className="block w-full border border-border bg-surface p-3 text-sm"
            />
            <p className="mt-2 text-sm text-foreground-muted">
              {narrationName
                ? `Narración actual: ${narrationName.split(":").slice(1).join(":")}`
                : "Ninguna narración subida todavía."}
            </p>
          </div>
        ) : null}
      </section>

      <section aria-label="Música de fondo">
        <h2 className="mb-3 font-display text-2xl font-semibold text-foreground">
          Música de fondo por defecto
        </h2>
        <label htmlFor="music-upload" className="mb-1 block text-sm font-medium text-foreground">
          Archivo de música
        </label>
        <input
          id="music-upload"
          type="file"
          accept="audio/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadAudio(file, MUSIC_STORAGE_KEY, setMusicName);
          }}
          className="block w-full border border-border bg-surface p-3 text-sm"
        />
        <p className="mt-2 text-sm text-foreground-muted">
          {musicName
            ? `Música actual: ${musicName.split(":").slice(1).join(":")}`
            : "Ninguna música por defecto. Usa solo música con licencia."}
        </p>
      </section>
    </main>
  );
}
