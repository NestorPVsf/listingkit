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
  /**
   * Metadatos estructurados específicos del renderer. Se persisten junto al
   * RenderJob/GeneratedPiece; otros renderers pueden omitirlos.
   */
  readonly metadata?: BindingRecord;
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
