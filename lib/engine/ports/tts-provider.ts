import type { IsoDateTime } from "../contracts";

/**
 * Modos de locución previstos por el motor:
 * - local: síntesis en la máquina del usuario (futuro).
 * - api-env: proveedor externo con credencial solo servidor (futuro).
 * - manual-upload: audio grabado y subido por el usuario (v1).
 * - none: vídeo deliberadamente sin locución (v1).
 */
export type TTSMode = "local" | "api-env" | "manual-upload" | "none";

export interface TTSNarrationRequest {
  readonly text: string;
  readonly locale: string;
  readonly deadline: IsoDateTime;
  readonly manualUploadPath?: string;
}

export interface TTSNarration {
  readonly mode: "manual-upload";
  readonly inputPath: string;
  readonly provider: string;
}

export interface TTSProvider {
  readonly id: string;
  readonly mode: TTSMode;
  resolveNarration(
    request: Readonly<TTSNarrationRequest>,
    signal: AbortSignal,
  ): Promise<TTSNarration | null>;
}
