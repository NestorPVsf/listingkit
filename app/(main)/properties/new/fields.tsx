"use client";

import type { ReactNode } from "react";
import type {
  FieldErrors,
  FieldValues,
  Path,
  UseFormRegister,
} from "react-hook-form";

/**
 * Sub-componentes de campo del formulario de propiedad. Centralizan el
 * contrato de accesibilidad: label asociado, data-testid="field-<name>",
 * aria-invalid + aria-describedby → data-testid="field-error-<name>".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPath = Path<any>;

function getError(errors: FieldErrors, name: string): string | undefined {
  const segments = name.split(".");
  let current: unknown = errors;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current === "object" && current !== null && "message" in current) {
    const message = (current as { message: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}

const INPUT_CLASS =
  "w-full border border-border bg-surface p-3 text-sm text-foreground focus:outline-2 focus:outline-primary aria-[invalid=true]:border-primary";

interface BaseFieldProps {
  readonly name: string;
  readonly label: string;
  readonly required?: boolean;
  readonly hint?: string;
  readonly placeholder?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly register: UseFormRegister<any>;
  readonly errors?: FieldErrors;
}

function FieldShell({
  name,
  label,
  required,
  hint,
  error,
  children,
}: {
  readonly name: string;
  readonly label: string;
  readonly required?: boolean;
  readonly hint?: string;
  readonly error?: string;
  readonly children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={`field-${name}`} className="mb-1 block text-sm font-medium text-foreground">
        {label}
        {required ? " *" : ""}
      </label>
      {children}
      {hint ? (
        <p id={`field-hint-${name}`} className="mt-1 text-xs text-foreground-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`field-error-${name}`}
          data-testid={`field-error-${name}`}
          role="alert"
          className="mt-1 text-sm font-medium text-primary"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(name: string, error?: string, hint?: string): string | undefined {
  const ids: string[] = [];
  if (hint) ids.push(`field-hint-${name}`);
  if (error) ids.push(`field-error-${name}`);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function TextField({
  name,
  label,
  required,
  hint,
  placeholder,
  register,
  errors,
  type = "text",
}: BaseFieldProps & { readonly type?: string }) {
  const error = errors ? getError(errors, name) : undefined;
  return (
    <FieldShell name={name} label={label} required={required} hint={hint} error={error}>
      <input
        id={`field-${name}`}
        data-testid={`field-${name}`}
        type={type}
        placeholder={placeholder}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={INPUT_CLASS}
        {...register(name as AnyPath)}
      />
    </FieldShell>
  );
}

export function NumberField({
  name,
  label,
  required,
  hint,
  register,
  errors,
}: BaseFieldProps) {
  const error = errors ? getError(errors, name) : undefined;
  return (
    <FieldShell name={name} label={label} required={required} hint={hint} error={error}>
      <input
        id={`field-${name}`}
        data-testid={`field-${name}`}
        type="number"
        inputMode="numeric"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={INPUT_CLASS}
        {...register(name as AnyPath, {
          setValueAs: (value: unknown) =>
            value === "" || value === null ? undefined : Number(value),
        })}
      />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  required,
  hint,
  register,
  errors,
  options,
}: BaseFieldProps & {
  readonly options: readonly { value: string; label: string }[];
}) {
  const error = errors ? getError(errors, name) : undefined;
  return (
    <FieldShell name={name} label={label} required={required} hint={hint} error={error}>
      <select
        id={`field-${name}`}
        data-testid={`field-${name}`}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={INPUT_CLASS}
        {...register(name as AnyPath)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function TextareaField({
  name,
  label,
  required,
  hint,
  register,
  errors,
}: BaseFieldProps) {
  const error = errors ? getError(errors, name) : undefined;
  return (
    <FieldShell name={name} label={label} required={required} hint={hint} error={error}>
      <textarea
        id={`field-${name}`}
        data-testid={`field-${name}`}
        rows={5}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={INPUT_CLASS}
        {...register(name as AnyPath)}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  name,
  label,
  register,
}: {
  readonly name: string;
  readonly label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly register: UseFormRegister<any>;
}) {
  return (
    <label
      htmlFor={`field-${name}`}
      className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
    >
      <input
        id={`field-${name}`}
        data-testid={`field-${name}`}
        type="checkbox"
        className="h-4 w-4 accent-[var(--color-primary)]"
        {...register(name as AnyPath)}
      />
      {label}
    </label>
  );
}

export function FormSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} className="mb-10">
      <h2 className="mb-4 border-b border-border pb-2 font-display text-2xl font-semibold text-foreground">
        {title}
      </h2>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}
