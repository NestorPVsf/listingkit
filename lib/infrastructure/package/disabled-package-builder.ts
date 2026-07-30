import { EngineError } from "@/lib/engine/errors";
import type { PackageBuilder } from "@/lib/engine/ports/package-builder";

export const disabledPackageBuilder: PackageBuilder = {
  async build() {
    throw new EngineError({
      code: "PACKAGE_NOT_IMPLEMENTED",
      cause: "El empaquetado no forma parte de este paso.",
      solution: "Completa la fase de empaquetado antes de solicitar un ZIP.",
      retryable: false,
      taskStatus: "blocked",
    });
  },
};
