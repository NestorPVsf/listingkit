/**
 * Panel de propiedades.
 *
 * Reescrito tras ver lo que veia el usuario: una lista plana de 340 filas de
 * texto, 26.685 px de alto, sin una sola foto — en un producto cuyo valor
 * entero es visual. Los cambios no son de gusto:
 *
 * - **Fotos**: la tarjeta se apoya en la foto principal. Un agente reconoce sus
 *   propiedades por la imagen, no por el nombre interno.
 * - **El estado es una accion**, no una etiqueta. "Sin generar" describia; ahora
 *   invita a generar.
 * - **Vocabulario de la agencia**: "Historial" era un log; esto es su cartera.
 * - **Se paginan y se buscan**: antes se traian TODAS las filas con sus conteos
 *   en cada carga.
 * - **Como funciona**, visible: la promesa (una alta -> 6 piezas) no aparecia en
 *   ninguna pantalla; la pagina de ayuda estaba enlazada al final del scroll.
 */
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const POR_PAGINA = 12;

const PRECIO = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

interface DashboardPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type EstadoTarjeta =
  | { readonly tono: "listo"; readonly texto: string }
  | { readonly tono: "curso"; readonly texto: string }
  | { readonly tono: "aviso"; readonly texto: string }
  | { readonly tono: "pendiente"; readonly texto: string };

function estadoDe(
  jobStatus: string | undefined,
  piezasDistintas: number,
): EstadoTarjeta {
  if (jobStatus === "pending" || jobStatus === "rendering") {
    return { tono: "curso", texto: "Generando…" };
  }
  if (jobStatus === "error") return { tono: "aviso", texto: "Falló — revisar" };
  if (jobStatus === "partial") {
    return { tono: "aviso", texto: `${piezasDistintas} de 6 — incompleta` };
  }
  if (piezasDistintas > 0) {
    return { tono: "listo", texto: `${piezasDistintas} piezas listas` };
  }
  return { tono: "pendiente", texto: "Generar las 6 piezas" };
}

