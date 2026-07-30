# ADR — Motor genérico configurable por nicho

- **Estado:** aceptado para v1
- **Fecha:** 2026-07-29
- **Alcance:** contrato de dominio entre entrada, plantillas, render y empaquetado
- **Primera instancia:** `inmobiliaria`
- **Prueba de extensibilidad:** PoC `clinica-dental` en la Fase 8.2

## Contexto y decisión

InmoContent OS no se modela como «un generador inmobiliario al que después se le
añadirán condicionales». Se modela como un motor de piezas de marketing que recibe
una configuración de nicho. Inmobiliaria aporta su schema, su proyección pública,
sus variables, sus políticas de texto, sus reglas legales y su catálogo de piezas.

El core solo entiende este flujo:

```text
EntityInput
    │ validar y proyectar mediante NicheConfig
    ▼
TemplateBindings
    │ crear tareas desde el catálogo del nicho
    ▼
RenderJob
    │ ejecutar renderers registrados y aislar fallos por tarea
    ▼
Package
```

La palabra `Property`, los campos inmobiliarios y los nombres de sus seis piezas no
pueden aparecer en `lib/engine/`. Esa condición se comprobará con tests de
arquitectura. El punto de composición, fuera del core, inyecta el registro de nichos
y los adaptadores de infraestructura.

## Principios invariantes

1. El schema de cada nicho es la autoridad sobre su entrada.
2. Una plantilla pública recibe una proyección pública, nunca la entidad persistida.
3. Los bindings son un snapshot inmutable: una regeneración usa una revisión
   identificable de datos, marca y configuración.
4. Cada pieza declara sus requisitos y salidas en el catálogo; el pipeline no
   contiene `switch` por nicho o por nombre comercial de pieza.
5. Los datos ausentes se omiten. El motor de texto no inventa hechos.
6. Las reglas legales producen hallazgos estructurados; la UI decide cómo
   mostrarlos y el catálogo indica qué severidades bloquean una pieza.
7. Un fallo de una pieza no invalida los artefactos correctos de otras piezas.
8. Las extensiones futuras se inyectan mediante puertos; no se activan por existir
   en el classpath o por tener credenciales en el entorno.

## Contratos TypeScript del core

Los siguientes contratos son código TypeScript válido y constituyen la API interna
que se implementará en `lib/engine/`.

