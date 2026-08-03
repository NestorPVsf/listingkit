/**
 * Importacion desde el XML de un CRM inmobiliario (formato Kyero v3).
 *
 * Por que Kyero y no un CSV inventado: Witei exporta con esta especificacion,
 * Inmovilla genera un XML diario, y es el formato con el que las agencias de
 * costa ya sindican a portales. O sea, la agencia YA tiene este fichero — no
 * hay que pedirle que prepare nada.
 *
 * ---------------------------------------------------------------------------
 * Lo que un feed publico NO puede darnos, y hay que decirlo alto
 * ---------------------------------------------------------------------------
 * Un feed de portal es publico por definicion, asi que no trae la direccion
 * exacta, ni el agente asignado, ni la llamada a la accion. Nuestro esquema
 * exige las tres, y ademas 3 fotos como minimo. De ahi que esto NO cree
 * propiedades a ciegas: produce un INFORME de lo que entraria, marcando campo
 * por campo lo que falta y de donde sale cada relleno.
 *
 * El parseo es deliberadamente tolerante. La especificacion v3 tiene versiones
 * (3.4 añadio `country`, 3.5 los videos, 3.9 los telefonos) y cada CRM emite su
 * variante; un parser estricto rechazaria feeds perfectamente utiles. Se lee lo
 * que hay, se avisa de lo que falta, y no se adivina nada.
 */
import { XMLParser } from "fast-xml-parser";
import type { PropertyInput } from "../schema";
import { propertyInputSchema } from "../schema";

export type IssueSeverity = "blocking" | "warning";

export interface ImportIssue {
  readonly field: string;
  readonly severity: IssueSeverity;
  readonly message: string;
}

export interface ImportCandidate {
  /** `<id>` del feed. Es lo que permite reimportar sin duplicar. */
  readonly externalId: string;
  readonly ref?: string;
  readonly title: string;
  readonly town?: string;
  readonly price?: number;
  readonly photoUrls: readonly string[];
  /** Los campos ya mapeados, SIN fotos ni identificadores de asset. */
  readonly draft: Partial<PropertyInput>;
  readonly issues: readonly ImportIssue[];
}

export interface ImportReport {
  readonly source: "kyero";
  readonly total: number;
  readonly importable: number;
  readonly blocked: number;
  readonly candidates: readonly ImportCandidate[];
}

/**
 * Datos que el feed no trae y salen de la marca ya configurada. Es informacion
 * de la agencia, no de la propiedad: pedirla propiedad a propiedad seria
 * absurdo cuando ya esta en la configuracion.
 */
export interface ImportDefaults {
  readonly agencyName: string;
  readonly agentName: string;
  readonly agentPhone: string;
  readonly agentEmail: string;
  readonly cta: string;
  readonly agencyWebsite?: string;
}

/**
 * Tipos de Kyero -> tipos nuestros. Lo que no reconocemos NO se adivina: se
 * marca y se deja que lo decida una persona. Un chalet clasificado como piso
 * sale mal en la pieza y nadie se entera hasta que el cliente lo ve.
 */
const TIPOS: Readonly<Record<string, PropertyInput["propertyType"]>> = {
  apartment: "apartment",
  flat: "apartment",
  penthouse: "penthouse",
  duplex: "apartment",
  studio: "studio",
  villa: "house",
  house: "house",
  townhouse: "house",
  bungalow: "house",
  chalet: "house",
  finca: "house",
  commercial: "commercial",
  business: "commercial",
  land: "land",
  plot: "land",
};

const RATINGS = new Set(["A", "B", "C", "D", "E", "F", "G"]);

function comoTexto(valor: unknown): string | undefined {
  if (valor === null || valor === undefined) return undefined;
  if (typeof valor === "object") return undefined;
  const texto = String(valor).trim();
  return texto.length > 0 ? texto : undefined;
}

function comoNumero(valor: unknown): number | undefined {
  const texto = comoTexto(valor);
  if (texto === undefined) return undefined;
  // Los feeds mezclan "245000", "245.000" y "245,000". Se quitan los
  // separadores de millar y se acepta la coma decimal.
  const limpio = texto.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : undefined;
}

function comoBooleano(valor: unknown): boolean {
  const texto = comoTexto(valor)?.toLowerCase();
  return texto === "1" || texto === "true" || texto === "yes" || texto === "si";
}

function comoLista(valor: unknown): readonly unknown[] {
  if (valor === null || valor === undefined) return [];
  return Array.isArray(valor) ? valor : [valor];
}

/**
 * `<desc>` viene multi-idioma (`<desc><es>…</es><en>…</en></desc>`). Se prefiere
 * español y se cae a ingles: el feed de una agencia de costa suele traer los
 * dos, y publicar en el idioma equivocado es peor que no publicar.
 */
