import type { Metadata } from "next";
import { pageTitle } from "@/lib/branding";
import { prisma } from "@/lib/prisma";
import { BrandSettingsForm } from "./BrandSettingsForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Marca"),
};

export default async function BrandSettingsPage() {
  const brand = await prisma.brand.findFirst({ orderBy: { createdAt: "desc" } });

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="mb-10">
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-foreground-muted">
          Configuración
        </p>
        <h1 className="font-display text-4xl font-semibold text-foreground">Marca</h1>
        <p className="mt-2 text-foreground-muted">
          Edita los datos de contacto y el CTA habitual de tu marca activa. El
          estilo (colores y tipografia) se define en el onboarding.
        </p>
      </header>
      {brand ? (
        <BrandSettingsForm
          brandId={brand.id}
          defaults={{
            nombre: brand.nombre,
            telefono: brand.telefono ?? "",
            email: brand.email ?? "",
            web: brand.web ?? "",
            instagram: brand.instagram ?? "",
            ctaHabitual: brand.ctaHabitual ?? "",
          }}
        />
      ) : (
        <p className="text-foreground-muted">
          No hay marca configurada. Completa primero el onboarding.
        </p>
      )}
    </main>
  );
}