const CLASE_ESTADO: Record<EstadoTarjeta["tono"], string> = {
  listo: "bg-secondary/10 text-secondary",
  curso: "bg-foreground/10 text-foreground",
  aviso: "bg-primary/10 text-primary",
  pendiente: "bg-primary text-on-primary",
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const query = await searchParams;
  const busqueda = typeof query.q === "string" ? query.q.trim() : "";
  const paginaPedida = Number(typeof query.page === "string" ? query.page : "1");
  const pagina = Number.isSafeInteger(paginaPedida) && paginaPedida > 0 ? paginaPedida : 1;

  const filtro = busqueda
    ? {
        OR: [
          { internalName: { contains: busqueda } },
          { city: { contains: busqueda } },
          { district: { contains: busqueda } },
        ],
      }
    : {};

  const [brand, total, propiedades] = await Promise.all([
    // La PRIMERA marca, no la ultima creada: una instalacion es una agencia y
    // tiene una marca. Ver persistBrand() en el onboarding.
    prisma.brand.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.property.count({ where: filtro }),
    prisma.property.findMany({
      where: filtro,
      orderBy: { createdAt: "desc" },
      take: POR_PAGINA,
      skip: (pagina - 1) * POR_PAGINA,
      include: {
        photos: { orderBy: { order: "asc" }, take: 1, select: { id: true } },
        renderJobs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
        // Se cuentan las piezas DISTINTAS: hay 11 artefactos por propiedad
        // (el carrusel son 5), pero lo que el producto promete son 6 piezas.
        generatedPieces: { select: { pieceKey: true } },
      },
    }),
  ]);

  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA));
  const sinNingunaPropiedad = total === 0 && busqueda === "";

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground">
            Tus propiedades
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {brand ? (
              <>
                Marca: <span className="font-medium text-foreground">{brand.nombre}</span>{" "}
                ·{" "}
                <Link href="/settings/brand" className="underline hover:text-foreground">
                  cambiar
                </Link>
              </>
            ) : (
              <Link href="/onboarding" className="font-medium text-primary underline">
                Configura tu marca para empezar
              </Link>
            )}
          </p>
        </div>

        <form action="/dashboard" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={busqueda}
            placeholder="Buscar por zona o nombre…"
            aria-label="Buscar propiedades"
            className="w-64 rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-foreground focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground"
          >
            Buscar
          </button>
        </form>
      </div>

      {sinNingunaPropiedad ? <ComoFunciona /> : null}

      {total === 0 && busqueda ? (
        <p className="border-y border-border py-10 text-center text-foreground-muted">
          No hay ninguna propiedad que coincida con «{busqueda}».{" "}
          <Link href="/dashboard" className="underline">
            Ver todas
          </Link>
        </p>
      ) : null}

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {propiedades.map((propiedad) => {
          const piezas = new Set(propiedad.generatedPieces.map((p) => p.pieceKey)).size;
          const estado = estadoDe(propiedad.renderJobs[0]?.status, piezas);
          const foto = propiedad.photos[0];
          // El nombre interno lleva prefijos de trabajo ("[DEMO] ", "Piso ...
          // — Postiguet Homes"): en la tarjeta manda la propiedad, no la etiqueta.
          const titulo = propiedad.internalName.replace(/^\[DEMO\]\s*/, "");

          return (
            <li key={propiedad.id}>
              <Link
                href={`/properties/${propiedad.id}`}
                data-testid={`property-history-item-${propiedad.id}`}
                className="group block overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-[0_2px_16px_rgba(26,24,21,0.08)]"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-border">
                  {foto ? (
                    // eslint-disable-next-line @next/next/no-img-element -- los
                    // assets se sirven por una ruta propia con id opaco, no por
                    // el optimizador de Next.
                    <img
                      src={`/api/assets/${foto.id}`}
                      alt={`Foto principal de ${titulo}`}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-foreground-muted">
                      Sin fotos
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <p className="font-display text-2xl font-semibold text-foreground">
                    {PRECIO.format(propiedad.price)}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-foreground-muted">
                    {propiedad.district ? `${propiedad.district} · ` : ""}
                    {propiedad.city}
                  </p>
                  <p className="mt-2 truncate text-sm text-foreground">{titulo}</p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {propiedad.bedrooms} hab · {propiedad.bathrooms} baño
                    {propiedad.bathrooms === 1 ? "" : "s"} · {propiedad.builtAreaM2} m²
                  </p>
                  <span
                    className={`mt-4 inline-block rounded-full px-3 py-1.5 text-xs font-semibold ${CLASE_ESTADO[estado.tono]}`}
                  >
                    {estado.texto}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {ultimaPagina > 1 ? (
        <nav
          aria-label="Paginación"
          className="mt-10 flex items-center justify-center gap-4 text-sm"
        >
          <PaginaEnlace pagina={pagina - 1} busqueda={busqueda} activo={pagina > 1}>
            ← Anteriores
          </PaginaEnlace>
          <span className="text-foreground-muted">
            Página {pagina} de {ultimaPagina} · {total} propiedades
          </span>
          <PaginaEnlace
            pagina={pagina + 1}
            busqueda={busqueda}
            activo={pagina < ultimaPagina}
          >
            Siguientes →
          </PaginaEnlace>
        </nav>
      ) : null}
    </main>
  );
}

function PaginaEnlace({
  pagina,
  busqueda,
  activo,
  children,
}: {
  readonly pagina: number;
  readonly busqueda: string;
  readonly activo: boolean;
  readonly children: React.ReactNode;
}) {
  if (!activo) {
    return <span className="text-border">{children}</span>;
  }
  const params = new URLSearchParams();
  if (busqueda) params.set("q", busqueda);
  if (pagina > 1) params.set("page", String(pagina));
  const query = params.toString();
  return (
    <Link href={`/dashboard${query ? `?${query}` : ""}`} className="underline">
      {children}
    </Link>
  );
}

/**
 * Lo que el usuario echo en falta con estas palabras: "la explicación de uso no
 * está reflejada aquí en ningún lado". Existia — en `/help`, enlazada al final
 * del scroll. Aqui va donde se entra, y solo mientras no haya propiedades.
 */
function ComoFunciona() {
  const pasos = [
    {
      titulo: "Das de alta la propiedad una vez",
      texto:
        "Datos, fotos y lo que no puede salir publicado (la dirección exacta se queda dentro).",
    },
    {
      titulo: "Pulsas generar",
      texto:
        "En un par de minutos salen las 6 piezas con tu marca: ficha PDF, post, carrusel, story, email y vídeo vertical.",
    },
    {
      titulo: "Descargas y publicas",
      texto:
        "Todo junto en un ZIP, o pieza a pieza. Si algo no te convence, editas el texto y regeneras solo esa.",
    },
  ];

  return (
    <section className="mb-10 rounded-lg border border-border bg-surface p-8">
      <h2 className="font-display text-2xl font-semibold text-foreground">
        Una alta, seis piezas
      </h2>
      <p className="mt-2 max-w-2xl text-foreground-muted">
        Lo que hoy se hace a mano en Canva —recortar cada foto a su formato,
        montar la ficha, escribir el texto tres veces— aquí sale de una sola
        carga de datos.
      </p>
      <ol className="mt-6 grid gap-6 sm:grid-cols-3">
        {pasos.map((paso, indice) => (
          <li key={paso.titulo}>
            <span className="font-display text-3xl font-semibold text-primary">
              {indice + 1}
            </span>
            <p className="mt-1 font-medium text-foreground">{paso.titulo}</p>
            <p className="mt-1 text-sm text-foreground-muted">{paso.texto}</p>
          </li>
        ))}
      </ol>
      <Link
        href="/properties/new"
        className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary"
      >
        Dar de alta la primera propiedad
      </Link>
    </section>
  );
}
