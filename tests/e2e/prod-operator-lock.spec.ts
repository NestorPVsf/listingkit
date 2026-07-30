/**
 * El candado de operador, contra un build de produccion real.
 *
 * Cierra el bloqueante que quedaba en AUDIT.md §6.1: "cualquiera con acceso a
 * la red del proceso opera la app entera". Aqui se comprueban las tres cosas
 * que hacen que eso deje de ser cierto: que sin sesion no se entra, que las
 * excepciones son EXACTAMENTE las previstas, y que con la contraseña correcta
 * se trabaja con normalidad.
 *
 * Las excepciones importan tanto como el candado: cada una es una puerta, y una
 * de mas (o de menos) rompe la generacion de piezas — que es como nos costo una
 * tarde el bug F-14.
 */
import { expect, test } from "@playwright/test";
import { PROD_OPERATOR_PASSWORD } from "./prod-server";

const RUTAS_PROTEGIDAS = ["/dashboard", "/properties/new", "/settings/brand"];
const APIS_PROTEGIDAS = ["/api/properties", "/api/render-jobs/no-existe"];

test.describe("Candado de operador en produccion", () => {
  test("sin sesion, las paginas redirigen al login", async ({ request }) => {
    for (const ruta of RUTAS_PROTEGIDAS) {
      const response = await request.get(ruta, { maxRedirects: 0 });
      expect(response.status(), `${ruta} deberia redirigir`).toBe(307);
      expect(response.headers()["location"]).toContain("/login");
    }
  });

  test("sin sesion, las APIs contestan 401 y no HTML del login", async ({
    request,
  }) => {
    for (const api of APIS_PROTEGIDAS) {
      const response = await request.get(api, { maxRedirects: 0 });
      expect(response.status(), `${api} deberia dar 401`).toBe(401);
      // Un fetch que recibe el HTML del login e intenta parsearlo como JSON da
      // un error incomprensible: por eso las APIs no redirigen.
      expect(await response.json()).toEqual({ error: "AUTH_REQUIRED" });
    }
  });

  test("la contraseña incorrecta no abre sesion ni distingue el motivo", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/session", {
      data: { password: "la que no es" },
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ ok: false });
    // Y despues sigue sin entrar.
    const dashboard = await request.get("/dashboard", { maxRedirects: 0 });
    expect(dashboard.status()).toBe(307);
  });

  test("cuerpo vacio, sin password o ilegible tampoco abren sesion", async ({
    request,
  }) => {
    for (const data of [{}, { password: "" }, { password: 42 }, "no-json"]) {
      const response = await request.post("/api/auth/session", { data });
      expect(response.status(), `${JSON.stringify(data)} no deberia entrar`).toBe(401);
    }
  });

  test("con la contraseña correcta se entra y se trabaja con normalidad", async ({
    request,
  }) => {
    const login = await request.post("/api/auth/session", {
      data: { password: PROD_OPERATOR_PASSWORD },
    });
    expect(login.status()).toBe(200);

    // La cookie de sesion no es legible desde JavaScript, no viaja en peticiones
    // cross-site y solo va por HTTPS. Comparacion en minusculas: Next emite
    // `SameSite=lax`, y afirmar sobre el capitalizado seria probar el formato
    // del framework, no la propiedad de seguridad.
    const setCookie = (login.headers()["set-cookie"] ?? "").toLowerCase();
    expect(setCookie).toContain("httponly");
    expect(setCookie).toContain("samesite=lax");
    expect(setCookie).toContain("secure");

    for (const ruta of RUTAS_PROTEGIDAS) {
      const response = await request.get(ruta, { maxRedirects: 0 });
      expect(response.status(), `${ruta} deberia abrirse`).toBe(200);
    }
  });

  test("cerrar sesion vuelve a dejar fuera", async ({ request }) => {
    await request.post("/api/auth/session", {
      data: { password: PROD_OPERATOR_PASSWORD },
    });
    expect((await request.get("/dashboard", { maxRedirects: 0 })).status()).toBe(200);

    await request.delete("/api/auth/session");

    expect((await request.get("/dashboard", { maxRedirects: 0 })).status()).toBe(307);
  });

  test("el login es alcanzable sin sesion (si no, no habria forma de entrar)", async ({
    page,
  }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  test("la pantalla de login avisa del fallo sin recargar", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Contraseña").fill("la que no es");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-error")).toBeVisible();
    expect(page.url()).toContain("/login");
  });

  test("desde el login se entra al panel", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Contraseña").fill(PROD_OPERATOR_PASSWORD);
    await page.getByTestId("login-submit").click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("las excepciones son exactamente las previstas", async ({ request }) => {
    // `/preview/*` NO puede pedir sesion: Playwright captura de ahi y no lleva
    // cookie. Tiene su propio token, comprobado en prod-render-access.spec.ts.
    // Aqui solo se verifica que el candado no se interpone (404 del token, no
    // 307 al login ni 401).
    const preview = await request.get("/preview/post-instagram?propertyId=x", {
      maxRedirects: 0,
    });
    expect(preview.status()).toBe(404);

    // Subrecursos que carga la pieza mientras se renderiza: tampoco llevan
    // sesion. Se protegen por identificador opaco, que NO es autenticacion y
    // esta anotado como tal en AUDIT.md.
    const asset = await request.get("/api/assets/no-existe", { maxRedirects: 0 });
    expect([400, 404]).toContain(asset.status());

    const logo = await request.get("/uploads/brand/no-existe.png", {
      maxRedirects: 0,
    });
    expect(logo.status()).toBe(404);
  });
});
