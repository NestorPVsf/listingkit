Resultado: 14 hallazgos. No observé una fuga automática directa de `Property.privateAddress` o `internalName` en el flujo normal, pero la garantía dura puede eludirse por entradas secundarias, metadatos y carreras.

### F-01 — Los overrides quedan fuera de `PublicPropertyView`

SEVERITY: high  
FILE: `app/api/properties/[propertyId]/piece-text/route.ts:10-13,38-57`; `app/api/properties/[propertyId]/regenerate-piece/route.ts:35-50,66-82`; `niches/inmobiliaria/apply-text-override.ts:31-59`; `lib/infrastructure/package/jszip-package-builder.ts:300-304`  
ATTACK: Un operador copia accidental o deliberadamente `privateAddress` o `internalName` en el editor de una pieza. El texto se persiste directamente y sustituye el titular después de la proyección pública; posteriormente aparece en PNG/PDF/email y en los textos del ZIP. Esta vía no extrae por sí sola los campos privados, pero permite reintroducirlos sin pasar por el contrato público. `regenerate-piece` tampoco limita el tamaño de `textOverride`.  
FIX: Validar todos los overrides con un schema específico del nicho, límite estricto y comparación normalizada contra los valores completos de `privateAddress` e `internalName`. Incorporar el override al snapshot público del nuevo job, no resolverlo desde `GeneratedPiece` en vivo. Añadir un test endpoint→render→ZIP con ambos centinelas.

### F-02 — Las fotos originales conservan EXIF y se publican desde el email

SEVERITY: high  
FILE: `lib/infrastructure/files/local-asset-store.ts:100-139,150-159`; `niches/inmobiliaria/email/load-piece-data.ts:126-129`; `app/api/assets/[assetId]/route.ts:17-25`  
ATTACK: Se sube un JPEG/WebP con GPS, dirección o comentarios EXIF. El almacenamiento valida el formato con Sharp, pero guarda el buffer original sin recodificar. El email apunta directamente a `/api/assets/<uuid>`; un destinatario descarga esa imagen y recupera ubicación o información interna con cualquier lector EXIF.  
FIX: Recodificar todas las imágenes al entrar mediante Sharp —autorrotación, límites y salida JPEG/PNG/WebP nueva sin metadatos— y almacenar como activo público únicamente ese derivado. Si se conservan originales, guardarlos en almacenamiento privado separado y nunca referenciarlos desde piezas.

### F-03 — SVG de marca permite XSS persistente same-origin

SEVERITY: high  
FILE: `app/(main)/(setup)/onboarding/actions.ts:20-26,60-80`; `app/uploads/brand/[fileName]/route.ts:12-16,43-50`; `next.config.ts:4-19`; `app/(main)/properties/new/PropertyForm.tsx:24,131-143`  
ATTACK: Se sube un SVG válido con `<script>`. Solo se confía en `File.type`; después se sirve inline como `image/svg+xml`, sin `Content-Disposition`, aislamiento ni CSP. Al abrir directamente su URL, el script ejecuta con el origen de la aplicación y puede leer el borrador de `localStorage`, que contiene `privateAddress` e `internalName`, o invocar todas las APIs sin autenticación.  
FIX: La opción más segura es eliminar SVG del upload y aceptar solo formatos raster recodificados. Si SVG es imprescindible, sanitizar con allowlist estricta, rasterizarlo antes de servirlo y alojar el original en otro origen sin credenciales. Añadir CSP global y `Content-Disposition: attachment`/`CSP: sandbox` para activos activos.

### F-04 — `listingUrl` admite esquemas activos y el HTML puede servirse inline

