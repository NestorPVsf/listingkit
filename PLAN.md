# Plan: InmoContent OS — Motor genérico de generación de piezas de marketing inmobiliario

> Plan de construccion, aprobado el 2026-07-29 y ejecutado sin cambios de alcance.
> Se desarrollo sobre Windows 11 nativo con npm; el codigo no depende de esa eleccion.

### Context
Construir desde cero una app Next.js interna que, a partir de UN formulario de propiedad (~35 campos), genera 6 piezas de marketing (PDF, post IG, carrusel, story, email, vídeo) mediante un motor **genérico** (config de nicho + plantillas) para poder replicarse a otros verticales.

### Lo que ya se sabia antes de empezar

Restricciones conocidas de antemano, cada una con su cicatriz previa detras:

- **Los `node_modules` no se comparten entre WSL y Windows**: los binarios nativos
  (sharp, `@next/swc`) son por plataforma y el arbol se rompe al alternar.
- **La ficha PDF hay que abrirla y mirarla**, no basta con que el build pase.
- **Las capturas de QA se quedan dentro del repo**, nunca en el temporal del sistema.
- **La ruta `/preview/:pieceId` va sin layout ni sesion**, para iterar plantillas y
  para que el renderizador headless pueda capturarlas.
- **FFmpeg y Playwright se invocan por `spawn` con el binario resuelto**, no por shim.
- **Ningun `.env` al repositorio**, cuidado con el IDOR en las descargas, y
  cabeceras de seguridad revisadas.
- **Los estados de generacion asincrona necesitan sus limites de carga** por vista.

Artefactos SDD: `.specs/active/inmocontent-os/{spec.md,plan.md,tasks.md,tests.md}` → archivar en Fase 8.

---

### Phase 1: Blueprint + arquitectura genérica
- [x] 1.1 Scaffold `create-next-app` — Next 16.2.12, React 19.2.4, TS 5.9.3, Tailwind 4; dev server 200 OK
- [x] 1.2 Stack validado → `docs/stack-decisions.md`; FFmpeg 8.0.1 instalado; fluent-ffmpeg descartado (obsoleto) → spawn directo
- [x] 1.3 `.specs/active/inmocontent-os/spec.md`
- [x] 1.4 `docs/architecture/niche-engine.md` — core `lib/engine/` + plugin `niches/inmobiliaria/`, registro estático, prueba de generalización dental incluida
- [x] 1.5 `.specs/active/inmocontent-os/plan.md` técnico

**verifiable_criteria**: spec.md existe >1500 chars Y `npm run dev` arranca en :3000.

### Phase 2: Modelo de datos + validación (Zod + Prisma/SQLite)
- [x] 2.1 Tests Zod ANTES del schema — 47 tests rojos limpios `[qa-engineer]`
- [x] 2.2 `niches/inmobiliaria/schema.ts` (+public-view.ts, ruta según ADR) + `prisma/schema.prisma` — 58/58 verdes `[database]`
- [x] 2.3 Migración init aplicada + seed placeholder + prisma.config.ts (Prisma 7 exige driver adapter better-sqlite3) `[database]`
- [x] 2.4 `toPublicPropertyView` por allowlist explícita, enforced por tipos `[database]`

**verifiable_criteria**: `npx vitest run tests/unit/property-schema.test.ts` 100% verde.

### Phase 3: Config de marca + onboarding
- [x] 3.1 `niches/inmobiliaria/brand-presets.json` — 4 presets con AA verificado + `docs/design/brand-presets.md` `[designer]`
- [x] 3.2 `tests/unit/brand-schema.test.ts` — ~45 casos rojos limpios `[qa-engineer]`
- [x] 3.3 `brand.schema.ts` + wizard onboarding 3 pasos — 129/129 verdes, flujo E2E verificado con Brand real en SQLite `[frontend]`

**verifiable_criteria**: tests brand verdes Y onboarding genera Brand válido en SQLite.
**Paralelo**: Phase 2 y 3 son independientes — dispatch simultáneo.
**Pre-requisito UI**: rellenar `.claude/design/` (skill design-setup) antes de la primera tarea frontend.

