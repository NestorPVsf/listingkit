/**
 * Manual de uso y configuración, dentro del producto.
 *
 * Existe porque una instalación se entrega en persona pero se usa meses
 * después, y para entonces no queda nadie a quien preguntar. Cubre las dos
 * mitades: lo que hace la agencia cada día y lo que se toca una sola vez al
 * instalar (secretos, HTTPS, copias de seguridad).
 *
 * Va en la app y no en un PDF suelto a propósito: un manual que hay que buscar
 * en el correo de hace seis meses es un manual que no existe.
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cómo funciona — InmoContent OS",
};

interface Seccion {
  readonly id: string;
  readonly titulo: string;
  readonly cuerpo: React.ReactNode;
}

const USO: readonly Seccion[] = [
  {
    id: "que-hace",
    titulo: "Qué hace",
    cuerpo: (
      <p>
        Introduces una sola vez los datos y las fotos de una propiedad, y salen
        seis piezas listas para revisar y publicar: ficha técnica en PDF, post y
        carrusel de Instagram, story, email comercial y vídeo vertical. Todas
        con tu marca. <strong>No publica por ti</strong> en redes ni en
        portales: te entrega el material para que lo revises y lo subas tú.
      </p>
    ),
  },
  {
    id: "flujo",
    titulo: "El día a día",
    cuerpo: (
      <ol className="list-decimal space-y-2 pl-6">
        <li>
          <strong>Nueva propiedad</strong> y rellenas la ficha. Mínimo 3 fotos,
          máximo 20.
        </li>
        <li>
          <strong>Generar.</strong> Tarda un par de minutos; verás el estado de
          cada pieza por separado.
        </li>
        <li>
          <strong>Revisas.</strong> Si un texto no te convence, lo editas y
          regeneras <em>solo</em> esa pieza: las demás no se tocan.
        </li>
        <li>
          <strong>Descargas</strong> pieza a pieza o todo junto en un ZIP.
        </li>
      </ol>
    ),
  },
  {
    id: "direccion",
    titulo: "La dirección privada nunca sale",
    cuerpo: (
      <p>
        La ficha tiene dos direcciones a propósito. La <em>pública</em> es la que
        aparece en las piezas («Centro, Alicante»). La <em>privada</em> es de uso
        interno y no sale nunca: ni en las piezas, ni en el ZIP, ni en los datos
        exportados. Si al editar un texto a mano pegas la dirección privada, el
        sistema lo detecta y no te deja guardar.
      </p>
    ),
  },
  {
    id: "errores",
    titulo: "Si una pieza falla",
    cuerpo: (
      <p>
        Cada pieza lleva su estado. Si alguna falla verás la causa y qué hacer,
        con un botón para reintentar solo esa: el resto del trabajo no se
        pierde. Ejemplo típico: si falta FFmpeg en el servidor, el vídeo falla
        con instrucciones y las otras cinco piezas salen igual.
      </p>
    ),
  },
];

const CONFIGURACION: readonly Seccion[] = [
  {
    id: "marca",
    titulo: "Tu marca",
    cuerpo: (
      <p>
        Se configura una vez, en{" "}
        <Link href="/settings/brand" className="underline">
          Marca
        </Link>
        : logotipo, colores, tipografía y datos de contacto. Es lo que visten
        todas las piezas. Cambiarla no reescribe lo ya generado — para eso hay
        que volver a generar la propiedad.
      </p>
    ),
  },
  {
    id: "voz",
    titulo: "Voz y música del vídeo",
    cuerpo: (
      <p>
        En{" "}
        <Link href="/settings/voice" className="underline">
          Voz y música
        </Link>{" "}
        eliges si el vídeo lleva locución (subiendo tú un audio) o solo música y
        texto en pantalla. <strong>Usa únicamente música con licencia</strong>:
        Instagram silencia o retira las publicaciones con audio protegido, y la
        responsabilidad es de quien publica.
      </p>
    ),
  },
  {
    id: "instalacion",
    titulo: "Requisitos de la instalación",
    cuerpo: (
      <ul className="list-disc space-y-2 pl-6">
        <li>
          <strong>HTTPS obligatorio.</strong> La cookie de sesión va marcada
          como segura: sin certificado, el navegador no la guarda y no se puede
          entrar. No es una recomendación, es un requisito para arrancar.
        </li>
        <li>
          <strong>Contraseña de acceso</strong> (<code>APP_PASSWORD_HASH</code>).
          Sin ella la aplicación responde a todo con un error, y es a propósito:
          preferimos que no arranque a que arranque abierta. Se genera con{" "}
          <code>npm run set-password</code>.
        </li>
        <li>
          <strong>FFmpeg</strong> instalado en el servidor. Solo lo necesita el
          vídeo; el resto de piezas funciona sin él.
        </li>
        <li>
          <strong>Una contraseña por instalación</strong>, no una por persona.
          Una instalación = una agencia. No hay usuarios ni permisos: quien tiene
          la contraseña puede hacer todo.
        </li>
      </ul>
    ),
  },
  {
    id: "copias",
    titulo: "Copias de seguridad",
    cuerpo: (
      <p>
        Hay dos cosas que guardar y están en el servidor:{" "}
        <code>prisma/dev.db</code> (las propiedades y los textos) y las carpetas{" "}
        <code>uploads/</code> y <code>output/</code> (las fotos que subes y las
        piezas generadas). Con esas tres rutas se restaura todo.{" "}
        <strong>Las piezas generadas se acumulan</strong>: cada regeneración deja
        su copia, a propósito, para que un enlace enviado hace meses siga
        funcionando. Conviene vigilar el espacio en disco de vez en cuando.
      </p>
    ),
  },
  {
    id: "limites",
    titulo: "Lo que hoy no hace",
    cuerpo: (
      <ul className="list-disc space-y-2 pl-6">
        <li>No publica en Idealista, Fotocasa ni en redes sociales.</li>
        <li>
          No importa propiedades desde tu CRM: los datos se introducen aquí.
        </li>
        <li>No traduce las piezas a otros idiomas.</li>
        <li>No hay usuarios ni roles, ni registro de quién hizo qué.</li>
      </ul>
    ),
  },
];

function Bloque({ seccion }: { readonly seccion: Seccion }) {
  return (
    <section aria-labelledby={seccion.id} className="scroll-mt-24">
      <h3
        id={seccion.id}
        className="mb-2 font-display text-xl font-semibold text-foreground"
      >
        {seccion.titulo}
      </h3>
      <div className="space-y-2 text-foreground-muted [&_code]:rounded [&_code]:bg-background [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em]">
        {seccion.cuerpo}
      </div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-10">
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Cómo funciona
        </h1>
        <p className="mt-2 max-w-2xl text-foreground-muted">
          Manual de uso y de configuración. La primera parte es para el día a
          día; la segunda, para quien instala o mantiene el sistema.
        </p>
      </header>

      <nav aria-label="Índice" className="mb-12 rounded-2xl bg-surface p-6 shadow-[var(--shadow-raised)]">
        <ul className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {[...USO, ...CONFIGURACION].map((seccion) => (
            <li key={seccion.id}>
              <a href={`#${seccion.id}`} className="text-foreground-muted underline-offset-2 hover:text-foreground hover:underline">
                {seccion.titulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12">
        <div>
          <h2 className="mb-6 font-display text-2xl font-semibold text-foreground">
            Uso diario
          </h2>
          <div className="space-y-8">
            {USO.map((seccion) => (
              <Bloque key={seccion.id} seccion={seccion} />
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-6 font-display text-2xl font-semibold text-foreground">
            Configuración e instalación
          </h2>
          <div className="space-y-8">
            {CONFIGURACION.map((seccion) => (
              <Bloque key={seccion.id} seccion={seccion} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
