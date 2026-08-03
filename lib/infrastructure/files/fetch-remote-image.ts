/**
 * Descarga de una imagen cuya URL viene en un fichero de terceros.
 *
 * Esto es una peticion HTTP que decide un extraño, hecha DESDE nuestro
 * servidor. El nombre tecnico es SSRF y el caso clasico no es robar una foto:
 * es apuntar a `http://169.254.169.254/`, que en AWS, Azure y GCP devuelve las
 * credenciales de la maquina. O a `http://192.168.1.1/`, que es el router de la
 * oficina. Un feed manipulado convierte nuestro servidor en su cliente HTTP
 * dentro de una red a la que el atacante no llega.
 *
 * Defensas, por orden:
 *
 * 1. **Solo https.** Ya se filtra al leer el feed; aqui se vuelve a comprobar,
 *    porque una redireccion puede degradar a http.
 * 2. **Se resuelve el nombre y se miran las IPs**, no el dominio. Un dominio
 *    publico puede apuntar a 127.0.0.1 — es gratis y no hay que hackear nada.
 *    Se bloquean privadas, loopback, link-local (la de metadatos), CGNAT,
 *    multicast y reservadas, en IPv4 y en IPv6.
 * 3. **IPv6 mapeado se decodifica.** `::ffff:169.254.169.254` es la misma
 *    direccion escrita de otra forma y es el bypass de manual.
 * 4. **Las redirecciones se siguen a mano**, revalidando cada salto. Seguirlas
 *    automaticamente tira las otras tres defensas: basta con que el primer
 *    salto sea legitimo.
 * 5. **Tope de tamaño mientras se descarga**, no solo por `content-length`: esa
 *    cabecera la escribe el mismo que manda los bytes.
 *
 * Lo que NO cubre, dicho para que conste: entre que se valida la IP y se abre
 * la conexion, el DNS podria cambiar (rebinding). Cerrarlo del todo exige
 * conectar contra la IP validada y forzar la cabecera Host, que aqui no
 * compensa: el fichero lo aporta la propia agencia desde su CRM, no un
 * desconocido de internet.
 */
import { lookup } from "node:dns/promises";
import { isIPv4 } from "node:net";

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECCIONES = 3;

const TIPOS_ACEPTADOS = new Set(["image/jpeg", "image/png", "image/webp"]);

export type RemoteImageErrorCode =
  | "REMOTE_IMAGE_URL_INVALID"
  | "REMOTE_IMAGE_BLOCKED_ADDRESS"
  | "REMOTE_IMAGE_TOO_MANY_REDIRECTS"
  | "REMOTE_IMAGE_HTTP_ERROR"
  | "REMOTE_IMAGE_TYPE_INVALID"
  | "REMOTE_IMAGE_TOO_LARGE"
  | "REMOTE_IMAGE_TIMEOUT";

export class RemoteImageRejected extends Error {
  constructor(readonly code: RemoteImageErrorCode) {
    super(code);
    this.name = "RemoteImageRejected";
  }
}

function ipv4Prohibida(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local: metadatos de la nube
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast y reservadas
  return false;
}

/** `true` si la direccion NO debe alcanzarse desde el servidor. */
export function direccionProhibida(ip: string): boolean {
  if (isIPv4(ip)) return ipv4Prohibida(ip);

  const normalizada = ip.toLowerCase().replace(/^\[|\]$/g, "");
  // IPv4 mapeado en IPv6: `::ffff:169.254.169.254` es la misma direccion con
  // otro traje. Se decodifica y se juzga como IPv4, que es lo que es.
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalizada);
  if (mapeada?.[1]) return ipv4Prohibida(mapeada[1]);

  if (normalizada === "::1" || normalizada === "::") return true;
  if (/^f[cd]/.test(normalizada)) return true; // fc00::/7 — unique local
  if (/^fe[89ab]/.test(normalizada)) return true; // fe80::/10 — link-local
  if (/^ff/.test(normalizada)) return true; // ff00::/8 — multicast
  return false;
}