### Phase 4: Motor de render — las 6 piezas (núcleo crítico, tests rojos primero)
- [x] 4.1 Tests ANTES + contrato de invocación API de 5 endpoints definido en tests/e2e/helpers.ts `[qa-engineer]`
- [x] 4.2 Ruta preview DEV-only con root layout independiente + plantillas de las 4 piezas visuales (4 presets verificados) `[frontend]`
- [x] 4.3 `lib/text-engine/` genérico + política/vocabulario del vertical — 142/142 verdes, determinista, censura defensa-en-profundidad `[executor]`
- [x] 4.4 `lib/engine/` core genérico (grep genericidad limpio) + renderer Playwright + 5 rutas API — E2E render-images y render-pdf VERDES
- [x] 4.5 Email HTML ≤600px tablas+inline+VML fallback + .txt, registrado en composite-renderer — 148/148 verdes `[frontend]`
- [x] 4.6 Vídeo FFmpeg: zoompan+xfade, tarjetas PNG vía sharp (no drawtext), TTSProvider 4 modos (manual/none impl.), voiceStatus explícito — E2E 4/4 verdes
- [x] 4.7 QA visual 2 presets × 6 piezas → P0 (logos sin servir) + P2s detectados y corregidos con regresión; P1 story = artefacto de inspección; fuentes PDF OK — 157/157 unit + E2E verdes `[qa-engineer + frontend]`

**verifiable_criteria**: E2E render verdes Y `ffprobe` reporta 1080x1920, 20-35s, H.264 Y text-engine verde con assertion negativa.

### Phase 5: UI de producto
- [x] 5.1 full-flow.spec.ts (4 tests) + contrato data-testid completo `[qa-engineer]`
- [x] 5.2 Dashboard + formulario 35 campos + historial `[kimi-executor k3]`
- [x] 5.3 Preview editable: override de textos + regenerar pieza individual + reorden fotos `[kimi-executor k3 + frontend]`
- [x] 5.4 Config marca/voz/música + ayuda `[kimi-executor k3]`
- [x] 5.5 Estados RenderJob por pieza con causa+solución+retry `[kimi-executor k3]`
> Nota: tests 2-4 full-flow verdes (5× sin flake tras arreglar carrera espuria del helper de descargas); test 1 falla SOLO en download-zip (endpoint de F6, esperado). Suite completa 8/9.

**verifiable_criteria**: `full-flow.spec.ts` verde end-to-end.

### Phase 6: Empaquetado + hardening
- [x] 6.1 tests/security/ (4 suites, fuzzing centinelas, contrato ZIP) — 193/193 `[qa-engineer]`
- [x] 6.2 jszip-package-builder + GET /api/render-jobs/[jobId]/package — ZIP de 15 entradas verificado, full-flow 4/4 `[executor + frontend]`
- [x] 6.3 Mapa XSS revisado: sin dangerouslySetInnerHTML; gap real corregido (fuente custom sin escapar en email) + cap 255 en sanitizeFileName `[executor]`
- [x] 6.4 Headers seguridad (nosniff/referrer/SAMEORIGIN, CSP diferida documentada) + env hygiene + dev.db ignorada `[devops]`
> Suite tras F6: 202/202 unit + 9/9 E2E. Concern abierto: fontanería de textOverride → bindings (auditoría en F7).

**verifiable_criteria**: `tests/security/` 100% verde Y grep "direccionPrivada" limpio fuera de server-only.

### Phase 7: Datos demo + QA completa + reviews
- [ ] 7.1 Consumir `docs/research/` (Postiguet Homes + 3 propiedades demo) — YA DISPONIBLE `[executor]`
- [ ] 7.2 `prisma/seed.ts` con las 3 propiedades + brand ficticia `[database]`
- [ ] 7.3 Flujo completo sobre las 3 demo → 18 piezas verificadas visualmente `[qa-engineer]`
- [ ] 7.4 `npm run test:all` (unit+integration+E2E+security) `[qa-engineer]`
- [x] 7.5 Revision en 3 ejes paralelos (seguridad / calidad / correccion) — 1 critico + 8 importantes
- [x] 7.6 Review adversarial con un modelo distinto — 14 hallazgos, informe en `docs/review/adversarial-review.md`

