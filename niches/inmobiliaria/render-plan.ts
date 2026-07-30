import type { PreviewPlanResolver } from "@/lib/infrastructure/render/playwright-renderer";

export const resolveInmobiliariaPreviewPlan: PreviewPlanResolver = (piece) => {
  if (piece.key === "property-sheet") {
    return [
      {
        previewId: "ficha-pdf",
        fileName: "ficha-tecnica.pdf",
        variant: "default",
        kind: "pdf",
      },
    ];
  }

  if (piece.key === "instagram-post") {
    return [
      {
        previewId: "post-instagram",
        fileName: "post-instagram.png",
        variant: "default",
        kind: "image",
        width: 1080,
        height: 1350,
      },
    ];
  }

  if (piece.key === "instagram-story") {
    return [
      {
        previewId: "story-instagram",
        fileName: "story-instagram.png",
        variant: "default",
        kind: "image",
        width: 1080,
        height: 1920,
      },
    ];
  }

  if (piece.key === "instagram-carousel") {
    return [1, 2, 3, 4, 5].map((slide) => ({
      previewId: `carousel-${slide}`,
      fileName: `carrusel-${String(slide).padStart(2, "0")}.png`,
      variant: String(slide).padStart(2, "0"),
      kind: "image" as const,
      width: 1080,
      height: 1350,
    }));
  }

  return null;
};