SEVERITY: high  
FILE: `niches/inmobiliaria/schema.ts:14,68`; `niches/inmobiliaria/email/render-email.ts:38-56,100-106`; `app/api/generated-pieces/[artifactId]/download/route.ts:12-21,49-65`  
ATTACK: `z.string().url()` no restringe el protocolo. Se guarda una URL `javascript:` o `data:`, se genera el email y se obtiene su artifact ID desde el job. Abriendo `/download?inline=1`, el servidor entrega el HTML como documento activo same-origin; al pulsar el CTA se alcanza una URL ejecutable o contenido controlado. El escapado HTML no neutraliza protocolos peligrosos.  
FIX: Usar una validación de URL limitada a `https:` y, si se necesita, `http:` solo en desarrollo. Para `.html`, ignorar siempre `inline=1` y forzar descarga; cualquier preview HTML debe ejecutarse en un origen aislado y con CSP `sandbox`.

### F-05 — No existe lock durable y los artefactos de distintos jobs comparten ruta

SEVERITY: high  
FILE: `lib/bootstrap/create-app.ts:161-176`; `lib/engine/create-engine.ts:161-184`; `lib/infrastructure/render/playwright-renderer.ts:104-117,156-174`; `lib/infrastructure/render/email-renderer.ts:53-65`; `lib/infrastructure/render/video-renderer.ts:317-327,459-467`; `prisma/schema.prisma:133-155`  
ATTACK: Dos instancias de Next, o dos workers tras un despliegue, procesan simultáneamente la misma propiedad. La cola solo existe en memoria por proceso. Ambos escriben `output/<propertyId>/<nombre-fijo>` y ejecutan `rm(final)` seguido de `rename`; pueden borrar el resultado contrario, fallar en el rename o hacer que dos artifact IDs apunten al mismo archivo mutable. Incluso secuencialmente, regenerar una pieza cambia lo descargado por enlaces históricos.  
FIX: Guardar artefactos inmutables en `output/<entityId>/<jobId>/<artifactId>.<ext>`. Implementar un lease/lock en DB por entidad y revisión, con adquisición mediante compare-and-swap. No borrar un destino compartido; publicar una ruta única terminada y marcar aparte cuál es la versión actual.

### F-06 — Los renderers ignoran el snapshot y vuelven a leer la fila viva

SEVERITY: high  
FILE: `lib/engine/compile-niche.ts:54-65`; `niches/inmobiliaria/persistence/property-mapper.ts:66-73`; `app/preview/[pieceId]/page.tsx:105-182`; `niches/inmobiliaria/email/load-piece-data.ts:53-131`; `niches/inmobiliaria/video/load-piece-data.ts:156-291`; `lib/infrastructure/package/jszip-package-builder.ts:153-202,295-304`  
ATTACK: Durante un render se cambia la foto principal, el orden, la marca o un override. Cada renderer vuelve a consultar Prisma en momentos distintos, por lo que un mismo job puede mezclar revisiones. El ZIP se crea con los datos actuales, no con los que generaron los binarios. Dos retries concurrentes también pueden hacer que el primer job consuma el override del segundo. Además, `entityRevision` está fijado siempre en `1`.  
FIX: Hacer que todos los renderers y el empaquetador consuman exclusivamente `job.bindings` y referencias de assets congeladas. Persistir e incrementar una revisión real ante cualquier cambio relevante. Los overrides deben crear un nuevo snapshot, nunca leerse dinámicamente durante el render.

### F-07 — Uploads ilimitados permiten agotar RAM y disco

SEVERITY: high  
FILE: `app/api/assets/route.ts:9-28`; `lib/infrastructure/files/local-asset-store.ts:100-107,150-159,171-178,203-212`; `next.config.ts:20-32`  
ATTACK: Se envían muchos multipart de 50 MB como audio o 10 MB como imagen. `request.formData()` materializa el body antes de comprobar `File.size`; cada upload válido queda huérfano aunque nunca se cree una propiedad. No hay cuota, rate limit, límite acumulado ni limpieza, por lo que se puede agotar memoria o disco. El audio solo valida el MIME declarado y entrega bytes arbitrarios a FFmpeg.  
FIX: Imponer el límite de body antes de Next mediante proxy/edge, parsear multipart por streaming con corte temprano, aplicar cuota y rate limit, y eliminar activos sin referencia. Validar audio por contenido/ffprobe antes de almacenarlo o encolarlo.

