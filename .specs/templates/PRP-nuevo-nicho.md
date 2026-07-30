# PRP — Nuevo vertical sobre el motor de nichos

> **Qué es esto.** La plantilla para levantar un vertical nuevo (clínica, taller,
> gimnasio, asesoría…) reutilizando el motor de InmoContent OS. Se rellena la
> sección 1, se lee el resto tal cual, y sale un documento autosuficiente para
> que un agente implemente el vertical sin tener que re-descubrir la
> arquitectura ni volver a tropezar con lo que ya nos tropezó.
>
> **Cómo se usa.** Copia este fichero a `.specs/active/<nicho>/PRP.md`, rellena
> los `«...»`, borra lo que no aplique, y arranca. Lo que **no** se toca son los
> gates de validación (§8) ni las reglas heredadas (§6): son lo que hace que el
> resultado sea vendible y no una demo.
>
> Escrito a partir de la v1 de inmobiliaria y del PoC de clínica dental
> (`niches/clinica-dental/`, que es el ejemplo mínimo funcionando).

---

## 1. Ficha del vertical (RELLENAR)

| Campo | Valor |
|---|---|
| **Id del nicho** (kebab-case, es el `id` del `NicheConfig`) | `«clinica-dental»` |
| **Entidad que se publica** | «un tratamiento», «un vehículo en venta», «una clase» |
| **Quién lo usa** | «la recepcionista de la clínica, entre paciente y paciente» |
| **Mercado / jurisdicción** | «España — sector sanitario» |
| **Dolor concreto que quita** | «cada post lo hace un becario en Canva y tarda 40 min» |

### 1.1 Campos privados (los que JAMÁS salen publicados)

Esto es lo primero que hay que decidir, no lo último. Es el equivalente a
`privateAddress` en inmobiliaria: el dato que, si se filtra, es un problema real
para el cliente, no una errata.

| Campo | Por qué es privado | Qué pasa si se filtra |
|---|---|---|
| `«caseNotes»` | «dato de salud del paciente de referencia» | «brecha RGPD categoría especial» |
| `«internalCostEur»` | «coste real para la clínica» | «el cliente ve tu margen»  |

### 1.2 Piezas a generar

| Pieza | Formato y medidas | Renderer | ¿Por defecto? |
|---|---|---|---|
| `«treatment-poster»` | «PNG 1080×1350» | `image` | sí |
| `«treatment-email»` | «HTML ≤600px + .txt» | `email` | sí |

> Renderers disponibles hoy: `image` y `pdf` (Playwright), `email` (plantilla
> server-side), `video` (FFmpeg). Uno nuevo es trabajo de motor, no de vertical.

### 1.3 Reglas legales del sector

Son un **gate de bloqueo**, no un aviso decorativo: una pieza con severidad
`blocking` no se renderiza. Es lo que evita publicar algo ilegal en nombre del
cliente.

| Regla | Severidad | Norma | Qué comprueba |
|---|---|---|---|
| `«es-health-no-guaranteed-results»` | `blocking` | «RD 1907/1996» | «que el texto no prometa resultados» |
| `«es-financing-apr»` | `warning` | «Ley 16/2011» | «que se declare la TAE si se anuncia financiación» |

### 1.4 Frases prohibidas (política de texto)

Lista negra que los textos generados no pueden contener nunca, ni aunque el
operador las escriba a mano: «"el mejor dentista"», «"sin dolor"», «"garantizado"».

---

## 2. Contexto que el agente no puede adivinar

Leer estos ficheros **antes** de escribir nada. No es documentación de cortesía:
cada uno responde a una pregunta que si no se resuelve genera trabajo tirado.

| Fichero | Qué buscar en él |
|---|---|
| `docs/architecture/niche-engine.md` | La ADR vinculante. Dirección de dependencias y qué puede saber cada capa |
| `lib/engine/niche-config.ts` | El contrato exacto que hay que rellenar (`NicheConfig`) |
| `lib/engine/contracts.ts` | `PieceDefinition`, `OutputContract`, `TemplateBindings`, `LegalFinding` |
| `niches/clinica-dental/` | **El ejemplo mínimo completo.** 8 ficheros, 556 líneas. Empieza copiando esto |
| `niches/inmobiliaria/` | El ejemplo completo de producción, con las 6 piezas y la persistencia |
| `tests/unit/niche-generalization.test.ts` | Cómo se prueba que el vertical no ensucia el motor |
| `AUDIT.md` §6 | Lo que el sistema NO hace todavía. Evita prometerlo al cliente |

---

## 3. Lo que el motor ya te da (no reimplementar)

Si te descubres escribiendo esto, párate: ya existe y es genérico.

