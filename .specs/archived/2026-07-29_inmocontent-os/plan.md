# Plan técnico de implementación — InmoContent OS v1

## Propósito y relación con `PLAN.md`

Este documento detalla cómo implementar las ocho fases ya definidas en
`PLAN.md`. No las sustituye, renumera ni amplía su alcance. Ante una discrepancia,
mandan la especificación funcional y el plan raíz.

Restricciones transversales:

- Next.js con App Router, TypeScript estricto y npm sobre Windows nativo.
- Motor local de plantillas; IA, publicación y TTS externo deshabilitados en v1.
- Prisma con SQLite para la persistencia local.
- Playwright para PDF y PNG; FFmpeg para MP4; ZIP como entrega final.
- `inmobiliaria` es un plugin de `NicheConfig`, nunca una rama especial del core.
- Ningún template público puede recibir la dirección privada.

## Capas y dirección de dependencias

```text
┌──────────────────────────────────────────────────────────────┐
│ Presentación                                                 │
│ app/ · components/ · Route Handlers · Server Actions         │
└──────────────────────────────┬───────────────────────────────┘
                               │ invoca casos de uso y DTOs
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Aplicación / dominio genérico                                │
│ lib/engine/                                                  │
│ contratos · pipeline · jobs · ports · políticas transversales│
└───────────────────┬──────────────────────────┬───────────────┘
                    │ usa puertos              │ recibe plugins
                    ▼                          ▼
┌──────────────────────────────┐  ┌────────────────────────────┐
│ Infraestructura             │  │ Nichos                     │
│ lib/infrastructure/         │  │ niches/inmobiliaria/       │
│ Prisma · FS · Playwright    │  │ schema · bindings · reglas │
│ FFmpeg · ZIP                │  │ catálogo · templates       │
└──────────────────────────────┘  └────────────────────────────┘
                    ▲                          ▲
                    └──────────────┬───────────┘
                                   │
                        lib/bootstrap/create-app.ts
                        raíz de composición
```

Reglas de dependencia:

- `app/` depende de casos de uso, no de Prisma ni de `child_process`.
- `lib/engine/` no importa `app/`, `lib/infrastructure/` ni ningún directorio de
  `niches/`.
- Infraestructura implementa interfaces declaradas en `lib/engine/ports/`.
- Cada nicho puede importar contratos genéricos, pero el core no puede importarlo.
- `lib/bootstrap/create-app.ts` es la excepción controlada: ensambla registry,
  repositorios, renderers, almacenamiento, reloj y empaquetador.
- Los componentes de templates reciben `TemplateBindings`; nunca reciben filas de
  Prisma ni el payload original.

### Responsabilidad de cada capa

| Capa | Responsabilidad | No debe hacer |
|---|---|---|
| Presentación | Formulario, autoguardado, estados, preview, edición y descargas. | Ejecutar FFmpeg, construir SQL o decidir copy. |
| Engine | Validar a través del plugin, crear bindings, planificar tareas, controlar estados y empaquetar mediante puertos. | Conocer propiedades, clínicas, JSX concreto o rutas físicas. |
| Nicho | Schema, proyección pública, catálogo, glosario, reglas legales, copy y templates. | Acceder directamente a Prisma/FS o cambiar la máquina de estados. |
| Infraestructura | Persistencia, archivos, navegador headless, procesos y ZIP. | Introducir reglas inmobiliarias o decidir qué piezas existen. |
| Bootstrap | Inyección explícita de implementaciones. | Contener lógica de negocio. |

## Árbol de ficheros objetivo

El árbol muestra el estado esperado al finalizar las fases existentes. Los
directorios `data/`, `output/` y sus temporales son generados en runtime y quedan
ignorados por Git.