```ts
import type { z } from "zod";

export type NicheId = string;
export type EntityId = string;
export type PieceKey = string;
export type IsoDateTime = string;

export type JsonPrimitive = string | number | boolean | null;
export type BindingValue =
  | JsonPrimitive
  | readonly BindingValue[]
  | { readonly [key: string]: BindingValue };

export type BindingRecord = {
  readonly [key: string]: BindingValue;
};

export interface AssetRef {
  readonly id: string;
  readonly kind: "image" | "audio" | "document";
  readonly mediaType: string;
  readonly fileName: string;
  readonly storageKey: string;
  readonly width?: number;
  readonly height?: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface EntityInput<TPayload = unknown> {
  readonly nicheId: NicheId;
  readonly entityId: EntityId;
  readonly revision: number;
  readonly locale: string;
  readonly payload: TPayload;
  readonly assets: readonly AssetRef[];
  readonly requestedPieceKeys?: readonly PieceKey[];
}

export interface BrandBindings {
  readonly name: string;
  readonly logoAssetId: string;
  readonly colors: {
    readonly primary: string;
    readonly secondary: string;
    readonly background: string;
    readonly text: string;
  };
  readonly fonts: {
    readonly heading: string;
    readonly body: string;
  };
  readonly contact: {
    readonly website?: string;
    readonly phone?: string;
    readonly email?: string;
    readonly instagram?: string;
  };
}

export type LegalSeverity = "info" | "warning" | "blocking";

export interface LegalFinding {
  readonly ruleId: string;
  readonly severity: LegalSeverity;
  readonly code: string;
  readonly message: string;
  readonly remediation: string;
  readonly affectedPieceKeys?: readonly PieceKey[];
}

export interface TemplateBindings<
  TVariables extends BindingRecord = BindingRecord,
> {
  readonly nicheId: NicheId;
  readonly nicheVersion: string;
  readonly entityId: EntityId;
  readonly entityRevision: number;
  readonly locale: string;
  readonly variables: Readonly<TVariables>;
  readonly brand: Readonly<BrandBindings>;
  readonly assets: readonly AssetRef[];
  readonly legalFindings: readonly LegalFinding[];
  readonly createdAt: IsoDateTime;
}

export type RendererKind = "pdf" | "image" | "email" | "video";

export type OutputContract =
  | {
      readonly kind: "single";
      readonly extension: "pdf" | "png" | "mp4";
      readonly mediaType: string;
      readonly width?: number;
      readonly height?: number;
    }
  | {
      readonly kind: "sequence";
      readonly extension: "png";
      readonly mediaType: "image/png";
      readonly width: number;
      readonly height: number;
      readonly minItems: number;
      readonly maxItems: number;
    }
  | {
      readonly kind: "email";
      readonly html: true;
      readonly plainText: true;
      readonly maxContentWidth: number;
    };

export interface PieceDefinition<
  TBindings extends BindingRecord = BindingRecord,
> {
  readonly key: PieceKey;
  readonly label: string;
  readonly renderer: RendererKind;
  readonly templateId: string;
  readonly output: OutputContract;
  readonly requiredBindingKeys: readonly (keyof TBindings & string)[];
  readonly blocksOnLegalSeverity: readonly LegalSeverity[];
  readonly enabledByDefault: boolean;
}

export interface RenderRequest {
  readonly requestedPieceKeys: readonly PieceKey[];
  readonly priority: "normal" | "retry";
  readonly correlationId: string;
}

export type RenderTaskStatus =
  | "pending"
  | "rendering"
  | "done"
  | "error"
  | "blocked";

export interface RenderError {
  readonly code: string;
  readonly cause: string;
  readonly solution: string;
  readonly retryable: boolean;
  readonly technicalDetails?: string;
}

export interface RenderArtifact {
  readonly id: string;
  readonly pieceKey: PieceKey;
  readonly variant: string;
  readonly fileName: string;
  readonly storageKey: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
}

export interface RenderTask {
  readonly id: string;
  readonly piece: PieceDefinition;
  readonly status: RenderTaskStatus;
  readonly attempt: number;
  readonly artifacts: readonly RenderArtifact[];
  readonly error?: RenderError;
  readonly startedAt?: IsoDateTime;
  readonly finishedAt?: IsoDateTime;
}

export type RenderJobStatus =
  | "pending"
  | "rendering"
  | "done"
  | "partial"
  | "error";

export interface RenderJob {
  readonly id: string;
  readonly nicheId: NicheId;
  readonly entityId: EntityId;
  readonly entityRevision: number;
  readonly status: RenderJobStatus;
  readonly request: RenderRequest;
  readonly bindings: TemplateBindings;
  readonly tasks: readonly RenderTask[];
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface PackageManifest {
  readonly formatVersion: 1;
  readonly nicheId: NicheId;
  readonly nicheVersion: string;
  readonly entityId: EntityId;
  readonly entityRevision: number;
  readonly jobId: string;
  readonly generatedAt: IsoDateTime;
  readonly files: readonly {
    readonly pieceKey: PieceKey | "metadata" | "instructions";
    readonly path: string;
    readonly mediaType: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
  readonly omittedPieces: readonly {
    readonly pieceKey: PieceKey;
    readonly reason: string;
  }[];
}

export interface Package {
  readonly id: string;
  readonly jobId: string;
  readonly fileName: string;
  readonly storageKey: string;
  readonly mediaType: "application/zip";
  readonly bytes: number;
  readonly sha256: string;
  readonly manifest: PackageManifest;
}

export interface EnginePipeline {
  createBindings(input: EntityInput): Promise<TemplateBindings>;
  createRenderJob(
    bindings: TemplateBindings,
    request: RenderRequest,
  ): Promise<RenderJob>;
  runRenderJob(jobId: string): Promise<RenderJob>;
  createPackage(jobId: string): Promise<Package>;
}
```

`Package` es el nombre del contrato de dominio, no una representación en memoria
del ZIP. El contenido binario se transmite al almacenamiento por streaming y el
contrato conserva su localización, hash y manifiesto.

## Diseño de `NicheConfig`

### Contrato

El genérico separa tres formas de datos:

- `TInput`: entrada validada completa, incluidos campos internos.
- `TPublicInput`: proyección permitida para marketing.
- `TBindings`: variables finales y tipadas consumidas por plantillas.

