import type { RenderJob, RenderTask } from "../contracts";

export type VideoSceneKind =
  | "hook"
  | "photo"
  | "features"
  | "differential"
  | "cta"
  | "closing";

export interface VideoScene {
  readonly kind: VideoSceneKind;
  readonly backgroundImagePath: string;
  readonly title: string;
  readonly lines: readonly string[];
}

export interface VideoBrand {
  readonly name: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly textColor: string;
  readonly logoPath?: string;
  readonly contactLines: readonly string[];
}

export interface VideoAudioSource {
  readonly musicPath?: string;
  readonly narrationPath?: string;
}

export interface VideoStoryboard {
  readonly locale: string;
  readonly narrationText: string;
  readonly scenes: readonly VideoScene[];
  readonly brand: VideoBrand;
  readonly audio: VideoAudioSource;
}

export type VideoStoryboardResolver = (
  job: Readonly<RenderJob>,
  task: Readonly<RenderTask>,
) => Promise<VideoStoryboard | null>;
