import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PropertyDetail } from "./PropertyDetail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Propiedad — InmoContent OS",
};

interface PropertyPageProps {
  readonly params: Promise<{ readonly propertyId: string }>;
}

export default async function PropertyPage({ params }: PropertyPageProps) {
  const { propertyId } = await params;
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      photos: { orderBy: { order: "asc" } },
      renderJobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!property) notFound();

  const latestJob = property.renderJobs[0];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16">
      <header className="mb-10">
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-foreground-muted">
          Propiedad
        </p>
        <h1 className="font-display text-4xl font-semibold text-foreground">
          {property.internalName}
        </h1>
        <p className="mt-2 text-foreground-muted">
          {property.city}
          {property.district ? ` — ${property.district}` : ""}
        </p>
      </header>

      <PropertyDetail
        propertyId={property.id}
        // Se lee en el servidor: el cliente nunca ve la configuracion de IA, y
        // sin esto habria un boton que solo sirve para dar un error.
        aiEnabled={process.env.AI_TEXT_ENABLED === "1"}
        initialJobId={latestJob?.id ?? null}
        initialPhotos={property.photos.map((photo) => ({
          id: photo.id,
          url: `/api/assets/${photo.id}`,
          isMain: photo.esMain,
        }))}
      />
    </main>
  );
}