```ts
import type { z } from "zod";

export interface BindingContext {
  readonly locale: string;
  readonly now: IsoDateTime;
  readonly brand: BrandBindings;
}

export interface FieldBindingRule<
  TPublicInput extends object,
  TValue extends BindingValue,
> {
  readonly sources: readonly (keyof TPublicInput)[];
  readonly resolve: (
    input: Readonly<TPublicInput>,
    context: Readonly<BindingContext>,
  ) => TValue;
}

export type FieldBindingMap<
  TPublicInput extends object,
  TBindings extends BindingRecord,
> = {
  readonly [K in keyof TBindings]: FieldBindingRule<
    TPublicInput,
    TBindings[K]
  >;
};

export interface ToneProfile {
  readonly register: "formal" | "neutral" | "conversational";
  readonly person: "first-plural" | "second-singular" | "impersonal";
  readonly maxHeadlineLength: number;
  readonly maxParagraphLength: number;
}

export interface GlossaryEntry {
  readonly canonical: string;
  readonly aliases: readonly string[];
  readonly replacement?: string;
  readonly note?: string;
}

export interface TextPolicy<TInput extends object> {
  readonly tone: ToneProfile;
  readonly prohibitedPhrases: readonly string[];
  readonly glossary: readonly GlossaryEntry[];
  readonly allowUnverifiedClaims: false;
  readonly explicitlyAllowedPhrases: (
    input: Readonly<TInput>,
  ) => readonly string[];
  readonly normalizeForComparison: (
    value: string,
    locale: string,
  ) => string;
}

export interface LegalRule<TInput extends object> {
  readonly id: string;
  readonly jurisdictions: readonly string[];
  readonly evaluate: (
    input: Readonly<TInput>,
    requestedPieceKeys: readonly PieceKey[],
  ) => LegalFinding | null;
}

export interface NicheConfig<
  TInput extends object,
  TPublicInput extends object,
  TBindings extends BindingRecord,
> {
  readonly id: NicheId;
  readonly version: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly toPublicInput: (input: Readonly<TInput>) => TPublicInput;
  readonly bindingMap: FieldBindingMap<TPublicInput, TBindings>;
  readonly pieces: readonly PieceDefinition<TBindings>[];
  readonly textPolicy: TextPolicy<TInput>;
  readonly legalRules: readonly LegalRule<TInput>[];
}

export function defineNicheConfig<
  TInput extends object,
  TPublicInput extends object,
  TBindings extends BindingRecord,
>(
  config: NicheConfig<TInput, TPublicInput, TBindings>,
): NicheConfig<TInput, TPublicInput, TBindings> {
  return config;
}
```

`toPublicInput` se ejecuta inmediatamente después de Zod y antes de resolver
bindings. Por tanto, el resolver de variables no puede acceder por accidente a
campos privados. En inmobiliaria, `privateAddress` e `internalName` dejan de existir
en el tipo que recibe `bindingMap`.

### Schema de la instancia inmobiliaria

Los archivos subidos se validan al entrar en infraestructura y el schema del nicho
solo conserva referencias ya aceptadas. El límite v1 es de 3 a 20 fotografías,
coherente con el plan de implementación; el mínimo es una decisión del nicho, no
del core.

```ts
import { z } from "zod";

const assetIdSchema = z.string().uuid();
const urlSchema = z.string().url();

export const propertyInputSchema = z
  .object({
    internalName: z.string().trim().min(1).max(120),
    operation: z.enum(["sale", "rent"]),
    propertyType: z.enum([
      "apartment",
      "house",
      "penthouse",
      "studio",
      "commercial",
      "land",
    ]),
    price: z.number().finite().positive(),
    currency: z.enum(["EUR", "USD", "GBP"]).default("EUR"),
    pricePeriod: z.enum(["month"]).optional(),
    city: z.string().trim().min(1).max(80),
    district: z.string().trim().max(80).optional(),
    publicAddress: z.string().trim().max(160).optional(),
    privateAddress: z.string().trim().min(1).max(240),
    builtAreaM2: z.number().finite().positive(),
    usableAreaM2: z.number().finite().positive().optional(),
    bedrooms: z.number().int().min(0).max(30),
    bathrooms: z.number().int().min(0).max(30),
    floor: z.string().trim().max(20).optional(),
    elevator: z.boolean(),
    terrace: z.boolean(),
    balcony: z.boolean(),
    garage: z.boolean(),
    storageRoom: z.boolean(),
    pool: z.boolean(),
    garden: z.boolean(),
    condition: z.enum([
      "new",
      "excellent",
      "good",
      "renovation-needed",
    ]),
    constructionYear: z.number().int().min(1800).max(2100).optional(),
    energyCertificate: z
      .object({
        rating: z.enum(["A", "B", "C", "D", "E", "F", "G"]),
        identifier: z.string().trim().max(80).optional(),
      })
      .optional(),
    description: z.string().trim().min(1).max(5_000),
    highlights: z.array(z.string().trim().min(1).max(100)).max(5),
    cta: z.string().trim().min(1).max(140),
    listingUrl: urlSchema.optional(),
    agent: z.object({
      name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(5).max(30),
      email: z.string().email(),
    }),
    agency: z.object({
      name: z.string().trim().min(1).max(120),
      website: urlSchema.optional(),
    }),
    photoAssetIds: z.array(assetIdSchema).min(3).max(20),
    primaryPhotoAssetId: assetIdSchema,
    musicAssetId: assetIdSchema.optional(),
    explicitlyAllowedClaims: z.array(z.string().trim().min(1)).default([]),
  })
  .superRefine((value, context) => {
    if (value.operation === "rent" && value.pricePeriod !== "month") {
      context.addIssue({
        code: "custom",
        path: ["pricePeriod"],
        message: "El alquiler debe declarar el periodo mensual.",
      });
    }

    if (value.operation === "sale" && value.pricePeriod !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["pricePeriod"],
        message: "Una venta no admite periodo de precio.",
      });
    }

    if (!value.photoAssetIds.includes(value.primaryPhotoAssetId)) {
      context.addIssue({
        code: "custom",
        path: ["primaryPhotoAssetId"],
        message: "La foto principal debe pertenecer a la galería.",
      });
    }
  });

export type PropertyInput = z.infer<typeof propertyInputSchema>;

export type PublicPropertyInput = Omit<
  PropertyInput,
  "internalName" | "privateAddress"
>;

export const toPublicPropertyInput = (
  input: Readonly<PropertyInput>,
): PublicPropertyInput => {
  const { internalName, privateAddress, ...publicInput } = input;
  void internalName;
  void privateAddress;
  return publicInput;
};
```

