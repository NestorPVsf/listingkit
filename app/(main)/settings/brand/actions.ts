"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export interface BrandSettingsState {
  readonly error?: string;
  readonly saved?: boolean;
}

function optionalTrimmed(value: FormDataEntryValue | null): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function updateBrandAction(
  brandId: string,
  _prevState: BrandSettingsState,
  formData: FormData,
): Promise<BrandSettingsState> {
  const nombre = optionalTrimmed(formData.get("nombre"));
  if (!nombre) {
    return { error: "El nombre de la agencia es obligatorio." };
  }

  await prisma.brand.update({
    where: { id: brandId },
    data: {
      nombre,
      telefono: optionalTrimmed(formData.get("telefono")),
      email: optionalTrimmed(formData.get("email")),
      web: optionalTrimmed(formData.get("web")),
      instagram: optionalTrimmed(formData.get("instagram")),
      ctaHabitual: optionalTrimmed(formData.get("ctaHabitual")),
    },
  });

  revalidatePath("/settings/brand");
  revalidatePath("/dashboard");
  return { saved: true };
}
