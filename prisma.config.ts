import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { defineConfig } from "@prisma/config";

// Prisma 7: la url de conexion ya no vive en schema.prisma (datasource.url),
// vive aqui + adapter. Ver docs/stack-decisions.md (Prisma 7.9.1, SQLite).
// Prisma ya no carga .env automaticamente -> "dotenv/config" lo hace explicito.
const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

// `engine`/`adapter` son opciones reales en runtime (ver docs Prisma 7 driver
// adapters) pero @prisma/config@7.9.1 aun no las declara en su tipo publico.
// Se construyen en una variable intermedia para evitar el excess-property
// check de TS sobre el objeto literal, sin recurrir a `any`.
const config = {
  schema: "prisma/schema.prisma",
  engine: "js",
  datasource: {
    url: databaseUrl,
  },
  async adapter() {
    return new PrismaBetterSqlite3({ url: databaseUrl });
  },
};

export default defineConfig(config);
