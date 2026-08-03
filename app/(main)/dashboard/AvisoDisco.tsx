/**
 * Aviso de disco lleno.
 *
 * Va en el panel y no en la pantalla de generar por una razon concreta: cuando
 * el disco se acaba, el sintoma no es un mensaje claro sino un vídeo que falla
 * a mitad o un ZIP que sale corto. Para entonces el operador ya ha perdido una
 * generacion. Aqui lo ve al entrar, con margen para hacer sitio.
 *
 * Solo aparece por debajo del 15%. Por encima no se pinta nada: un indicador
 * permanente de disco en un panel de propiedades es ruido.
 */
import Link from "next/link";
import { diskLevel, readOutputDiskSpace } from "@/lib/infrastructure/storage/disk-space";

const GIGA = 1024 ** 3;

function enGigas(bytes: number): string {
  return `${(bytes / GIGA).toLocaleString("es-ES", {
    maximumFractionDigits: 1,
  })} GB`;
}

export default async function AvisoDisco() {
  const espacio = await readOutputDiskSpace();
  if (!espacio) return null;

  const nivel = diskLevel(espacio);
  if (nivel === "ok") return null;

  const porcentaje = Math.round(espacio.freeRatio * 100);
  const critico = nivel === "critical";

  return (
    <section
      role="status"
      data-testid="aviso-disco"
      className={`mb-8 flex flex-wrap items-start gap-x-6 gap-y-3 rounded-2xl border-l-4 bg-surface p-5 shadow-[var(--shadow-raised)] ${
        critico ? "border-l-primary" : "border-l-foreground-muted"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {critico
            ? `Queda muy poco disco: ${enGigas(espacio.freeBytes)} libres (${porcentaje}%).`
            : `Queda poco disco: ${enGigas(espacio.freeBytes)} libres (${porcentaje}% de ${enGigas(espacio.totalBytes)}).`}
        </p>
        <p className="mt-1 text-sm text-foreground-muted">
          {critico
            ? "Las próximas generaciones pueden fallar a mitad —el vídeo es lo primero que se rompe—. Haz sitio antes de seguir generando."
            : "Cada generación completa ocupa unos 18 MB. Conviene hacer sitio antes de que se note."}{" "}
          De cada propiedad se conservan las tres últimas generaciones
          superadas; borrar propiedades que ya no estén en cartera libera el
          resto.
        </p>
      </div>
      <Link
        href="/help#espacio"
        className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
      >
        Cómo liberar espacio
      </Link>
    </section>
  );
}
