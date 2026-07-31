/**
 * Base de datos de los tests unitarios — separada de `prisma/dev.db`.
 *
 * Segunda mitad del mismo problema que ya se arreglo en Playwright: varios
 * unitarios hablan con SQLite de verdad a proposito (el lease de render, el
 * control de version, la persistencia del wizard), y lo hacian contra la base
 * que el usuario abre en el navegador.
 *
 * Dejo de ser un detalle el 2026-07-31: desde que `persistBrand` respeta "una
 * instalacion = una marca" y ACTUALIZA la existente en vez de crear otra,
 * `onboarding-brand-persist.test.ts` empezo a sobrescribir la marca de la demo
 * y a **borrarla** en su limpieza, porque el id que recogia para limpiar era el
 * de la marca buena. Es decir: pasar los tests destruia los datos del usuario.
 *
 * El test no estaba mal escrito: da por hecho que su base es suya, que es lo
 * normal. Lo que faltaba era darsela.
 */
import { execSync } from "node:child_process";

export const UNIT_DATABASE_URL = "file:./prisma/test-unit.db";

export default function setup(): void {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: UNIT_DATABASE_URL },
  });
}
