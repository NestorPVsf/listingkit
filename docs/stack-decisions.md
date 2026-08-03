# Stack Decisions — InmoContent OS

> Generado en Fase 1 (pasos 1.1/1.2 del PLAN.md). Solo documentación — ninguna dependencia listada aquí está instalada todavía (se instalan en fases posteriores).

## Entorno verificado

| Item | Valor | Estado |
|---|---|---|
| Node | v24.11.1 | OK — cumple el mínimo de Next 16 (`^18.18 \|\| >=20`) y de Prisma 7 (`^20.19 \|\| ^22.12 \|\| >=24.0`) |
| npm | 11.6.2 | OK |
| OS | Windows 11 nativo | El desarrollo se mantiene 100% Windows-native, sin WSL: los binarios nativos son por plataforma y el arbol de `node_modules` se rompe al alternar |
| FFmpeg | **Instalado** — `ffmpeg version 8.0.1-full_build` (Gyan.FFmpeg via winget) | OK. Dos instalaciones detectadas vía winget (`Gyan.FFmpeg` y `yt-dlp.FFmpeg`), ambas en PATH. No requiere acción. |

## Scaffold creado

- Next.js **16.2.12**, React **19.2.4**, TypeScript **5.9.3** (rango `^5` — Next 16 aún no soporta TS 7.x, ver nota abajo), Tailwind **4.x**, ESLint **9.x** con `eslint-config-next`.
- App Router, sin `src/`, alias `@/*`, `npm run dev` verificado con `HTTP 200` en `http://localhost:3000` (Ready en 637ms) y proceso detenido tras la prueba.
- Nota: el flag `--no-turbopack` no impidió que Next 16 use Turbopack por defecto en `next dev` (comportamiento nuevo de la CLI en esta major) — no causó ningún problema en el arranque, así que se deja como está. Si en fases posteriores aparece algún problema de compatibilidad Windows-specific con Turbopack, revisar `next.config.ts`.

## Dependencias planificadas — versión estable actual (npm view, 2026-07-29)

| Paquete | Versión actual | Compatibilidad con Next 16 / Node 24 | Notas |
|---|---|---|---|
| `prisma` + `@prisma/client` | 7.9.1 | OK — engines exige `^20.19 \|\| ^22.12 \|\| >=24.0`, Node 24 cumple | SQLite como datasource sigue soportado en Prisma 7 |
| `zod` | 4.4.3 | OK | Zod 4 tiene cambios de API respecto a v3 (import paths, `.parse` performance) — usar la doc v4 al implementar, no asumir sintaxis v3 |
| `sharp` | 0.35.3 | OK | Binarios prebuilt para Windows x64 — sin toolchain nativo necesario. Instalar SIEMPRE desde el mismo sistema en el que se ejecuta: nunca reusar un `node_modules` generado en otra plataforma |
| `playwright` / `@playwright/test` | 1.62.0 | OK | Usar para render y verificación real del PDF (abrirlo y mirarlo, no solo comprobar que el build pasa) y para la ruta de preview |
| `jszip` | 3.10.1 | OK | Sin cambios relevantes, estable desde hace años, mantenido |
| `vitest` | 4.1.10 | OK | Compatible con Vite 6/7 subyacente; verificar en fase de testing que no colisiona con la config de Next |
| `react-hook-form` | 7.83.0 | OK | Compatible con React 19 |
| Librería QR ligera | `qrcode` 1.5.4 (recomendada) vs `qr-code-styling` 1.9.2 | OK ambas | `qrcode` es la opción más ligera (sin dependencias, genera PNG/SVG/datauri, última publicación 2025-11-13 — mantenida activamente). `qr-code-styling` añade personalización visual (esquinas, logos) pero pesa más y no hace falta para un QR funcional simple. **Recomendación: `qrcode`** salvo que el diseño de la ficha exija QR con estilo custom. |

## FFmpeg vía child_process — decisión sobre `fluent-ffmpeg`

- `fluent-ffmpeg` (última versión 2.1.3, último publish **2025-05-22**) está efectivamente **sin mantenimiento activo** — el repo lleva años sin cambios sustanciales y es un wrapper fino sobre `child_process.spawn` que no aporta nada que no se pueda hacer directo.
- **Decisión (confirma la nota del PLAN.md)**: NO usar `fluent-ffmpeg`. Invocar FFmpeg directo vía `child_process.spawn`, resolviendo el binario con `where.exe ffmpeg` (o ruta absoluta) resolviendo el binario antes de invocarlo — evita el `EINVAL` de shims `.cmd` en Windows y evita añadir una dependencia para lo que es una llamada de proceso con argumentos de array.
- Ponytail: una función `runFfmpeg(args: string[])` de ~15 líneas sobre `child_process.spawn` cubre encode/thumbnail/concat sin dependencia extra.

## TypeScript — nota sobre major 7.x

- `npm view typescript version` devuelve **7.0.2** como última versión publicada, pero `create-next-app` fijó `^5` (TS 5.9.3 instalado) porque Next 16 y `eslint-config-next`/`typescript-eslint` en su versión actual (8.65.0) aún no soportan la major 7. **No forzar TS 7** hasta que el ecosistema Next/ESLint lo confirme soportado — quedarse en `^5` es la elección correcta, no una omisión.

## Pendiente-entorno

Ninguno — FFmpeg y Node ya cumplen. No se requiere instalación adicional en esta máquina para arrancar Fase 2.

## Headers de seguridad y CSP — decisión (Fase 6, paso 6.4)

- `next.config.ts` aplica a todas las rutas: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`.
- **SAMEORIGIN y no `DENY`**: el visor de PDF embebe el preview en un `<iframe>` same-origin; `DENY` lo habría roto.
- **Sin `Content-Security-Policy`**: se evaluó y se descarta por ahora. Motivo: `app/preview/[pieceId]/page.tsx` (layout propio, `app/preview/layout.tsx`) carga fuentes de Google vía `<link>` dinámico por marca (`googleFontsHref` en `templates/brand-adapter.ts`) y cada plantilla trae estilos inline — una CSP estricta (`script-src`/`style-src` sin `unsafe-inline` o sin el host de Google Fonts en la allowlist) rompería el render de `lib/infrastructure/render/playwright-renderer.ts` (que navega same-origin a `/preview/[pieceId]` con Playwright headless) sin aviso salvo que se audite plantilla por plantilla. Además, Next dev/Turbopack inyecta scripts inline propios en modo desarrollo.
- **Revisar en el futuro**: si se fija el catálogo de plantillas y fuentes (ya no cambia por marca), definir una CSP con `style-src 'self' fonts.googleapis.com 'unsafe-inline'; font-src fonts.gstatic.com; script-src 'self'` y probarla primero en modo `Content-Security-Policy-Report-Only` contra el propio `render-images.spec.ts`/`render-pdf.spec.ts` antes de forzarla.