Además del tipo, un test de arquitectura rechazará cualquier importación de
`PropertyInput` desde plantillas públicas; solo se permite
`PublicPropertyInput`/`TemplateBindings`. Los tests de fuzzing buscarán valores
centinela de `privateAddress` en HTML, PDF, PNG, MP4, JSON y ZIP.

### Mapeo inmobiliario de formulario a variables

El mapa es auditable: cada variable declara exactamente qué campos lee. El resolver
genérico itera sus claves, ejecuta `resolve` y valida que el resultado sea un
`BindingValue`.

```ts
type PropertyBindings = {
  readonly headline: string;
  readonly priceLabel: string;
  readonly publicLocation: string;
  readonly metrics: readonly string[];
  readonly featureLabels: readonly string[];
  readonly description: string;
  readonly highlights: readonly string[];
  readonly cta: string;
  readonly listingUrl: string | null;
  readonly agentName: string;
  readonly agentPhone: string;
  readonly agentEmail: string;
  readonly agencyName: string;
  readonly primaryPhotoAssetId: string;
  readonly galleryAssetIds: readonly string[];
  readonly musicAssetId: string | null;
};

const featureLabels = (
  input: Readonly<PublicPropertyInput>,
): readonly string[] =>
  [
    input.elevator && "Ascensor",
    input.terrace && "Terraza",
    input.balcony && "Balcón",
    input.garage && "Garaje",
    input.storageRoom && "Trastero",
    input.pool && "Piscina",
    input.garden && "Jardín",
  ].filter((value): value is string => typeof value === "string");

export const propertyBindingMap = {
  headline: {
    sources: ["propertyType", "district", "city"],
    resolve: (input) =>
      [input.propertyType, input.district, input.city]
        .filter(Boolean)
        .join(" en "),
  },
  priceLabel: {
    sources: ["price", "currency", "operation"],
    resolve: (input, context) => {
      const amount = new Intl.NumberFormat(context.locale, {
        style: "currency",
        currency: input.currency,
        maximumFractionDigits: 0,
      }).format(input.price);
      return input.operation === "rent" ? `${amount}/mes` : amount;
    },
  },
  publicLocation: {
    sources: ["publicAddress", "district", "city"],
    resolve: (input) =>
      [input.publicAddress, input.district, input.city]
        .filter(Boolean)
        .join(", "),
  },
  metrics: {
    sources: ["bedrooms", "bathrooms", "builtAreaM2"],
    resolve: (input) => [
      `${input.bedrooms} hab.`,
      `${input.bathrooms} baños`,
      `${input.builtAreaM2} m²`,
    ],
  },
  featureLabels: {
    sources: [
      "elevator",
      "terrace",
      "balcony",
      "garage",
      "storageRoom",
      "pool",
      "garden",
    ],
    resolve: (input) => featureLabels(input),
  },
  description: {
    sources: ["description"],
    resolve: (input) => input.description,
  },
  highlights: {
    sources: ["highlights"],
    resolve: (input) => input.highlights,
  },
  cta: {
    sources: ["cta"],
    resolve: (input) => input.cta,
  },
  listingUrl: {
    sources: ["listingUrl"],
    resolve: (input) => input.listingUrl ?? null,
  },
  agentName: {
    sources: ["agent"],
    resolve: (input) => input.agent.name,
  },
  agentPhone: {
    sources: ["agent"],
    resolve: (input) => input.agent.phone,
  },
  agentEmail: {
    sources: ["agent"],
    resolve: (input) => input.agent.email,
  },
  agencyName: {
    sources: ["agency"],
    resolve: (input) => input.agency.name,
  },
  primaryPhotoAssetId: {
    sources: ["primaryPhotoAssetId"],
    resolve: (input) => input.primaryPhotoAssetId,
  },
  galleryAssetIds: {
    sources: ["photoAssetIds"],
    resolve: (input) => input.photoAssetIds,
  },
  musicAssetId: {
    sources: ["musicAssetId"],
    resolve: (input) => input.musicAssetId ?? null,
  },
} satisfies FieldBindingMap<PublicPropertyInput, PropertyBindings>;
```

