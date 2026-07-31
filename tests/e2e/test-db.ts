/**
 * Bases de datos de la suite E2E — separadas de `prisma/dev.db`.
 *
 * Hasta ahora los tests escribian en la MISMA base que el usuario abre en el
 * navegador. Dos consecuencias, y la segunda apareció el 2026-07-31:
 *
 * 1. Cada tanda dejaba propiedades "demo E2E" dentro. Se acumularon 326, con
 *    1,2 GB de artefactos, hasta volver el panel inservible.
 * 2. Desde que el onboarding respeta "una instalacion = una marca" (actualiza
 *    la que hay en vez de crear otra), el onboarding de los tests dejo de
 *    ensuciar y paso a **sobrescribir la marca de la demo**. De ruido a
 *    perdida de datos.
 *
 * Son DOS ficheros y no uno para que los dos servidores no migren a la vez
 * sobre el mismo SQLite: cada `webServer` prepara el suyo y no hay carrera.
 * El proceso de Playwright apunta al de desarrollo porque es el unico que
 * habla con Prisma directamente (`brand-logo.spec.ts`); los specs de
 * produccion van por HTTP.
 */
export const E2E_DEV_PORT = 3001;
export const E2E_DEV_BASE_URL = `http://localhost:${E2E_DEV_PORT}`;

/** Rutas relativas: Prisma las resuelve desde la raiz del proyecto. */
export const E2E_DEV_DATABASE_URL = "file:./prisma/test-dev.db";
export const E2E_PROD_DATABASE_URL = "file:./prisma/test-prod.db";