- **Planificación de trabajos**: qué piezas se generan, en qué orden, con
  reintentos y estados (`pending → rendering → done/error/blocked`).
- **Gate de bindings**: una pieza a la que le falta un dato obligatorio se marca
  `blocked` con un error accionable, no revienta a mitad del render.
- **Gate legal**: `blocking` bloquea, `warning` avisa y deja pasar.
- **Cola** con deduplicación (409 si ya hay un trabajo idéntico) y tope (429).
- **Reintentos y timeouts**: 90 s de techo por captura, reclamación de tareas
  huérfanas tras un reinicio, cierre honesto de trabajos a medias.
- **Empaquetado ZIP** con `README.txt` y el JSON de datos públicos.
- **Ingesta de imágenes**: recodificación con descarte de EXIF/GPS, tope de
  dimensiones, validación de contenido real (no del MIME declarado).
- **Ruta de render** protegida con token efímero, operativa en producción.

## 4. Lo que sí tienes que escribir

Árbol objetivo. Los cinco primeros son obligatorios; el resto según piezas.

```
niches/«nicho»/
├── schema.ts            # Zod del input + proyección pública POR INCLUSIÓN
├── bindings.ts          # FieldBindingMap: de campos públicos a variables de plantilla
├── legal-rules.ts       # Las reglas de §1.3
├── catalog.ts           # Las piezas de §1.2 (PieceDefinition[])
├── config.ts            # defineNicheConfig + compileNiche  ← lo único que ve el motor
├── index.ts
└── templates/           # Una por pieza. Consumen TemplateBindings, nada más
    ├── «Poster».tsx
    └── «email».ts
```

Y una línea en `niches/registry.ts` para registrarlo.

---

## 5. Cómo se conecta (el pipeline, en una frase por paso)

```
EntityInput (payload sin validar)
  → inputSchema.parse()            valida y tipa
  → toPublicInput()                ALLOWLIST: aquí se quedan fuera los campos privados
  → bindingMap                     deriva las variables que ven las plantillas
  → legalRules                     evalúa sobre el input COMPLETO (puede mirar lo privado)
  → TemplateBindings               objeto congelado que viaja al renderer
  → PieceDefinition[]              qué se genera y con qué renderer
  → RenderJob → artefactos → ZIP
```

Detalle que se olvida: las reglas legales evalúan el input **completo**, no el
público. Una regla puede necesitar un campo privado para decidir, siempre que lo
que emita (mensaje, remediación) no lo revele.

---

## 6. Reglas heredadas — NO negociables

1. **La proyección pública es por inclusión, nunca por omisión.** Nada de
   `delete input.campoPrivado`. Se listan los campos que salen, uno a uno. Un
   campo nuevo en el schema no se publica hasta que alguien lo añade a mano.
2. **Un único sitio convierte fila de BD → vista pública.** Esa función *es* la
   allowlist de privacidad. En v1 llegó a haber cuatro copias escritas a mano y
   ya habían divergido: el ZIP publicaba `photoAssetIds: []`. Ver
   `niches/inmobiliaria/persistence/public-view-mapper.ts`.
3. **Todo texto editable a mano se valida contra los campos privados.** El
   editor entra *después* de la proyección pública: es la puerta de atrás por la
   que un operador reintroduce el dato privado de un copia-pega. Ver
   `niches/inmobiliaria/validate-text-override.ts`.
4. **Sin IA para los textos.** Plantillas deterministas + lista negra. Misma
   entrada, misma salida, y ninguna frase legalmente comprometida por un mal día
   del modelo. Si el vertical necesita IA, es una decisión de producto explícita
   con su propio gate, no un atajo de implementación.
5. **`lib/engine/` no puede mencionar el vertical.** Hay un test que lo lee
   fichero a fichero y falla. Si necesitas tocar el motor, es señal de que el
   contrato se queda corto: cámbialo a propósito y documenta por qué.
6. **Tests rojos primero** en el núcleo (schema, proyección pública, reglas
   legales). Son baratos y son justo donde un error se paga caro.

---

## 7. Blueprint de implementación

Cada fase termina con un criterio comprobable por comando, no por opinión.

| # | Fase | Criterio de cierre |
|---|---|---|
| 1 | `schema.ts` + proyección pública + sus tests | Un test serializa la vista pública y **no** encuentra ningún campo de §1.1 |
| 2 | `bindings.ts` + `legal-rules.ts` + tests | Una entidad con la frase prohibida deja las piezas en `blocked` con el código correcto |
| 3 | `catalog.ts` + `config.ts` + registro | `nicheRegistry.get("«nicho»")` devuelve las piezas y `createRenderJob` planifica |
| 4 | Plantillas | Se renderizan a HTML en un test y no contienen datos privados; el email escapa el contenido y solo acepta `https:` en los enlaces |
| 5 | Persistencia y UI | *(ver §9: hoy esto obliga a tocar `lib/infrastructure/`)* |
| 6 | Auditoría | `AUDIT.md` del vertical con su sección de «lo que NO hace» |

