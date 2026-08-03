# ListingKit

[![CI](https://github.com/NestorPVsf/listingkit/actions/workflows/ci.yml/badge.svg)](https://github.com/NestorPVsf/listingkit/actions/workflows/ci.yml)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)

Una ficha de propiedad entra. Salen seis piezas de marketing con la marca de la
agencia: ficha técnica en PDF, post de Instagram, carrusel, story, email
comercial y vídeo vertical.

El dolor que ataca está documentado en `docs/research/`: una agencia media teclea
los mismos datos tres o cuatro veces —CRM, portal, Canva, PDF— y dedica entre dos
horas y dos horas y media por propiedad. Y hay trabajo que directamente no se
hace: la ficha en PDF «a menudo no existe» y el vídeo es «prácticamente
inexistente» salvo que se contrate a alguien de fuera.

**No publica por ti.** Genera el material y te lo entrega; subirlo es tuyo.

## Cómo está montado

Un motor genérico con un vertical enchufado encima. El motor no sabe qué es un
piso: recibe una entidad, la proyecta a una vista pública, resuelve *bindings*,
aplica reglas legales y encarga las piezas a los renderizadores. Lo que sabe de
inmuebles vive en `niches/inmobiliaria/`.

```
lib/engine/          motor: contratos, puertos, orquestación de trabajos
lib/infrastructure/  adaptadores: Playwright, FFmpeg, Prisma, ZIP, IA
niches/inmobiliaria/ el vertical: esquema, textos, plantillas, reglas legales
app/                 interfaz (Next.js App Router) y API
docs/architecture/   la ADR que manda sobre todo lo anterior
```

La dirección de dependencias es innegociable y hay un test que la vigila fichero
a fichero: **el nicho depende del motor, nunca al revés**. Levantar un vertical
nuevo no toca `lib/`; hay una plantilla de PRP en `.specs/templates/`.

## Decisiones que no son obvias

- **La dirección privada no puede salir.** No por convención: `PublicPropertyView`
  es una proyección por *allowlist* y es el único tipo que aceptan las plantillas
  públicas. Un campo nuevo no llega a una pieza hasta que alguien lo añade a
  propósito. El editor de texto libre, que es la puerta de atrás, tiene su propio
  guardarraíl.
- **Artefactos inmutables.** Cada trabajo escribe en su propio directorio, así que
  regenerar una pieza no cambia lo que descarga un enlace enviado hace semanas.
  A cambio los ficheros se acumulan: es un intercambio consciente, no un descuido.
- **Una versión por trabajo.** Si la propiedad cambia a mitad de una generación,
  las piezas se niegan en vez de entregar un juego con datos de dos momentos.
- **La IA reescribe, no inventa.** Apagada por defecto. Cuando se activa parte de
  un texto existente, y la salida se valida: no puede introducir ningún número que
  no esté en la ficha o en el texto original. Si lo intenta, se descarta entera.
- **La importación no crea a ciegas.** Lee el XML del CRM (formato Kyero) y
  produce un informe de qué entraría y qué falta antes de escribir nada. Las
  fotos se descargan con protección SSRF: se resuelven las IPs y se rechazan las
  privadas, la de metadatos de la nube y los saltos de redirección sin validar.
- **Texto por plantillas como camino principal.** Determinista, sin coste y sin
  inventar. Ver `docs/architecture/niche-engine.md`.

## Poner en marcha

Requisito único: Node 22 o superior. Nada de cuentas, claves ni servicios de
terceros para tenerlo funcionando en local.

```bash
npm install
npx prisma migrate deploy
npm run db:seed     # marca y 3 propiedades de demostración con fotos reales
npm run dev
```

Copia `.env.example` a `.env` y ajústalo. En producción hacen falta además HTTPS
y `APP_PASSWORD_HASH` (`npm run set-password`): sin contraseña la aplicación
responde con un error a todo, a propósito.

El nombre visible se cambia por instalación con `NEXT_PUBLIC_APP_NAME`. La
reescritura de texto con IA es **opcional y viene apagada por defecto**: sin
`AI_TEXT_ENABLED=1` en el `.env` no se llama a ningún servicio externo y el
botón ni siquiera aparece — ver `.env.example` para activarla con tu propio
proveedor y clave.

## Qué NO hace / límites

- **No publica por ti.** Genera las seis piezas y te las entrega; subirlas a
  Instagram, al portal o al CRM sigue siendo cosa tuya.
- **No inventa datos.** Si un campo no está en la ficha, no sale en la pieza —
  ni la reescritura con IA (cuando está activada) puede introducir un número
  que no venga de la ficha o del texto original.
- **Una instalación = una agencia = una contraseña.** No hay gestión de
  usuarios, roles ni multi-inquilino: eso es otro producto.
- **Los artefactos viven en disco local.** Con una sola instancia funciona sin
  más; con varias hace falta almacenamiento compartido (`output/`) porque una
  instancia no sirve lo que escribió otra.
- **Cuotas por fichero, no acumuladas.** Un uso normal no lo nota; un abuso
  deliberado, sí.
- Lista completa, con nombre y apellidos, en `AUDIT.md` §6 ("Lo que NO hace").

## Comprobaciones

```bash
npm test            # 372 unitarios
npm run test:e2e    # 27 end-to-end (desarrollo + build de producción real)
```

Los E2E corren contra dos servidores: uno de desarrollo y un `next build && next
start` de verdad. Existe porque los dos fallos más caros del proyecto pasaron con
toda la suite en verde — sólo se manifestaban en un build de producción. Usan sus
propias bases de datos: pasar los tests no toca tus datos.

## Estado

Instalable en una agencia detrás de HTTPS. Lo que falta, con nombre y apellidos,
está en `AUDIT.md` §6 — incluida la sección «lo que no hace», que es la que evita
la conversación incómoda a los tres meses.

`AUDIT.md` es la auditoría de seguridad del propio proyecto: revisor por ejes ×3 en
paralelo + revisión adversarial cross-model con Codex sobre el producto real,
no una checklist genérica. Documenta vulnerabilidades que existieron —fotos
que filtraban GPS por EXIF sin recodificar, un logo SVG que permitía XSS
persistente same-origin, entre otras 14— y cómo se cerró cada una, con test de
regresión (`tests/security/`). Se deja en el repo a propósito: demuestra
proceso, no solo lo afirma.

## Contacto

Esto es un proyecto personal, abierto bajo MIT para que lo cojas y lo adaptes
sin pedir permiso. Si quieres esto mismo montado para tu agencia, con tu
marca y tus flujos, o cualquier otra cosa a medida: **info@podervsfuerza.com**
