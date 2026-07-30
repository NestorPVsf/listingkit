import type { VideoScene, VideoSceneKind } from "@/lib/engine/ports/video-storyboard";

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;
export const TRANSITION_SECONDS = 0.5;
export const MIN_VIDEO_SECONDS = 20;
export const MAX_VIDEO_SECONDS = 35;

const FIXED_DURATIONS: Readonly<Record<Exclude<VideoSceneKind, "photo">, number>> = {
  hook: 3,
  features: 3,
  differential: 3,
  cta: 2.8,
  closing: 2.8,
};

export interface TimedVideoScene {
  readonly scene: VideoScene;
  readonly durationSeconds: number;
}

export interface VideoDurationPlan {
  readonly scenes: readonly TimedVideoScene[];
  readonly durationSeconds: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Cada foto adicional añade tiempo hasta el techo de 35 s. La duración bruta
 * incluye los solapes de xfade para que el MP4 resultante conserve exactamente
 * el objetivo adaptativo después de restar las transiciones.
 */
export function createVideoDurationPlan(
  scenes: readonly VideoScene[],
): VideoDurationPlan {
  const photoCount = scenes.filter((scene) => scene.kind === "photo").length;
  const targetDuration = clamp(
    20 + Math.max(0, photoCount - 3) * 2.2,
    MIN_VIDEO_SECONDS,
    MAX_VIDEO_SECONDS,
  );
  const transitionOverlap = TRANSITION_SECONDS * Math.max(0, scenes.length - 1);
  const fixedTotal = scenes.reduce(
    (sum, scene) =>
      scene.kind === "photo" ? sum : sum + FIXED_DURATIONS[scene.kind],
    0,
  );
  const photoDuration =
    photoCount > 0
      ? (targetDuration + transitionOverlap - fixedTotal) / photoCount
      : 0;

  return {
    durationSeconds: targetDuration,
    scenes: scenes.map((scene) => ({
      scene,
      durationSeconds:
        scene.kind === "photo"
          ? photoDuration
          : FIXED_DURATIONS[scene.kind],
    })),
  };
}
