"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pantalla de generacion + preview de una propiedad (Fases 5.3 y 5.5).
 *
 * - Al montar, si no hay job en curso, dispara POST /api/properties/:id/generate.
 * - Hace polling de GET /api/render-jobs/:jobId hasta que todas las piezas
 *   llegan a done/error.
 * - Muestra el estado por pieza (data-testid="job-status-<uiKey>"), y en caso
 *   de error la causa + solucion + boton de reintento.
 * - Vista previa con tarjetas por pieza, edicion de texto, regeneracion
 *   individual, descarga individual y descarga ZIP.
 * - Reorden de fotos con botones subir/bajar; cambiar la foto principal
 *   regenera las piezas que dependen de ella.
 */

// Claves de UI (contrato data-testid del spec E2E) ↔ claves del catalogo.
const PIECES = [
  { uiKey: "pdf-ficha", catalogKey: "property-sheet", label: "Ficha técnica PDF" },
  { uiKey: "instagram-post", catalogKey: "instagram-post", label: "Post de Instagram" },
  { uiKey: "instagram-carousel", catalogKey: "instagram-carousel", label: "Carrusel de Instagram" },
  { uiKey: "instagram-story", catalogKey: "instagram-story", label: "Story de Instagram" },
  { uiKey: "email", catalogKey: "property-email", label: "Email comercial" },
  { uiKey: "video", catalogKey: "vertical-video", label: "Vídeo vertical" },
] as const;

type UiKey = (typeof PIECES)[number]["uiKey"];

/**
 * El backend rechaza con 422 el texto editado que reintroduce un campo privado
 * (F-01). Sin este mensaje el operador veria el boton "no hacer nada" y creeria
 * que guardo — justo el escenario en el que la direccion acaba publicada.
 */
function textOverrideErrorMessage(code?: string, field?: string): string {
  if (code === "TEXT_OVERRIDE_LEAKS_PRIVATE_DATA") {
    const label =
      field === "internalName" ? "la referencia interna" : "la dirección privada";
    return `Ese texto contiene ${label} de la propiedad. Esos datos nunca salen en una pieza publica: reescribelo sin ellos.`;
  }
  if (code === "TEXT_OVERRIDE_TOO_LONG") {
    return "El texto es demasiado largo. Recórtalo e inténtalo de nuevo.";
  }
  if (code === "TEXT_OVERRIDE_EMPTY") {
    return "El texto no puede quedar vacio.";
  }
  if (code === "RENDER_QUEUE_FULL") {
    return "Hay demasiadas generaciones en cola. Espera a que terminen e inténtalo otra vez.";
  }
  if (code === "RENDER_JOB_DUPLICATED") {
    return "Esa pieza ya se esta regenerando ahora mismo.";
  }
  return "No se pudo guardar el texto. Inténtalo de nuevo.";
}

function catalogToUiKey(catalogKey: string): UiKey | null {
  const match = PIECES.find((piece) => piece.catalogKey === catalogKey);
  return match ? match.uiKey : null;
}

// Piezas que usan la foto principal: al cambiarla se regeneran.
const PRIMARY_DEPENDENT_CATALOG_KEYS = [
  "property-sheet",
  "instagram-post",
  "instagram-story",
  "instagram-carousel",
  "vertical-video",
];

type TaskStatus = "pending" | "rendering" | "done" | "error" | "blocked";

interface ArtifactDto {
  readonly id: string;
  readonly pieceKey: string;
  readonly variant: string;
  readonly fileName: string;
  readonly mediaType: string;
}

interface TaskDto {
  readonly id: string;
  readonly piece: { readonly key: string };
  readonly status: TaskStatus;
  readonly artifacts: readonly ArtifactDto[];
  readonly error?: {
    readonly cause: string;
    readonly solution: string;
    readonly retryable: boolean;
  };
}

interface RenderJobDto {
  readonly id: string;
  readonly status: "pending" | "rendering" | "done" | "partial" | "error";
  readonly tasks: readonly TaskDto[];
}

interface PhotoItem {
  readonly id: string;
  readonly url: string;
  readonly isMain: boolean;
}

