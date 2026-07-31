import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ayuda — InmoContent OS",
};

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="mb-10">
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-foreground-muted">
          InmoContent OS
        </p>
        <h1 className="font-display text-4xl font-semibold text-foreground">Ayuda</h1>
      </header>

      <div className="space-y-8 text-foreground">
        <section aria-labelledby="help-que-es">
          <h2 id="help-que-es" className="mb-2 font-display text-2xl font-semibold">
            Que hace InmoContent OS
          </h2>
          <p className="text-foreground-muted">
            Introduces una sola vez los datos y las fotos de una propiedad y el
            sistema genera seis piezas listas para revisar y publicar: ficha
            técnica PDF, post y carrusel de Instagram, story, email comercial y
            video vertical. No publica en redes ni portales: te entrega el
            contenido para que lo revises.
          </p>
        </section>

        <section aria-labelledby="help-flujo">
          <h2 id="help-flujo" className="mb-2 font-display text-2xl font-semibold">
            Flujo recomendado
          </h2>
          <ol className="list-decimal space-y-2 pl-6 text-foreground-muted">
            <li>Configura tu marca (onboarding) la primera vez.</li>
            <li>Crea una propiedad desde el botón &quot;Nueva propiedad&quot; y sube al menos 3 fotos.</li>
            <li>Espera a que se generen las piezas (veras el estado de cada una).</li>
            <li>Revisa la vista previa, edita textos si hace falta y regenera solo la pieza afectada.</li>
            <li>Descarga las piezas individualmente o todas en un ZIP.</li>
          </ol>
        </section>

        <section aria-labelledby="help-privacidad">
          <h2 id="help-privacidad" className="mb-2 font-display text-2xl font-semibold">
            Privacidad de la direccion
          </h2>
          <p className="text-foreground-muted">
            La direccion privada de la propiedad es de uso interno y nunca
            aparece en las piezas generadas, en el ZIP ni en los datos
            exportados. Usa la &quot;direccion publica&quot; para lo que quieras
            mostrar en los anuncios.
          </p>
        </section>

        <section aria-labelledby="help-errores">
          <h2 id="help-errores" className="mb-2 font-display text-2xl font-semibold">
            Si una pieza falla
          </h2>
          <p className="text-foreground-muted">
            Cada pieza muestra su estado. Si alguna falla, veras la causa y la
            solución sugerida junto a un botón para reintentar solo esa pieza;
            el resto no se pierde. Por ejemplo, si falta FFmpeg en el sistema,
            el video fallara con instrucciones de instalacion pero las demas
            piezas se generaran igual.
          </p>
        </section>
      </div>
    </main>
  );
}
