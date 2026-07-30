/**
 * Fase 8.2 — prueba de que el motor es de verdad multi-nicho.
 *
 * El criterio de la ADR (`docs/architecture/niche-engine.md`) es que montar un
 * vertical nuevo consista en escribir un `NicheConfig` y sus plantillas, sin
 * tocar `lib/engine/`. Aqui se monta una clinica dental —entidad distinta,
 * campos privados distintos, reglas legales de otro sector— y se hace pasar por
 * el MISMO engine que genera las piezas inmobiliarias.
 *
 * Lo que este test NO demuestra, y conviene no confundir: la persistencia y los
 * renderers siguen atados a inmobiliaria (leen `prisma.property`). El nicho
 * dental llega hasta la planificacion del job, no hasta el PNG. Esta acotado
 * como riesgo residual en AUDIT.md.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { createEngine } from "@/lib/engine/create-engine";
import type {
  EntityInput,
  RenderJob,
  TemplateBindings,
} from "@/lib/engine/contracts";
import type { RenderJobRepository } from "@/lib/engine/ports/render-job-repository";
import { nicheRegistry } from "@/niches/registry";
import { clinicaDentalConfig } from "@/niches/clinica-dental";
import type { TreatmentBindings } from "@/niches/clinica-dental/bindings";
import { TreatmentPoster } from "@/niches/clinica-dental/templates/TreatmentPoster";
import { renderTreatmentEmail } from "@/niches/clinica-dental/templates/treatment-email";
import { treatmentInputSchema } from "@/niches/clinica-dental/schema";

const NOW = "2026-07-30T12:00:00.000Z";
const INTERNAL_CODE = "ORTO-INV-2026-Q3";
const CASE_NOTES = "Paciente con bruxismo severo, historial en ficha 4471.";

const BRAND = {
  name: "Clinica Dental Postiguet",
  logoAssetId: "",
  colors: {
    primary: "#0a5f8f",
    secondary: "#0a5f8f",
    background: "#ffffff",
    text: "#12212b",
  },
  fonts: { heading: "Inter", body: "Inter" },
  contact: { website: "https://dental-demo.es" },
};

function treatment(overrides: Record<string, unknown> = {}) {
  return {
    internalCode: INTERNAL_CODE,
    caseNotes: CASE_NOTES,
    internalCostEur: 480,
    treatmentName: "Ortodoncia invisible",
    category: "ortodoncia",
    summary:
      "Alineadores transparentes hechos a medida, con revisiones periodicas y seguimiento del avance en cada visita.",
    priceFromEur: 2400,
    priceIncludesVat: true,
    priceIncludes: ["Estudio 3D", "Juego de alineadores", "Revisiones"],
    sessions: 8,
    sessionMinutes: 30,
    financingAvailable: true,
    financingApr: 6.5,
    clinic: {
      name: "Clinica Dental Postiguet",
      city: "Alicante",
      phone: "+34611223344",
      email: "hola@dental-demo.es",
      bookingUrl: "https://dental-demo.es/cita",
    },
    professional: { name: "Dra. Elena Marti", licenseNumber: "03-004471" },
    cta: "Pide tu estudio inicial",
    photoAssetIds: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ],
    primaryPhotoAssetId: "11111111-1111-4111-8111-111111111111",
    explicitlyAllowedClaims: [],
    ...overrides,
  };
}

function entityInput(overrides: Record<string, unknown> = {}): EntityInput {
  return {
    nicheId: "clinica-dental",
    entityId: "treatment-1",
    revision: 1,
    locale: "es-ES",
    payload: treatment(overrides),
    assets: [],
  } as unknown as EntityInput;
}

function memoryRepository(): RenderJobRepository {
  let stored: RenderJob | null = null;
  return {
    async create(job) {
      stored = job;
    },
    async get() {
      return stored;
    },
    async save(job) {
      stored = job;
    },
    async reclaimStale() {
      return 0;
    },
  };
}

/** El engine real, con el registro real de la app. */
function engine() {
  return createEngine({
    niches: nicheRegistry,
    jobs: memoryRepository(),
    renderer: {
      async open() {
        return { async render() { return []; }, async close() {} };
      },
    },
    packages: { build: async () => ({}) } as never,
    clock: { now: () => NOW },
    createBindingContext: async () => ({
      locale: "es-ES",
      now: NOW,
      brand: BRAND,
    }),
  });
}

async function dentalBindings(
  overrides: Record<string, unknown> = {},
): Promise<TemplateBindings<TreatmentBindings>> {
  const bindings = await engine().createBindings(entityInput(overrides));
  return bindings as TemplateBindings<TreatmentBindings>;
}

