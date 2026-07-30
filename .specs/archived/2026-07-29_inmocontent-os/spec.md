# Spec — InmoContent OS v1

## Resumen
Aplicación web interna para inmobiliarias. El agente introduce UNA vez los datos y fotografías de una propiedad y el sistema genera automáticamente 6 piezas de contenido listas para revisar, editar y descargar (individual o en ZIP). No publica en redes ni portales en v1: entrega "contenido listo para revisar y publicar".

## Motivación
Una agencia media (caso investigado: flujo AS-IS de "Postiguet Homes", ficticia — ver `docs/research/inmobiliaria-x.md`) invierte ~2h-2h30 por propiedad y teclea los mismos datos 3-4 veces entre Idealista, Fotocasa, Canva, email e Instagram. El sistema elimina la duplicación: un dato → seis piezas coherentes con la marca.

## Las 6 piezas
1. **Ficha técnica PDF** A4: logo, foto principal, nombre, precio, ubicación pública, características, descripción, galería, datos del agente, QR a la URL de la propiedad, aviso "verificar antes de publicar".
2. **Post Instagram** PNG 1080×1350: foto principal, tipo, zona, precio, 3 características, logo, CTA. Márgenes seguros, legible en móvil.
3. **Carrusel** 5 PNGs 1080×1350: (1) foto+titular+ubicación+precio, (2) hab/baños/m²/características, (3) galería 2-3 fotos, (4) estilo de vida/beneficios reales, (5) contacto+CTA.
4. **Story** PNG 1080×1920: foto vertical/recortada, tipo, precio, zona, 3 datos, CTA, zona segura para UI de Instagram.
5. **Email HTML** responsive ≤600px, estilos inline, compatible con clientes principales + versión texto plano. Asunto, preheader, foto, titular, precio, características, descripción, botón, firma del agente.
6. **Vídeo vertical MP4** 1080×1920, 20-35s: hook (tipo+zona+precio) → secuencia de fotos con Ken Burns → características → diferencial → CTA → cierre con logo. Música subida por el usuario (nunca de fuentes sin licencia), volúmenes independientes música/voz, locución vía `TTSProvider`.

## Entidades
- **Property** (~35 campos): nombre interno, operación (venta|alquiler), tipo de propiedad, precio+moneda, ciudad, zona/barrio, dirección pública (opcional), **dirección privada interna**, superficie construida y útil, habitaciones, baños, planta, booleanos (ascensor, terraza, balcón, garaje, trastero, piscina, jardín), estado, año construcción, certificado energético, descripción, 5 destacados, CTA, URL, agente (nombre, teléfono, email), inmobiliaria, 3-20 fotos.
- **Brand**: nombre, logo, color principal/secundario/fondo, tipografía titulares/texto, web, teléfono, email, IG, CTA habitual. Default: fondo crema, texto negro, primario naranja, secundario verde, editorial limpio. 3 presets: urbana moderna / lujo / cercana familiar.
- **GeneratedPiece**: pieza generada (tipo, path, propiedad, versión, texto editable).
- **RenderJob**: estado de generación (pending | rendering | done | error{causa, solución, retry}).
- **PublicPropertyView**: proyección de Property SIN dirección privada ni campos internos. Es el ÚNICO tipo que las plantillas de piezas públicas pueden recibir.

## Reglas de negocio (duras)
1. **La dirección privada JAMÁS aparece en ninguna pieza pública, en el ZIP, ni en `datos-propiedad.json`.** Enforced por tipos (PublicPropertyView) + tests de fuzzing + review adversarial.
2. Todo dato comercial procede del formulario. El sistema NO inventa datos; si una característica no existe, no se menciona.
3. Motor de textos por plantillas locales SIN API de IA. Frases prohibidas salvo input explícito y justificado del usuario: "oportunidad única", "la mejor propiedad", "inversión garantizada", "rentabilidad asegurada", "última oportunidad". Proveedor IA externo opcional vía key server-only, off por defecto.
4. Si no hay proveedor TTS configurado, se informa claramente — nunca se simula que el vídeo lleva voz.
5. Publicación automática en redes/portales: fuera de alcance v1. Arquitectura preparada (interfaz Publisher), flag desactivado hasta credenciales válidas.
6. Precio positivo; ≥1 fotografía; formatos JPG/PNG/WebP; límite de tamaño por archivo (10MB); nombres de archivo sanitizados; confirmación antes de eliminar propiedad; autoguardado de borrador del formulario.

## Escenarios (si X entonces Y)
- Si el agente completa el formulario válido → se crea Property + RenderJob y se generan las 6 piezas con estados visibles.
- Si falta el certificado energético → advertencia legal visible (obligatorio en anuncios en España desde 2013), no bloqueo.
- Si hay <5 fotos → el carrusel y el vídeo adaptan su composición (menos slides de galería, más duración por foto); nunca se rompe.
- Si la operación es alquiler → el precio se etiqueta €/mes; validación cruzada de campos.
- Si la ciudad no tiene zona/barrio → las plantillas omiten la línea, sin huecos visibles.
- Si el usuario edita el texto de una pieza en preview → puede regenerar SOLO esa pieza sin tocar las demás.
- Si FFmpeg no está instalado → error claro con causa, cómo instalarlo y botón reintentar; el resto de piezas se generan igual.
- Si falla el render de una pieza → RenderJob=error con causa+solución+retry; las demás piezas no se pierden.

## Casos raros
Sin TTS provider (modo sin voz) · foto principal eliminada tras generar (re-elegir obligado) · caracteres especiales/emoji en descripción (escapado en HTML/PDF/overlays de vídeo) · nombres de archivo con `../`, unicode, null bytes (sanitización) · dos generaciones concurrentes de la misma propiedad (lock por RenderJob).

## Accesibilidad
Labels asociados, navegación por teclado, contraste suficiente, alt texts, focus states, errores anunciados accesiblemente.

## Arquitectura estratégica
El motor es **genérico por nicho**: `NicheConfig` define schema de entrada, mapeo campos→variables de plantilla y catálogo de piezas. "Inmobiliaria" es la primera instancia; el core (entrada → plantillas → render → paquete) no conoce el vertical. Contrato: `EntityInput → TemplateBindings → RenderJob → Package`. Detalle: `docs/architecture/niche-engine.md`.

## Fuera de alcance v1
Publicación directa a redes · multi-tenant/auth multi-agencia · IA de texto activada por defecto · traducción automática y checklist legal ampliado (candidatas v1.1, ver `docs/research/oportunidades-producto.md`) · segunda vertical completa (solo PoC).

## Criterios de finalización
App arranca localmente · formulario funciona · datos persisten · previews visibles · 6 piezas se generan · ZIP descargable · tests verdes (unit+E2E+security) · build sin errores · README con comandos exactos · lista clara de limitaciones.
