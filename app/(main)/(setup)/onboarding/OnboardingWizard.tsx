"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { createBrandAction, type OnboardingState } from "./actions";
import { PRESET_FONT_CLASS } from "./preset-fonts";

interface PresetOption {
  id: string;
  nombre: string;
  descripcion: string;
  colores: {
    background: string;
    primary: string;
    secondary: string;
    text: string;
  };
  tipografia: {
    display: { familia: string };
    body: { familia: string };
  };
}

const STEP_LABELS = ["Estilo", "Logo", "Contacto"] as const;
const TOTAL_STEPS = STEP_LABELS.length;

const initialState: OnboardingState = {};

export function OnboardingWizard({
  presets,
  defaultPresetId,
}: {
  presets: PresetOption[];
  defaultPresetId: string;
}) {
  const [step, setStep] = useState(1);
  const [presetId, setPresetId] = useState(defaultPresetId);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [state, formAction] = useActionState(createBrandAction, initialState);
  const [isPending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  function goTo(next: number) {
    setStep(next);
    // Mueve el foco al titulo del nuevo paso — navegacion accesible sin
    // recargar pagina ni perder el resto del formulario montado.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function handleNext() {
    if (step === 1 && !presetId) return;
    if (step === 2 && !logoName) return;
    goTo(Math.min(step + 1, TOTAL_STEPS));
  }

  function handleBack() {
    goTo(Math.max(step - 1, 1));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <ol className="mb-10 flex gap-6 text-sm" aria-label="Progreso del onboarding">
        {STEP_LABELS.map((label, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === step;
          const isDone = stepNumber < step;
          return (
            <li
              key={label}
              aria-current={isActive ? "step" : undefined}
              className={
                isActive
                  ? "font-semibold text-foreground"
                  : isDone
                    ? "text-foreground-muted"
                    : "text-foreground-muted/50"
              }
            >
              {stepNumber}. {label}
            </li>
          );
        })}
      </ol>

      <form
        onSubmit={(event) => {
          if (step !== TOTAL_STEPS) {
            event.preventDefault();
            handleNext();
            return;
          }
          const form = event.currentTarget;
          event.preventDefault();
          startTransition(() => formAction(new FormData(form)));
        }}
      >
        {state.error ? (
          <p role="alert" className="mb-6 text-sm font-medium text-primary">
            {state.error}
          </p>
        ) : null}

        {/* Paso 1 — estilo */}
        <fieldset hidden={step !== 1}>
          <legend className="sr-only">Elige el estilo de tu marca</legend>
          <h1
            ref={step === 1 ? headingRef : undefined}
            tabIndex={-1}
            className="mb-2 font-display text-3xl font-semibold text-foreground"
          >
            Elige el estilo de tu marca
          </h1>
          <p className="mb-8 text-foreground-muted">
            Define la identidad visual que usaran tus piezas generadas.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {presets.map((preset) => {
              const displayFontClass = PRESET_FONT_CLASS[preset.tipografia.display.familia];
              const bodyFontClass = PRESET_FONT_CLASS[preset.tipografia.body.familia];
              return (
                <label
                  key={preset.id}
                  className="cursor-pointer border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-primary"
                  style={{
                    borderColor: presetId === preset.id ? preset.colores.primary : "var(--border)",
                    background: preset.colores.background,
                    color: preset.colores.text,
                  }}
                >
                  <input
                    type="radio"
                    name="presetId"
                    value={preset.id}
                    checked={presetId === preset.id}
                    onChange={() => setPresetId(preset.id)}
                    className="sr-only"
                  />
                  <span className={`block text-lg font-semibold ${displayFontClass ?? ""}`}>
                    {preset.nombre}
                  </span>
                  <span className={`mt-1 block text-sm opacity-80 ${bodyFontClass ?? ""}`}>
                    {preset.descripcion}
                  </span>
                  <span className="mt-3 flex gap-2" aria-hidden="true">
                    <span
                      className="h-6 w-6 rounded-full border"
                      style={{ background: preset.colores.primary }}
                    />
                    <span
                      className="h-6 w-6 rounded-full border"
                      style={{ background: preset.colores.secondary }}
                    />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Paso 2 — logo */}
        <fieldset hidden={step !== 2}>
          <legend className="sr-only">Sube el logo de tu agencia</legend>
          <h1
            ref={step === 2 ? headingRef : undefined}
            tabIndex={-1}
            className="mb-2 font-display text-3xl font-semibold text-foreground"
          >
            Sube el logo de tu agencia
          </h1>
          <p className="mb-8 text-foreground-muted">
            Formatos admitidos: PNG, WebP o JPG. Maximo 5MB.
          </p>
          <label htmlFor="logo" className="mb-2 block text-sm font-medium text-foreground">
            Logo
          </label>
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/webp,image/jpeg"
            required
            onChange={(event) => setLogoName(event.target.files?.[0]?.name ?? null)}
            className="block w-full border border-border bg-surface p-3 text-sm"
            aria-describedby="logo-hint"
          />
          <p id="logo-hint" className="mt-2 text-sm text-foreground-muted">
            {logoName ? `Archivo seleccionado: ${logoName}` : "Ningun archivo seleccionado todavia."}
          </p>
        </fieldset>

        {/* Paso 3 — contacto */}
        <fieldset hidden={step !== 3}>
          <legend className="sr-only">Datos de contacto</legend>
          <h1
            ref={step === 3 ? headingRef : undefined}
            tabIndex={-1}
            className="mb-2 font-display text-3xl font-semibold text-foreground"
          >
            Datos de contacto
          </h1>
          <p className="mb-8 text-foreground-muted">
            Apareceran en las piezas generadas (footer, CTA, ficha de contacto).
          </p>
          <div className="grid gap-5">
            <Field id="nombre" name="nombre" label="Nombre de la agencia" required />
            <Field id="telefono" name="telefono" label="Telefono" type="tel" placeholder="+34 611 22 33 44" />
            <Field id="email" name="email" label="Email" type="email" />
            <Field id="web" name="web" label="Web" type="url" placeholder="https://" />
            <Field id="instagram" name="instagram" label="Instagram" placeholder="usuario (sin @)" />
            <Field id="ctaHabitual" name="ctaHabitual" label="CTA habitual" placeholder="Solicita visita" />
          </div>
        </fieldset>

        <div className="mt-10 flex justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className="px-4 py-2 text-sm font-medium text-foreground-muted disabled:opacity-40"
          >
            Atras
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="bg-primary px-6 py-2 text-sm font-semibold text-on-primary disabled:opacity-60"
          >
            {step === TOTAL_STEPS ? (isPending ? "Guardando..." : "Finalizar") : "Siguiente"}
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  required = false,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        {label}
        {required ? " *" : ""}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full border border-border bg-surface p-3 text-sm text-foreground focus:outline-2 focus:outline-primary"
      />
    </div>
  );
}