async function validarDestino(url: URL): Promise<void> {
  if (url.protocol !== "https:") {
    throw new RemoteImageRejected("REMOTE_IMAGE_URL_INVALID");
  }
  // Todas las direcciones del nombre, no la primera: un dominio puede resolver
  // a una publica y a una privada, y quedarse con una es jugar a los dados.
  const direcciones = await lookup(url.hostname, { all: true }).catch(() => []);
  if (direcciones.length === 0) {
    throw new RemoteImageRejected("REMOTE_IMAGE_BLOCKED_ADDRESS");
  }
  if (direcciones.some((d) => direccionProhibida(d.address))) {
    throw new RemoteImageRejected("REMOTE_IMAGE_BLOCKED_ADDRESS");
  }
}

async function leerConTope(respuesta: Response): Promise<Buffer> {
  // El `content-length` lo escribe quien manda los bytes, asi que sirve para
  // cortar pronto pero no como garantia: se cuenta lo que llega de verdad.
  const declarado = Number(respuesta.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > MAX_BYTES) {
    throw new RemoteImageRejected("REMOTE_IMAGE_TOO_LARGE");
  }

  const lector = respuesta.body?.getReader();
  if (!lector) throw new RemoteImageRejected("REMOTE_IMAGE_HTTP_ERROR");

  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await lector.cancel();
      throw new RemoteImageRejected("REMOTE_IMAGE_TOO_LARGE");
    }
    trozos.push(value);
  }
  return Buffer.concat(trozos);
}

/**
 * Descarga la imagen y la devuelve como `File`, lista para `storeImageUpload`,
 * que es quien la recodifica con sharp y le quita los metadatos. Aqui solo se
 * decide si el fichero puede llegar hasta ahi.
 */
export async function fetchRemoteImage(urlCruda: string): Promise<File> {
  let url: URL;
  try {
    url = new URL(urlCruda);
  } catch {
    throw new RemoteImageRejected("REMOTE_IMAGE_URL_INVALID");
  }

  const abort = new AbortController();
  const temporizador = setTimeout(() => abort.abort(), TIMEOUT_MS);

  try {
    let respuesta: Response | null = null;
    for (let salto = 0; salto <= MAX_REDIRECCIONES; salto += 1) {
      await validarDestino(url);
      respuesta = await fetch(url, {
        // A mano: seguirlas solo sirve para saltarse las comprobaciones de
        // arriba a partir del segundo salto.
        redirect: "manual",
        signal: abort.signal,
        headers: { accept: "image/*" },
      });

      if (respuesta.status >= 300 && respuesta.status < 400) {
        const destino = respuesta.headers.get("location");
        if (!destino) throw new RemoteImageRejected("REMOTE_IMAGE_HTTP_ERROR");
        url = new URL(destino, url);
        continue;
      }
      break;
    }

    if (!respuesta) throw new RemoteImageRejected("REMOTE_IMAGE_TOO_MANY_REDIRECTS");
    if (respuesta.status >= 300) {
      throw new RemoteImageRejected(
        respuesta.status < 400
          ? "REMOTE_IMAGE_TOO_MANY_REDIRECTS"
          : "REMOTE_IMAGE_HTTP_ERROR",
      );
    }

    const tipo = (respuesta.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
    if (!TIPOS_ACEPTADOS.has(tipo)) {
      throw new RemoteImageRejected("REMOTE_IMAGE_TYPE_INVALID");
    }

    const bytes = await leerConTope(respuesta);
    // El nombre sale de la ruta, no de ninguna cabecera: `sanitizeUploadName`
    // volvera a limpiarlo, pero cuanto menos entre de fuera, mejor.
    const nombre = url.pathname.split("/").pop() || "imagen";
    return new File([new Uint8Array(bytes)], nombre, { type: tipo });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new RemoteImageRejected("REMOTE_IMAGE_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(temporizador);
  }
}