```text
.
├── .specs/
│   └── active/inmocontent-os/
│       ├── spec.md
│       ├── plan.md
│       ├── tasks.md
│       └── tests.md
├── app/
│   ├── (product)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── properties/
│   │   │   ├── new/page.tsx
│   │   │   └── [propertyId]/
│   │   │       ├── page.tsx
│   │   │       ├── edit/page.tsx
│   │   │       └── pieces/[pieceKey]/page.tsx
│   │   └── settings/
│   │       ├── brand/page.tsx
│   │       └── media/page.tsx
│   ├── api/
│   │   ├── assets/route.ts
│   │   ├── properties/
│   │   │   ├── route.ts
│   │   │   └── [propertyId]/
│   │   │       ├── route.ts
│   │   │       └── generate/route.ts
│   │   ├── render-jobs/[jobId]/
│   │   │   ├── route.ts
│   │   │   ├── retry/route.ts
│   │   │   └── package/route.ts
│   │   └── generated-pieces/[pieceId]/download/route.ts
│   ├── preview/[pieceId]/page.tsx
│   ├── error.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── loading.tsx
├── components/
│   ├── brand/
│   │   ├── brand-preset-picker.tsx
│   │   └── brand-wizard.tsx
│   ├── properties/
│   │   ├── property-form.tsx
│   │   ├── property-form-sections.tsx
│   │   ├── photo-uploader.tsx
│   │   └── photo-sorter.tsx
│   ├── render/
│   │   ├── generation-progress.tsx
│   │   ├── piece-preview.tsx
│   │   └── render-error-card.tsx
│   └── ui/
│       ├── field-error.tsx
│       ├── progress.tsx
│       └── status-badge.tsx
├── lib/
│   ├── bootstrap/
│   │   └── create-app.ts
│   ├── engine/
│   │   ├── contracts.ts
│   │   ├── errors.ts
│   │   ├── create-engine.ts
│   │   ├── compile-niche.ts
│   │   ├── niche-config.ts
│   │   ├── niche-registry.ts
│   │   ├── bindings/
│   │   │   ├── binding-resolver.ts
│   │   │   └── binding-value.schema.ts
│   │   ├── jobs/
│   │   │   ├── create-render-job.ts
│   │   │   ├── render-job-machine.ts
│   │   │   ├── render-job-lock.ts
│   │   │   └── run-render-job.ts
│   │   ├── package/
│   │   │   ├── package-manifest.ts
│   │   │   └── package-service.ts
│   │   ├── policies/
│   │   │   ├── legal-policy.ts
│   │   │   ├── public-data-policy.ts
│   │   │   └── text-policy.ts
│   │   ├── ports/
│   │   │   ├── asset-store.ts
│   │   │   ├── clock.ts
│   │   │   ├── package-builder.ts
│   │   │   ├── render-job-repository.ts
│   │   │   ├── renderer.ts
│   │   │   └── repositories.ts
│   │   ├── render/
│   │   │   ├── renderer-registry.ts
│   │   │   └── select-renderer.ts
│   │   └── extensions/
│   │       ├── ai-provider.ts
│   │       ├── publisher.ts
│   │       └── tts-provider.ts
│   ├── infrastructure/
│   │   ├── db/
│   │   │   ├── prisma.ts
│   │   │   ├── brand-repository.prisma.ts
│   │   │   ├── generated-piece-repository.prisma.ts
│   │   │   ├── property-repository.prisma.ts
│   │   │   └── render-job-repository.prisma.ts
│   │   ├── files/
│   │   │   ├── local-asset-store.ts
│   │   │   ├── path-policy.ts
│   │   │   ├── sanitize-upload.ts
│   │   │   └── temporary-workspace.ts
│   │   ├── package/
│   │   │   └── jszip-package-builder.ts
│   │   ├── process/
│   │   │   ├── binary-resolver.ts
│   │   │   ├── ffmpeg-process.ts
│   │   │   └── spawn-with-timeout.ts
│   │   └── render/
│   │       ├── email-renderer.ts
│   │       ├── ffmpeg-video-renderer.ts
│   │       ├── playwright-browser.ts
│   │       ├── playwright-image-renderer.ts
│   │       ├── playwright-pdf-renderer.ts
│   │       ├── render-readiness.ts
│   │       └── render-url.ts
│   ├── schema/
│   │   ├── brand.schema.ts
│   │   └── property.schema.ts
│   ├── security/
│   │   ├── escape-html.ts
│   │   ├── safe-json.ts
│   │   └── signed-download.ts
│   └── text-engine/
│       ├── index.ts
│       ├── local-template-engine.ts
│       ├── prohibited-phrase-checker.ts
│       └── template-field-overrides.ts
├── niches/
│   ├── registry.ts
│   ├── inmobiliaria/
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── schema.ts
│   │   ├── public-view.ts
│   │   ├── bindings.ts
│   │   ├── catalog.ts
│   │   ├── legal-rules.ts
│   │   ├── text-policy.ts
│   │   ├── formatters.ts
│   │   ├── brand-presets/
│   │   │   ├── default.json
│   │   │   ├── urbana-moderna.json
│   │   │   ├── lujo.json
│   │   │   └── cercana-familiar.json
│   │   ├── persistence/
│   │   │   └── property-mapper.ts
│   │   └── templates/
│   │       ├── shared/
│   │       │   ├── brand-header.tsx
│   │       │   ├── contact-footer.tsx
│   │       │   └── template.css
│   │       ├── pdf/
│   │       │   └── property-sheet.tsx
│   │       ├── images/
│   │       │   ├── instagram-post.tsx
│   │       │   ├── instagram-carousel.tsx
│   │       │   └── instagram-story.tsx
│   │       ├── email/
│   │       │   ├── property-email.tsx
│   │       │   └── property-email-text.ts
│   │       └── video/
│   │           └── vertical-video-storyboard.ts
│   └── clinica-dental/                 # PoC de la Fase 8.2
│       ├── index.ts
│       ├── config.ts
│       ├── schema.ts
│       ├── public-view.ts
│       ├── bindings.ts
│       ├── catalog.ts
│       ├── legal-rules.ts
│       ├── text-policy.ts
│       └── templates/
│           ├── service-sheet.tsx
│           └── campaign-email.tsx
├── prisma/
│   ├── migrations/
│   │   └── 20260729_initial/migration.sql
│   ├── schema.prisma
│   └── seed.ts
├── public/
│   └── fonts/
│       ├── heading.woff2
│       └── body.woff2
├── docs/
│   ├── architecture/
│   │   └── niche-engine.md
│   └── stack-decisions.md
├── scripts/
│   ├── check-ffmpeg.ts
│   ├── verify-generated-assets.ts
│   └── verify-no-private-data.ts
├── tests/
│   ├── fixtures/
│   │   ├── brands.ts
│   │   ├── properties.ts
│   │   └── sentinel-assets.ts
│   ├── unit/
│   │   ├── brand-schema.test.ts
│   │   ├── property-schema.test.ts
│   │   ├── binding-resolver.test.ts
│   │   ├── niche-registry.test.ts
│   │   ├── render-job-machine.test.ts
│   │   └── text-engine.test.ts
│   ├── integration/
│   │   ├── email-renderer.test.ts
│   │   ├── package-builder.test.ts
│   │   ├── render-images.test.ts
│   │   ├── render-pdf.test.ts
│   │   └── render-video.test.ts
│   ├── e2e/
│   │   └── full-flow.spec.ts
│   ├── __screenshots__/
│   ├── security/
│   │   ├── private-address-leak.test.ts
│   │   ├── path-traversal.test.ts
│   │   ├── template-xss.test.ts
│   │   └── upload-limits.test.ts
│   └── architecture/
│       ├── core-has-no-niche-knowledge.test.ts
│       └── public-template-imports.test.ts
├── data/                               # runtime, ignorado
│   ├── app.db
│   ├── uploads/
│   └── tmp/
├── output/                             # runtime, ignorado
│   └── demo/
├── .env.example
├── .gitignore
├── AUDIT.md
├── README.md
├── next.config.ts
├── package.json
├── playwright.config.ts
├── tsconfig.json
└── vitest.config.ts
```

