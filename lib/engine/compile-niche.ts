import { resolveBindingMap } from "./bindings/binding-value";
import type {
  BindingRecord,
  EntityInput,
  PieceDefinition,
  TemplateBindings,
} from "./contracts";
import type {
  BindingContext,
  NicheConfig,
} from "./niche-config";
import type {
  NicheRuntime,
  PreparedEntity,
} from "./niche-registry";

export function compileNiche<
  TInput extends object,
  TPublicInput extends object,
  TBindings extends BindingRecord,
>(
  config: NicheConfig<TInput, TPublicInput, TBindings>,
): NicheRuntime {
  const pieces = config.pieces as unknown as readonly PieceDefinition[];

  return {
    id: config.id,
    version: config.version,
    pieces,
    async prepare(
      input: EntityInput,
      context: BindingContext,
    ): Promise<PreparedEntity> {
      const parsed = config.inputSchema.safeParse(input.payload);
      if (!parsed.success) {
        throw new Error(`ENTITY_INPUT_INVALID:${parsed.error.message}`);
      }

      const requestedKeys =
        input.requestedPieceKeys ??
        config.pieces
          .filter((piece) => piece.enabledByDefault)
          .map((piece) => piece.key);
      const publicInput = config.toPublicInput(parsed.data);
      const variables = resolveBindingMap(
        publicInput,
        context,
        config.bindingMap,
      );
      const legalFindings = config.legalRules
        .map((rule) => rule.evaluate(parsed.data, requestedKeys))
        .filter((finding) => finding !== null);

      const bindings: TemplateBindings<TBindings> = Object.freeze({
        nicheId: config.id,
        nicheVersion: config.version,
        entityId: input.entityId,
        entityRevision: input.revision,
        locale: input.locale,
        variables,
        brand: Object.freeze(context.brand),
        assets: Object.freeze([...input.assets]),
        legalFindings: Object.freeze(legalFindings),
        createdAt: context.now,
      });

      return {
        bindings,
        availablePieces: pieces,
      };
    },
  };
}
