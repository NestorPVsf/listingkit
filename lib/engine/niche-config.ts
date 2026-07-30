import type { z } from "zod";
import type {
  BindingRecord,
  BindingValue,
  BrandBindings,
  IsoDateTime,
  LegalFinding,
  PieceDefinition,
  PieceKey,
} from "./contracts";

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
  readonly id: string;
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
