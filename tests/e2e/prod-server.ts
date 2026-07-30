/**
 * Datos compartidos entre `playwright.config.ts` (que arranca el servidor de
 * produccion) y el spec que lo interroga.
 *
 * El secreto se fija a proposito: sin el, el servidor generaria uno aleatorio
 * en su `globalThis` y el proceso de test no podria acuñar un token valido, asi
 * que el caso "con token correcto -> 200" quedaria sin probar y solo sabriamos
 * decir que la ruta esta cerrada, no que sigue funcionando. Ademas ejercita la
 * ruta de `RENDER_PREVIEW_SECRET`, que es la que hace falta con varias replicas.
 */
export const PROD_PORT = 3100;
export const PROD_BASE_URL = `http://localhost:${PROD_PORT}`;

/** 40 caracteres: por encima del minimo de 32 que exige el modulo del token. */
export const PROD_PREVIEW_SECRET = "e2e-prod-secret-no-usar-en-produccion-01";

/**
 * Candado de operador para el servidor de pruebas de produccion. El hash se
 * calcula al vuelo (no se versiona un hash fijo) y viaja a `webServer.env`.
 */
export const PROD_OPERATOR_PASSWORD = "contrasena-de-prueba-del-e2e";