`lib/schema/property.schema.ts` puede reexportar el schema del nicho para mantener
el path comprometido por el plan raíz; la única definición vive en
`niches/inmobiliaria/schema.ts`. Así no aparecen dos schemas divergentes.

## Contratos del pipeline y persistencia

Los tipos canónicos de `EntityInput`, `TemplateBindings`, `RenderJob` y `Package`
son los definidos en `docs/architecture/niche-engine.md`.

Secuencia transaccional:

1. La acción server valida metadatos de uploads y persiste el borrador de
   `Property`.
2. El mapper inmobiliario crea un `EntityInput` con revisión monotónica.
3. El engine resuelve el plugin, valida el payload y genera la proyección pública.
4. Se persisten `TemplateBindings` y el catálogo solicitado como snapshot del job.
5. Una transacción corta crea `RenderJob` y sus tareas; el render pesado se ejecuta
   fuera de la transacción SQLite.
6. Un lock por `entityId + revision` impide dos generaciones concurrentes
   equivalentes. Regenerar una pieza crea una tarea/revisión nueva solo para ella.
7. Cada renderer escribe primero a un temporal por job, valida el resultado y hace
   un rename atómico al destino final.
8. El empaquetador lee únicamente artefactos `done` y datos públicos. Si hay
   errores, crea un paquete parcial con las omisiones en el manifiesto.

Los estados persistidos se comparan al actualizar (`pending -> rendering`, etc.)
para evitar que dos workers reclamen la misma tarea. SQLite usa transacciones
cortas, `busy_timeout` y modo WAL; v1 mantiene un único proceso worker.

## Implementación técnica dentro de las fases vigentes

| Fase existente | Cómo se implementa |
|---|---|
| Phase 1: Blueprint + arquitectura genérica | Fijar versiones compatibles, crear contratos, puertos y ADR. Añadir tests de arquitectura que prohíban imports de nicho desde el core. Hacer smoke test de Chromium y resolución de FFmpeg antes de construir templates. |
| Phase 2: Modelo de datos + validación | Escribir primero fixtures y tests Zod. El schema vertical realiza refinamientos; Prisma persiste `Property`, `Brand`, `GeneratedPiece` y `RenderJob`. El mapper server-only produce la proyección pública. |
| Phase 3: Config de marca + onboarding | Modelar tokens como datos validados, no clases CSS arbitrarias. Los tres presets producen un `BrandBindings` idéntico y las fuentes se resuelven desde assets locales. |
| Phase 4: Motor de render | Construir primero el estado rojo por contrato. Los renderers implementan puertos genéricos y reciben `templateId + bindings`. Playwright atiende PDF/PNG, el renderer de email produce HTML/texto y FFmpeg consume un storyboard vertical. |
| Phase 5: UI de producto | Formularios por secciones con `react-hook-form` y Zod compartido, autosave con debounce y revisión. Polling de jobs con Suspense/loading; la regeneración individual conserva el resto. |
| Phase 6: Empaquetado + hardening | Fuzzing de datos privados y rutas antes del builder. ZIP por streaming lógico, nombres sanitizados, manifest con hashes y JSON público. Escapar datos al entrar en HTML; overlays FFmpeg reciben archivos de texto temporales, no comandos concatenados. |
| Phase 7: Datos demo + QA | Seed determinista, tres ejecuciones completas y verificación visual/dimensional. Congelar toolchain y fixtures antes de snapshots. Resolver hallazgos de reviews sin debilitar tests. |
| Phase 8: Build, auditoría y PoC | Añadir el plugin dental y una entrada en `niches/registry.ts`, sin cambios en `lib/engine/`. Ejecutar build/test final, documentar riesgos residuales y archivar SDD según el plan raíz. |