function extraerDescripcion(desc: unknown): { texto?: string; idioma?: string } {
  const directo = comoTexto(desc);
  if (directo) return { texto: directo, idioma: "es" };
  if (typeof desc !== "object" || desc === null) return {};
  const registro = desc as Record<string, unknown>;
  for (const idioma of ["es", "spanish", "en", "english"]) {
    const texto = comoTexto(registro[idioma]);
    if (texto) return { texto, idioma };
  }
  for (const [clave, valor] of Object.entries(registro)) {
    const texto = comoTexto(valor);
    if (texto) return { texto, idioma: clave };
  }
  return {};
}

function extraerImagenes(images: unknown): readonly string[] {
  if (typeof images !== "object" || images === null) return [];
  const lista = comoLista((images as Record<string, unknown>).image);
  const urls: string[] = [];
  for (const imagen of lista) {
    const url =
      comoTexto(imagen) ??
      comoTexto((imagen as Record<string, unknown>)?.url) ??
      undefined;
    // Solo https: una URL http en un feed de un tercero es una descarga en
    // claro y un vector de suplantacion. Se filtra aqui y se avisa arriba.
    if (url && /^https:\/\//i.test(url)) urls.push(url);
  }
  return urls;
}

function mapearPropiedad(
  crudo: Record<string, unknown>,
  defaults: Readonly<ImportDefaults>,
): ImportCandidate {
  const issues: ImportIssue[] = [];
  const avisar = (field: string, message: string, severity: IssueSeverity = "warning") =>
    issues.push({ field, severity, message });

  const externalId = comoTexto(crudo.id) ?? comoTexto(crudo.ref) ?? "";
  const ref = comoTexto(crudo.ref);
  const town = comoTexto(crudo.town);
  const province = comoTexto(crudo.province);
  const price = comoNumero(crudo.price);
  const beds = comoNumero(crudo.beds);
  const baths = comoNumero(crudo.baths);

  if (!externalId) {
    avisar("id", "Sin <id> ni <ref>: no se puede reimportar sin duplicar.", "blocking");
  }
  if (price === undefined) avisar("price", "Sin precio.", "blocking");
  if (!town) avisar("town", "Sin municipio.", "blocking");
  if (beds === undefined) avisar("beds", "Sin numero de habitaciones.", "blocking");
  if (baths === undefined) avisar("baths", "Sin numero de baños.", "blocking");

  const tipoCrudo = comoTexto(crudo.type)?.toLowerCase() ?? "";
  const propertyType = TIPOS[tipoCrudo];
  if (!propertyType) {
    avisar(
      "type",
      `Tipo "${comoTexto(crudo.type) ?? "(vacio)"}" no reconocido: eligelo a mano.`,
      "blocking",
    );
  }

  const frecuencia = comoTexto(crudo.price_freq)?.toLowerCase();
  const operation: PropertyInput["operation"] =
    frecuencia === "month" || frecuencia === "rent" ? "rent" : "sale";
  if (!frecuencia) {
    avisar("price_freq", "Sin <price_freq>: se asume venta.");
  }

  const superficie = crudo.surface_area as Record<string, unknown> | undefined;
  const construida = comoNumero(superficie?.built) ?? comoNumero(crudo.built);
  if (construida === undefined) {
    avisar("surface_area.built", "Sin superficie construida.", "blocking");
  }

  const { texto: descripcion, idioma } = extraerDescripcion(crudo.desc);
  if (!descripcion) {
    avisar("desc", "Sin descripcion.", "blocking");
  } else if (idioma && !["es", "spanish"].includes(idioma)) {
    avisar("desc", `La descripcion viene en "${idioma}", no en español: revisala.`);
  }

  const photoUrls = extraerImagenes(crudo.images);
  const totalImagenes = comoLista(
    (crudo.images as Record<string, unknown> | undefined)?.image,
  ).length;
  if (photoUrls.length < totalImagenes) {
    avisar(
      "images",
      `${totalImagenes - photoUrls.length} imagen(es) descartadas por no venir en https.`,
    );
  }
  if (photoUrls.length < 3) {
    avisar(
      "images",
      `Solo ${photoUrls.length} foto(s) utilizables; hacen falta 3 para generar piezas.`,
      "blocking",
    );
  }

  const rating = comoTexto(crudo.energy_rating)?.toUpperCase();
  const energyCertificate = rating && RATINGS.has(rating)
    ? { rating: rating as "A" }
    : undefined;
  if (!energyCertificate) {
    // Verificado en la investigacion: el CEE es obligatorio en TODO anuncio
    // desde 2013 y la etiqueta debe verse. Sin el, publicar es arriesgado.
    avisar(
      "energy_rating",
      "Sin certificado energetico. Es obligatorio en cualquier anuncio en España.",
    );
  }

  // Lo que el feed no puede traer, dicho una por una para que nadie se lleve
  // una sorpresa al publicar.
  avisar(
    "privateAddress",
    "Un feed de portal es publico: no trae la direccion exacta. Se rellena con el municipio y hay que completarla.",
  );
  avisar("agent", "El agente sale de la marca configurada, no del feed.");
  avisar("cta", "La llamada a la accion sale de la marca configurada.");
  avisar("condition", comoBooleano(crudo.new_build)
    ? "Marcado como obra nueva en el feed."
    : "El feed no declara el estado de conservacion: se asume «buen estado».");

  const ubicacionPublica = [town, province].filter(Boolean).join(", ");

  const draft: Partial<PropertyInput> = {
    internalName: `${ref ?? externalId} — ${ubicacionPublica || "sin ubicacion"}`,
    operation,
    ...(propertyType ? { propertyType } : {}),
    ...(price !== undefined ? { price } : {}),
    currency: (comoTexto(crudo.currency)?.toUpperCase() as "EUR") ?? "EUR",
    ...(operation === "rent" ? { pricePeriod: "month" as const } : {}),
    ...(town ? { city: town } : {}),
    ...(province ? { district: province } : {}),
    ...(ubicacionPublica ? { publicAddress: ubicacionPublica } : {}),
    // Marcado explicitamente como pendiente: es mejor que quede feo y visible
    // que poner algo que parezca una direccion real y no lo sea.
    privateAddress: `${ubicacionPublica || "Sin ubicacion"} — PENDIENTE: direccion exacta (no viene en el feed)`,
    ...(construida !== undefined ? { builtAreaM2: construida } : {}),
    ...(beds !== undefined ? { bedrooms: beds } : {}),
    ...(baths !== undefined ? { bathrooms: baths } : {}),
    elevator: false,
    terrace: false,
    balcony: false,
    garage: false,
    storageRoom: false,
    pool: comoBooleano(crudo.pool),
    garden: false,
    condition: comoBooleano(crudo.new_build) ? "new" : "good",
    ...(energyCertificate ? { energyCertificate } : {}),
    ...(descripcion ? { description: descripcion } : {}),
    highlights: [],
    cta: defaults.cta,
    agent: {
      name: defaults.agentName,
      phone: defaults.agentPhone,
      email: defaults.agentEmail,
    },
    agency: {
      name: defaults.agencyName,
      ...(defaults.agencyWebsite ? { website: defaults.agencyWebsite } : {}),
    },
    explicitlyAllowedClaims: [],
  };

  return {
    externalId,
    ...(ref ? { ref } : {}),
    title: `${comoTexto(crudo.type) ?? "Propiedad"} en ${ubicacionPublica || "?"}`,
    ...(town ? { town } : {}),
    ...(price !== undefined ? { price } : {}),
    photoUrls,
    draft,
    issues,
  };
}

/**
 * Lee un feed y devuelve el informe. NO escribe nada: esta funcion es pura y
 * ese es el punto — lo primero que hay que poder hacer con el fichero de una
 * agencia es enseñarle que entraria, antes de tocarle la base de datos.
 */
export function readKyeroFeed(
  xml: string,
  defaults: Readonly<ImportDefaults>,
): ImportReport {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    // Sin procesar entidades externas: un feed es un fichero de un tercero.
    processEntities: false,
    // TODO llega como texto. Por defecto el parser convierte a numero por su
    // cuenta y se come el separador de miles español: `<price>245.000</price>`
    // entraba como **245**. Una propiedad de 245.000 € importada por 245 €, en
    // silencio y camino de un post de Instagram. Quien sabe que "245.000" son
    // doscientos cuarenta y cinco mil es el codigo del nicho, no el parser XML.
    parseTagValue: false,
    parseAttributeValue: false,
  });

  const documento = parser.parse(xml) as Record<string, unknown>;
  const raiz = (documento.kyero ?? documento.root ?? documento) as Record<string, unknown>;
  const propiedades = comoLista(raiz.property) as Record<string, unknown>[];

  const candidates = propiedades
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map((p) => mapearPropiedad(p, defaults));

  const blocked = candidates.filter((c) =>
    c.issues.some((i) => i.severity === "blocking"),
  ).length;

  return {
    source: "kyero",
    total: candidates.length,
    importable: candidates.length - blocked,
    blocked,
    candidates,
  };
}

/**
 * Valida un candidato contra el esquema REAL del nicho, ya con las fotos
 * subidas. Se usa al confirmar la importacion: el informe dice lo que se
 * espera, esto comprueba lo que de verdad hay.
 */
export function completeCandidate(
  candidate: Readonly<ImportCandidate>,
  photoAssetIds: readonly string[],
): PropertyInput {
  return propertyInputSchema.parse({
    ...candidate.draft,
    photoAssetIds: [...photoAssetIds],
    primaryPhotoAssetId: photoAssetIds[0],
  });
}
