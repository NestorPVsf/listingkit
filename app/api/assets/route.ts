import { ZodError } from "zod";
import {
  storeAudioUpload,
  storeImageUpload,
} from "@/lib/infrastructure/files/local-asset-store";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = formData.get("kind");
    if (
      !(file instanceof File) ||
      (kind !== "image" && kind !== "audio")
    ) {
      return Response.json(
        { error: "UPLOAD_MULTIPART_INVALID" },
        { status: 400 },
      );
    }

    const asset =
      kind === "image"
        ? await storeImageUpload(file)
        : await storeAudioUpload(file);
    return Response.json(asset, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "UPLOAD_INVALID", issues: error.issues },
        { status: 400 },
      );
    }
    // F-10: solo devolvemos codigos estables nuestros ("UPLOAD_IMAGE_INVALID",
    // ...). El mensaje crudo de sharp o de fs puede arrastrar rutas absolutas
    // del disco del servidor hasta el navegador.
    const raw = error instanceof Error ? error.message : String(error);
    const detail = /^[A-Z][A-Z0-9_]{2,63}$/.test(raw) ? raw : "UPLOAD_FAILED";
    return Response.json({ error: "UPLOAD_INVALID", detail }, { status: 400 });
  }
}
