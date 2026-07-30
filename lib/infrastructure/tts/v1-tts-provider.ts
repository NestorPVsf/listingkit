import { EngineError } from "@/lib/engine/errors";
import type {
  TTSMode,
  TTSNarration,
  TTSNarrationRequest,
  TTSProvider,
} from "@/lib/engine/ports/tts-provider";

export interface V1TTSProviderOptions {
  readonly mode: TTSMode;
}

export function createV1TTSProvider(
  options: V1TTSProviderOptions,
): TTSProvider {
  return {
    id: `v1-${options.mode}`,
    mode: options.mode,
    async resolveNarration(
      request: Readonly<TTSNarrationRequest>,
      signal: AbortSignal,
    ): Promise<TTSNarration | null> {
      if (signal.aborted) {
        throw signal.reason;
      }

      if (options.mode === "none") {
        return null;
      }
      if (options.mode === "manual-upload") {
        return request.manualUploadPath
          ? {
              mode: "manual-upload",
              inputPath: request.manualUploadPath,
              provider: "manual-upload",
            }
          : null;
      }

      throw new EngineError({
        code: "NOT_IMPLEMENTED",
        cause: `El modo TTS "${options.mode}" todavía no está implementado.`,
        solution:
          'Usa VIDEO_TTS_MODE="manual-upload" o "none" en esta versión.',
        retryable: false,
        taskStatus: "blocked",
      });
    },
  };
}
