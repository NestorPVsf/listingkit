/**
 * Plan de empaquetado del nicho inmobiliario.
 *
 * Todo esto vivia dentro de `lib/infrastructure/package/jszip-package-builder.ts`,
 * que ademas consultaba `prisma.property` directamente. Aqui es donde le
 * corresponde estar: el empaquetador comprime y hashea, el nicho decide QUE se
 * empaqueta y como se llama.
 */
import type { RenderJob } from "@/lib/engine/contracts";
import type {
  NichePackagePlan,
  PackageExtraFile,
} from "@/lib/infrastructure/package/niche-package-plan";
import { prisma } from "@/lib/prisma";
import { generatePropertyTexts } from "@/niches/inmobiliaria/text-engine";
import { resolveTextOverride } from "../apply-text-override";
import { storedPropertyToPublicView } from "../persistence/public-view-mapper";
import type { PublicPropertyView } from "../public-view";

/**
 * Vista minima cuando la propiedad ya no existe (se borro entre el render y la
 * descarga): el ZIP sigue siendo descargable y `datos-propiedad.json` declara
 * lo poco que se sabe, en vez de reventar la descarga entera.
 */
function buildFallbackView(job: Readonly<RenderJob>): PublicPropertyView {
  const contact = job.bindings.brand.contact;
  return {
    id: job.entityId,
    operation: "sale",
    propertyType: "apartment",
    price: 0,
    currency: "EUR",
    city: job.bindings.brand.name || "",
    builtAreaM2: 0,
    bedrooms: 0,
    bathrooms: 0,
    elevator: false,
    terrace: false,
    balcony: false,
    garage: false,
    storageRoom: false,
    pool: false,
    garden: false,
    condition: "good",
    description: "",
    highlights: [],
    cta: "Contactar",
    agent: {
      name: job.bindings.brand.name || "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
    },
    agency: {
      name: job.bindings.brand.name || "",
      website: contact.website,
    },
    photoAssetIds: [],
    primaryPhotoAssetId: "",
  };
}

async function loadPublicView(job: Readonly<RenderJob>): Promise<PublicPropertyView> {
  const property = await prisma.property.findUnique({
    where: { id: job.entityId },
    // Con las fotos: `datos-propiedad.json` declaraba `photoAssetIds: []`
    // aunque la propiedad tuviera 12 fotos, porque esta consulta era la unica
    // de las cuatro copias del mapeo que no hacia el join.
    include: { photos: { orderBy: { order: "asc" } } },
  });
  return property ? storedPropertyToPublicView(property) : buildFallbackView(job);
}

/** Override de texto editado por el usuario (regenerate-piece/route.ts), si existe. */
async function loadTextOverride(
  entityId: string,
  pieceKey: string,
): Promise<string | undefined> {
  try {
    return await resolveTextOverride(entityId, pieceKey);
  } catch {
    return undefined;
  }
}

export const inmobiliariaPackagePlan: NichePackagePlan = {
  packageNamePrefix: "propiedad",
  readmeTitle: "InmoContent OS — paquete de piezas generadas",
  entityLabel: "Propiedad",

  pieceFiles: {
    "property-sheet": [
      { fileName: "ficha-tecnica.pdf", mediaType: "application/pdf" },
    ],
    "instagram-post": [
      { fileName: "post-instagram.png", mediaType: "image/png" },
    ],
    "instagram-carousel": Array.from({ length: 5 }, (_, index) => ({
      fileName: `carrusel-${String(index + 1).padStart(2, "0")}.png`,
      mediaType: "image/png",
    })),
    "instagram-story": [
      { fileName: "story-instagram.png", mediaType: "image/png" },
    ],
    "property-email": [
      { fileName: "email.html", mediaType: "text/html" },
      { fileName: "email.txt", mediaType: "text/plain" },
    ],
    "vertical-video": [
      { fileName: "video-vertical.mp4", mediaType: "video/mp4" },
    ],
  },

  fileDescriptions: {
    "ficha-tecnica.pdf": "ficha técnica en PDF de la propiedad.",
    "post-instagram.png": "imagen para publicación única de Instagram.",
    "carrusel-01.png .. carrusel-05.png": "5 imágenes para carrusel de Instagram.",
    "story-instagram.png": "imagen para historia de Instagram.",
    "video-vertical.mp4": "vídeo vertical (solo si se solicitó).",
    "email.html / email.txt": "email de la propiedad (HTML y texto plano).",
    "copy-instagram.txt": "texto de acompañamiento sugerido para Instagram.",
    "guion-video.txt": "guión sugerido para el vídeo vertical.",
    "datos-propiedad.json":
      "datos públicos de la propiedad (sin información interna/privada).",
  },

  async extraFiles(job: Readonly<RenderJob>): Promise<readonly PackageExtraFile[]> {
    const view = await loadPublicView(job);
    const bundle = generatePropertyTexts(view);

    const instagramCopy =
      (await loadTextOverride(job.entityId, "instagram-post")) ??
      bundle.instagramPostCopy;
    const videoScript =
      (await loadTextOverride(job.entityId, "vertical-video")) ??
      bundle.videoScript;

    return [
      {
        fileName: "copy-instagram.txt",
        content: instagramCopy,
        mediaType: "text/plain",
        pieceKey: "instagram-post",
      },
      {
        fileName: "guion-video.txt",
        content: videoScript,
        mediaType: "text/plain",
        pieceKey: "vertical-video",
      },
      {
        // Sale de `PublicPropertyView`, nunca del payload original: es la
        // misma allowlist que protege las piezas visuales.
        fileName: "datos-propiedad.json",
        content: JSON.stringify(view, null, 2),
        mediaType: "application/json",
        pieceKey: "metadata",
      },
    ];
  },
};