## Dependencias npm y justificación

Las versiones exactas se fijan tras la comprobación de compatibilidad de la Fase
1.2 y se bloquean en `package-lock.json`; no se usan rangos flotantes para
Playwright, Prisma ni herramientas binarias.

### Dependencias de ejecución

| Paquete | Uso y motivo |
|---|---|
| `next` | App Router, Route Handlers, Server Components y build de una única app. Evita introducir un servidor HTTP paralelo. |
| `react` y `react-dom` | Runtime de la UI y de los templates TSX compartidos con la ruta de preview. Se mantienen en las versiones compatibles exigidas por Next. |
| `zod` | Fuente ejecutable de verdad para inputs, configuración de marca y refinamientos cruzados. Se elige frente a JSON Schema porque infiere tipos TS y permite reglas como venta/alquiler o foto principal dentro de galería sin un segundo validador. |
| `@prisma/client` | Acceso tipado a SQLite y transacciones cortas. Reduce SQL manual y mantiene migraciones explícitas para las entidades v1. |
| `react-hook-form` | Manejo eficiente de unas 35 entradas, campos condicionales y errores accesibles sin rerenderizar el formulario completo. |
| `@hookform/resolvers` | Conecta el mismo schema Zod con el formulario; evita duplicar validación cliente/servidor. |
| `playwright` | Chromium controlado en runtime para `page.pdf()` y `page.screenshot()`. Se prefiere a Puppeteer porque el proyecto ya usa Playwright para E2E, tiene contexts con locale/timezone/device scale explícitos y permite compartir una versión de navegador y utilidades de espera. |
| `sharp` | Inspección y normalización segura de JPG/PNG/WebP, orientación EXIF, dimensiones y verificación de los PNG finales. No sustituye a Playwright: valida y prepara bitmaps, mientras Chromium compone tipografía/layout. |
| `jszip` | Construye el ZIP y permite fijar nombres/metadatos por entrada. Encaja con el volumen local de v1; si los paquetes crecen se sustituirá detrás de `PackageBuilder` por una opción de streaming real. |
| `sanitize-filename` | Primera normalización de nombres aportados por usuario. Se complementa con una política propia de rutas, UUIDs internos y comprobación de confinamiento; no se considera una defensa completa por sí sola. |
| `qrcode` | Genera el QR de la ficha desde una URL validada. Se elige una librería local para que el render no dependa de servicios remotos. |

### Dependencias de desarrollo y prueba

| Paquete | Uso y motivo |
|---|---|
| `prisma` | CLI de schema, migraciones y seed; no debe formar parte del código cliente. |
| `typescript` | Comprobación estricta, sin `any`, para hacer efectiva la separación de proyección pública y bindings. |
| `vitest` | Unitarios e integración con buen soporte TypeScript/ESM y ejecución rápida de tests de schemas, policies y repositorios. |
| `@vitejs/plugin-react` | Transforma JSX/TSX en tests Vitest de templates y componentes sin depender del bundler de producción. |
| `@testing-library/react`, `@testing-library/jest-dom` y `@testing-library/user-event` | Verifican formularios, estados y accesibilidad desde comportamiento observable, no desde detalles internos de React. |
| `@playwright/test` | E2E del flujo real y regresión de previews. Comparte conceptos y browser revision con el renderer, pero sus fixtures/test runner quedan fuera del runtime. |
| `fast-check` | Property-based testing para fuga de dirección privada, unicode, traversal y combinaciones de campos que los fixtures manuales no cubren. |
| `pixelmatch` y `pngjs` | Diff visual tolerante y reporte de píxeles para PNGs. Se usan junto a aserciones estructurales para evitar snapshots que fallen por ruido irrelevante. |
| `tsx` | Ejecuta seed y scripts TypeScript en Windows sin mantener una compilación separada de scripts. |
| `eslint` y `eslint-config-next` | Reglas de Next/React y detección de imports incorrectos; los tests de arquitectura cubren las restricciones que ESLint no exprese. |
| `tailwindcss` y `postcss` | Toolchain de estilos elegido por el scaffold. Los templates exportables fijan sus estilos críticos y no dependen de clases dinámicas imposibles de analizar. |
| `@types/node`, `@types/react`, `@types/react-dom`, `@types/qrcode` y `@types/sanitize-filename` | Tipos estrictos de APIs usadas. Solo se añaden paquetes `@types` cuando la dependencia no los incluya. |

