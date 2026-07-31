# AUDIT — InmoContent OS

**Fecha:** 2026-07-30 · **Estado:** v1 completa (8 fases) · **Nivel de rigor:** PRO

Auditoría de lo construido: qué hace, qué está verificado, qué se rompió por el camino
y qué **no** hace. La última sección es la importante — es la que evita vender humo.

---

## 1. Qué es

Un operador de inmobiliaria rellena **un formulario de propiedad** (~35 campos) y obtiene
**6 piezas de marketing** listas para publicar, más un ZIP con todo:

| Pieza | Formato | Renderer |
|---|---|---|
| Ficha técnica | PDF A4 con QR al anuncio | Playwright (print) |
| Post de Instagram | PNG 1080×1350 | Playwright |
| Carrusel de Instagram | 5 × PNG 1080×1350 | Playwright |
| Story de Instagram | PNG 1080×1920 | Playwright |
| Email comercial | HTML ≤600px + `.txt` | Plantilla server-side |
| Vídeo vertical | MP4 1080×1920, 20-35 s | FFmpeg (`spawn` directo) |

**Sin IA generativa para los textos**: plantillas locales deterministas con lista negra de
frases prohibidas. La misma entrada produce la misma salida, y ninguna frase legalmente
comprometida se cuela porque un modelo tuvo un mal día.

**Sin publicación automática** en redes: v1 entrega ficheros. Publicar es una decisión
del cliente, no del sistema.

---

## 2. Cómo se verifica

| Comprobación | Resultado |
|---|---|
| `npx vitest run` | **302 pasan / 302** (23 ficheros) |
| `npx playwright test` | **26 pasan / 26** — 9 contra `next dev` (flujo por UI + render real de las 6 piezas) y **17 contra un build de producción** (`next build && next start`) |
| `npx tsc --noEmit` | **0 errores** |
| `npm run build` | **exit 0**, 21 rutas |

De esos 302 unitarios, **12 ficheros son de seguridad** (`tests/security/`) y existen porque
cada uno corresponde a un agujero real que se encontró y se cerró, no a una casilla de
cobertura:

- `private-address-leak` · `public-view-mapper` — la dirección privada no sale por la vía normal
- `text-override-private-leak` — ni por el editor manual de textos
- `image-metadata-strip` — ni por el EXIF de las fotos
- `brand-logo-active-content` — ni por un logo SVG con `<script>`
- `zip-package` · `zip-package-scope` — el ZIP lleva lo que debe, y todo lo que debe
- `preview-render-token` — la ruta de render no se abre sin un token firmado y caduco
- `operator-session` — la llave de la instalación no se fabrica ni se estira
- `render-lease` — dos procesos no generan piezas de la misma propiedad a la vez
- `path-traversal` · `file-size-limits` — lo básico de subida de ficheros

El E2E de la ficha PDF **extrae el texto del PDF generado** y comprueba que la dirección
privada no aparece. No se fía del tipo TypeScript: mira el binario.

---

## 3. La regla dura

> *La dirección privada y el nombre interno JAMÁS aparecen en una pieza pública, en el ZIP,
> ni en `datos-propiedad.json`.*

Es la promesa que hace vendible el producto (una filtración de la dirección de un piso
vacío es un problema de seguridad física para el cliente), así que tiene **cuatro capas**:

1. **Tipo**: las plantillas solo aceptan `PublicPropertyView`, que es una proyección
   **por inclusión** — un campo nuevo en el modelo no se publica hasta que alguien lo añade
   a la allowlist a propósito.
2. **Mapeo único**: `niches/inmobiliaria/persistence/public-view-mapper.ts` es el único sitio
   donde una fila de base de datos se convierte en vista pública. Hasta el cierre de la review
   había **cuatro copias escritas a mano y ya divergentes**.
3. **Validación de entrada manual**: el editor de textos rechaza (422) cualquier texto que
   contenga la dirección o la referencia interna, normalizando mayúsculas, tildes y puntuación.
4. **Ingesta de imágenes**: las fotos se recodifican al subirlas, así que el EXIF con las
   coordenadas GPS del inmueble no llega al destinatario del email.

---

## 4. Qué encontraron las revisiones

Dos pasadas independientes sobre el código terminado:

- **`revisor por ejes` ×3 en paralelo** (seguridad / calidad / corrección, mismo modelo):
  1 crítico + 8 importantes.
- **Revisión adversarial con un modelo distinto** (modelo distinto, prompt de atacante):
  14 hallazgos. Informe íntegro en [`docs/review/adversarial-review.md`](docs/review/adversarial-review.md).

### Corregido

