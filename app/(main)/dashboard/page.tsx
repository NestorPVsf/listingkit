import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  rendering: "Generando",
  done: "Completada",
  partial: "Parcial",
  error: "Con errores",
};

export default async function DashboardPage() {
  const [brand, properties] = await Promise.all([
    prisma.brand.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.property.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        renderJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true },
        },
        _count: { select: { generatedPieces: true } },
      },
    }),
  ]);

  const total = properties.length;
  const completed = properties.filter(
    (property) => property.renderJobs[0]?.status === "done",
  ).length;
  const inProgress = properties.filter((property) =>
    ["pending", "rendering"].includes(property.renderJobs[0]?.status ?? ""),
  ).length;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <header className="mb-12 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-foreground-muted">
            InmoContent OS
          </p>
          <h1 className="font-display text-4xl font-semibold text-foreground">
            Panel de propiedades
          </h1>
          {brand ? (
            <p className="mt-2 text-foreground-muted">
              Marca activa: <span className="font-medium text-foreground">{brand.nombre}</span>
            </p>
          ) : null}
        </div>
        <Link
          href="/properties/new"
          data-testid="new-property-link"
          className="bg-primary px-6 py-3 text-sm font-semibold text-on-primary"
        >
          Nueva propiedad
        </Link>
      </header>

      {!brand ? (
        <p className="mb-10 border border-border bg-surface p-4 text-sm text-foreground-muted">
          Aun no has configurado tu marca.{" "}
          <Link href="/onboarding" className="font-medium text-primary underline">
            Completar el onboarding
          </Link>
        </p>
      ) : null}

      <section aria-label="Resumen" className="mb-12 grid gap-6 sm:grid-cols-3">
        <Stat label="Propiedades" value={total} />
        <Stat label="Generadas" value={completed} />
        <Stat label="En curso" value={inProgress} />
      </section>

      <section aria-label="Historial de propiedades">
        <h2 className="mb-4 font-display text-2xl font-semibold text-foreground">
          Historial
        </h2>
        {properties.length === 0 ? (
          <p className="text-foreground-muted">
            Todavia no hay propiedades. Crea la primera con el boton
            &quot;Nueva propiedad&quot;.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {properties.map((property) => {
              const status = property.renderJobs[0]?.status;
              return (
                <li key={property.id} data-testid={`property-history-item-${property.id}`}>
                  <Link
                    href={`/properties/${property.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div>
                      <p className="font-medium text-foreground">{property.internalName}</p>
                      <p className="text-sm text-foreground-muted">
                        {property.city}
                        {property.district ? ` — ${property.district}` : ""} ·{" "}
                        {property._count.generatedPieces} piezas
                      </p>
                    </div>
                    <span className="text-sm font-medium text-foreground-muted">
                      {status ? (STATUS_LABEL[status] ?? status) : "Sin generar"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <nav aria-label="Configuracion" className="mt-12 flex gap-6 text-sm">
        <Link href="/settings/brand" className="text-primary underline">
          Marca
        </Link>
        <Link href="/settings/voice" className="text-primary underline">
          Voz y musica
        </Link>
        <Link href="/help" className="text-primary underline">
          Ayuda
        </Link>
      </nav>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-4xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-sm text-foreground-muted">{label}</p>
    </div>
  );
}