Los nombres técnicos de enum se traducen mediante el glosario/formatter del nicho
antes de llegar a una pieza. El ejemplo mantiene el mapa corto; la implementación
no mostrará `apartment` al usuario.

### Catálogo de piezas inmobiliarias

```ts
export const realEstatePieces = [
  {
    key: "property-sheet",
    label: "Ficha técnica PDF",
    renderer: "pdf",
    templateId: "inmobiliaria/property-sheet@1",
    output: {
      kind: "single",
      extension: "pdf",
      mediaType: "application/pdf",
    },
    requiredBindingKeys: ["headline", "priceLabel", "primaryPhotoAssetId"],
    blocksOnLegalSeverity: ["blocking"],
    enabledByDefault: true,
  },
  {
    key: "instagram-post",
    label: "Post de Instagram",
    renderer: "image",
    templateId: "inmobiliaria/instagram-post@1",
    output: {
      kind: "single",
      extension: "png",
      mediaType: "image/png",
      width: 1080,
      height: 1350,
    },
    requiredBindingKeys: ["headline", "priceLabel", "primaryPhotoAssetId"],
    blocksOnLegalSeverity: ["blocking"],
    enabledByDefault: true,
  },
  {
    key: "instagram-carousel",
    label: "Carrusel de Instagram",
    renderer: "image",
    templateId: "inmobiliaria/instagram-carousel@1",
    output: {
      kind: "sequence",
      extension: "png",
      mediaType: "image/png",
      width: 1080,
      height: 1350,
      minItems: 5,
      maxItems: 5,
    },
    requiredBindingKeys: ["headline", "metrics", "galleryAssetIds"],
    blocksOnLegalSeverity: ["blocking"],
    enabledByDefault: true,
  },
  {
    key: "instagram-story",
    label: "Story de Instagram",
    renderer: "image",
    templateId: "inmobiliaria/instagram-story@1",
    output: {
      kind: "single",
      extension: "png",
      mediaType: "image/png",
      width: 1080,
      height: 1920,
    },
    requiredBindingKeys: ["headline", "priceLabel", "primaryPhotoAssetId"],
    blocksOnLegalSeverity: ["blocking"],
    enabledByDefault: true,
  },
  {
    key: "property-email",
    label: "Email comercial",
    renderer: "email",
    templateId: "inmobiliaria/property-email@1",
    output: {
      kind: "email",
      html: true,
      plainText: true,
      maxContentWidth: 600,
    },
    requiredBindingKeys: ["headline", "description", "agentEmail"],
    blocksOnLegalSeverity: ["blocking"],
    enabledByDefault: true,
  },
  {
    key: "vertical-video",
    label: "Vídeo vertical",
    renderer: "video",
    templateId: "inmobiliaria/vertical-video@1",
    output: {
      kind: "single",
      extension: "mp4",
      mediaType: "video/mp4",
      width: 1080,
      height: 1920,
    },
    requiredBindingKeys: ["headline", "galleryAssetIds", "cta"],
    blocksOnLegalSeverity: ["blocking"],
    enabledByDefault: true,
  },
] as const satisfies readonly PieceDefinition<PropertyBindings>[];
```

El carrusel sigue siendo una pieza de marketing aunque produzca cinco artefactos.
El catálogo de otro nicho puede contener dos piezas, una sola, o piezas con otros
templates; no existe un supuesto de «siempre seis» en el motor.

### Política de texto inmobiliaria

```ts
export const realEstateTextPolicy: TextPolicy<PropertyInput> = {
  tone: {
    register: "neutral",
    person: "second-singular",
    maxHeadlineLength: 80,
    maxParagraphLength: 420,
  },
  prohibitedPhrases: [
    "oportunidad única",
    "la mejor propiedad",
    "inversión garantizada",
    "rentabilidad asegurada",
    "última oportunidad",
  ],
  glossary: [
    {
      canonical: "superficie construida",
      aliases: ["metros construidos", "m2 construidos"],
      replacement: "superficie construida",
    },
    {
      canonical: "vivienda",
      aliases: ["unidad", "producto inmobiliario"],
      replacement: "vivienda",
    },
  ],
  allowUnverifiedClaims: false,
  explicitlyAllowedPhrases: (input) => input.explicitlyAllowedClaims,
  normalizeForComparison: (value, locale) =>
    value
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase(locale)
      .replace(/\s+/g, " ")
      .trim(),
};
```

