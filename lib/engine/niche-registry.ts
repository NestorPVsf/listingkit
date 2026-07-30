import type {
  BindingRecord,
  EntityInput,
  NicheId,
  PieceDefinition,
  TemplateBindings,
} from "./contracts";
import type { BindingContext } from "./niche-config";

export interface PreparedEntity {
  readonly bindings: TemplateBindings<BindingRecord>;
  readonly availablePieces: readonly PieceDefinition[];
}

export interface NicheRuntime {
  readonly id: NicheId;
  readonly version: string;
  readonly pieces: readonly PieceDefinition[];
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
