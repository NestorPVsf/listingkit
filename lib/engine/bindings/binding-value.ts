import type { BindingRecord, BindingValue } from "../contracts";
import type { BindingContext, FieldBindingMap } from "../niche-config";

export function isBindingValue(value: unknown): value is BindingValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isBindingValue);
  }

  if (typeof value !== "object") {
    return false;
  }

  return Object.values(value).every(isBindingValue);
}

export function resolveBindingMap<
  TPublicInput extends object,
  TBindings extends BindingRecord,
>(
  input: Readonly<TPublicInput>,
  context: Readonly<BindingContext>,
  bindingMap: FieldBindingMap<TPublicInput, TBindings>,
): TBindings {
  const resolved: Record<string, BindingValue> = {};

  for (const key of Object.keys(bindingMap) as (keyof TBindings & string)[]) {
    const value = bindingMap[key].resolve(input, context);
    if (!isBindingValue(value)) {
      throw new Error(`BINDING_VALUE_INVALID:${key}`);
    }
    resolved[key] = value;
  }

  return Object.freeze(resolved) as TBindings;
}