Una frase prohibida solo puede pasar si aparece en
`explicitlyAllowedClaims` y coincide con texto aportado por el usuario. La
excepción queda registrada en el manifiesto; nunca la introduce una plantilla.

### Reglas legales inmobiliarias

```ts
export const realEstateLegalRules: readonly LegalRule<PropertyInput>[] = [
  {
    id: "es-energy-certificate",
    jurisdictions: ["ES"],
    evaluate: (input) =>
      input.energyCertificate
        ? null
        : {
            ruleId: "es-energy-certificate",
            severity: "warning",
            code: "ENERGY_CERTIFICATE_MISSING",
            message:
              "Falta la información del certificado energético para el anuncio.",
            remediation:
              "Añade la calificación energética o valida la excepción aplicable antes de publicar.",
          },
  },
];
```

En v1 este hallazgo es una advertencia visible, según la especificación, y no
bloquea el render. La configuración legal tiene versión y jurisdicción: no se
presenta como asesoramiento jurídico ni se actualiza silenciosamente. Para otros
países de la UE se implementa una regla por jurisdicción a partir del marco
europeo y su transposición nacional; no se presupone que el detalle o las
excepciones de la regla española sean universales.

## Prueba de generalización: clínica dental

El PoC de la Fase 8.2 no reutiliza nombres inmobiliarios. Su entidad es una campaña
de servicio, no una propiedad.

### Schema dental

```ts
import { z } from "zod";

export const dentalCampaignInputSchema = z
  .object({
    internalName: z.string().trim().min(1).max(120),
    clinicName: z.string().trim().min(1).max(120),
    serviceName: z.string().trim().min(1).max(120),
    serviceCategory: z.enum([
      "prevention",
      "orthodontics",
      "implantology",
      "aesthetic-dentistry",
    ]),
    city: z.string().trim().min(1).max(80),
    publicAddress: z.string().trim().min(1).max(160),
    priceFrom: z.number().finite().positive().optional(),
    currency: z.enum(["EUR", "USD", "GBP"]).default("EUR"),
    factualBenefits: z.array(z.string().trim().min(1).max(140)).min(1).max(5),
    contraindications: z.array(z.string().trim().min(1).max(240)).max(10),
    targetAudience: z.string().trim().min(1).max(240),
    responsibleProfessional: z.object({
      name: z.string().trim().min(1).max(100),
      professionalRegistrationNumber: z.string().trim().min(1).max(60),
    }),
    healthCenterRegistrationNumber: z.string().trim().max(80).optional(),
    patientImageAssetIds: z.array(z.string().uuid()).max(10),
    patientImageConsentDocumented: z.boolean(),
    campaignImageAssetIds: z.array(z.string().uuid()).min(1).max(10),
    cta: z.string().trim().min(1).max(140),
    landingUrl: z.string().url().optional(),
    promotionValidUntil: z.string().date().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.patientImageAssetIds.length > 0 &&
      !value.patientImageConsentDocumented
    ) {
      context.addIssue({
        code: "custom",
        path: ["patientImageConsentDocumented"],
        message:
          "Las imágenes de pacientes requieren consentimiento documentado.",
      });
    }
  });

export type DentalCampaignInput = z.infer<
  typeof dentalCampaignInputSchema
>;

export type PublicDentalCampaignInput = Omit<
  DentalCampaignInput,
  "internalName"
>;
```

Sus bindings serían, por ejemplo:

```ts
type DentalCampaignBindings = {
  readonly headline: string;
  readonly clinicName: string;
  readonly serviceName: string;
  readonly publicLocation: string;
  readonly priceLabel: string | null;
  readonly factualBenefits: readonly string[];
  readonly contraindications: readonly string[];
  readonly professionalAttribution: string;
  readonly healthCenterRegistrationNumber: string | null;
  readonly cta: string;
  readonly landingUrl: string | null;
  readonly campaignImageAssetIds: readonly string[];
  readonly patientImageAssetIds: readonly string[];
};
```

El catálogo PoC puede generar solo:

- `service-sheet`: PDF informativo del servicio.
- `campaign-email`: HTML y texto plano para una campaña consentida.

Su política de texto prohíbe, entre otras, afirmaciones absolutas como «resultado
garantizado», «sin riesgos» o «cura definitiva»; usa terminología clínica aportada
por el profesional y obliga a conservar contraindicaciones declaradas. Como
equivalente de cumplimiento vertical, una configuración española puede advertir si
falta el número de registro/autorización del centro y bloquear cualquier pieza que
incluya imágenes de pacientes sin consentimiento documentado. La regla exacta y su
severidad se versionan por jurisdicción y deben validarse con asesoría legal antes
de activar el nicho en producción.

Este ejemplo demuestra que el core no presupone precio obligatorio, inmuebles,
habitaciones, seis salidas ni siquiera presencia de vídeo.

