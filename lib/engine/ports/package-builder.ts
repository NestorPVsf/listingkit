import type { Package, RenderJob } from "../contracts";

export interface PackageBuilder {
  build(job: Readonly<RenderJob>): Promise<Package>;
}
