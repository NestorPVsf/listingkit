import type { RenderError, RenderTaskStatus } from "./contracts";

export class EngineError extends Error {
  readonly code: string;
  readonly causeText: string;
  readonly solution: string;
  readonly retryable: boolean;
  readonly taskStatus: Extract<RenderTaskStatus, "error" | "blocked">;
  readonly technicalDetails?: string;

  constructor({
    code,
    cause,
    solution,
    retryable,
    taskStatus = "error",
    technicalDetails,
  }: RenderError & {
    readonly taskStatus?: Extract<RenderTaskStatus, "error" | "blocked">;
  }) {
    super(cause);
    this.name = "EngineError";
    this.code = code;
    this.causeText = cause;
    this.solution = solution;
    this.retryable = retryable;
    this.taskStatus = taskStatus;
    this.technicalDetails = technicalDetails;
  }

  toRenderError(): RenderError {
    return {
      code: this.code,
      cause: this.causeText,
      solution: this.solution,
      retryable: this.retryable,
      technicalDetails: this.technicalDetails,
    };
  }
}

export function normalizeRenderFailure(error: unknown): {
  readonly error: RenderError;
  readonly status: Extract<RenderTaskStatus, "error" | "blocked">;
} {
  if (error instanceof EngineError) {
    return {
      error: error.toRenderError(),
      status: error.taskStatus,
    };
  }

  const technicalDetails =
    error instanceof Error ? error.message : String(error);
  return {
    error: {
      code: "RENDER_FAILED",
      cause: "El renderer no pudo completar la tarea.",
      solution: "Revisa el diagnostico tecnico y reintenta la tarea.",
      retryable: true,
      technicalDetails,
    },
    status: "error",
  };
}