---

## 8. Gates de validación (comandos exactos, no negociables)

```bash
npx tsc --noEmit          # 0 errores
npx vitest run            # 100% verde
npx playwright test       # 100% verde
npm run build             # exit 0
```

Y el gate de arquitectura, que es el que protege la reutilización:

```bash
# No debe devolver NADA. Si devuelve algo, el vertical ha ensuciado el motor.
rg -i "«nicho»|«entidad»" lib/engine
```

**Verde no significa funcional.** El proyecto `production` de
`playwright.config.ts` levanta un `next build && next start` real: **añade ahí
los casos de tu vertical**, no solo en el proyecto de desarrollo. Los dos bugs
más caros de v1 pasaron con toda la suite en verde porque los E2E arrancaban
`next dev` (§9, trampas 3 y 7).

Y antes de dar el vertical por hecho, mira los ficheros generados: tamaño,
dimensiones y, si hay vídeo, `ffprobe`. Un test de regresión que no te has visto
fallar tampoco cuenta — desactiva a mano lo que protege y comprueba que se pone
rojo.

---

## 9. Trampas conocidas (todas se pagaron ya una vez)

1. **`OutputContract` tiene la lista de extensiones cerrada** (`pdf|png|mp4`
   para artefactos sueltos). Un email no se declara como `single/.html`: existe
   `kind: "email"`. Si tu pieza necesita otro formato binario, hay que tocar el
   motor — decisión consciente, no parche.

2. **`lib/infrastructure/` todavía importa el vertical inmobiliario**
   (`email-renderer`, `jszip-package-builder`, `create-app`, `text-engine`
   consultan `prisma.property`). El motor está limpio; la infraestructura no.
   Hasta que se desacople, un vertical nuevo llega a **planificar** el trabajo
   pero no a producir el PNG. Es el primer trabajo a hacer si el vertical va a
   venderse, y conviene presupuestarlo antes de prometer fechas.

3. **Estado compartido entre bundles de Next: usa `globalThis`.** En un build de
   producción, una page y un route handler reciben **instancias distintas** del
   mismo módulo. Un `let secreto = randomBytes(32)` a nivel de módulo da un
   valor diferente en cada lado; el síntoma fue que las cuatro piezas visuales
   fallaban solo en producción, con los tests en verde. Patrón correcto:
   `lib/render-access/preview-token.ts` y `lib/bootstrap/create-app.ts`.

4. **Los campos `Json` de Prisma no se pasan por `JSON.stringify()`.** Hacerlo
   guarda un string doble-codificado que revienta en cada consumidor, y el bug
   aparece lejos del sitio donde se escribió.

5. **Las fotos del cliente traen EXIF con GPS.** Si se sirven sin recodificar,
   el destinatario del email extrae la ubicación. La ingesta ya lo resuelve;
   no la puentees por rendimiento.

6. **Una respuesta RSC de una ruta con `notFound()` devuelve 200**, no 404: Next
   señaliza el not-found dentro del payload para que el cliente pinte el
   boundary. Si escribes un test de control de acceso, afirma sobre el
   contenido; el status solo sirve para la petición del documento.

7. **Un test que solo cubre la parte fácil tranquiliza sin proteger.** En v1 los
   tests del control de acceso probaban la criptografía pero no la decisión, así
   que borrar el control de la página dejaba la suite verde con la ruta abierta.
   Saca la política a una función pura y cúbrela caso a caso.

8. **Un formateo no es un test.** `Intl.NumberFormat("es-ES")` no agrupa los
   millares de 4 dígitos (`2400`, no `2.400`). Comprueba la salida real antes de
   fijar la expectativa, o escribirás un test que documenta tu suposición.

---

## 10. Definición de hecho

- [ ] Los cuatro gates de §8 en verde, más el gate de arquitectura vacío.
- [ ] Un test que serializa la salida pública y no encuentra ningún campo de §1.1.
- [ ] Un test por regla legal de §1.3, incluyendo el caso que **debe** bloquear.
- [ ] Piezas generadas contra un build de producción y **abiertas con los ojos**:
      medidas correctas, sin texto cortado, con la marca del cliente.
- [ ] `AUDIT.md` del vertical, con su sección de riesgos residuales escrita antes
      de enseñárselo a nadie.