### F-08 — Cola serial pero ilimitada y sin deduplicación

SEVERITY: high  
FILE: `app/api/properties/[propertyId]/generate/route.ts:29-47`; `app/api/properties/[propertyId]/regenerate-piece/route.ts:87-101`; `lib/bootstrap/create-app.ts:161-176`  
ATTACK: Un cliente repite POST de generación o retry. Cada petición crea un job nuevo y lo añade a una cadena de promesas sin límite; no se rechazan duplicados activos de la misma propiedad/pieza. La CPU queda ocupada durante horas y un reinicio pierde la cola en memoria dejando jobs pendientes en DB.  
FIX: Usar una cola durable con límite de backlog y concurrencia, idempotency key única por entidad+revisión+pieza, y devolver `409`/`429` cuando ya exista un job equivalente o se supere la capacidad.

### F-09 — El ZIP se construye y sirve completamente en memoria sin techo

SEVERITY: medium  
FILE: `lib/infrastructure/package/jszip-package-builder.ts:270-354`; `app/api/render-jobs/[jobId]/package/route.ts:42-51`  
ATTACK: Cada descarga reconstruye todas las entradas con JSZip, crea un `nodebuffer`, lo escribe y vuelve a leer todo el ZIP antes de responder. Varias descargas simultáneas de jobs con vídeo/PNGs grandes multiplican el uso de RAM; no existe tamaño máximo ni single-flight por job.  
FIX: Calcular previamente un máximo de paquete, rechazarlo antes de construir y cachear una única creación por job. Preferir ZIP por streaming y respuesta mediante stream, sin un segundo `readFile` completo.

### F-10 — `stderr` es ilimitado, se persiste y se devuelve al cliente

SEVERITY: medium  
FILE: `lib/infrastructure/process/spawn-with-timeout.ts:35-62,81-86`; `lib/infrastructure/render/video-renderer.ts:134-155`; `lib/infrastructure/db/render-job-repository.prisma.ts:93-105`; `app/api/render-jobs/[jobId]/route.ts:14-21`; `app/api/assets/route.ts:29-40`  
ATTACK: Un audio hostil provoca que FFmpeg emita gran cantidad de diagnóstico o metadatos controlados durante 120 segundos. Todo `stderr` se acumula sin límite, se guarda como `errorTechnicalDetails` y GET del job devuelve el objeto completo. Esto permite consumo de memoria/DB y exposición de rutas locales o metadatos del archivo. Otros endpoints también devuelven `error.message` crudo.  
FIX: Limitar stdout/stderr con un buffer circular pequeño, usar `-loglevel error`, truncar y redactar rutas, y no incluir `technicalDetails` en el DTO público. Las respuestas deben devolver códigos estables; el diagnóstico completo debe quedar en logging interno con redacción.

### F-11 — Un crash deja estados imposibles e irrecuperables

SEVERITY: medium  
FILE: `lib/engine/create-engine.ts:87-95,161-207,237-257`; `lib/infrastructure/db/render-job-repository.prisma.ts:67-109`  
ATTACK: El proceso muere después de persistir una task como `rendering`. Al reanudar el mismo job, `runRenderJob` solo ejecuta tasks `pending`, por lo que la task queda eternamente `rendering`; aun así el job puede terminar marcado `error` o `partial`. La UI detiene el polling por el estado agregado y muestra una pieza imposible de reintentar correctamente.  
FIX: Añadir leases con expiración, watchdog de recuperación y transición atómica `pending -> rendering`. Al vencer el lease, convertir tasks activas a `error` retryable o devolverlas a `pending`. `finalJobStatus` debe rechazar cualquier task todavía activa.