### Fixes post-review (aplicados inline; los subagentes en background morian por reciclado del runner)
- [x] **F-02 EXIF/GPS (el más grave)** — las fotos se guardaban sin recodificar y el email las servía tal cual: un destinatario podía extraer las coordenadas del inmueble. Ahora se recodifican al ingerir (rotate → sin metadata → lado largo ≤2560). 5 tests, incluido control de que el original SÍ traía GPS.
- [x] **CRITICAL ZIP incompleto** — el paquete se construía desde `job.tasks`; tras regenerar una pieza el ZIP salía con 1 de 15 entradas en silencio. Ahora el alcance es la PROPIEDAD (catálogo completo, incluye lo que exista en disco; lo que falte se declara en `omittedPieces`). 3 tests de regresión.
- [x] **F-04 `listingUrl` con esquema activo** — `z.string().url()` aceptaba `javascript:`/`data:` y llegaba al href del CTA del email. Restringido a `https://`.
- [x] Endurecido el literal NUL de `sanitizeFileName` (escape `\x00` en vez de byte crudo en el fuente).
- [x] **Falso positivo descartado**: el hallazgo SECURITY "el check de null-byte comprueba espacios" era erróneo — el fuente contenía un NUL literal (verificado con `od -c`); el check funcionaba.
- [x] **Falso positivo descartado**: el "bug" de override que no llegaba al render — verificado por HTML del preview y por hash del PNG (cambia al regenerar con otro texto). El fallo era del test: esperaba `data-status` en `done|error` cuando la pieza YA estaba en `done`, así que descargaba el fichero viejo. Ahora sondea el job real de la regeneración. 4/4 estable en 3 corridas.
> Estado tras fixes: **217/217 unit + 9/9 E2E**, tsc limpio.

### Cierre de pendientes de la review (segunda tanda, inline)
- [x] **F-03 logo SVG (XSS same-origin)** — un SVG con `<script>` servido desde `/uploads/brand/` se ejecutaba con el origen de la app y podia leer el borrador de propiedad de localStorage (con `privateAddress`). SVG fuera del pipeline entero: ingesta solo PNG/WebP/JPG **recodificados con sharp** (el MIME declarado deja de ser prueba), `LOGO_PATH_REGEX` sin svg, la ruta ya no lo sirve, y cabeceras `nosniff` + `CSP: default-src 'none'; sandbox`. 6 tests nuevos (incluye SVG que miente sobre su MIME y HTML disfrazado de WebP).
- [x] **F-01 el editor reintroducia la direccion privada** — el texto editado entra DESPUES de `PublicPropertyView`. Nuevo `assertPublicTextOverride` (normaliza mayusculas/tildes/puntuacion, compara contra `privateAddress` e `internalName`, y contra el tramo calle+numero que es lo que se pega suelto) aplicado en los DOS endpoints (`piece-text` y `regenerate-piece`, este ademas sin limite de tamaño). 422 + mensaje visible en la UI. 10 tests.
- [x] **F-08 cola sin dedup ni tope** — hueco reservado ANTES de crear el job: trabajo equivalente en curso → 409 (la UI se engancha al job existente en vez de fallar), mas de 8 activos → 429. 5 tests.
- [x] **F-11 jobs huerfanos en "rendering"** — las tasks huerfanas se reclaman a `pending` al reanudar, ninguna task activa sobrevive al cierre del job (`RENDER_TASK_ABANDONED` retryable) y al arrancar se cierran los jobs sin tocar desde hace >10 min (`reclaimStale`). 2 tests.
- [x] **F-12 Playwright sin timeout duro** — techo de 90 s por captura (`page.evaluate` no tiene timeout propio: una foto que no carga colgaba la cola entera) + 30 s en operaciones nativas + pestaña nueva tras un timeout. Test con un servidor que deja el `<img>` colgado: muere en 3 s con error retryable.
- [x] **F-10 stderr ilimitado** — buffer circular de 8 KB (cola, que es donde esta el motivo real), `-loglevel error` en FFmpeg, y `technicalDetails` fuera del DTO publico del job (arrastraba rutas locales). El endpoint de uploads solo devuelve codigos estables.
- [x] **F-04b HTML activo same-origin** — el email `.html` se sirve inline para previsualizarlo; ahora con `CSP: sandbox` (sin `allow-scripts` ni `allow-same-origin`). Solo para `.html`: el visor de PDF de Chrome no funciona dentro de un documento sandboxed.
- [x] **QUALITY: 4 copias del mapeo Prisma→PublicPropertyView** — esa es LA allowlist que decide que sale publicado, y ya habia divergido (la del ZIP emitia `photoAssetIds: []`). Unificadas en `niches/inmobiliaria/persistence/public-view-mapper.ts`; el ZIP ahora si declara las fotos. 7 tests que vigilan la allowlist.
> Estado tras esta tanda: **253/253 unit + 9/9 E2E**, tsc limpio (solo los errores preexistentes de `prisma/seed.ts`).

