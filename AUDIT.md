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
| `npx vitest run` | **273 pasan / 273** (21 ficheros) |
| `npx playwright test` | **9 pasan / 9** (flujo completo por UI + render real de las 6 piezas) |
| `npx tsc --noEmit` | **0 errores** |
| `npm run build` | **exit 0**, 21 rutas |

De esos 273 unitarios, **10 ficheros son de seguridad** (`tests/security/`) y existen porque
cada uno corresponde a un agujero real que se encontró y se cerró, no a una casilla de
cobertura:

- `private-address-leak` · `public-view-mapper` — la dirección privada no sale por la vía normal
- `text-override-private-leak` — ni por el editor manual de textos
- `image-metadata-strip` — ni por el EXIF de las fotos
- `brand-logo-active-content` — ni por un logo SVG con `<script>`
- `zip-package` · `zip-package-scope` — el ZIP lleva lo que debe, y todo lo que debe
- `preview-render-token` — la ruta de render no se abre sin un token firmado y caduco
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

### 6.1 Bloqueantes para producción

| Riesgo | Realidad hoy | Qué haría falta |
|---|---|---|
| **Sin autenticación** | v1 es monoinquilino por diseño: cualquiera con acceso a la red del proceso opera la app entera | Auth + multiinquilino (fuera del alcance de v1) |
| **Un solo proceso** (F-05) | La cola vive en memoria y los artefactos se escriben en rutas fijas (`output/<propiedad>/<fichero>`). Dos instancias se pisarían los ficheros. El secreto del token de render también es por proceso: con varias instancias hay que fijar `RENDER_PREVIEW_SECRET` | Rutas inmutables por job + lock en base de datos |

**Conclusión honesta:** con F-14 cerrado, `next start` genera las 6 piezas (verificado end-to-end
contra un build de producción real, no solo en tests). Lo que sigue impidiendo exponerlo en una red
es la ausencia de autenticación, que en v1 es una decisión, no un olvido: cualquiera con acceso al
puerto opera la aplicación entera. Sirve hoy para instalarlo en la máquina de una inmobiliaria y
trabajar en local; para dejarlo abierto en internet hace falta la capa de auth.

### 6.2 Deuda conocida, no bloqueante

- **Snapshot ignorado** (F-06): cada renderer relee la fila viva en vez del snapshot del job,
  así que editar una propiedad *a mitad* de generación puede mezclar versiones entre piezas.
  `entityRevision` está fijo en `1`.
- **Cuotas** (F-07/F-09): hay límite por fichero, no acumulado. El ZIP se construye entero en
  memoria. Un operador legítimo no lo nota; un abuso deliberado, sí.
- **Acoplamiento en `lib/infrastructure/`**: el motor está limpio, pero `email-renderer`,
  `jszip-package-builder`, `create-app` y `text-engine` **importan del vertical inmobiliario**
  y consultan `prisma.property` directamente. Es lo que impide que el nicho dental llegue del
  job al PNG. Es la primera deuda a pagar antes de vender el segundo vertical.
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
