"use client";

import { useActionState, useTransition } from "react";
import { updateBrandAction, type BrandSettingsState } from "./actions";

interface BrandDefaults {
  readonly nombre: string;
  readonly telefono: string;
  readonly email: string;
  readonly web: string;
  readonly instagram: string;
  readonly ctaHabitual: string;
}

const initialState: BrandSettingsState = {};

export function BrandSettingsForm({
  brandId,
  defaults,
}: {
  readonly brandId: string;
  readonly defaults: BrandDefaults;
}) {
  const action = updateBrandAction.bind(null, brandId);
  const [state, formAction] = useActionState(action, initialState);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        startTransition(() => formAction(new FormData(form)));
      }}
    >
      {state.error ? (
        <p role="alert" className="mb-6 text-sm font-medium text-primary">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="mb-6 text-sm font-medium text-secondary">
          Marca actualizada.
        </p>
      ) : null}

      <div className="grid gap-5">
        <Field id="nombre" name="nombre" label="Nombre de la agencia" required defaultValue={defaults.nombre} />
        <Field id="telefono" name="telefono" label="Telefono" type="tel" defaultValue={defaults.telefono} />
        <Field id="email" name="email" label="Email" type="email" defaultValue={defaults.email} />
        <Field id="web" name="web" label="Web" type="url" defaultValue={defaults.web} />
        <Field id="instagram" name="instagram" label="Instagram" defaultValue={defaults.instagram} />
        <Field id="ctaHabitual" name="ctaHabitual" label="CTA habitual" defaultValue={defaults.ctaHabitual} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-8 bg-primary px-6 py-2 text-sm font-semibold text-on-primary disabled:opacity-60"
      >
        {isPending ? "Guardando..." : "Guardar cambios"}
      </button>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  required = false,
  defaultValue,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly type?: string;
  readonly required?: boolean;
  readonly defaultValue?: string;
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
        defaultValue={defaultValue}
        className="w-full border border-border bg-surface p-3 text-sm text-foreground focus:outline-2 focus:outline-primary"
      />
    </div>
  );
}