### Decisiones explícitas de no dependencia

- No se usa `puppeteer`: duplicaría navegador, APIs de espera y configuración E2E.
- No se usa `fluent-ffmpeg`: el pipeline necesita argumentos precisos y errores de
  proceso transparentes; una capa abandonada/indirecta dificultaría diagnosticar
  quoting y señales en Windows. FFmpeg se invoca con `child_process.spawn`.
- No se incluye `ffmpeg-static` en v1: aumenta el artefacto y obliga a revisar
  redistribución/licencias del binario. Se resuelve una instalación local mediante
  ruta absoluta. El puerto permite añadir bundling más adelante.
- No se usa una librería de templates de email: el HTML es un template TSX/función
  local con tablas y estilos inline; añadir un DSL no mejora las dos salidas v1.
- No se usa una cola externa: un worker en proceso con locks persistidos basta para
  una app local de un solo operador. El repositorio de jobs permite migrar después.
- No se usa una librería de IA, TTS o SDK social mientras sus flags estén apagados.

## Puntos de extensión v2/v3

Las interfaces se implementan en v1 junto con adaptadores `disabled`; no existe
ninguna implementación externa operativa ni selector que pueda activarlas por
accidente.

### `AiProvider`

```ts
import type {
  IsoDateTime,
  PieceKey,
  TemplateBindings,
} from "@/lib/engine/contracts";

export interface AiTextRequest {
  readonly pieceKey: PieceKey;
  readonly templateId: string;
  readonly bindings: TemplateBindings;
  readonly requestedFields: readonly string[];
  readonly prohibitedPhrases: readonly string[];
  readonly locale: string;
  readonly deadline: IsoDateTime;
}

export interface AiTextResult {
  readonly fields: Readonly<Record<string, string>>;
  readonly provider: string;
  readonly model: string;
  readonly generatedAt: IsoDateTime;
}

export interface AiProvider {
  readonly id: string;
  isConfigured(): Promise<boolean>;
  generateText(
    request: Readonly<AiTextRequest>,
    signal: AbortSignal,
  ): Promise<AiTextResult>;
}
```

En v1 `TextPolicy` y templates locales generan todo el texto. La feature
`AI_TEXT_ENABLED` es `false`; no hay fallback automático a IA y ninguna key llega
al cliente. Una futura salida de IA deberá pasar las mismas comprobaciones de
claims, glosario y datos públicos.

### `TTSProvider`

```ts
export interface TTSVoice {
  readonly id: string;
  readonly label: string;
  readonly locale: string;
}

export interface TTSSynthesisRequest {
  readonly text: string;
  readonly voiceId: string;
  readonly locale: string;
  readonly format: "wav";
  readonly sampleRateHz: 48_000;
}

export interface TTSAudio {
  readonly bytes: Uint8Array;
  readonly mediaType: "audio/wav";
  readonly durationSeconds: number;
  readonly provider: string;
}

export interface TTSProvider {
  readonly id: string;
  isConfigured(): Promise<boolean>;
  listVoices(locale: string): Promise<readonly TTSVoice[]>;
  synthesize(
    request: Readonly<TTSSynthesisRequest>,
    signal: AbortSignal,
  ): Promise<TTSAudio>;
}
```

En v1 el modo efectivo es `disabled`: FFmpeg genera vídeo sin pista de voz y la UI
lo indica. Una pista de voz subida por el usuario puede tratarse como asset local,
pero no se presenta como TTS. No se simula éxito ni se sustituye voz por música.

### `Publisher`

```ts
import type {
  RenderArtifact,
  TemplateBindings,
} from "@/lib/engine/contracts";

export interface PublishTarget {
  readonly provider: string;
  readonly accountId: string;
  readonly destination: string;
}

export interface PublishRequest {
  readonly target: PublishTarget;
  readonly artifact: RenderArtifact;
  readonly bindings: TemplateBindings;
  readonly caption?: string;
  readonly idempotencyKey: string;
}

export interface PublishReceipt {
  readonly provider: string;
  readonly externalId: string;
  readonly publicUrl?: string;
  readonly publishedAt: string;
}

export interface Publisher {
  readonly id: string;
  isConfigured(): Promise<boolean>;
  publish(
    request: Readonly<PublishRequest>,
    signal: AbortSignal,
  ): Promise<PublishReceipt>;
}
```

En v1 `PUBLISHING_ENABLED` es `false`, no existen rutas de publicación y el
producto solo descarga artefactos. La existencia de credenciales no cambia el
flag. Una versión futura deberá añadir OAuth, permisos, idempotencia, auditoría y
confirmación explícita.

