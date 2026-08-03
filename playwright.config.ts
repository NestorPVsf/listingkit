import { defineConfig, devices } from "@playwright/test";
import { hashPassword } from "./lib/auth/operator-session";
import {
  PROD_BASE_URL,
  PROD_OPERATOR_PASSWORD,
  PROD_PORT,
  PROD_PREVIEW_SECRET,
} from "./tests/e2e/prod-server";
import {
  E2E_DEV_BASE_URL,
  E2E_DEV_DATABASE_URL,
  E2E_DEV_PORT,
  E2E_PROD_DATABASE_URL,
} from "./tests/e2e/test-db";

/**
 * El proceso de test tambien habla con Prisma (`brand-logo.spec.ts` crea el
 * Brand directamente), asi que apuntarlo a la base de pruebas ANTES de que se
 * cargue `lib/prisma.ts` es parte de la separacion, no un detalle.
 */
process.env.DATABASE_URL = E2E_DEV_DATABASE_URL;

/**
 * Config E2E. Dos proyectos, porque hay dos cosas distintas que comprobar:
 *
 * - `chromium`: el producto contra `next dev`. Flujo de usuario y render real
 *   de las seis piezas.
 * - `production`: un build de produccion de verdad (`next build && next start`).
 *   Existe porque la review cross-model del control de acceso puso el dedo en
 *   la llaga: los tests solo probaban criptografia, asi que borrar el control
 *   de la ruta de render dejaba la suite entera en verde con la ruta abierta.
 *   Y porque el bug de F-14 —la generacion visual fallaba SOLO en produccion—
 *   paso las dos suites sin despeinarse.
 *
 * Los dos corren por defecto: un test que hay que acordarse de lanzar no
 * protege de nada.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Renders pesados (PDF+imagenes+video) compiten por CPU: >2 workers provoca timeouts espurios
  workers: process.env.CI ? 1 : 2,
  timeout: 90_000,
  reporter: [["html", { open: "never", outputFolder: "tests/__screenshots__/report" }]],
  outputDir: "tests/__screenshots__/artifacts",
  use: {
    baseURL: E2E_DEV_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /prod-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "production",
      testMatch: /prod-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: PROD_BASE_URL },
      // Los dos proyectos generan piezas de verdad (Chromium + FFmpeg). Corrian
      // a la vez y se peleaban por la CPU: un render se pasaba de su techo y un
      // test caia sin que nada estuviera roto — dos falsos rojos en dos tandas,
      // los dos en el mismo test, los dos verdes al repetirlos en aislamiento.
      // Un test que grita "lobo" es peor que uno lento: se acaba ignorando el
      // dia que el lobo viene. Se serializan los proyectos; dentro de cada uno
      // sigue habiendo paralelismo.
      dependencies: ["chromium"],
    },
  ],
  webServer: [
    {
      // Puerto y base propios: `reuseExistingServer` habria enganchado el
      // servidor de desarrollo que el usuario tiene abierto —con SU base—, que
      // es justo lo que esto viene a evitar.
      command: `npx prisma migrate deploy && npx next dev -p ${E2E_DEV_PORT}`,
      url: E2E_DEV_BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: E2E_DEV_DATABASE_URL,
        // Sin esto el renderer navegaria a su puerto por defecto (3000) para
        // capturar las piezas: o no hay nada escuchando, o —peor— esta el
        // servidor del usuario y las capturas saldrian de SU base de datos.
        RENDER_BASE_URL: E2E_DEV_BASE_URL,
      },
    },
    {
      // Build fresco siempre: reutilizar un servidor de produccion que quedo
      // vivo de otra tanda daria un falso verde con codigo antiguo o con otro
      // secreto.
      command: `npx prisma migrate deploy && npm run build && npx next start -p ${PROD_PORT}`,
      url: PROD_BASE_URL,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        NODE_ENV: "production",
        RENDER_BASE_URL: PROD_BASE_URL,
        RENDER_PREVIEW_SECRET: PROD_PREVIEW_SECRET,
        // El candado de operador se prueba encendido: en produccion es
        // obligatorio, y sin el la app responde 503 a todo.
        APP_PASSWORD_HASH: hashPassword(PROD_OPERATOR_PASSWORD),
        DATABASE_URL: E2E_PROD_DATABASE_URL,
      },
    },
  ],
});
