import {
  readAnyStoredAsset,
} from "@/lib/infrastructure/files/local-asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AssetRouteContext {
  readonly params: Promise<{ readonly assetId: string }>;
}

export async function GET(
  _request: Request,
  context: AssetRouteContext,
): Promise<Response> {
  try {
    const { assetId } = await context.params;
    const asset = await readAnyStoredAsset(assetId);
    return new Response(new Uint8Array(asset.bytes), {
      status: 200,
      headers: {
        "Content-Type": asset.metadata.mediaType,
        "Content-Length": String(asset.metadata.bytes),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "ASSET_NOT_FOUND" }, { status: 404 });
  }
}
