import { defineConfig, devices } from "@playwright/test";

/**
 * Config E2E — Fase 4.1 del PLAN.md. Los specs bajo tests/e2e/ ejercitan el
 * motor de render (imágenes + PDF) contra un endpoint del engine que AÚN NO
 * EXISTE (TDD): ver contrato documentado en cabecera de cada spec.
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
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