| # | Hallazgo | Por qué importaba |
|---|---|---|
| CRÍTICO | El ZIP se construía desde `job.tasks`: tras regenerar una pieza salía con **1 de 15 entradas**, en silencio | El cliente descargaba "todo" y recibía un fichero |
| F-02 | Las fotos se guardaban **sin recodificar** y el email las servía tal cual | Cualquier destinatario extraía las **coordenadas GPS** del inmueble con un lector EXIF |
| F-01 | El editor de textos entra *después* de la proyección pública | Pegar la dirección en el titular la publicaba en 6 piezas de una vez |
| F-03 | Se aceptaban logos **SVG**, servidos inline y same-origin | Un `<script>` en el logo leía el borrador de propiedad de `localStorage` |
| F-04 | `z.string().url()` aceptaba `javascript:` y `data:` en el enlace del anuncio | Ese enlace acaba en el `href` del CTA del email |
| F-08 | Cola sin deduplicación ni tope | Un doble clic encadenaba renders idénticos durante horas |
| F-10 | `stderr` de FFmpeg ilimitado, persistido y devuelto por API | Consumo de memoria + rutas locales del servidor expuestas al navegador |
| F-11 | Tareas huérfanas en `rendering` tras un reinicio | Piezas que la UI no podía completar **ni reintentar**, para siempre |
| F-12 | Playwright sin timeout duro | Una foto que no cargaba congelaba **toda** la cola, sin error |
| F-14 | `/preview/*` era DEV-only y Playwright captura de esa ruta | **Toda** la generación visual fallaba en producción: el único runtime operativo era `next dev` |
| QUALITY | 4 copias del mapeo a vista pública, ya divergentes | Es *la* allowlist de privacidad; mantenerla en 4 sitios es cuestión de tiempo |

### Tercera pasada: revisión cross-model del control de acceso

El token de render (F-14) se auditó aparte con un modelo distinto, porque un
control de acceso escrito por el mismo modelo que lo diseñó no es una segunda
opinión. Veredicto del núcleo criptográfico: correcto — HMAC-SHA256 bien
construido, alcance cubierto, `timingSafeEqual`, sin length-extension aplicable,
verificación antes de tocar Prisma. **Sin hallazgos críticos ni altos.**

Cinco hallazgos medios y bajos, todos aplicados:

| Hallazgo | Qué se hizo |
|---|---|
| El token viaja en la URL y se reenvía en el `Referer` hacia `/api/assets/…` | `Referrer-Policy: no-referrer` en la ruta de render y TTL de 5 → 2 min |
| `RENDER_PREVIEW_SECRET=x` se aceptaba | Mínimo de 32 caracteres, y falla al arrancar en vez de fingir que protege |
| Se colaban tokens no canónicos (`1.78e12`, ceros delante, sufijos tras la firma) | Forma canónica exigida por regex + tope de caducidad |
| `brandId` cambiaba el render y no iba firmado | Se ignora en producción; manda la marca de la propiedad |
| **Los tests solo probaban criptografía**: borrar el control de la página dejaba la suite verde con la ruta abierta | La decisión se extrajo a `isPreviewAccessAllowed`, una función pura con 6 casos cubiertos |

Ese último es el que más valía. También destapó que dos casos de mi propia
batería usaban una caducidad del año 2001, así que se rechazaban por caducados
y **nunca llegaban a ejercitar el parser de firma** que decían probar.

### Artefactos inmutables y lease de render (F-05)

Cada job escribe ahora en su **propio directorio** (`output/<entityId>/<jobId>/`),
no en rutas fijas compartidas. Tres cosas cambian:

- Dos procesos ya no se pisan el mismo fichero.
- Desaparece el `rm(destino)` previo al `rename`, y con él la ventana en la que
  una descarga simultánea encontraba el fichero ausente.
- **Regenerar una pieza deja de cambiar lo que descarga un enlace antiguo.** Es
  lo que le importa al cliente: un artefacto enviado por correo la semana pasada
  sigue entregando lo mismo.

Como la convención de nombre ya no sirve para encontrar nada, el empaquetador
pregunta a un registro de artefactos (`ArtifactRegistry`, sobre la tabla
`GeneratedPiece`) cuál es el último fichero de cada pieza. Eso mantiene la
propiedad que costó un bug crítico: **el ZIP describe la propiedad, no el job**.

Y para lo que las rutas por sí solas no arreglan —dos procesos generando la
misma propiedad a la vez— hay un lease en base de datos que se toma con un
compare-and-swap y **caduca solo**, para que un proceso muerto no deje la
entidad bloqueada hasta que alguien entre a mano en la base de datos.

Los dos tests que lo prueban se validaron contra el propio fallo: devolviendo el
renderer a la ruta compartida, el de inmutabilidad se pone rojo.

### Candado de operador

