/**
 * Lectura del feed XML de un CRM (formato Kyero v3).
 *
 * Lo que se prueba aquí no es "el parser parsea": es que el informe **diga la
 * verdad sobre lo que falta**. Una importación que crea propiedades a medias en
 * silencio es peor que no importar, porque el problema aparece cuando la agencia
 * ya ha publicado.
 *
 * Los feeds de esta prueba están escritos a mano imitando lo que emiten los CRM
 * reales, con sus imperfecciones: campos ausentes, precios con separador de
 * miles, descripciones multi-idioma, tipos que no están en nuestro catálogo e
 * imágenes en http.
 */
import { describe, expect, it } from "vitest";
import { readKyeroFeed, type ImportDefaults } from "@/niches/inmobiliaria/import/kyero";

const DEFAULTS: ImportDefaults = {
  agencyName: "Postiguet Homes",
  agentName: "Marta Llorens",
  agentPhone: "+34 633 66 77 88",
  agentEmail: "marta@postiguethomes-demo.es",
  cta: "Solicita visita",
  agencyWebsite: "https://postiguethomes-demo.es",
};

function feed(propiedades: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kyero><root>
  <kyero_version>3</kyero_version>
</root>${propiedades}</kyero>`;
}

const COMPLETA = `
<property>
  <id>1042</id>
  <ref>PH-1042</ref>
  <price>245.000</price>
  <currency>EUR</currency>
  <price_freq>sale</price_freq>
  <type>Apartment</type>
  <town>Alicante</town>
  <province>Alicante</province>
  <beds>3</beds>
  <baths>1</baths>
  <pool>0</pool>
  <energy_rating>D</energy_rating>
  <surface_area><built>78</built><plot>0</plot></surface_area>
  <desc><es>Piso reformado junto a la playa.</es><en>Renovated flat.</en></desc>
  <images>
    <image id="1"><url>https://cdn.example.com/1.jpg</url></image>
    <image id="2"><url>https://cdn.example.com/2.jpg</url></image>
    <image id="3"><url>https://cdn.example.com/3.jpg</url></image>
  </images>
</property>`;

const bloqueos = (issues: readonly { severity: string; field: string }[]) =>
  issues.filter((i) => i.severity === "blocking").map((i) => i.field);

describe("readKyeroFeed — una propiedad bien formada", () => {
  const informe = readKyeroFeed(feed(COMPLETA), DEFAULTS);
  const candidato = informe.candidates[0]!;

  it("la cuenta como importable", () => {
    expect(informe.total).toBe(1);
    expect(informe.importable).toBe(1);
    expect(bloqueos(candidato.issues)).toEqual([]);
  });

  it("mapea los campos que el feed sí trae", () => {
    expect(candidato.draft).toMatchObject({
      operation: "sale",
      propertyType: "apartment",
      price: 245_000, // "245.000" con separador de miles español
      city: "Alicante",
      bedrooms: 3,
      bathrooms: 1,
      builtAreaM2: 78,
      condition: "good",
      description: "Piso reformado junto a la playa.",
    });
    expect(candidato.draft.energyCertificate).toEqual({ rating: "D" });
  });

  it("prefiere la descripción en español sobre la inglesa", () => {
    expect(candidato.draft.description).toBe("Piso reformado junto a la playa.");
  });

  it("rellena con la marca lo que el feed no puede traer", () => {
    expect(candidato.draft.agent?.name).toBe("Marta Llorens");
    expect(candidato.draft.cta).toBe("Solicita visita");
    expect(candidato.draft.agency?.name).toBe("Postiguet Homes");
  });

  it("avisa SIEMPRE de la dirección exacta, aunque todo lo demás esté bien", () => {
    // Un feed de portal es público por definición. Que la propiedad sea
    // "importable" no significa que esté lista para publicar.
    const aviso = candidato.issues.find((i) => i.field === "privateAddress");
    expect(aviso).toBeDefined();
    expect(candidato.draft.privateAddress).toContain("PENDIENTE");
  });
});

describe("readKyeroFeed — lo que falta se dice, no se adivina", () => {
  it("bloquea si el tipo no está en nuestro catálogo", () => {
    // Colar un "Cortijo" como piso sale mal en la pieza y nadie se entera
    // hasta que lo ve el cliente.
    const informe = readKyeroFeed(
      feed(COMPLETA.replace("<type>Apartment</type>", "<type>Cortijo</type>")),
      DEFAULTS,
    );
    expect(bloqueos(informe.candidates[0]!.issues)).toContain("type");
    expect(informe.importable).toBe(0);
  });

  it("bloquea con menos de 3 fotos utilizables", () => {
    const informe = readKyeroFeed(
      // `[\s\S]` en vez de la bandera `s`: el target de tsconfig no la admite.
      feed(COMPLETA.replace(/<image id="[23]">[\s\S]*?<\/image>/g, "")),
      DEFAULTS,
    );
    expect(bloqueos(informe.candidates[0]!.issues)).toContain("images");
  });

  it("descarta imágenes en http y lo dice", () => {
    // Un feed de un tercero con imagen en claro es descarga sin cifrar y un
    // vector de suplantacion. Se descarta, pero en voz alta.
    const informe = readKyeroFeed(
      feed(COMPLETA.replace("https://cdn.example.com/1.jpg", "http://cdn.example.com/1.jpg")),
      DEFAULTS,
    );
    const candidato = informe.candidates[0]!;
    expect(candidato.photoUrls).toHaveLength(2);
    expect(candidato.issues.some((i) => i.field === "images")).toBe(true);
  });

  it("bloquea sin id ni ref: sin eso no se puede reimportar sin duplicar", () => {
    const informe = readKyeroFeed(
      feed(COMPLETA.replace("<id>1042</id>", "").replace("<ref>PH-1042</ref>", "")),
      DEFAULTS,
    );
    expect(bloqueos(informe.candidates[0]!.issues)).toContain("id");
  });

  it("avisa del certificado energético, que es obligatorio en España", () => {
    const informe = readKyeroFeed(
      feed(COMPLETA.replace("<energy_rating>D</energy_rating>", "")),
      DEFAULTS,
    );
    const aviso = informe.candidates[0]!.issues.find((i) => i.field === "energy_rating");
    expect(aviso?.message).toMatch(/obligatorio/i);
  });

  it("un alquiler se mapea con su periodo mensual", () => {
    const informe = readKyeroFeed(
      feed(COMPLETA.replace("<price_freq>sale</price_freq>", "<price_freq>month</price_freq>")),
      DEFAULTS,
    );
    expect(informe.candidates[0]!.draft).toMatchObject({
      operation: "rent",
      pricePeriod: "month",
    });
  });
});

describe("readKyeroFeed — robustez frente a feeds reales", () => {
  it("lee un feed con varias propiedades y separa las que entran", () => {
    const rota = COMPLETA.replace("<price>245.000</price>", "").replace("<id>1042</id>", "<id>99</id>");
    const informe = readKyeroFeed(feed(COMPLETA + rota), DEFAULTS);
    expect(informe.total).toBe(2);
    expect(informe.importable).toBe(1);
    expect(informe.blocked).toBe(1);
  });

  it("una sola propiedad no se confunde con una lista", () => {
    // fast-xml-parser devuelve objeto cuando hay un elemento y array cuando
    // hay varios: el fallo clasico de leer XML.
    expect(readKyeroFeed(feed(COMPLETA), DEFAULTS).total).toBe(1);
  });

  it("un feed vacío no explota", () => {
    expect(readKyeroFeed(feed(""), DEFAULTS).total).toBe(0);
  });

  it("no expande entidades externas", () => {
    // Billion laughs / XXE: un feed es un fichero de un tercero.
    const malicioso = `<?xml version="1.0"?>
      <!DOCTYPE kyero [ <!ENTITY lol "aaaa"> ]>
      <kyero><property><id>1</id><town>&lol;</town></property></kyero>`;
    const informe = readKyeroFeed(malicioso, DEFAULTS);
    expect(informe.total).toBe(1);
    expect(informe.candidates[0]!.draft.city ?? "").not.toContain("aaaa");
  });
});
