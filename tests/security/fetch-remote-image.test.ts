/**
 * SSRF: la descarga de fotos que vienen en el feed de un CRM.
 *
 * El riesgo no es una foto fea. Es que un feed manipulado apunte a
 * `169.254.169.254` —las credenciales de la máquina en AWS, Azure y GCP— o al
 * router de la oficina, convirtiendo nuestro servidor en el cliente HTTP del
 * atacante dentro de una red a la que él no llega.
 *
 * Los tests de rango se hacen sobre la función pura `direccionProhibida`, que
 * es donde vive la decisión. Los de flujo sustituyen `fetch` y `dns.lookup`
 * para poder ejercitar redirecciones y respuestas gigantes sin salir a la red.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  direccionProhibida,
  fetchRemoteImage,
  RemoteImageRejected,
} from "@/lib/infrastructure/files/fetch-remote-image";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (hostname: string) => {
    // El test decide a qué resuelve cada dominio: así se puede simular el
    // dominio público que apunta a una IP interna, que es el ataque real.
    if (hostname === "interno.example.com") return [{ address: "10.0.0.5", family: 4 }];
    if (hostname === "metadatos.example.com") return [{ address: "169.254.169.254", family: 4 }];
    if (hostname === "mixto.example.com") {
      return [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }];
    }
    return [{ address: "93.184.216.34", family: 4 }];
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function respuestaImagen(bytes: number, tipo = "image/jpeg"): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": tipo, "content-length": String(bytes) },
  });
}

describe("direccionProhibida — rangos que no se tocan", () => {
  it("bloquea la dirección de metadatos de la nube", () => {
    // La más importante de la lista: devuelve credenciales sin autenticación.
    expect(direccionProhibida("169.254.169.254")).toBe(true);
  });

  it("bloquea privadas, loopback, CGNAT y multicast", () => {
    for (const ip of [
      "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",
      "127.0.0.1", "0.0.0.0", "100.64.0.1", "224.0.0.1", "240.0.0.1",
    ]) {
      expect(direccionProhibida(ip), `deberia bloquear ${ip}`).toBe(true);
    }
  });

  it("deja pasar direcciones públicas de verdad", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:2800:220:1::"]) {
      expect(direccionProhibida(ip), `deberia permitir ${ip}`).toBe(false);
    }
  });

  it("no se deja engañar por IPv6 mapeado, que es el bypass de manual", () => {
    expect(direccionProhibida("::ffff:169.254.169.254")).toBe(true);
    expect(direccionProhibida("::ffff:127.0.0.1")).toBe(true);
    expect(direccionProhibida("::ffff:10.0.0.1")).toBe(true);
  });

  it("bloquea loopback y link-local de IPv6", () => {
    for (const ip of ["::1", "fe80::1", "fc00::1", "fd12::1", "ff02::1"]) {
      expect(direccionProhibida(ip), `deberia bloquear ${ip}`).toBe(true);
    }
  });
});

describe("fetchRemoteImage — el destino se comprueba, no se confía", () => {
  it("rechaza un dominio público que resuelve a una IP interna", async () => {
    // El ataque de verdad: el dominio es legítimo, la IP no. Registrar un
    // dominio que apunte a 10.0.0.5 es gratis y no requiere hackear nada.
    vi.stubGlobal("fetch", vi.fn());
    await expect(fetchRemoteImage("https://interno.example.com/f.jpg")).rejects.toMatchObject({
      code: "REMOTE_IMAGE_BLOCKED_ADDRESS",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rechaza el host de metadatos aunque venga con nombre bonito", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(fetchRemoteImage("https://metadatos.example.com/f.jpg")).rejects.toBeInstanceOf(
      RemoteImageRejected,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("basta con que UNA de las IPs del dominio sea interna", async () => {
    // Quedarse con la primera dirección es jugar a los dados con el atacante.
    vi.stubGlobal("fetch", vi.fn());
    await expect(fetchRemoteImage("https://mixto.example.com/f.jpg")).rejects.toMatchObject({
      code: "REMOTE_IMAGE_BLOCKED_ADDRESS",
    });
  });

  it("rechaza http, que no es https", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(fetchRemoteImage("http://cdn.example.com/f.jpg")).rejects.toMatchObject({
      code: "REMOTE_IMAGE_URL_INVALID",
    });
  });

  it("revalida CADA redirección, no solo la primera", async () => {
    // Sin esto, todas las defensas se saltan con un 302: el primer salto es
    // limpio y el segundo va a donde quiera el atacante.
    //
    // El doble RESPETA `init.redirect` a propósito. La primera versión de este
    // test devolvía el 302 pasara lo que pasara, así que pasaba en verde
    // aunque el código pidiera `redirect: "follow"` — es decir, aunque el
    // agujero estuviera abierto. Lo destapó una mutación. Un doble que no
    // distingue los dos modos no puede probar nada sobre ellos.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        if (init?.redirect === "follow") {
          // Lo que haría el fetch real: seguir hasta el destino interno y
          // devolver su respuesta, sin que nadie haya validado ese salto.
          return respuestaImagen(512);
        }
        return new Response(null, {
          status: 302,
          headers: { location: "https://interno.example.com/f.jpg" },
        });
      }),
    );
    await expect(fetchRemoteImage("https://cdn.example.com/f.jpg")).rejects.toMatchObject({
      code: "REMOTE_IMAGE_BLOCKED_ADDRESS",
    });
  });

  it("corta un bucle de redirecciones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.com/otra.jpg" },
        }),
      ),
    );
    await expect(fetchRemoteImage("https://cdn.example.com/f.jpg")).rejects.toMatchObject({
      code: "REMOTE_IMAGE_TOO_MANY_REDIRECTS",
    });
  });
});

describe("fetchRemoteImage — lo que se descarga", () => {
  it("acepta una imagen normal y la devuelve como File", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuestaImagen(1024)));
    const fichero = await fetchRemoteImage("https://cdn.example.com/foto.jpg");
    expect(fichero.name).toBe("foto.jpg");
    expect(fichero.type).toBe("image/jpeg");
    expect(fichero.size).toBe(1024);
  });

  it("rechaza lo que no es una imagen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuestaImagen(64, "text/html")));
    await expect(fetchRemoteImage("https://cdn.example.com/f.jpg")).rejects.toMatchObject({
      code: "REMOTE_IMAGE_TYPE_INVALID",
    });
  });

  it("corta por tamaño aunque el content-length mienta", async () => {
    // La cabecera la escribe quien manda los bytes. Se cuenta lo que llega.
    const enorme = new Response(new Uint8Array(11 * 1024 * 1024), {
      status: 200,
      headers: { "content-type": "image/jpeg", "content-length": "10" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => enorme));
    await expect(fetchRemoteImage("https://cdn.example.com/f.jpg")).rejects.toMatchObject({
      code: "REMOTE_IMAGE_TOO_LARGE",
    });
  });

  it("propaga un error HTTP en vez de devolver basura", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(fetchRemoteImage("https://cdn.example.com/f.jpg")).rejects.toMatchObject({
      code: "REMOTE_IMAGE_HTTP_ERROR",
    });
  });
});
