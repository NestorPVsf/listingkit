# Contrato de diseño — InmoContent OS

## Dos capas de diseño (no confundir)
1. **UI de la app** (dashboard, formulario, preview, config): usa SIEMPRE el preset `editorial-crema` de `niches/inmobiliaria/brand-presets.json` como sistema propio. Es la cara del producto ante la inmobiliaria.
2. **Piezas generadas** (PDF, posts, story, email, vídeo): usan la marca ACTIVA de la agencia (BrandConfig resuelto: preset + overrides). La UI de la app nunca impone su estética a las piezas.

## Dirección de la UI de la app
- Editorial, limpio, moderno. Fondo crema, texto negro, primario naranja, secundario verde (hex exactos: ver preset `editorial-crema` en brand-presets.json — fuente única de verdad, no duplicar valores aquí).
- Jerarquía por tamaño y peso tipográfico, no por cajas/bordes. Generosidad de blanco.
- Tipografías: las del preset (Google Fonts, latin-extended). No introducir fuentes nuevas.

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
