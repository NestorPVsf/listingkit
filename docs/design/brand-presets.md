# Brand presets — nicho inmobiliaria

Justificación de las decisiones visuales para `niches/inmobiliaria/brand-presets.json`
(Paso 3.1 del plan). Ningún componente ni CSS vive aquí: esto es la razón de ser de
cada token, no su implementación.

## Metodología de contraste

Todos los ratios se calcularon con la fórmula WCAG 2.x de luminancia relativa:

```
linearizar(c) = c/12.92                          si c <= 0.03928
              = ((c+0.055)/1.055)^2.4             si c > 0.03928
L = 0.2126*R + 0.7152*G + 0.0722*B   (canales linearizados, 0-1)
contraste = (L_claro + 0.05) / (L_oscuro + 0.05)
```

Se verificó numéricamente **texto sobre background** y **onPrimary sobre primary**
en los 4 estilos (mínimo exigido AA = 4.5:1 para texto normal). El color `primary`
se trató también como texto/enlace sobre `background` porque en piezas reales
(precio, CTA, headers) se usa como color de texto, no solo de relleno.

## Default — Editorial cálido (`editorial-crema`)

Fijado por spec: fondo crema, texto negro, naranja principal, verde secundario,
editorial limpio y moderno. Las decisiones fueron elegir los HEX exactos:

- **Background `#FAF7F0`**: crema cálido (no blanco puro) — evita el aspecto
  "documento Word" y da calidez sin caer en beige apagado.
- **Text `#1A1815`**: negro cálido, no `#000000` — el negro puro sobre crema
  produce vibración óptica (fenómeno de halation); un negro con matiz cálido
  descansa la lectura en párrafos largos (descripciones de propiedad).
- **Primary `#C1440E`** (terracota/naranja quemado): se descartó un naranja
  saturado tipo `#FF6600` porque falla AA sobre crema (ratio ~2.9:1). `#C1440E`
  da **4.78:1** sobre `#FAF7F0` — pasa AA como texto/enlace, no solo como
  relleno de botón.
- **onPrimary `#FFFFFF`** sobre primary: **5.12:1** — el texto de los CTA es
  legible sin necesidad de negro sobre naranja (que además desentonaría con el
  resto de la paleta).
- **Secondary `#2F5D3A`** (verde bosque): **7.15:1** sobre fondo — funciona
  incluso como texto de apoyo (iconos + etiqueta de amenities), no solo como
  chip decorativo.
- **Tipografía**: `Fraunces` (display, 600/700) es una serif variable con
  personalidad editorial contemporánea sin caer en "serif de lujo clásico" —
  encaja con "moderno" del spec. `Inter` (body) es el estándar de legibilidad
  en pantalla y PDF, con excelente soporte de números tabulares (precios,
  m², habitaciones) y cobertura latin-extended completa (nombres con ñ, acentos).
  Ambas son Google Fonts.

## Urbana moderna (`urbana-moderna`)

Personalidad: contemporáneo, geométrico, alto contraste. Se buscó el efecto
"señalética urbana / editorial de revista de arquitectura", no un theme
genérico de SaaS.

- **Background `#FFFFFF` / text `#101113`**: **18.9:1**, el contraste más alto
  de los 4 presets — coherente con "alto contraste" del brief.
- **Primary `#1D3FD1`** (cobalt): **7.83:1** sobre blanco tanto como texto
  como onPrimary invertido — un azul saturado pero no eléctrico, con peso
  visual geométrico (evita el azul "startup" tipo `#3B82F6` por ser demasiado
  genérico/IA).
- **Secondary `#C41E5D`** (magenta contenido): **5.69:1** sobre blanco — actúa
  como contra-acento puntual (nunca junto al azul en el mismo plano, ver notas
  de uso), evitando el efecto "circo" de combinar dos colores saturados a la vez.
- **Tipografía**: `Space Grotesk` (display) tiene formas geométricas explícitas
  (la "o" y la "e" cuadradas) — es la elección más directa para "geométrico".
  `Inter` se repite como body por consistencia de legibilidad entre presets
  (mismo body font que el default reduce fricción de implementación sin
  sacrificar identidad, ya que el display sí cambia radicalmente).
- **Radios pequeños** (2/4/8px): geometría dura, sin blandura — evita cualquier
  lectura "glass" o "app friendly" que no encaja con la marca urbana.

## Lujo (`lujo`)

Personalidad: sobrio, oscuro, dorado/bronce **contenido** (no dorado brillante
tipo casino), serif elegante. Se eligió la variante oscura (de las dos que
permitía el brief, oscuro o marfil) porque diferencia más al preset frente al
default (que ya cubre el registro claro/cálido) y es el código visual más
reconocible en el sector inmobiliario premium.