### F-12 — Playwright carece de un timeout duro de tarea/job

SEVERITY: medium  
FILE: `lib/infrastructure/render/playwright-renderer.ts:63-83,126-157,226-231`; `lib/bootstrap/create-app.ts:169-176`  
ATTACK: `page.evaluate()` espera `document.fonts.ready` y decodificación de todas las imágenes sin un watchdog propio. Un recurso que no resuelve puede dejar el primer job bloqueado; como la cola es global y serial, todos los trabajos posteriores quedan detenidos y el browser no llega al `finally` mientras la promesa no termine.  
FIX: Aplicar timeout duro a toda captura y al job completo, cerrar browser/context al expirar y ejecutar el renderer pesado en un worker/proceso que pueda terminarse de forma fiable.

### F-13 — El package builder “genérico” puede mezclar datos entre nichos

SEVERITY: medium  
FILE: `lib/infrastructure/package/jszip-package-builder.ts:38-61,153-202,253-310`  
ATTACK: Al añadir una segunda vertical, cualquier job sigue consultando `prisma.property` usando solo `entityId` y siempre añade `datos-propiedad.json`, copy de Instagram y guion inmobiliario. Si un entity ID del nuevo nicho coincide con una Property existente, su ZIP contiene datos de esa propiedad aunque `job.nicheId` sea otro.  
FIX: Inyectar en cada `NicheRuntime` un proyector público/empaquetador específico y namespacear las entidades por `nicheId`. El builder común debe limitarse a artefactos y datos públicos presentes en el snapshot del job, sin importar Prisma ni `niches/inmobiliaria`.

La comprobación literal sí pasa: `lib/engine/` no contiene `Property`, `privateAddress` ni conocimiento inmobiliario. La separación práctica falla en renderers y empaquetado.

### F-14 — El renderer visual no funciona en producción segura

SEVERITY: medium  
FILE: `app/preview/[pieceId]/page.tsx:185-201`; `app/preview/layout.tsx:15-20`; `lib/infrastructure/render/playwright-renderer.ts:126-129`; `README.md:3-17`  
ATTACK: En `NODE_ENV=production`, `/preview/*` devuelve 404, pero Playwright depende de esa ruta para PDF y PNG. Las generaciones visuales fallan sistemáticamente; repetir solicitudes llena la cola. Para que funcione actualmente hay que ejecutar `next dev`, que no debe exponerse a una red.  
FIX: Crear una ruta renderer-only disponible en producción, protegida por token efímero ligado a job/pieza y restringida a loopback, o renderizar HTML directamente sin endpoint HTTP. No usar el servidor de desarrollo como runtime operativo.

## Áreas sin hallazgo directo

- FFmpeg usa argumentos separados, `shell:false` y binario resuelto; el texto se rasteriza con Sharp y se escapa como XML. No encontré command injection ni `drawtext` controlable.
- Los segmentos de salida se restringen, los asset IDs son UUID y los nombres del ZIP son constantes. No encontré ZIP-slip o path traversal explotable desde las APIs actuales.
- El email escapa correctamente el contenido textual con codificación contextual básica; el problema está en los protocolos URL, no en la descripción o características.

## Veredicto global

No es seguro tal como está para producción, una LAN compartida o datos reales sujetos a la regla dura. Solo es aceptable como demo local en `127.0.0.1`, con un único proceso y operador totalmente confiable, sin SVG no confiables y sin distribuir emails que referencien las imágenes originales.

TOP-3:

1. Privacidad incompleta: overrides fuera de la proyección y EXIF original publicado.
2. Contenido activo same-origin: SVG y HTML/URLs ejecutables sin CSP o aislamiento.
3. Integridad y disponibilidad del pipeline: sin lock durable, snapshots ignorados, rutas mutables y colas sin límite.

Revisión estática únicamente; no ejecuté tests ni modifiqué archivos.