## Render determinista con Playwright

### Contexto fijo

El browser/context se crea con valores constantes:

```ts
const context = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
  locale: "es-ES",
  timezoneId: "Europe/Madrid",
  colorScheme: "light",
  reducedMotion: "reduce",
});
```

Cada pieza reemplaza el viewport por las dimensiones CSS de su contrato. Con
`deviceScaleFactor: 1`, 1080×1350 CSS produce exactamente 1080×1350 píxeles. El
valor no depende del monitor, DPI o escala de Windows.

### Protocolo de readiness

La captura no se basa solo en `networkidle`. La ruta de preview expone
`window.__RENDER_READY__ = true` cuando datos, imágenes y layout están listos. El
renderer espera, en este orden:

```ts
await page.goto(renderUrl, { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  await document.fonts.ready;
  const images = Array.from(document.images);
  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => reject(), { once: true });
        });
      }
      await image.decode();
    }),
  );
});
await page.waitForFunction(() => window.__RENDER_READY__ === true);
```

La declaración global de `Window` vive en un `.d.ts` del módulo de preview, sin
casts a `any`.

### Fuentes de no determinismo controladas

| Fuente | Control |
|---|---|
| Fuentes | WOFF2 locales, versiones fijadas, sin Google Fonts remoto; esperar `document.fonts.ready`. |
| Imágenes | Normalizar orientación EXIF y espacio de color con Sharp; cargar por asset ID local y esperar `decode()`. |
| Animaciones/caret | Inyectar CSS que deshabilite `animation`, `transition` y caret; `reducedMotion: "reduce"`. |
| Hora/fechas | `createdAt` y fecha de campaña se inyectan en bindings; las plantillas no llaman `Date.now()` ni muestran tiempos relativos. |
| Aleatoriedad | IDs y orden se crean antes del render; templates no usan `Math.random()`. Los fixtures fijan UUIDs. |
| Locale/zona | `locale` y `timezoneId` explícitos; `Intl` recibe locale y moneda, nunca defaults de la máquina. |
| Red | Assets locales y bloqueo de requests a hosts no permitidos. Sin analytics ni CDNs en preview. |
| Browser | Playwright y su Chromium fijados por lockfile; actualización exige aceptar nuevos baselines. |
| Viewport/DPI | Dimensiones y `deviceScaleFactor` fijos por pieza. |
| Datos mutables | Snapshot de bindings por revisión; no se relee `Property` durante una captura. |
| Layout | CSS con tamaños/line-height explícitos, safe areas y overflow detectado antes de capturar. |
| PDF | `printBackground: true`, `preferCSSPageSize: true`, CSS `@page` A4 y márgenes fijos. |
| Vídeo | FPS, resolución, duración, codec, pixel format y toolchain fijados; se elimina metadata variable. |

El objetivo v1 es reproducibilidad visual dentro del toolchain fijado, no igualdad
byte a byte entre versiones distintas de Chromium/FFmpeg. Los tests combinan
dimensiones, contenido, ausencia de datos privados y diff visual con tolerancia.

La ruta `/preview/[pieceId]` se habilita solo en desarrollo, sin layout de producto,
para iterar y para el renderer local previsto en v1. Rechaza IDs inexistentes y no
serializa el payload privado. Si el producto se despliega como servicio en una
fase futura, se sustituirá por una ruta interna autenticada con token efímero y
alcance de job; no se expondrá el preview dev en producción.

## Pipeline FFmpeg en Windows

### Resolución de binarios

`binary-resolver.ts` resuelve `ffmpeg.exe` y `ffprobe.exe` una vez al arrancar:

1. Si existe `FFMPEG_PATH`/`FFPROBE_PATH`, exige ruta absoluta, archivo existente y
   extensión `.exe`; nunca acepta un directorio ni una ruta relativa.
2. En ausencia de override, ejecuta el `where.exe` absoluto de
   `%SystemRoot%\System32\where.exe` con argumento `ffmpeg.exe`/`ffprobe.exe`.
3. Normaliza cada línea, descarta shims no ejecutables y selecciona la primera ruta
   absoluta existente.
4. Ejecuta un smoke test `-version` con timeout corto y cachea el resultado.
5. Si falta, devuelve `FFMPEG_NOT_FOUND` con causa, instrucciones de instalación,
   campo de configuración y acción de reintento. PDF, PNG y email continúan.

No se concatena `%PATH%\ffmpeg`, no se confía en el working directory y no se
invoca un nombre relativo. Esto es crítico en Windows porque el servicio, terminal
y proceso Next pueden tener PATH/CWD distintos, y los espacios de `Program Files`
rompen comandos construidos como strings.

### Invocación segura

