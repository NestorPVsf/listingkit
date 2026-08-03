/**
 * Importar la cartera desde el XML del CRM.
 *
 * La pantalla existe para una conversacion concreta: la agencia trae su fichero
 * y quiere ver QUE entraria antes de tocar nada. Por eso son dos pasos —
 * informe primero, confirmar despues— y por eso el informe enseña los avisos
 * tan grandes como los aciertos.
 */
"use client";

import { useState } from "react";

interface ImportIssue {
  readonly field: string;
  readonly severity: "blocking" | "warning";
  readonly message: string;
}

interface Candidate {
  readonly externalId: string;
  readonly ref?: string;
  readonly title: string;
  readonly town?: string;
  readonly price?: number;
  readonly photoUrls: readonly string[];
  readonly issues: readonly ImportIssue[];
}

interface Report {
  readonly total: number;
  readonly importable: number;
  readonly blocked: number;
  readonly candidates: readonly Candidate[];
}

interface Result {
  readonly externalId: string;
  readonly outcome: "created" | "updated" | "failed";
  readonly photosImported?: number;
  readonly reason?: string;
}

interface Summary {
  readonly created: number;
  readonly updated: number;
  readonly failed: number;
  readonly results: readonly Result[];
}

const PRECIO = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function ImportScreen() {
  const [feedXml, setFeedXml] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function analizar(file: File) {
    setCargando(true);
    setError(null);
    setSummary(null);
    try {
      const xml = await file.text();
      const cuerpo = new FormData();
      cuerpo.append("feed", file);
      const respuesta = await fetch("/api/import", { method: "POST", body: cuerpo });
      const datos = (await respuesta.json()) as Report & { error?: string; detail?: string };
      if (!respuesta.ok) {
        setError(datos.detail ?? datos.error ?? "No se pudo leer el fichero.");
        return;
      }
      setFeedXml(xml);
      setReport(datos);
      // Preseleccionadas las que entran: lo normal es querer todas, y quien
      // quiera afinar desmarca.
      setSeleccion(
        new Set(
          datos.candidates
            .filter((c) => !c.issues.some((i) => i.severity === "blocking"))
            .map((c) => c.externalId),
        ),
      );
    } catch {
      setError("No se pudo leer el fichero.");
    } finally {
      setCargando(false);
    }
  }

  async function confirmar() {
    if (!feedXml || seleccion.size === 0) return;
    setCargando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feed: feedXml, externalIds: [...seleccion] }),
      });
      const datos = (await respuesta.json()) as Summary & { error?: string; detail?: string };
      if (!respuesta.ok) {
        setError(datos.detail ?? datos.error ?? "La importación falló.");
        return;
      }
      setSummary(datos);
    } catch {
      setError("La importación falló.");
    } finally {
      setCargando(false);
    }
  }

  function alternar(externalId: string) {
    setSeleccion((previa) => {
      const siguiente = new Set(previa);
      if (siguiente.has(externalId)) siguiente.delete(externalId);
      else siguiente.add(externalId);
      return siguiente;
    });
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-foreground">
        Importar desde tu CRM
      </h1>
      <p className="mt-2 max-w-2xl text-foreground-muted">
        Sube el XML que tu CRM ya genera para los portales (formato Kyero: lo
        exportan Witei e Inmovilla, entre otros). Primero verás qué entraría; no
        se guarda nada hasta que lo confirmes.
      </p>

      {error ? (
        <p role="alert" className="mt-6 rounded-xl border border-primary bg-surface p-4 text-sm font-medium text-primary">
          {error}
        </p>
      ) : null}

      {!report ? (
        <label className="mt-8 flex cursor-pointer flex-col items-center rounded-2xl bg-surface p-12 text-center shadow-[var(--shadow-raised)]">
          <span className="font-display text-xl font-semibold text-foreground">
            {cargando ? "Leyendo el fichero…" : "Elige el fichero XML"}
          </span>
          <span className="mt-1 text-sm text-foreground-muted">
            No se envía a ningún sitio: se lee en tu servidor.
          </span>
          <input
            type="file"
            accept=".xml,text/xml,application/xml"
            className="sr-only"
            disabled={cargando}
            onChange={(evento) => {
              const file = evento.target.files?.[0];
              if (file) void analizar(file);
            }}
          />
        </label>
      ) : null}

      {report && !summary ? (
        <>
          <section className="mt-8 rounded-2xl bg-surface p-6 shadow-[var(--shadow-raised)]">
            <p className="text-foreground">
              <strong className="font-display text-2xl">{report.total}</strong>{" "}
              propiedades en el fichero ·{" "}
              <strong className="text-secondary">{report.importable}</strong>{" "}
              listas para importar
              {report.blocked > 0 ? (
                <>
                  {" "}· <strong className="text-primary">{report.blocked}</strong>{" "}
                  con datos que faltan
                </>
              ) : null}
            </p>
            <p className="mt-2 text-sm text-foreground-muted">
              Un feed de portal es público, así que nunca trae la dirección
              exacta ni el agente. Eso se completa después, propiedad a
              propiedad.
            </p>
          </section>

          <ul className="mt-6 space-y-3">
            {report.candidates.map((candidato) => {
              const bloqueos = candidato.issues.filter((i) => i.severity === "blocking");
              const bloqueado = bloqueos.length > 0;
              return (
                <li
                  key={candidato.externalId}
                  className="rounded-2xl bg-surface p-5 shadow-[var(--shadow-raised)]"
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0"
                      checked={seleccion.has(candidato.externalId)}
                      disabled={bloqueado}
                      onChange={() => alternar(candidato.externalId)}
                      aria-label={`Importar ${candidato.title}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">
                        {candidato.ref ? `${candidato.ref} · ` : ""}
                        {candidato.title}
                      </p>
                      <p className="mt-0.5 text-sm text-foreground-muted">
                        {candidato.price !== undefined ? PRECIO.format(candidato.price) : "sin precio"}
                        {" · "}
                        {candidato.photoUrls.length} foto
                        {candidato.photoUrls.length === 1 ? "" : "s"}
                      </p>

                      {bloqueado ? (
                        <ul className="mt-3 space-y-1">
                          {bloqueos.map((problema) => (
                            <li key={problema.field} className="text-sm text-primary">
                              <span className="font-semibold">{problema.field}:</span>{" "}
                              {problema.message}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {candidato.issues.filter((i) => i.severity === "warning").length > 0 ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm text-foreground-muted">
                            {candidato.issues.filter((i) => i.severity === "warning").length}{" "}
                            aviso(s) — qué se rellena y qué revisar
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {candidato.issues
                              .filter((i) => i.severity === "warning")
                              .map((aviso) => (
                                <li key={aviso.field} className="text-sm text-foreground-muted">
                                  <span className="font-medium text-foreground">
                                    {aviso.field}:
                                  </span>{" "}
                                  {aviso.message}
                                </li>
                              ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="glass-bar sticky bottom-0 mt-8 flex flex-wrap items-center justify-between gap-4 rounded-t-2xl px-6 py-4">
            <p className="text-sm text-foreground-muted">
              {seleccion.size} seleccionada{seleccion.size === 1 ? "" : "s"}. Se
              descargarán sus fotos, así que puede tardar.
            </p>
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={cargando || seleccion.size === 0}
              className="rounded-full bg-primary px-7 py-3 text-sm font-semibold text-on-primary disabled:opacity-60"
            >
              {cargando ? "Importando…" : `Importar ${seleccion.size}`}
            </button>
          </div>
        </>
      ) : null}

      {summary ? (
        <section className="mt-8 rounded-2xl bg-surface p-6 shadow-[var(--shadow-raised)]">
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Importación terminada
          </h2>
          <p className="mt-2 text-foreground">
            {summary.created} creada{summary.created === 1 ? "" : "s"} ·{" "}
            {summary.updated} actualizada{summary.updated === 1 ? "" : "s"} ·{" "}
            {summary.failed} fallida{summary.failed === 1 ? "" : "s"}
          </p>
          {summary.failed > 0 ? (
            <ul className="mt-4 space-y-1">
              {summary.results
                .filter((r) => r.outcome === "failed")
                .map((fallo) => (
                  <li key={fallo.externalId} className="text-sm text-primary">
                    <span className="font-semibold">{fallo.externalId}:</span> {fallo.reason}
                  </li>
                ))}
            </ul>
          ) : null}
          <a
            href="/dashboard"
            className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary"
          >
            Ver la cartera
          </a>
        </section>
      ) : null}
    </main>
  );
}