### Riesgos residuales que NO se cierran en v1 (van a AUDIT.md en 8.3)
- **F-05/F-06** rutas de artefacto mutables y renderers que releen la fila viva en vez del snapshot del job. Impacto real solo con concurrencia o edicion a mitad de render; v1 es un proceso unico con un operador.
- **F-07/F-09** uploads sin cuota y ZIP construido en memoria. Mitigado por el limite por fichero, no por el acumulado.
- **F-13/ADR** `email-renderer` y `jszip-package-builder` importan el vertical y consultan `prisma.property`. **8.2 lo destapa**: es justo lo que rompe al montar el segundo nicho.
- **F-14** `/preview/*` es DEV-only y Playwright depende de esa ruta: hoy el runtime operativo es `next dev` en loopback.

**verifiable_criteria**: test:all exit 0 Y 18 piezas en `output/demo/` con tamaño >0.

### Phase 8: Build limpio, AUDIT.md, archive
- [x] 8.1 `npm run build` limpio — fallaba por `prisma/seed.ts`: `node prisma/seed.ts` (type-stripping nativo) exige imports con extension `.ts`, y el type-check de Next lo rechazaba. Resuelto con `allowImportingTsExtensions` (valido con `noEmit`). **tsc 0 errores, build exit 0, 21 rutas.**
- [x] 8.2 PoC `niches/clinica-dental/` (556 lineas): schema con 3 campos privados propios, proyeccion publica por allowlist, bindings, 3 reglas legales sanitarias (RD 1907/1996 + TAE) y **2 plantillas** (poster TSX + email HTML). Registrado junto a inmobiliaria en `niches/registry.ts` para que se compile en cada build. 12 tests, incluido uno que lee `lib/engine/` fichero a fichero y falla si aparece rastro de cualquier vertical.
  - **Friccion real encontrada** (el valor del PoC): `OutputContract` del motor solo admite `pdf|png|mp4` en `kind: "single"`; `tsc` rechazo el primer intento de declarar el email como `.html`. Defendible (la lista refleja lo que los renderers producen) pero anotado en AUDIT.md.
  - **Confirmado el limite**: el nicho dental llega hasta la planificacion del job, no al PNG — `lib/infrastructure/` sigue importando el vertical. Es la primera deuda a pagar antes de vender un segundo vertical.
- [x] 8.3 `AUDIT.md` en la raiz: que es, como se verifica, la regla dura y sus 4 capas, los 10 hallazgos corregidos, los 2 falsos positivos descartados con evidencia, la generalizacion, y **que NO hace** (3 bloqueantes de produccion + deuda conocida) + contraste punto por punto con la guia de partida.
- [x] 8.4 `.specs/active/inmocontent-os/` → `.specs/archived/2026-07-29_inmocontent-os/`
- [x] 8.6 Verificacion final en navegador: dashboard carga sin errores de consola. **Destapo un fallo de acabado**: la raiz `/` seguia siendo la plantilla de create-next-app ("To get started, edit the page.tsx file" con el logo de Next) — lo primero que veria un cliente en una demo. Sustituida por `redirect("/dashboard")`; verificado `NEXT_REDIRECT;replace;/dashboard;307`.

**verifiable_criteria**: build exit 0 Y AUDIT.md existe Y test:all exit 0 Y dev server sirve dashboard sin errores de consola.

---

### Post-v1 — cierre del bloqueante nº1 del audit (F-14)