```ts
import { spawn } from "node:child_process";

export interface SpawnFfmpegOptions {
  readonly ffmpegPath: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
}

export const spawnFfmpeg = ({
  ffmpegPath,
  args,
  cwd,
  timeoutMs,
  signal,
}: SpawnFfmpegOptions) => {
  const processSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(timeoutMs),
  ]);

  return spawn(ffmpegPath, [...args], {
    cwd,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    signal: processSignal,
  });
};
```

La ruta ya resuelta se pasa como `file` y cada argumento ocupa una posición del
array. `shell: false` evita expansión, quoting ambiguo e inyección. Las rutas con
espacios no se entrecomillan manualmente: `spawn` las transmite como argumentos.
`cmd.exe /d /s /c` solo se usaría para un shim `.cmd` inevitable de otra
herramienta; FFmpeg debe resolverse a `.exe`.

### Storyboard y filtros

El nicho produce un storyboard declarativo con fotos, duración, textos y
transiciones. El adapter FFmpeg:

- normaliza fotos a 1080×1920 con Sharp sin deformarlas;
- escapa textos y los escribe en archivos UTF-8 temporales para `drawtext`,
  evitando incrustar texto de usuario en el filter string;
- genera segmentos con `zoompan` a FPS fijo;
- concatena segmentos, mezcla música local con volumen explícito y añade voz solo
  si existe un asset/proveedor real;
- codifica H.264, `yuv420p`, 1080×1920, 20–35 s y audio AAC cuando hay audio;
- elimina metadata variable (`-map_metadata -1`) y valida con `ffprobe`.

### Errores, timeout y temporales

- Escuchar `error` para fallos de spawn y `close` para código/señal; no resolver la
  promesa solo porque el proceso arrancó.
- Conservar un ring buffer limitado de `stderr` para diagnóstico; no volcar datos
  privados ni buffers ilimitados a memoria.
- Usar `AbortController` por tarea. Al vencer el timeout, enviar terminación,
  esperar un periodo corto y, si sigue vivo, finalizar el árbol mediante
  `taskkill.exe /PID <pid> /T /F` resuelto desde `%SystemRoot%\System32`.
- Traducir exit code, señal y últimas líneas de stderr a `RenderError` con
  `cause`, `solution` y `retryable`.
- Crear `data/tmp/<jobId>/<taskId>-<uuid>/` mediante rutas internas, nunca desde
  nombres de usuario.
- Escribir el MP4 en temporal, verificar dimensiones/duración/codec con ffprobe y
  moverlo atómicamente a almacenamiento final.
- Ejecutar limpieza en `finally`; un barrido al arranque elimina solo temporales
  huérfanos más antiguos que el umbral configurado y confinados bajo `data/tmp`.
- Nunca borrar el output correcto de otras tareas al reintentar vídeo.

## Seguridad y privacidad por construcción

- `privateAddress` solo existe en schema, Prisma y mapper server-only.
- El mapper produce `PublicPropertyInput`; el binding resolver no acepta
  `PropertyInput`.
- El JSON del ZIP se construye desde proyección pública con allowlist.
- Los assets usan UUID/storage key internos. El nombre original es metadata
  sanitizada, nunca parte de una ruta.
- Toda ruta resuelta se comprueba con `path.relative(base, candidate)` y se rechaza
  si escapa del base.
- Uploads se validan por tamaño, magic bytes, dimensiones y decode real; la
  extensión no es evidencia suficiente.
- HTML escapa texto por contexto. No se permite `dangerouslySetInnerHTML` con
  input de usuario.
- FFmpeg recibe argumentos separados y textos mediante archivos; no shell.
- Descargas y previews resuelven IDs a registros permitidos, no paths recibidos.
- Logs usan IDs y códigos; no incluyen dirección privada, contenido completo de
  email ni credenciales.

## Riesgos técnicos y mitigaciones

