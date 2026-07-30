import type { Metadata } from "next";
import { PropertyForm } from "./PropertyForm";

export const metadata: Metadata = {
  title: "Nueva propiedad — InmoContent OS",
};

export default function NewPropertyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <header className="mb-10">
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-foreground-muted">
          InmoContent OS
        </p>
        <h1 className="font-display text-4xl font-semibold text-foreground">
          Nueva propiedad
        </h1>
        <p className="mt-2 text-foreground-muted">
          Rellena los datos una sola vez: generaremos la ficha PDF, los posts de
          Instagram, el email y el video con tu marca.
        </p>
      </header>
      <PropertyForm />
    </main>
  );
}