La aplicación ya no se abre sola. Una contraseña única de operador (scrypt con sal en
`APP_PASSWORD_HASH`, generada con `npm run set-password`), sesión en cookie firmada `HttpOnly`
+ `Secure` + `SameSite=lax` con 12 h de vida, y un middleware que lo aplica en un solo sitio.

Tres decisiones que conviene entender:

- **La clave que firma la sesión se deriva del propio hash de la contraseña.** No hace falta un
  segundo secreto que alguien olvidaría configurar, y cambiarla invalida todas las sesiones
  vivas — que es justo lo que uno espera al cambiarla porque sospecha algo.
- **Sin `APP_PASSWORD_HASH` en producción la app responde 503 a todo.** Falla cerrado y ruidoso:
  una instalación sin candado en una red es exactamente el problema que esto viene a evitar.
- **Las excepciones son tres y cada una es una puerta**: `/login` y `/api/auth/*` (evidente),
  `/preview/*` (tiene su propio token; exigirle cookie rompería toda la generación, que es el bug
  F-14 otra vez) y los subrecursos que carga la pieza al renderizarse (`/api/assets/*`,
  `/uploads/brand/*`), que no llevan sesión. Estos últimos se protegen por identificador opaco,
  que **no es equivalente a autenticación**.

10 tests contra el build de producción cubren el candado, y como los demás, se validó contra el
propio fallo: desactivándolo, 4 de los 15 se ponen rojos.

### El E2E que faltaba: modo producción

Los dos incidentes más caros de este proyecto pasaron **con toda la suite en
verde**, y por la misma razón: los E2E arrancaban `next dev`.

1. `/preview/*` devolvía 404 en producción → toda la generación visual fallaba.
2. El primer arreglo guardaba el secreto en una variable de módulo, y en un
   build de producción Next da instancias distintas a la página y al route
   handler → seguía fallando, verde igualmente.

Ahora `npx playwright test` levanta **dos servidores**: el de desarrollo y un
build de producción real en el puerto 3100. Cinco tests comprueban las dos
mitades que importan — que la ruta **sigue funcionando** (token válido → 200 con
la pieza montada, y generación 6/6) y que está **cerrada** (sin token, token
inventado, caducado, de otra propiedad, de otra pieza, y `?demo=1` → 404).

Ese test se validó contra el propio bug: desactivando el control de acceso,
**3 de los 5 fallan**. Un test de regresión que no se ha visto fallar no es un
test de regresión.

De paso destapó un detalle de Next que habría sido un falso hallazgo: una
petición RSC a una ruta que llama a `notFound()` responde **200**, porque el
not-found viaja dentro del payload. No hay fuga —el payload no trae ni la pieza
ni los datos— pero el assert correcto es sobre el contenido, no sobre el status.

### Descartado con evidencia

Dos hallazgos resultaron ser **falsos positivos**, y se comprobó antes de tocar código sano:

- *"El validador de nombres de fichero comprueba espacios en vez del byte nulo"* — `od -c`
  mostró que el fuente contenía un NUL literal real. El check funcionaba.
- *"El texto editado no llega al render"* — verificado por el HTML del preview y por el hash
  del PNG (cambia al regenerar con otro texto). El fallo estaba **en el test**, que descargaba
  el fichero anterior por una condición de carrera.

---

## 5. Generalización a otros nichos

El objetivo declarado no era una app para inmobiliarias: era una **estructura replicable**.
El motor (`lib/engine/`, 1.004 líneas) no conoce el vertical; el vertical es un plugin que
declara schema, proyección pública, bindings, piezas, política de texto y reglas legales.

**Prueba real, no promesa** — `niches/clinica-dental/` (556 líneas, PoC de Fase 8.2):
una clínica dental con sus propios campos privados (código interno, notas clínicas, coste),
sus reglas legales (RD 1907/1996: prohibido prometer resultados; TAE obligatoria al anunciar
financiación) y **2 plantillas** propias. Pasa por el **mismo** engine, el mismo registro y
los mismos contratos. 12 tests en `tests/unit/niche-generalization.test.ts` lo verifican,
incluido uno que lee `lib/engine/` fichero a fichero y falla si aparece cualquier rastro del
vertical.

**Fricción encontrada al montarlo** (que es el valor del PoC): el contrato `OutputContract`
del motor solo admite `pdf | png | mp4` para artefactos binarios sueltos. `tsc` rechazó el
primer intento. Es defendible —la lista refleja lo que los renderers saben producir— pero
un nicho que necesite otro formato **tiene que tocar el motor**.

---

## 6. Lo que NO hace (riesgos residuales)

Esta sección existe porque un audit que solo lista logros no sirve para decidir.

### 6.1 Requisitos de despliegue (ya no hay bloqueantes)

Los dos bloqueantes que quedaban están cerrados: hay candado de operador, y F-05
(un solo proceso) también. Lo que queda no son defectos sino **condiciones de
instalación**, y conviene tenerlas delante antes de montar esto en ningún sitio:

| Requisito | Por qué |
|---|---|
| **Servir detrás de HTTPS** | La cookie de sesión va marcada `Secure`: sin TLS, el navegador no la guarda y no se puede entrar |
| **`APP_PASSWORD_HASH` configurado** | Sin él la app responde 503 a todo. Es deliberado |
| **Con varias instancias: `RENDER_PREVIEW_SECRET` compartido** | Cada proceso genera el suyo si falta, y las capturas de uno no validarían contra la ruta servida por otro |
| **Con varias instancias: `output/` en almacenamiento compartido** | Los artefactos se escriben en disco local. El lease evita que dos procesos generen la misma propiedad a la vez, y las rutas por job evitan que se pisen — pero una instancia no puede servir la descarga de un fichero que escribió otra en su disco. Un `AssetStore` sobre object storage es el siguiente paso natural |

**Conclusión honesta:** una instalación, detrás de HTTPS, con su contraseña, es
instalable hoy en una inmobiliaria. Varias instancias requieren además el
almacenamiento compartido de la última fila — no es un defecto oculto, es el
límite conocido de guardar ficheros en el disco de la máquina.

Y lo que el candado **no** es: gestión de usuarios. Una instalación = una agencia
= una contraseña. No hay usuarios, ni roles, ni trazabilidad de quién hizo qué.
Multi-inquilino sigue siendo otro producto.

### 6.2 Deuda conocida, no bloqueante

- **Snapshot ignorado** (F-06): cada renderer relee la fila viva en vez del snapshot del job,
  así que editar una propiedad *a mitad* de generación puede mezclar versiones entre piezas.
  `entityRevision` está fijo en `1`.
- **Cuotas** (F-07/F-09): hay límite por fichero, no acumulado. El ZIP se construye entero en
  memoria. Un operador legítimo no lo nota; un abuso deliberado, sí.
- **Acoplamiento en `lib/infrastructure/`**: **resuelto**. `email-renderer` recibe un
  compositor, el empaquetador ZIP recibe un plan por `nicheId` (lo que además cierra F-13,
  la mezcla de datos entre nichos), `sanitizeFileName`/`photoUploadSchema` bajaron a
  infraestructura y el generador de copy inmobiliario subió al nicho. Hoy la única capa de
  `lib/` que importa un vertical es la raíz de composición, que es justo lo que la ADR
  permite, y hay un test que lo vigila fichero a fichero.
- **Replay del token de render**: dentro de su ventana de 2 minutos, una URL
  filtrada se puede repetir. No hay nonce ni consumo único — con la app sin
  autenticación, ese no es el eslabón débil, pero queda dicho.
- **Validación del texto editado**: detecta el copia-pega de la dirección, no una reescritura
  a mano ("c/ Secreta doce"). Es una red, no una garantía matemática.

---

## 7. Contraste con la guía de partida

La guía original describía el flujo y las 6 piezas. Estado punto por punto:

| Punto de la guía | Estado |
|---|---|
| Formulario de propiedad con campos públicos y privados separados | ✅ ~35 campos, separación en el tipo |
| Configuración de marca (logo, colores, tipografía) | ✅ Onboarding + 4 presets con contraste AA verificado |
| Las 6 piezas | ✅ Todas, con render real verificado en E2E |
| Descarga individual + ZIP | ✅ Más `README.txt` y `datos-propiedad.json` |
| Regenerar una sola pieza | ✅ Sin tocar las demás |
| Editar el texto antes de regenerar | ✅ Con el guardarraíl de privacidad añadido |
| Textos sin IA | ✅ Plantillas deterministas + lista negra |
| Replicable a otros nichos | ✅ Demostrado con el PoC dental (parcial: hasta la planificación) |

**Añadido sobre la guía** (del research de mercado en `docs/research/`): reglas legales como
gate de bloqueo —el certificado energético es obligatorio en los anuncios en España— y la
separación estricta dirección pública / privada, que la guía no contemplaba.

**No incorporado a v1** y candidato claro a v1.1: checklist legal completo previo a publicar,
traducción a inglés y nórdico de un clic (la Costa Blanca vende a extranjeros), y registro de
consentimiento RGPD del propietario.

---

## 8. Rastro

- Plan y criterios verificables por fase: [`PLAN.md`](PLAN.md)
- Decisión de arquitectura del motor de nichos: [`docs/architecture/niche-engine.md`](docs/architecture/niche-engine.md)
- Revisión adversarial íntegra: [`docs/review/adversarial-review.md`](docs/review/adversarial-review.md)
- Research de mercado e inmobiliaria de referencia: [`docs/research/`](docs/research/)
- Decisiones de stack y versiones: [`docs/stack-decisions.md`](docs/stack-decisions.md)