## Compilación y registro de nichos

El registro guarda una interfaz con tipos internos cerrados. `compileNiche` valida y
resuelve los genéricos dentro de un closure, evitando `any` en el borde heterogéneo.

```ts
export interface PreparedEntity {
  readonly bindings: TemplateBindings;
  readonly availablePieces: readonly PieceDefinition[];
}

export interface NicheRuntime {
  readonly id: NicheId;
  readonly version: string;
  prepare(
    input: EntityInput,
    context: BindingContext,
  ): Promise<PreparedEntity>;
}

export interface NicheRegistry {
  get(nicheId: NicheId): NicheRuntime;
  has(nicheId: NicheId): boolean;
  list(): readonly {
    readonly id: NicheId;
    readonly version: string;
  }[];
}

export function createNicheRegistry(
  runtimes: readonly NicheRuntime[],
): NicheRegistry {
  const byId = new Map(runtimes.map((runtime) => [runtime.id, runtime]));

  if (byId.size !== runtimes.length) {
    throw new Error("NICHE_ID_DUPLICATED");
  }

  return {
    get: (nicheId) => {
      const runtime = byId.get(nicheId);
      if (!runtime) {
        throw new Error(`NICHE_NOT_REGISTERED:${nicheId}`);
      }
      return runtime;
    },
    has: (nicheId) => byId.has(nicheId),
    list: () =>
      runtimes.map(({ id, version }) => ({ id, version })),
  };
}
```

`lib/engine/compile-niche.ts` implementa `compileNiche<TInput, TPublicInput,
TBindings>()`. La composición explícita vive en `niches/registry.ts`:

```ts
import { createNicheRegistry } from "@/lib/engine/niche-registry";
import { inmobiliariaNiche } from "@/niches/inmobiliaria";

export const nicheRegistry = createNicheRegistry([inmobiliariaNiche]);
```

Para la Fase 8.2 solo se añaden `niches/clinica-dental/**` y una entrada en ese
manifest:

```ts
import { clinicaDentalNiche } from "@/niches/clinica-dental";

export const nicheRegistry = createNicheRegistry([
  inmobiliariaNiche,
  clinicaDentalNiche,
]);
```

No se modifica ninguna línea de `lib/engine/`. El registro estático es deliberado:
Next.js puede analizar los imports durante el build, el bundler incluye las
plantillas correctas y el arranque falla pronto ante IDs duplicados. No se usa
descubrimiento por filesystem, que sería frágil en bundles y despliegues serverless.

La raíz de composición crea el pipeline:

```ts
const engine = createEngine({
  niches: nicheRegistry,
  renderers: rendererRegistry,
  jobs: renderJobRepository,
  assets: assetStore,
  packages: packageBuilder,
  clock: systemClock,
});
```

Ni `createEngine` ni los renderers importan `niches/inmobiliaria`.

## Separación de responsabilidades

### `lib/engine/`: core genérico

Contiene exclusivamente:

- contratos del pipeline y errores de dominio;
- `NicheConfig`, compilador de configuración y registro;
- resolución de bindings y aplicación genérica de políticas;
- selección de piezas y creación de tareas;
- máquina de estados de `RenderJob`, reintentos y aislamiento de fallos;
- puertos de renderer, repositorio, reloj, almacenamiento y empaquetado;
- coordinación de render y construcción del manifiesto;
- políticas transversales de seguridad: rutas lógicas, hashes y límites.

No contiene schemas de propiedad, copy inmobiliario, componentes visuales de
propiedad, reglas de certificado energético ni el número seis como constante.

### `niches/inmobiliaria/`: plugin vertical

Contiene:

- schema Zod y validaciones cruzadas de propiedad;
- proyección `PropertyInput -> PublicPropertyInput`;
- mapa de bindings y formatters inmobiliarios;
- catálogo de seis piezas;
- política de texto, glosario y excepciones explícitas;
- reglas legales por jurisdicción;
- templates TSX/HTML y storyboard de vídeo;
- mapeo entre el modelo Prisma `Property` y `EntityInput`.

La persistencia v1 puede conservar tablas específicas como `Property`, porque
necesita consultas e índices de negocio claros. Esa tabla no pertenece al motor:
un adaptador del nicho la transforma a `EntityInput`. Un nicho completo futuro
podría añadir su propia tabla y mapper sin cambiar el pipeline; el PoC dental de la
Fase 8.2 no necesita persistencia.

### Infraestructura y presentación

`lib/infrastructure/` implementa los puertos: Prisma/SQLite, filesystem, Playwright,
FFmpeg y ZIP. `app/` y `components/` conocen casos de uso y view models, pero no
implementan reglas del pipeline. La raíz de composición es la única capa que
importa simultáneamente core, infraestructura y `niches/registry.ts`.