- [x] `/preview/[pieceId]` ya existe en produccion. Antes devolvia 404 con `NODE_ENV=production` y, como Playwright captura de esa ruta, **toda la generacion visual fallaba fuera de `next dev`**.
- [x] Control de acceso nuevo: token efimero firmado (HMAC-SHA256, TTL 5 min) ligado a (pieza, propiedad), acuñado por el renderer y verificado por la ruta. Sin el, la ruta seria un mirador publico de cualquier propiedad por id, porque v1 no tiene auth. `?demo=1` sigue siendo DEV-only.
- [x] **Gotcha que costo el primer intento**: el secreto vivia en una variable de modulo. En un build de produccion Next empaqueta la page y el route handler en bundles distintos, asi que cada uno tenia SU instancia del modulo y firmaba con un secreto diferente — el token nunca casaba y las 4 piezas visuales seguian fallando. Resuelto moviendolo a `globalThis` (mismo patron que la cola en `create-app.ts`). Se detecto porque la verificacion se hizo contra un `next start` real, no solo con tests.
- [x] Verificado end-to-end contra build de produccion **sin variables de entorno**: 6/6 piezas `done`, 11 artefactos en disco, video h264 1080x1920 de 24,4 s. Y la ruta cerrada: sin token 404, con token inventado 404, `?demo=1` en produccion 404.
- [x] Suite: **273 unit + 9 E2E**, tsc limpio, build exit 0.

### Post-v1 — desacoplar `lib/infrastructure/` del vertical

Era la trampa nº2 del PRP y lo que impedia que un nicho nuevo pasara de planificar el job a producir el PNG. Cuatro violaciones reales de la ADR (la raiz de composicion NO cuenta: la ADR le permite explicitamente importar el vertical):

- [x] `sanitizeFileName` + `photoUploadSchema` vivian en `niches/inmobiliaria/schema.ts` y los usaba la infraestructura generica para poder guardar un fichero — dependencia invertida. Bajados a `lib/infrastructure/files/upload-contract.ts`; ningun vertical nuevo tiene que copiarlos.
- [x] `email-renderer` importaba `niches/inmobiliaria/email/*`. Ahora recibe un `composeEmail` (mismo patron que `resolvePlan` de Playwright y `resolveStoryboard` de video); el nicho aporta `composePropertyEmail`.
- [x] `jszip-package-builder` importaba el vertical Y consultaba `prisma.property`. Ahora es una factoria que recibe **un plan por nicho** y lo resuelve por `job.nicheId` — eso cierra ademas **F-13**: con dos verticales registrados, un `entityId` coincidente metia datos de una propiedad en el ZIP del otro.
- [x] `lib/text-engine/index.ts` generaba copy inmobiliario e importaba del nicho, mientras el nicho importaba de vuelta `compose`/`policy`: **dependencia circular** entre "generico" y "vertical". Movido a `niches/inmobiliaria/text-engine.ts`; en `lib/` se queda lo que si es generico (componer, sanear frases prohibidas, el puerto `AiProvider`).
- [x] Test de arquitectura ampliado: ningun fichero de `lib/` fuera de `bootstrap/` puede importar `@/niches/`. Comprobado que tiene dientes (sin el filtro detecta `create-app.ts`).

### Post-v1 — revision del control de acceso con un modelo distinto

Nucleo criptografico validado, sin criticos ni altos. Cinco hallazgos medios/bajos aplicados: `Referrer-Policy: no-referrer` (el token viajaba en el `Referer` hacia `/api/assets/`), TTL 5 → 2 min, minimo de 32 caracteres para `RENDER_PREVIEW_SECRET`, forma canonica del token + tope de caducidad, y `brandId` ignorado en produccion.

El hallazgo mas util no era de codigo sino de tests: **los mios solo probaban criptografia**, asi que borrar el control de la page dejaba la suite verde con la ruta abierta. La decision se extrajo a `isPreviewAccessAllowed`, funcion pura con 6 casos. De paso destapo que dos casos de mi bateria usaban una caducidad del año 2001 y nunca llegaban al parser de firma que decian probar.

> Estado: **283 unit + 9 E2E**, tsc limpio, build exit 0, y generacion 6/6 reverificada contra `next start` con la ruta cerrada (sin token 404, token invalido 404, demo 404).

### Post-v1 — E2E en modo produccion (cierra el hueco declarado en AUDIT.md)

Los dos incidentes mas caros del proyecto pasaron con TODA la suite en verde, por la misma razon: los E2E arrancaban `next dev`. Ahora `npx playwright test` levanta dos servidores — el de desarrollo y un `next build && next start` en el 3100 — y corre 5 tests contra el segundo.

