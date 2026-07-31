# Contrato de diseño — InmoContent OS

## Dos capas de diseño (no confundir)
1. **Chasis de la app** (dashboard, formulario, config): paleta NEUTRA propia, definida en `app/globals.css`. NO es la de ningún preset de marca.
2. **Piezas generadas** (PDF, posts, story, email, vídeo): usan la marca de la agencia (BrandConfig resuelto: preset + overrides), con sus propios tokens `--piece-*`. El chasis nunca impone su estética a las piezas, ni al revés.

> **Cambio 2026-07-31.** El chasis usaba el preset `editorial-crema` (fondo crema #faf7f0). Se desacopla por dos razones. La estética: arrastraba la interfaz hacia lo editorial —"tipo revista"— cuando esto es una herramienta, y apagaba el naranja (acento cálido sobre fondo cálido no acenta). Y la de fondo, que es la que manda: **la app no debe vestir la paleta de ninguna marca**, porque el día que una agencia sea turquesa o azul marino su panel no pegaría con nada suyo. `editorial-crema` sigue intacto como preset de marca.

## Dirección del chasis
- Neutro, limpio, herramienta. Fondo gris muy claro, superficies blancas, texto casi negro (hex exactos en `app/globals.css` — fuente única de verdad).
- **El color lo ponen las fotos de las propiedades.** El acento (naranja) se reserva para la acción principal; no se reparte por la interfaz.
- Jerarquía por tamaño y peso tipográfico. Generosidad de blanco.
- Tipografías: Fraunces (display) + Inter (interfaz). No introducir fuentes nuevas.

## Prohibiciones (anti-generic-AI)
- Nada de gradientes genéricos, glassmorphism, sombras moradas, emoji decorativo.
- Máx 2 acentos + neutros por vista.
- Contraste AA mínimo verificado (usar `meetsContrastAA` cuando exista).

## Criterio para nuevas decisiones visuales
- ¿Está en brand-presets.json o en docs/design/brand-presets.md? → seguirlo.
- ¿No está? → decidir con el principio editorial (menos es más) y documentar en docs/design/.
- Cambios de token: solo vía designer + actualización del JSON, nunca hardcodeados en componentes.

## Referencias
- Tokens: `niches/inmobiliaria/brand-presets.json`
- Justificación y ratios AA: `docs/design/brand-presets.md`
- Marca demo recomendada para Postiguet Homes: preset `cercana-familiar`
