"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length === 0 || enviando) return;

    setEnviando(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError("Contraseña incorrecta.");
        setPassword("");
        return;
      }
      // `refresh()` ademas de `push()`: sin el, el router puede servir la
      // version cacheada de /dashboard que se genero cuando aun no habia sesion.
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo conectar. Intentalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label
        htmlFor="password"
        className="mb-2 block text-sm font-medium text-foreground"
      >
        Contraseña
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error ? "login-error" : undefined}
        className="w-full border border-border bg-surface p-3 text-foreground focus:outline-2 focus:outline-primary"
      />

      {error ? (
        <p
          id="login-error"
          data-testid="login-error"
          role="alert"
          className="mt-3 border border-primary bg-surface p-3 text-sm font-medium text-primary"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        data-testid="login-submit"
        disabled={enviando || password.length === 0}
        className="mt-6 w-full bg-primary px-4 py-3 text-sm font-semibold text-on-primary disabled:opacity-60"
      >
        {enviando ? "Comprobando..." : "Entrar"}
      </button>
    </form>
  );
}
