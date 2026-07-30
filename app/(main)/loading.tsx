export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16" aria-busy="true">
      <p role="status" className="text-foreground-muted">
        Cargando...
      </p>
    </main>
  );
}