| Riesgo | Impacto | Mitigación verificable |
|---|---|---|
| FFmpeg/ffprobe ausente o no visible para Next | Solo falla el vídeo; diagnóstico difícil en Windows. | Resolver ruta absoluta al boot, smoke test, error `FFMPEG_NOT_FOUND`, UI con solución y retry; el resto de tareas continúa. |
| Quoting o inyección en procesos Windows | Fallos con espacios o ejecución no deseada. | `spawn(exeAbsoluto, args, { shell: false })`, argumentos por array, textos en archivos temporales y tests con unicode/espacios/metacaracteres. |
| Chromium o fuentes producen capturas distintas | Baselines inestables y cortes de texto. | Versiones fijadas, fuentes locales, `fonts.ready`, imágenes decodificadas, viewport/DSF/locale fijos y diff tolerante. |
| Fuga de dirección privada | Incidente crítico de privacidad. | Proyección por tipo antes de bindings, allowlist JSON, tests de imports, fuzzing centinela sobre todos los formatos y revisión adversarial. |
| XSS en preview/email | Ejecución de contenido aportado y HTML malicioso. | Escapado contextual, React por defecto, CSP/headers, sin HTML crudo, fixtures hostiles. |
| Traversal o colisión de nombres | Lectura/sobrescritura fuera del workspace. | UUIDs internos, `sanitize-filename`, confinamiento con `path.relative`, `wx`/rename atómico y tests `../`, UNC, unicode y null bytes. |
| Dos jobs sobre la misma revisión | Outputs mezclados o estados corruptos. | Lock persistido por entidad+revisión, compare-and-set de estados, workspace por task y tests concurrentes. |
| SQLite bloqueado por render largo | UI sin poder guardar/consultar. | Ningún render dentro de una transacción, WAL, `busy_timeout`, transacciones cortas y un worker v1. |
| Job parcialmente fallido | Pérdida de piezas correctas o ZIP engañoso. | Estado `partial`, tareas aisladas, artefactos inmutables y manifest de omisiones; retry solo de pieza fallida. |
| Fotos grandes agotan memoria | Caída durante normalización, vídeo o ZIP. | Límite 10 MB, dimensiones máximas, Sharp secuencial con concurrencia limitada, temporales en disco y rechazo temprano. |
| ZIP crece más que la memoria disponible | Timeout/OOM al empaquetar vídeos. | Límite de paquete y medición previa; v1 usa JSZip por volumen conocido, puerto `PackageBuilder` listo para adapter streaming. |
| Fotos insuficientes o principal eliminada | Carrusel/vídeo roto. | Schema 3–20, principal dentro de galería, adaptación de storyboard <5 y bloqueo de regeneración hasta reelegir principal. |
| Texto inventado o frase prohibida | Riesgo comercial/legal. | Templates factuales, `allowUnverifiedClaims: false`, blacklist normalizada, excepción solo desde input explícito y tests negativos. |
| Regla legal desactualizada | Aviso incorrecto o falsa sensación de cumplimiento. | Reglas versionadas por jurisdicción, fecha/fuente en documentación, severidad explícita y revisión legal antes de activación. |
| Ruta de preview expuesta | Enumeración de piezas o datos. | Dev-only en v1, solo bindings públicos, IDs no predecibles; una futura producción requiere ruta interna con token efímero. |
| Incompatibilidad entre Next, Prisma y Playwright | Build o runtime roto por actualizaciones. | Matriz y smoke tests en Fase 1.2, versiones exactas y lockfile; upgrades separados con baselines nuevos. |
| FFmpeg distribuido en el futuro | Tamaño/licencias por plataforma. | V1 usa instalación externa; cualquier bundling pasa revisión de licencia y adapter por plataforma. |
| Música sin licencia | Riesgo de derechos. | Solo assets subidos por usuario, confirmación de derechos y ninguna descarga automática. |
| TTS/IA/Publisher se activan accidentalmente | Coste, fuga de datos o publicación involuntaria. | Null/disabled adapters, flags `false`, sin SDKs/rutas v1 y tests que rechazan configuración implícita. |

## Estrategia de pruebas

### Unitarias

- Schemas y refinamientos de propiedad/marca.
- Proyección pública y mapa de bindings.
- Normalización de frases prohibidas con mayúsculas, tildes y whitespace.
- Catálogo y selección de piezas.
- Transiciones válidas/ inválidas de jobs.
- Registry: nicho desconocido e IDs duplicados.

### Integración

- Prisma en base SQLite aislada por suite.
- Cada renderer con assets locales.
- PDF: tamaño/páginas/texto extraíble y ausencia de centinelas privados.
- PNG: dimensiones exactas y diff visual.
- Email: HTML ≤600 px, estilos inline, enlaces/escaping y texto plano.
- Vídeo: ffprobe para codec, resolución, duración y streams.
- ZIP: nombres, hashes, manifiesto, README y JSON público.

### E2E y seguridad

- Flujo formulario → persistencia → seis estados → preview → ZIP.
- Regeneración individual sin modificar hashes de otras piezas.
- Fallo simulado de FFmpeg con entrega parcial.
- Fuzzing de dirección privada en todos los campos de texto.
- Traversal, nombres UNC, unicode, null bytes, MIME falso y archivos >10 MB.
- Accesibilidad de labels, teclado, foco y anuncios de error.

Las capturas y artefactos de QA permanecen dentro de
`tests/__screenshots__/` o `.playwright-mcp/`, nunca en temporales externos al
repositorio.

## Criterios técnicos de cierre

- `lib/engine/` compila y sus tests pasan sin importar ningún módulo de
  `niches/inmobiliaria`.
- Las seis piezas inmobiliarias generan los formatos y dimensiones indicados.
- El ZIP contiene solo proyección pública y explicita cualquier pieza omitida.
- FFmpeg ausente produce un error accionable sin invalidar PDF/PNG/email.
- El PoC dental añade schema y dos templates modificando únicamente su carpeta y
  `niches/registry.ts`; `lib/engine/` queda idéntico.
- Build TypeScript estricto sin `any`, tests unit/integration/E2E/security verdes y
  verificación visual de las 18 piezas demo.