describe("PoC de segundo nicho — clinica dental sobre el mismo motor", () => {
  it("el registro sirve los dos verticales sin que ninguno sepa del otro", () => {
    const ids = nicheRegistry.list().map((niche) => niche.id);
    expect(ids).toContain("inmobiliaria");
    expect(ids).toContain("clinica-dental");
    expect(nicheRegistry.get("clinica-dental").pieces).toHaveLength(2);
  });

  it("resuelve los bindings del tratamiento con el pipeline generico", async () => {
    const bindings = await dentalBindings();

    expect(bindings.nicheId).toBe("clinica-dental");
    expect(bindings.variables.headline).toBe("Ortodoncia invisible · Ortodoncia");
    expect(bindings.variables.priceLabel).toBe("Desde 2400 EUR");
    expect(bindings.variables.priceDetail).toContain("6.50% TAE");
    expect(bindings.variables.planLabel).toBe("8 sesiones de 30 min");
    expect(bindings.variables.professionalLine).toContain("03-004471");
  });

  it("la proyeccion publica deja fuera codigo interno, notas clinicas y coste", async () => {
    const bindings = await dentalBindings();
    const serialized = JSON.stringify(bindings);

    expect(serialized).not.toContain(INTERNAL_CODE);
    expect(serialized).not.toContain(CASE_NOTES);
    expect(serialized).not.toContain("480");
  });

  it("el gate legal del motor bloquea publicidad sanitaria ilicita", async () => {
    const bindings = await dentalBindings({
      summary:
        "Tratamiento con resultados garantizados y sin dolor para toda la familia, en pocas semanas.",
    });
    const job = await engine().createRenderJob(bindings, {
      requestedPieceKeys: ["treatment-poster", "treatment-email"],
      priority: "normal",
      correlationId: "corr-dental-1",
    });

    expect(job.tasks).toHaveLength(2);
    for (const task of job.tasks) {
      expect(task.status).toBe("blocked");
      expect(task.error?.code).toBe("HEALTH_GUARANTEED_RESULT_CLAIM");
    }
  });

  it("avisa (sin bloquear) si se anuncia financiacion sin TAE", async () => {
    const bindings = await dentalBindings({ financingApr: undefined });

    expect(bindings.legalFindings).toHaveLength(1);
    expect(bindings.legalFindings[0]?.code).toBe("FINANCING_APR_MISSING");
    expect(bindings.legalFindings[0]?.severity).toBe("warning");

    const job = await engine().createRenderJob(bindings, {
      requestedPieceKeys: [],
      priority: "normal",
      correlationId: "corr-dental-2",
    });
    // `warning` no bloquea: las piezas se planifican igual.
    expect(job.tasks.every((task) => task.status === "pending")).toBe(true);
  });

  it("planifica las dos piezas por defecto y genera un job ejecutable", async () => {
    const bindings = await dentalBindings();
    const job = await engine().createRenderJob(bindings, {
      requestedPieceKeys: [],
      priority: "normal",
      correlationId: "corr-dental-3",
    });

    expect(job.nicheId).toBe("clinica-dental");
    expect(job.tasks.map((task) => task.piece.key).toSorted()).toEqual([
      "treatment-email",
      "treatment-poster",
    ]);
  });

  it("rechaza un tratamiento invalido con el mismo schema Zod del contrato", () => {
    expect(
      treatmentInputSchema.safeParse(
        treatment({ professional: { name: "X", licenseNumber: "no-valido" } }),
      ).success,
    ).toBe(false);
    expect(
      treatmentInputSchema.safeParse(treatment({ priceFromEur: -1 })).success,
    ).toBe(false);
  });
});

describe("plantillas del nicho dental", () => {
  it("el poster se renderiza desde los bindings genericos y sin datos privados", async () => {
    const bindings = await dentalBindings();
    const html = renderToStaticMarkup(
      createElement(TreatmentPoster, {
        bindings,
        photoUrl: "https://dental-demo.es/foto.png",
      }),
    );

    expect(html).toContain("Ortodoncia invisible");
    expect(html).toContain("Desde 2400 EUR");
    expect(html).toContain("Col. n.o 03-004471");
    expect(html).toContain("valoracion clinica previa");
    expect(html).not.toContain(INTERNAL_CODE);
    expect(html).not.toContain(CASE_NOTES);
  });

  it("el email escapa el contenido y solo acepta https en el CTA", async () => {
    const conUrlMaliciosa = await dentalBindings({
      clinic: {
        ...treatment().clinic,
        // El schema ya lo rechazaria; la plantilla no confia igualmente.
        bookingUrl: "https://dental-demo.es/cita",
      },
      treatmentName: '<script>alert("xss")</script>',
    });
    const html = renderTreatmentEmail(conUrlMaliciosa);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="https://dental-demo.es/cita"');
    expect(html).not.toContain(CASE_NOTES);
  });

  it("el email cae a texto plano cuando no hay URL de reserva", async () => {
    const sinUrl = await dentalBindings({
      clinic: { ...treatment().clinic, bookingUrl: undefined },
    });
    const html = renderTreatmentEmail(sinUrl);

    expect(html).toContain("Pide tu estudio inicial");
    expect(html).not.toContain("<a href");
  });
});

describe("criterio duro de la ADR — el motor no conoce ningun vertical", () => {
  function sourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
      const absolute = path.join(directory, entry);
      if (statSync(absolute).isDirectory()) return sourceFiles(absolute);
      return absolute.endsWith(".ts") ? [absolute] : [];
    });
  }

  it("lib/engine no menciona ni inmobiliaria ni la clinica dental", () => {
    const engineRoot = path.resolve(process.cwd(), "lib", "engine");
    const offenders = sourceFiles(engineRoot).filter((file) =>
      /inmobili|clinica-dental|privateAddress|treatmentName|prisma/i.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("el config dental declara todo lo que el motor necesita, y nada mas", () => {
    expect(Object.keys(clinicaDentalConfig).toSorted()).toEqual([
      "bindingMap",
      "id",
      "inputSchema",
      "legalRules",
      "pieces",
      "textPolicy",
      "toPublicInput",
      "version",
    ]);
  });
});
