import path from "node:path";
import { defineConfig } from "vitest/config";
import { UNIT_DATABASE_URL } from "./tests/setup/unit-db";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/security/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    // Varios tests hablan con SQLite de verdad a proposito (lease de render,
    // control de version, persistencia del wizard). Su base es SUYA: hasta el
    // 2026-07-31 escribian en `prisma/dev.db` y llegaron a borrar la marca de
    // la demo del usuario. Ver tests/setup/unit-db.ts.
    globalSetup: ["./tests/setup/unit-db.ts"],
    // Y su propio `uploads/`: hasta el 2026-08-03 los tests escribian fotos y
    // audios en el directorio del usuario. Dos ficheros de test llegaron a
    // pisarse entre si ahi dentro.
    env: { DATABASE_URL: UNIT_DATABASE_URL, UPLOADS_DIR: "uploads-test-unit" },
  },
});