- [x] Proyecto `production` en `playwright.config.ts` con su propio `webServer` (build fresco siempre: reutilizar uno vivo daria falso verde con codigo antiguo). `RENDER_PREVIEW_SECRET` fijado para que el proceso de test pueda acuñar un token valido — de paso ejercita la ruta que hace falta con varias replicas.
- [x] Cubre las DOS mitades: que la ruta sigue funcionando (token valido → 200 con la pieza montada; generacion 6/6 piezas) y que esta cerrada (sin token, inventado, caducado, de otra propiedad, de otra pieza, `?demo=1` → 404).
- [x] **Validado contra el propio bug**: desactivando el control de acceso, 3 de los 5 fallan. Un test de regresion que no se ha visto fallar no es un test de regresion.
- [x] Hallazgo del propio test: una peticion RSC a una ruta con `notFound()` responde **200** (Next señaliza el not-found dentro del payload). No hay fuga — el payload no trae ni la pieza ni los datos —, pero el assert correcto es sobre contenido, no sobre status. Mi primera version del test exigia 404 y estaba equivocada.

> Estado: **283 unit + 14 E2E** (9 dev + 5 produccion), tsc limpio, build exit 0.

### Post-v1 — candado de operador (bloqueante de produccion nº1 de los dos que quedaban)

Cierra "cualquiera con acceso a la red del proceso opera la app entera". **Alcance declarado**: es UN candado, no gestion de usuarios — v1 es monoinquilino por diseño (ADR), y multi-inquilino con usuarios y roles sigue siendo otro producto.

- [x] Contraseña unica de operador: scrypt con sal en `APP_PASSWORD_HASH`, generada con `npm run set-password` (imprime la linea para pegar en `.env`, no escribe ficheros por su cuenta).
- [x] Sesion en cookie firmada, `HttpOnly` + `Secure` + `SameSite=lax`, 12 h. **La clave de firma se deriva del propio hash**: sin segundo secreto que olvidar, y cambiar la contraseña invalida las sesiones vivas.
- [x] `middleware.ts` lo aplica en un unico sitio. Paginas → 307 al login; APIs → 401 JSON (un fetch que recibe el HTML del login y lo parsea como JSON da un error incomprensible).
- [x] **Falla cerrado**: sin `APP_PASSWORD_HASH` en produccion, 503 a todo con instrucciones. En desarrollo el candado no aplica, mismo criterio que la ruta de render.
- [x] Excepciones, tres y justificadas: `/login` + `/api/auth/*`, `/preview/*` (token propio; pedirle cookie romperia la generacion = F-14 otra vez) y los subrecursos de la pieza (`/api/assets/*`, `/uploads/brand/*`), protegidos por id opaco — que NO es autenticacion y esta anotado como tal.
- [x] 11 unit + 10 E2E contra build de produccion. **Validado contra el propio fallo**: desactivando el candado, 4 de los 15 se ponen rojos.

> Estado: **294 unit + 24 E2E** (9 dev + 15 produccion), tsc limpio, build exit 0.

### Post-v1 — F-05 cerrado: artefactos inmutables + lease de render

Era el segundo y ultimo bloqueante de produccion.

- [x] **Rutas por job**: cada job escribe en `output/<entityId>/<jobId>/`, no en rutas fijas compartidas. Adios al `rm(destino)` previo al `rename` (y a la ventana en la que una descarga simultanea no encontraba el fichero). Los tres renderers y el propio ZIP.
- [x] **Registro de artefactos** (`ArtifactRegistry` sobre `GeneratedPiece`): la convencion de nombre ya no sirve para encontrar nada, asi que el empaquetador pregunta cual es el ultimo fichero de cada pieza. Mantiene la propiedad que costo un bug critico — el ZIP describe la PROPIEDAD, no el job.
- [x] **Lease en base de datos** con compare-and-swap y caducidad propia: dos procesos no generan la misma propiedad a la vez, y un proceso muerto no deja la entidad bloqueada para siempre. Migracion `20260731064236_render_lease`.
- [x] Tests: 8 unit contra la implementacion REAL de Prisma (un doble en memoria no probaria el CAS) + 2 E2E de produccion que comprueban lo que le importa al cliente: que un enlace de descarga antiguo sigue entregando lo mismo tras regenerar. **Validado contra el propio fallo**: devolviendo el renderer a la ruta compartida, el de inmutabilidad se pone rojo.