## Flujo de ejecución y garantías

1. La presentación construye `EntityInput` con `payload: unknown`.
2. El registry resuelve el `NicheRuntime` por `nicheId`.
3. `inputSchema.safeParse` valida sin casts.
4. Se conserva la entidad completa solo en el adaptador server-only.
5. `toPublicInput` elimina datos internos.
6. El mapa produce `TemplateBindings`, que se persiste como snapshot.
7. Se evalúan reglas de texto y legales sobre los datos validados.
8. El catálogo filtra piezas solicitadas, comprueba requisitos y crea tareas.
9. El registry de renderers elige por `RendererKind`, no por nicho.
10. Cada renderer recibe el template identificado y bindings públicos.
11. Los artefactos correctos se conservan aunque otra tarea falle.
12. El empaquetador incluye artefactos correctos, manifiesto, instrucciones y una
    proyección pública de datos; nunca serializa la entidad original.

## Decisiones y alternativas descartadas

| Decisión | Motivo | Alternativa descartada |
|---|---|---|
| Zod como schema ejecutable | Comparte validación y tipos entre formulario, acciones server y tests; permite `superRefine` para reglas cruzadas. | JSON Schema como fuente primaria: bueno para interoperabilidad, pero obliga a mantener generación de tipos/validadores custom y complica refinamientos. Podrá exportarse en el futuro, no dirigir v1. |
| Configuración genérica con funciones tipadas | Los bindings calculados, la proyección pública y las reglas jurisdiccionales necesitan lógica segura y testeable. | JSON declarativo puro: no expresa bien pluralización, cálculo de precio ni validación cruzada sin crear otro lenguaje. |
| Registry explícito + composición | Evita condicionales, detecta IDs duplicados al arrancar y funciona con el análisis estático de Next.js. | Herencia de clases (`RealEstateEngine extends Engine`): acopla comportamiento y estado, favorece overrides frágiles y hace difícil combinar adaptadores. |
| Manifest estático de nichos | Imports visibles al bundler, despliegue predecible y habilitación intencional. | Autodescubrimiento de carpetas en runtime: no es fiable tras empaquetado y activaría código por mera presencia. |
| Proyección pública antes de bindings | La privacidad se garantiza por construcción y por tipos, no por listas negras al final. | Limpiar outputs después del render: llega tarde, es fácil olvidar un formato y no protege logs/previews. |
| Catálogo de piezas por nicho | Permite cantidades y formatos distintos sin ramas en el pipeline. | Enum global con las seis piezas inmobiliarias: convertiría el primer vertical en el core. |
| Composición funcional y puertos | Facilita tests, adaptadores sustituibles y objetos inmutables. | Jerarquía orientada a clases: aporta poco y aumenta el acoplamiento por herencia. |
| Snapshot inmutable de bindings | La regeneración es reproducible y auditable aunque la entidad cambie después. | Leer siempre la fila actual durante cada renderer: mezcla revisiones dentro de un mismo ZIP. |
| Plantillas locales en v1 | Salida determinista, sin coste externo y sin invención de datos. | IA como camino principal: incumple la especificación y dificulta garantizar claims. `AiProvider` queda como puerto opcional y apagado. |
| Fallo aislado por tarea | PDF, imágenes y email siguen disponibles si FFmpeg falla. | Transacción todo-o-nada: empeora la recuperación y descarta trabajo válido. |
| Persistencia vertical fuera del core | Prisma conserva modelos consultables sin introducir `Property` en el engine. | Un único JSON genérico para toda entidad: simplifica migraciones iniciales, pero degrada constraints, índices y evolución de cada dominio. |

## Consecuencias

El coste inicial es mayor que un servicio con seis funciones inmobiliarias: hay
contratos, registro, proyección y adaptadores. A cambio, la segunda vertical exige
crear un plugin y registrarlo, no bifurcar el pipeline. También obliga a versionar
schemas, templates y reglas legales; esa explicitud es necesaria para reproducir
renders y auditar paquetes.

## Criterios de verificación arquitectónica

- `rg -n -i "inmobili|property|certificado energético" lib/engine` no encuentra
  conocimiento vertical, salvo comentarios de tests que expliquen la prohibición.
- Un test de imports impide que templates públicos importen modelos Prisma o tipos
  de entrada privada.
- El PoC dental compila con dos templates tras modificar solo
  `niches/clinica-dental/**` y `niches/registry.ts`.
- El mismo `createEngine` procesa ambos `nicheId`.
- Solicitar una pieza inexistente devuelve `PIECE_NOT_AVAILABLE`, no cae a un
  default inmobiliario.
- Un registry con IDs duplicados falla al arrancar.
- Los artefactos y `datos-*.json` se generan desde `TemplateBindings`/proyección
  pública, nunca desde el payload original.
