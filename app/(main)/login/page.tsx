import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Acceso — InmoContent OS",
};

/**
 * Pantalla de acceso del operador. Vive dentro del grupo `(main)` para heredar
 * las fuentes y los tokens de la UI (ver .claude/design/DESIGN.md): editorial,
 * jerarquia por tipografia, sin cajas decorativas.
 */
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <p className="mb-2 text-sm font-medium tracking-wide text-foreground-muted">
        InmoContent OS
      </p>
      <h1 className="mb-8 font-display text-3xl font-semibold text-foreground">
        Acceso
      </h1>
      <LoginForm />
      <p className="mt-8 text-sm text-foreground-muted">
        Esta instalacion usa una unica contraseña de operador. Si no la tienes,
        pidesela a quien monto el sistema.
      </p>
    </main>
  );
}