**Lo que NO arregla, dicho claro**: los artefactos siguen en disco local. El lease evita que dos procesos generen la misma propiedad y las rutas por job evitan que se pisen, pero una instancia no puede servir la descarga de un fichero que escribio otra. Varias instancias necesitan `output/` en almacenamiento compartido — un `AssetStore` sobre object storage es el siguiente paso natural. Esta en AUDIT.md §6.1 como requisito de despliegue, no escondido.

> Estado: **302 unit + 26 E2E** (9 dev + 17 produccion), tsc limpio, build exit 0.

### Post-v1 — F-06 cerrado: un trabajo, una version de la propiedad

Primera deuda no bloqueante de la lista. El defecto: el motor toma un snapshot, pero quien pinta las piezas son adaptadores que releen la fila viva. Entre la primera pieza y la ultima pasan uno o dos minutos, asi que reordenar las fotos o editar un titular a mitad hacia que unas piezas salieran con los datos de antes y otras con los de despues. Sin ruido, sin aviso, y con el juego completo aparentando estar bien.

- [x] **`Property.revision`** (migracion `20260731073031_property_revision`): sube con TODO lo que cambia lo que se imprime — reordenar fotos, cambiar la principal, guardar un titular editado. `updatedAt` no valia: reordenar escribe en `PropertyPhoto`, no en `Property`, asi que ni se movia.
- [x] **Cada trabajo nace atado a su revision** y la lleva consigo: firmada dentro del token de render (no solo en la URL — si no, cambiar un numero a mano desactivaria el control), y pasada a los renderers de correo y video.
- [x] **La comprobacion vive en las tres rutas que releen la fila** (`/preview`, compositor de correo, guion de video), dentro de la MISMA peticion que lee y pinta, para que no quede ventana entre comprobar y renderizar. La condicion es "distinto", no "mayor": un `>` dejaria pasar en silencio un rollback.
- [x] **Diagnostico en vez de misterio**: un 404 del preview ya no se traga los 30 s de espera del selector para acabar en "revisa los assets y reintenta" — y reintentable, repitiendo el mismo fallo tres veces. Ahora corta al momento y dice que paso.
- [x] 10 unit invocando los handlers **reales** contra Prisma (replicar la transaccion de la ruta dentro del test seria probarse a si mismo) + 1 E2E de produccion que lo comprueba por donde se ve: reordenar las fotos y ver que el render de la version anterior deja de servirse, con el contraste de que la actual si.
- [x] **Bug real destapado por el test nuevo**: reordenar fotos violaba `@@unique([propertyId, order])` y **fallaba siempre** que dos fotos se intercambiaban el sitio — o sea, en el caso mas normal de todos. La restriccion se comprueba sentencia a sentencia, asi que la asignacion va ahora en dos pasadas (aparcadero en negativos, luego los definitivos). Nadie lo habia visto porque ningun test tocaba ese endpoint.

**Lo que NO hace**: conservar la version antigua. Editar a mitad no reaprovecha lo ya renderizado — hay que volver a generar, y el juego sale entero con los datos actuales. Un snapshot completo por trabajo lo evitaria; no compensa hoy.

> Estado: **314 unit + 27 E2E** (9 dev + 18 produccion), tsc limpio, build exit 0.

### Risks (top 5) y mitigación
1. **FFmpeg en Windows** — resolver binario con `where.exe` al boot, `cmd.exe /d /s /c` para shims, timeout duro, smoke test `ffmpeg -version` en Fase 1.
2. **Determinismo de render Playwright** — esperar `document.fonts.ready`, `deviceScaleFactor` fijo, regresión visual con diff tolerante.
3. **Fuga de dirección privada** — `PublicPropertyView` como único tipo permitido en plantillas públicas (enforced por tipos), fuzzing en F6, adversarial en F7.6.
4. **Dependencia del research** — RESUELTA (docs/research completo antes de arrancar).
5. **Text-engine derivando en frases prohibidas** — lista negra como test unitario obligatorio; AiProvider off por defecto.

### Out of scope v1
Publicación directa a redes (flag off) · multi-tenant/auth multi-agencia · IA de texto activada por defecto · segunda vertical completa (solo PoC en 8.2).