interface PieceView {
  readonly uiKey: UiKey;
  readonly catalogKey: string;
  readonly label: string;
  readonly status: TaskStatus | "waiting";
  readonly artifacts: readonly ArtifactDto[];
  readonly error?: { cause: string; solution: string; retryable: boolean };
}

const STATUS_TEXT: Record<string, string> = {
  waiting: "En cola",
  pending: "Pendiente",
  rendering: "Generando",
  done: "Lista",
  error: "Error",
  blocked: "Bloqueada",
};

const POLL_INTERVAL_MS = 1_200;

export function PropertyDetail({
  propertyId,
  initialJobId,
  initialPhotos,
}: {
  readonly propertyId: string;
  readonly initialJobId: string | null;
  readonly initialPhotos: readonly PhotoItem[];
}) {
  const [job, setJob] = useState<RenderJobDto | null>(null);
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<readonly PhotoItem[]>(initialPhotos);
  const [editingPiece, setEditingPiece] = useState<UiKey | null>(null);
  const [editorText, setEditorText] = useState<string>("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<UiKey | null>(null);
  // Artifacts acumulados por pieza (catalogKey). Persisten entre jobs para que
  // regenerar UNA pieza no borre los artifacts/botones de descarga de las demas.
  const [artifactsByPiece, setArtifactsByPiece] = useState<
    Readonly<Record<string, readonly ArtifactDto[]>>
  >({});
  // Status acumulado por pieza (catalogKey). Una pieza que llego a done/error
  // conserva su estado aunque el job en curso (regeneracion de otra) no la
  // incluya; solo se sobrescribe cuando un job la vuelve a procesar.
  const [statusByPiece, setStatusByPiece] = useState<
    Readonly<Record<string, TaskStatus>>
  >({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/render-jobs/${id}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as RenderJobDto;
        setJob(data);
        // Fusiona artifacts y status de las tasks de este job en los mapas.
        setArtifactsByPiece((previous) => {
          const next: Record<string, readonly ArtifactDto[]> = { ...previous };
          for (const task of data.tasks) {
            if (task.artifacts.length > 0) {
              next[task.piece.key] = task.artifacts;
            }
          }
          return next;
        });
        setStatusByPiece((previous) => {
          const next: Record<string, TaskStatus> = { ...previous };
          for (const task of data.tasks) {
            next[task.piece.key] = task.status;
          }
          return next;
        });
        if (data.status === "done" || data.status === "partial" || data.status === "error") {
          stopPolling();
        }
      } catch {
        // Reintenta en el siguiente tick del intervalo.
      }
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      void pollJob(id);
      pollingRef.current = setInterval(() => void pollJob(id), POLL_INTERVAL_MS);
    },
    [pollJob, stopPolling],
  );

  const triggerGenerate = useCallback(async () => {
    setGenerateError(null);
    try {
      const response = await fetch(`/api/properties/${propertyId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
      };
      if (!response.ok) {
        // 409 con jobId: ya hay un trabajo identico en marcha (doble clic,
        // doble montaje). Nos enganchamos a ese en vez de fallar.
        if (response.status === 409 && body.jobId) {
          setJobId(body.jobId);
          startPolling(body.jobId);
          return;
        }
        setGenerateError(
          response.status === 429
            ? "Hay demasiadas generaciones en cola. Espera a que terminen e inténtalo otra vez."
            : "No se pudo iniciar la generación. Inténtalo de nuevo.",
        );
        return;
      }
      if (!body.jobId) {
        setGenerateError("No se pudo iniciar la generación. Inténtalo de nuevo.");
        return;
      }
      setJobId(body.jobId);
      startPolling(body.jobId);
    } catch {
      setGenerateError("Error de red al iniciar la generación.");
    }
  }, [propertyId, startPolling]);

  // Al montar: reanuda el polling del job existente o dispara uno nuevo.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialJobId) {
      startPolling(initialJobId);
    } else {
      void triggerGenerate();
    }
    return () => stopPolling();
  }, [initialJobId, startPolling, stopPolling, triggerGenerate]);

  const pieces: PieceView[] = PIECES.map((piece) => {
    const task = job?.tasks.find((candidate) => candidate.piece.key === piece.catalogKey);
    // Prioridad: status del job en curso si la pieza esta en el; si no, el
    // ultimo status conocido (persiste entre regeneraciones de otras piezas).
    const status: TaskStatus | "waiting" =
      task?.status ?? statusByPiece[piece.catalogKey] ?? "waiting";
    return {
      uiKey: piece.uiKey,
      catalogKey: piece.catalogKey,
      label: piece.label,
      status,
      artifacts: artifactsByPiece[piece.catalogKey] ?? task?.artifacts ?? [],
      error: task?.error,
    };
  });

  const allSettled = pieces.every(
    (piece) => piece.status === "done" || piece.status === "error" || piece.status === "blocked",
  );

  async function handleRetry(uiKey: UiKey) {
    const piece = PIECES.find((candidate) => candidate.uiKey === uiKey);
    if (!piece) return;
    setRegenerating(uiKey);
    try {
      const response = await fetch(`/api/properties/${propertyId}/regenerate-piece`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceKey: piece.catalogKey }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        jobId?: string;
      };
      // 202 con job nuevo, o 409 con el job identico que ya estaba en marcha.
      if (body.jobId && (response.ok || response.status === 409)) {
        setJobId(body.jobId);
        startPolling(body.jobId);
      }
    } finally {
      setRegenerating(null);
    }
  }

  function handleEdit(uiKey: UiKey) {
    setEditingPiece(uiKey);
    setEditorText("");
    setEditorError(null);
  }

  async function handleSaveEdit(uiKey: UiKey) {
    const piece = PIECES.find((candidate) => candidate.uiKey === uiKey);
    if (!piece || editorText.trim().length === 0) {
      setEditingPiece(null);
      return;
    }
    const response = await fetch(`/api/properties/${propertyId}/piece-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceKey: piece.catalogKey, text: editorText.trim() }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        field?: string;
      };
      setEditorError(textOverrideErrorMessage(body.error, body.field));
      return;
    }
    setEditorError(null);
    setEditingPiece(null);
  }

  async function handleRegenerate(uiKey: UiKey) {
    const piece = PIECES.find((candidate) => candidate.uiKey === uiKey);
    if (!piece) return;
    setRegenerating(uiKey);
    try {
      const response = await fetch(`/api/properties/${propertyId}/regenerate-piece`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceKey: piece.catalogKey,
          textOverride: editorText.trim().length > 0 ? editorText.trim() : undefined,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
        field?: string;
      };
      if (body.jobId && (response.ok || response.status === 409)) {
        setEditorError(null);
        setJobId(body.jobId);
        startPolling(body.jobId);
      } else {
        setEditorError(textOverrideErrorMessage(body.error, body.field));
      }
    } finally {
      setRegenerating(null);
    }
  }

  async function persistOrder(nextPhotos: readonly PhotoItem[]) {
    setPhotos(nextPhotos);
    const primary = nextPhotos.find((photo) => photo.isMain);
    await fetch(`/api/properties/${propertyId}/photo-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderedPhotoIds: nextPhotos.map((photo) => photo.id),
        primaryPhotoId: primary?.id,
      }),
    });
  }

  async function movePhoto(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    await persistOrder(next);
  }

  async function changePrimary(photoId: string) {
    const next = photos.map((photo) => ({ ...photo, isMain: photo.id === photoId }));
    await persistOrder(next);
    // Cambiar la foto principal regenera las piezas que dependen de ella.
    for (const catalogKey of PRIMARY_DEPENDENT_CATALOG_KEYS) {
      const piece = PIECES.find((candidate) => candidate.catalogKey === catalogKey);
      if (piece) await handleRegenerate(piece.uiKey);
    }
  }

  return (
    <div>
      {/* ------------------- Las piezas: estado y resultado -------------------
          Estaban en DOS secciones: una tabla de estados que decia "Lista" seis
          veces y, mas abajo y fuera de pantalla, las miniaturas de verdad. En
          un producto visual, la primera pantalla no puede ser una tabla de
          texto sobre imagenes que existen. Se fusionan: una tarjeta por pieza,
          con su estado dentro. */}
      <section
        data-testid="generation-screen"
        aria-label="Piezas de la propiedad"
        className="mb-14"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Las 6 piezas
          </h2>
          {allSettled ? (
            <a
              data-testid="download-zip"
              href={jobId ? `/api/render-jobs/${jobId}/package` : "#"}
              download
              className="rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-on-primary"
            >
              Descargar todo (ZIP)
            </a>
          ) : null}
        </div>
        {generateError ? (
          <p role="alert" className="mb-4 rounded-lg border border-primary bg-surface p-3 text-sm font-medium text-primary">
            {generateError}
          </p>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pieces.map((piece) => (
            <article
              key={piece.uiKey}
              data-testid={`piece-card-${piece.uiKey}`}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-semibold text-foreground">
                  {piece.label}
                </h3>
                <p
                  data-testid={`job-status-${piece.uiKey}`}
                  data-status={piece.status === "waiting" ? "pending" : piece.status}
                  role="status"
                  className="shrink-0 text-xs font-medium text-foreground-muted"
                >
                  {STATUS_TEXT[piece.status]}
                </p>
              </div>
              <PiecePreview artifacts={piece.artifacts} label={piece.label} />

              {piece.error ? (
                <div className="mt-3 rounded border border-border bg-background p-3 text-sm">
                  <p data-testid={`job-error-cause-${piece.uiKey}`} className="text-foreground">
                    <span className="font-semibold">Causa: </span>
                    {piece.error.cause}
                  </p>
                  <p data-testid={`job-error-solution-${piece.uiKey}`} className="mt-1 text-foreground-muted">
                    <span className="font-semibold text-foreground">Solución: </span>
                    {piece.error.solution}
                  </p>
                  {piece.error.retryable ? (
                    <button
                      type="button"
                      data-testid={`retry-${piece.uiKey}`}
                      onClick={() => void handleRetry(piece.uiKey)}
                      disabled={regenerating === piece.uiKey}
                      className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary disabled:opacity-60"
                    >
                      {regenerating === piece.uiKey ? "Reintentando…" : "Reintentar esta pieza"}
                    </button>
                  ) : null}
                </div>
              ) : null}

                {editingPiece === piece.uiKey ? (
                  <div className="mt-3">
                    <label
                      htmlFor={`piece-text-editor-${piece.uiKey}`}
                      className="mb-1 block text-sm font-medium text-foreground"
                    >
                      Texto de la pieza (titular)
                    </label>
                    <textarea
                      id={`piece-text-editor-${piece.uiKey}`}
                      data-testid={`piece-text-editor-${piece.uiKey}`}
                      rows={3}
                      value={editorText}
                      onChange={(event) => setEditorText(event.target.value)}
                      className="w-full border border-border bg-surface p-3 text-sm text-foreground focus:outline-2 focus:outline-primary"
                      aria-invalid={editorError !== null}
                      aria-describedby={
                        editorError ? `piece-text-error-${piece.uiKey}` : undefined
                      }
                    />
                    {editorError ? (
                      <p
                        id={`piece-text-error-${piece.uiKey}`}
                        data-testid={`piece-text-error-${piece.uiKey}`}
                        role="alert"
                        className="mt-2 border border-primary bg-surface p-3 text-sm font-medium text-primary"
                      >
                        {editorError}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      data-testid={`save-piece-edit-${piece.uiKey}`}
                      onClick={() => void handleSaveEdit(piece.uiKey)}
                      className="mt-2 bg-primary px-4 py-2 text-xs font-semibold text-on-primary"
                    >
                      Guardar texto
                    </button>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid={`edit-piece-${piece.uiKey}`}
                    onClick={() => handleEdit(piece.uiKey)}
                    className="border border-border px-3 py-2 text-xs font-medium text-foreground"
                  >
                    Editar texto
                  </button>
                  <button
                    type="button"
                    data-testid={`regenerate-${piece.uiKey}`}
                    onClick={() => void handleRegenerate(piece.uiKey)}
                    disabled={regenerating === piece.uiKey}
                    className="border border-border px-3 py-2 text-xs font-medium text-foreground disabled:opacity-60"
                  >
                    {regenerating === piece.uiKey ? "Regenerando…" : "Regenerar esta pieza"}
                  </button>
                  {piece.artifacts[0] ? (
                    <a
                      data-testid={`download-${piece.uiKey}`}
                      href={`/api/generated-pieces/${piece.artifacts[0].id}/download`}
                      download
                      className="border border-border px-3 py-2 text-xs font-medium text-foreground"
                    >
                      Descargar
                    </a>
                  ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------- Reorden de fotos ------------------------- */}
      <section aria-label="Orden de las fotos">
        <h2 className="mb-4 font-display text-2xl font-semibold text-foreground">
          Fotos de la propiedad
        </h2>
        <ol data-testid="photo-order-list" className="grid gap-4 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="border border-border bg-surface p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={`Foto ${index + 1} de la propiedad`}
                className="h-32 w-full object-cover"
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <button
                    type="button"
                    data-testid={`reorder-photo-${index}`}
                    onClick={() => void movePhoto(index, -1)}
                    disabled={index === 0}
                    aria-label={`Subir la foto ${index + 1}`}
                    className="border border-border px-2 py-1 text-xs disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => void movePhoto(index, 1)}
                    disabled={index === photos.length - 1}
                    aria-label={`Bajar la foto ${index + 1}`}
                    className="border border-border px-2 py-1 text-xs disabled:opacity-40"
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void changePrimary(photo.id)}
                  aria-pressed={photo.isMain}
                  className={
                    photo.isMain
                      ? "bg-secondary px-2 py-1 text-xs font-semibold text-on-primary"
                      : "border border-border px-2 py-1 text-xs font-medium text-foreground"
                  }
                >
                  {photo.isMain ? "Principal" : "Hacer principal"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function PiecePreview({
  artifacts,
  label,
}: {
  readonly artifacts: readonly ArtifactDto[];
  readonly label: string;
}) {
  const first = artifacts[0];
  if (!first) {
    return (
      <p className="text-sm text-foreground-muted">
        Sin artefacto todavía — la pieza no se ha generado.
      </p>
    );
  }
  // `?inline=1`: el preview se sirve sin Content-Disposition: attachment para
  // que el navegador lo muestre embebido en vez de disparar una descarga.
  const url = `/api/generated-pieces/${first.id}/download?inline=1`;
  if (first.mediaType.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`Vista previa de ${label}`}
        className="max-h-72 w-full border border-border object-contain"
      />
    );
  }
  if (first.mediaType === "video/mp4") {
    return (
      <video
        src={url}
        controls
        className="max-h-72 w-full border border-border"
        aria-label={`Vídeo de ${label}`}
      />
    );
  }
  if (first.mediaType === "application/pdf") {
    return <PdfPreview url={url} label={label} />;
  }
  // Email HTML / texto plano: enlace de descarga como preview minima.
  return (
    <p className="text-sm text-foreground-muted">
      Pieza generada ({first.fileName}). Usa el botón Descargar para verla.
    </p>
  );
}

/**
 * Preview de PDF embebido, solo cuando el navegador tiene visor de PDF nativo
 * (Chrome/Edge/Firefox). Chromium headless (Playwright) NO lo tiene:
 * `navigator.pdfViewerEnabled` es `false` ahi, y un `<iframe>` apuntando a un
 * PDF sin visor dispara un evento de descarga espurio en vez de mostrarlo.
 * Sin visor, mostramos un enlace en su lugar — nunca montamos el iframe.
 */
function PdfPreview({ url, label }: { readonly url: string; readonly label: string }) {
  const [canPreview, setCanPreview] = useState(false);

  useEffect(() => {
    setCanPreview(
      typeof navigator !== "undefined" &&
        "pdfViewerEnabled" in navigator &&
        navigator.pdfViewerEnabled === true,
    );
  }, []);

  if (!canPreview) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block border border-border bg-surface p-3 text-sm text-foreground underline"
      >
        Ver ficha ({label})
      </a>
    );
  }

  return (
    <iframe
      src={url}
      title={`Vista previa de ${label}`}
      className="h-72 w-full border border-border"
    />
  );
}
