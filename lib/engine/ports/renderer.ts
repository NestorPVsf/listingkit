import type {
  RenderArtifact,
  RenderJob,
  RenderTask,
} from "../contracts";

export interface RenderSession {
  render(
    job: Readonly<RenderJob>,
    task: Readonly<RenderTask>,
  ): Promise<readonly RenderArtifact[]>;
  close(): Promise<void>;
}

export interface RendererPort {
  open(job: Readonly<RenderJob>): Promise<RenderSession>;
}
