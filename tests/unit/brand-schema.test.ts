/**
 * TDD — Fase 3.2 del PLAN.md de InmoContent OS.
 *
 * Estos tests DEBEN fallar en rojo por import inexistente
 * (`niches/inmobiliaria/brand.schema.ts` aun no existe). Se implementara
 * despues respetando la estructura real de `niches/inmobiliaria/brand-presets.json`
 * (4 presets: editorial-crema [default], urbana-moderna, lujo, cercana-familiar)
 * y la entidad Brand descrita en `.specs/active/inmocontent-os/spec.md`:
 * nombre, logo, colores, tipografias, web, telefono, email, IG, CTA habitual.
 *
 * NOTA para quien implemente: los presets del JSON usan claves en español
 * (`colores`, `tipografia`, `nombre`) mientras que `brandConfigSchema` (la marca
 * de una agencia concreta, tras onboarding) puede modelarse en ingles si se
 * prefiere consistencia con `schema.ts` de property — pero DEBE poder construirse
 * a partir de un preset via `resolveBrand(preset, overrides)`. Ajustar este test
 * si se decide otra convencion de nombres, pero mantener los 4 ejes cubiertos:
 * validacion, carga de presets reales, merge preset+overrides, contraste AA.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  brandConfigSchema,
  brandPresetSchema,
  meetsContrastAA,
  resolveBrand,
} from "@/niches/inmobiliaria/brand.schema";

const PRESETS_PATH = path.resolve(
  process.cwd(),
  "niches/inmobiliaria/brand-presets.json",
);

function loadPresetsFile(): {
  default: string;
  presets: Array<Record<string, unknown>>;
} {
  const raw = readFileSync(PRESETS_PATH, "utf-8");
  return JSON.parse(raw);
}

function validBrandInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    nombre: "Postiguet Homes",
    logo: "/uploads/brand/postiguet-homes-logo.png",
    colores: {
      background: "#FAF7F0",
      surface: "#FFFFFF",
      text: "#1A1815",
      textMuted: "#6B6558",
      primary: "#C1440E",
      secondary: "#2F5D3A",
      onPrimary: "#FFFFFF",
      border: "#E5DFD0",
    },
    tipografia: {
      display: { familia: "Fraunces", pesos: [600, 700] },
      body: { familia: "Inter", pesos: [400, 500, 600] },
    },
    web: "https://postiguethomes-demo.es",
    telefono: "+34 611 22 33 44",
    email: "hola@postiguethomes-demo.es",
    instagram: "postiguethomes",
    ctaHabitual: "Solicita visita",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Validacion de campos
// ---------------------------------------------------------------------------

describe("brandConfigSchema — validacion", () => {
  it("acepta una marca valida completa", () => {
    const result = brandConfigSchema.safeParse(validBrandInput());
    expect(result.success).toBe(true);
  });

  it("rechaza nombre vacio", () => {
    const result = brandConfigSchema.safeParse(
      validBrandInput({ nombre: "" }),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza si falta el nombre", () => {
    const input = validBrandInput();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (input as any).nombre;
    const result = brandConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  describe("colores — formato hex", () => {
    it.each(["#FAF7F0", "#fff", "#C1440E", "#000"])(
      "acepta hex valido %s",
      (hex) => {
        const result = brandConfigSchema.safeParse(
          validBrandInput({
            colores: { ...validBrandInput().colores, primary: hex },
          }),
        );
        expect(result.success).toBe(true);
      },
    );

    it.each([
      "orange",
      "red",
      "rgb(193, 68, 14)",
      "rgba(193, 68, 14, 0.5)",
      "hsl(20, 87%, 40%)",
      "C1440E",
      "#GGGGGG",
      "#12345",
    ])("rechaza color no-hex o invalido: %s", (bad) => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({
          colores: { ...validBrandInput().colores, primary: bad },
        }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("logo", () => {
    it("requiere logo tras onboarding (no vacio)", () => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({ logo: "" }),
      );
      expect(result.success).toBe(false);
    });

    it.each([
      "/uploads/brand/logo.png",
      "/uploads/brand/logo.webp",
      "/uploads/brand/logo.jpg",
    ])("acepta formatos permitidos: %s", (logo) => {
      const result = brandConfigSchema.safeParse(validBrandInput({ logo }));
      expect(result.success).toBe(true);
    });

    // SVG fuera desde el fix de F-03: es contenido activo servido same-origin.
    it.each([
      "/uploads/brand/logo.svg",
      "/uploads/brand/logo.gif",
      "/uploads/brand/logo.exe",
      "../../etc/passwd.png",
      "/uploads/brand/../../secret.png",
    ])("rechaza formato no permitido o path no sanitizado: %s", (logo) => {
      const result = brandConfigSchema.safeParse(validBrandInput({ logo }));
      expect(result.success).toBe(false);
    });
  });

  describe("telefono — formato español", () => {
    it.each([
      "+34 611 22 33 44",
      "+34611223344",
      "611 22 33 44",
      "611223344",
      "911 22 33 44",
    ])("acepta telefono valido: %s", (telefono) => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({ telefono }),
      );
      expect(result.success).toBe(true);
    });

    it.each([
      "12345", // muy corto
      "+34 611 22 33", // 8 digitos
      "+1 611 223 3440", // prefijo no español
      "611-22-33-44-55", // 10 digitos
      "abc def gh ij", // no numerico
    ])("rechaza telefono invalido: %s", (telefono) => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({ telefono }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("email", () => {
    it("acepta email valido", () => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({ email: "contacto@agencia.es" }),
      );
      expect(result.success).toBe(true);
    });

    it.each(["no-es-email", "falta@dominio", "@sindominio.com", ""])(
      "rechaza email invalido: %s",
      (email) => {
        const result = brandConfigSchema.safeParse(
          validBrandInput({ email }),
        );
        expect(result.success).toBe(false);
      },
    );
  });

  describe("instagram — usuario normalizado", () => {
    it("normaliza quitando @ inicial", () => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({ instagram: "@postiguethomes" }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.instagram).toBe("postiguethomes");
      }
    });

    it("acepta usuario sin @ tal cual", () => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({ instagram: "postiguethomes" }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.instagram).toBe("postiguethomes");
      }
    });

    it("rechaza usuario con espacios o caracteres invalidos", () => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({ instagram: "postiguet homes!" }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("ctaHabitual — longitud maxima", () => {
    it("acepta CTA corto", () => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({ ctaHabitual: "Solicita visita" }),
      );
      expect(result.success).toBe(true);
    });

    it("rechaza CTA excesivamente largo (>40 chars, no cabe en badge/CTA de pieza)", () => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({
          ctaHabitual:
            "Contacta ahora mismo con nuestro equipo comercial para más información",
        }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("tipografia — catalogo de presets o custom declarada", () => {
    const KNOWN_FAMILIES = [
      "Fraunces",
      "Inter",
      "Space Grotesk",
      "Playfair Display",
      "Work Sans",
      "Fredoka",
      "Nunito Sans",
    ];

    it.each(KNOWN_FAMILIES)(
      "acepta familia del catalogo de presets: %s",
      (familia) => {
        const result = brandConfigSchema.safeParse(
          validBrandInput({
            tipografia: {
              display: { familia, pesos: [600] },
              body: { familia: "Inter", pesos: [400] },
            },
          }),
        );
        expect(result.success).toBe(true);
      },
    );

    it("acepta familia custom si se declara explicitamente (esCustom: true)", () => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({
          tipografia: {
            display: { familia: "Montserrat", pesos: [700], esCustom: true },
            body: { familia: "Inter", pesos: [400] },
          },
        }),
      );
      expect(result.success).toBe(true);
    });

    it("rechaza familia fuera de catalogo sin declarar esCustom", () => {
      const result = brandConfigSchema.safeParse(
        validBrandInput({
          tipografia: {
            display: { familia: "Montserrat", pesos: [700] },
            body: { familia: "Inter", pesos: [400] },
          },
        }),
      );
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Carga de los 4 presets reales — data-driven contra el JSON real
// ---------------------------------------------------------------------------

describe("brandPresetSchema — presets reales de brand-presets.json", () => {
  const file = loadPresetsFile();

  it("el fichero declara exactamente 4 presets", () => {
    expect(file.presets).toHaveLength(4);
  });

  it("el default declarado es 'editorial-crema'", () => {
    expect(file.default).toBe("editorial-crema");
  });

  it.each(file.presets.map((p) => [p.id as string, p]))(
    "el preset '%s' valida contra brandPresetSchema",
    (_id, preset) => {
      const result = brandPresetSchema.safeParse(preset);
      expect(result.success).toBe(true);
    },
  );

  it("exactamente un preset tiene esDefault: true, y es editorial-crema", () => {
    const defaults = file.presets.filter(
      (p) => (p as { esDefault?: boolean }).esDefault === true,
    );
    expect(defaults).toHaveLength(1);
    expect((defaults[0] as { id: string }).id).toBe("editorial-crema");
  });

  it.each(["editorial-crema", "urbana-moderna", "lujo", "cercana-familiar"])(
    "existe el preset esperado: %s",
    (id) => {
      const found = file.presets.some((p) => (p as { id: string }).id === id);
      expect(found).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// 3. Merge preset + overrides
// ---------------------------------------------------------------------------

describe("resolveBrand — merge preset + overrides", () => {
  const file = loadPresetsFile();
  const editorialCrema = file.presets.find(
    (p) => (p as { id: string }).id === "editorial-crema",
  ) as Record<string, unknown>;
  const lujo = file.presets.find(
    (p) => (p as { id: string }).id === "lujo",
  ) as Record<string, unknown>;

  it("una marca basada en preset conserva colores no sobreescritos", () => {
    const brand = resolveBrand(editorialCrema, {
      colores: { primary: "#FF0000" },
    });
    const colores = brand.colores as Record<string, string>;
    expect(colores.primary).toBe("#FF0000");
    // El resto de tokens del preset se conservan intactos.
    expect(colores.background).toBe("#FAF7F0");
    expect(colores.secondary).toBe("#2F5D3A");
    expect(colores.text).toBe("#1A1815");
  });

  it("sin overrides, resolveBrand devuelve el preset intacto", () => {
    const brand = resolveBrand(lujo, {});
    const colores = brand.colores as Record<string, string>;
    expect(colores.primary).toBe("#B08D57");
    expect(colores.background).toBe("#14120F");
  });

  it("el override de tipografia no afecta a los colores del preset", () => {
    const brand = resolveBrand(editorialCrema, {
      tipografia: {
        display: { familia: "Montserrat", pesos: [700], esCustom: true },
      },
    });
    const colores = brand.colores as Record<string, string>;
    expect(colores.primary).toBe("#C1440E");
    const tipografia = brand.tipografia as {
      display: { familia: string };
      body: { familia: string };
    };
    expect(tipografia.display.familia).toBe("Montserrat");
    // La tipografia body del preset se conserva si no se sobreescribe.
    expect(tipografia.body.familia).toBe("Inter");
  });
});

// ---------------------------------------------------------------------------
// 4. Contraste AA
// ---------------------------------------------------------------------------

describe("meetsContrastAA", () => {
  it("caso verde: texto negro calido sobre fondo crema del preset editorial-crema (~14.5:1)", () => {
    expect(meetsContrastAA("#1A1815", "#FAF7F0")).toBe(true);
  });

  it("caso verde: onPrimary blanco sobre primary naranja del preset editorial-crema (~5.12:1)", () => {
    expect(meetsContrastAA("#FFFFFF", "#C1440E")).toBe(true);
  });

  it("caso verde: texto marfil sobre fondo casi negro del preset lujo (~15.06:1)", () => {
    expect(meetsContrastAA("#EDE6D9", "#14120F")).toBe(true);
  });

  it("caso rojo: blanco sobre fondo crema claro (#FFFFFF sobre #FAF7F0) no cumple AA", () => {
    expect(meetsContrastAA("#FFFFFF", "#FAF7F0")).toBe(false);
  });
});