- **Background `#14120F` / text `#EDE6D9`**: **15.06:1** — negro cálido tipo
  "espresso", no negro frío `#000000`, para que el bronce no vibre contra un
  negro azulado.
- **Primary `#B08D57`** (bronce mate): se descartó un dorado brillante tipo
  `#FFD700` porque (a) sobre fondo oscuro un dorado saturado vibra y resulta
  "casino/IA genérica", y (b) un `#FFD700` puro da contraste altísimo pero lee
  como plástico. `#B08D57` da **6.04:1** sobre el fondo oscuro — suficiente
  para texto/label sin perder la sobriedad pedida ("contenido").
- **onPrimary `#14120F`** sobre primary: mismo ratio **6.04:1** (relación
  simétrica al ser los mismos dos colores) — el texto sobre un botón bronce
  debe ser oscuro, no blanco, porque el bronce es un tono medio-claro.
- **Secondary `#6E2438`** (burdeos): deliberadamente **no** se usa como texto
  sobre el fondo oscuro (ratio real 1.76:1, insuficiente) — ver nota de uso:
  solo bordes, sellos o iconos, nunca párrafos ni CTA. Esto está documentado
  explícitamente en `notasDeUso.email` del JSON para que `frontend` no lo use
  mal por accidente.
- **Tipografía**: `Playfair Display` (serif clásica con alto contraste de trazo)
  se restringe a tamaños grandes (>=28px) — a tamaño de cuerpo un serif de alto
  contraste pierde legibilidad, especialmente en PDF impreso o pantallas
  pequeñas de story. `Work Sans` como body crea el contraste serif/sans que
  es la firma tipográfica del segmento lujo (títulos con carácter, datos con
  claridad).
- **Radios casi nulos** (0/2/4px): la ausencia de redondeo es una señal de
  sobriedad — el redondeo generoso se asocia a "amigable/consumer app", lo
  opuesto al registro que pide el brief.

## Cercana y familiar (`cercana-familiar`)

Personalidad: cálido, redondeado, accesible.

- **Background `#FEF6EC` / text `#2B211A`**: **14.68:1** — marfil rosado,
  deliberadamente distinto del crema del default (`#FAF7F0`) para que ambos
  estilos convivan en el selector de onboarding sin confundirse a simple vista.
- **Primary `#B84826`** (terracota profundo): se probaron dos coral más claros
  (`#E8734F`, ratio 2.80:1, y `#C24E2B`, ratio 4.44:1) y ambos fallaron o
  quedaron al límite del umbral AA sobre el fondo marfil rosado — se oscureció
  hasta `#B84826` (**4.91:1**) manteniendo la temperatura cálida/coral que pide
  "cercano" sin sacrificar accesibilidad. Es la decisión más reñida de los 4
  presets: cualquier ajuste posterior de este tono debe re-verificar el ratio.
- **onPrimary `#FFFFFF`** sobre primary: **5.26:1**.
- **Secondary `#357064`** (verde-azulado suave): **5.37:1** sobre fondo — se
  oscureció desde un teal más claro (`#3E8074`, 4.32:1, insuficiente) para
  quedar cómodamente por encima del umbral incluso en usos de icono/texto
  pequeño.
- **Tipografía**: `Fredoka` (display) tiene terminales redondeados explícitos
  — es la traducción tipográfica directa de "redondeado" del brief. `Nunito
  Sans` (body) comparte esa misma familia de terminales suaves, dando
  coherencia entre titular y cuerpo (a diferencia de Lujo, aquí el contraste
  serif/sans sería contradictorio con "cercano").
- **Radios generosos** (12/20/28px): el radio más alto de los 4 presets,
  coherente con "redondeado" y con la sensación de accesibilidad/confianza
  que buscan agencias familiares frente a inversores institucionales.

## Cómo se pensó la relación con Postiguet Homes (agencia demo)

El perfil de `docs/research/inmobiliaria-x.md` sugiere una paleta propia
(azul mediterráneo + arena + coral) que **no coincide exactamente** con
ninguno de los 4 presets — es intencional: Postiguet Homes es el caso de uso
que demuestra que una agencia real puede necesitar salirse de los 4 presets
de fábrica. Aun así, su personalidad de marca ("cercano pero profesional,
cero superlativos vacíos", datos concretos primero) encaja mejor con el
**tono** de `cercana-familiar` que con `lujo` o `urbana-moderna` — si
Postiguet Homes usa un preset de fábrica en vez de su paleta custom en el
onboarding, `cercana-familiar` es la recomendación por comportamiento de
marca, no por color literal.

## Fuera de alcance de este documento

No se han escrito componentes React, clases Tailwind ni CSS. Los 4 objetos
del JSON son la fuente de verdad de tokens; su consumo por `BrandBindings`
(definido en `docs/architecture/niche-engine.md`) y por las plantillas TSX/HTML
de cada pieza es responsabilidad de `frontend` en una fase posterior.
