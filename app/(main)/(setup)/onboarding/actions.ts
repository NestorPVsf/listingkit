"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { brandDir } from "@/lib/infrastructure/storage/upload-paths";
import sharp from "sharp";
import { redirect } from "next/navigation";
import presetsFile from "@/niches/inmobiliaria/brand-presets.json";
import { sanitizeFileName } from "@/lib/infrastructure/files/upload-contract";
import {
  brandConfigSchema,
  brandPresetSchema,
  type BrandConfig,
} from "@/niches/inmobiliaria/brand.schema";
import { prisma } from "@/lib/prisma";
import type { Brand } from "@prisma/client";

export interface OnboardingState {
  error?: string;
}

/**
 * F-03 de la review adversarial: SVG fuera. Un SVG es un documento activo y se
 * servia inline y same-origin desde /uploads/brand/, asi que un logo con
 * <script> podia leer el borrador de propiedad de localStorage (privateAddress,
 * internalName) y llamar a cualquier API. Solo raster, y ademas recodificado
 * con sharp: asi el `File.type` declarado por el navegador deja de ser la
 * unica prueba de que el contenido es realmente una imagen.
 */
const ALLOWED_LOGO_TYPES = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
} as const;

type LogoExtension = (typeof ALLOWED_LOGO_TYPES)[keyof typeof ALLOWED_LOGO_TYPES];

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_LOGO_DIMENSION = 1600;

// La ruta publica sigue siendo `/uploads/brand/...` (es una ruta de la app,
// no del disco), pero el directorio real es configurable: los tests no
// pueden escribir donde estan los logos del usuario.
//
// Se resuelve en cada uso y NO se congela en una constante de modulo: en ESM
// los imports se evaluan antes que nada, asi que una constante aqui capturaria
// el valor que hubiera en ese instante. El almacen de assets ya lo hace asi.

function toSafeSlug(name: string): string {
  const withoutExt = name.replace(/\.[^.]+$/, "");
  const slug = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "logo";
}

function optionalTrimmed(value: FormDataEntryValue | null): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Valida, recodifica y guarda el logo de la agencia. Devuelve la ruta publica.
 * Extraida de la accion para poder testearla sin FormData ni redirect
 * (tests/security/brand-logo-active-content.test.ts).
 *
 * Recodificar no es cosmetico: es lo que garantiza que el fichero servido desde
 * /uploads/brand/ sean pixeles y no un documento activo con un MIME mentido.
 * Errores: LOGO_TYPE_UNSUPPORTED · LOGO_TOO_LARGE · LOGO_CONTENT_INVALID.
 */
export async function storeBrandLogo(file: File): Promise<string> {
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("LOGO_TOO_LARGE");
  }
  const extension: LogoExtension | undefined =
    ALLOWED_LOGO_TYPES[file.type as keyof typeof ALLOWED_LOGO_TYPES];
  if (!extension) {
    throw new Error("LOGO_TYPE_UNSUPPORTED");
  }

  const original = Buffer.from(await file.arrayBuffer());
  const probe = sharp(original, { limitInputPixels: 40_000_000 });
  const metadata = await probe.metadata().catch(() => null);
  // `svg` aqui significa que el navegador declaro PNG/WebP/JPEG pero el
  // contenido era un SVG. Ni siquiera lo rasterizamos: no exponemos el parser
  // de librsvg a un fichero hostil.
  if (!metadata?.format || metadata.format === "svg") {
    throw new Error("LOGO_CONTENT_INVALID");
  }

  const resized = sharp(original, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: MAX_LOGO_DIMENSION,
      height: MAX_LOGO_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
  const recoded = await (extension === "png"
    ? resized.png({ compressionLevel: 9 })
    : extension === "webp"
      ? resized.webp({ quality: 90 })
      : resized.jpeg({ quality: 90, mozjpeg: true })
  ).toBuffer();

  const fileName = `${Date.now()}-${toSafeSlug(file.name)}.${extension}`;
  // Defensa en profundidad: reutiliza el mismo validador que property photos
  // (traversal, nombres reservados de Windows) aunque fileName ya es un slug
  // generado por nosotros.
  const validatedFileName = sanitizeFileName(fileName);

  const uploadDir = brandDir();
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, validatedFileName), recoded);
  return `/uploads/brand/${validatedFileName}`;
}

const LOGO_ERROR_MESSAGES: Record<string, string> = {
  LOGO_TOO_LARGE: "El logo supera el limite de 5MB.",
  LOGO_TYPE_UNSUPPORTED: "Formato de logo no soportado (usa PNG, WebP o JPG).",
  LOGO_CONTENT_INVALID:
    "El archivo no es una imagen valida. Sube el logo en PNG, WebP o JPG.",
};

export async function createBrandAction(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const presetId = String(formData.get("presetId") ?? "");
  const preset = presetsFile.presets.find((candidate) => candidate.id === presetId);
  if (!preset) {
    return { error: "Selecciona un estilo de marca valido." };
  }

  const parsedPreset = brandPresetSchema.safeParse(preset);
  if (!parsedPreset.success) {
    return { error: "El preset seleccionado esta corrupto. Contacta con soporte." };
  }

  const logoEntry = formData.get("logo");
  if (!(logoEntry instanceof File) || logoEntry.size === 0) {
    return { error: "Sube un logo en PNG, WebP o JPG." };
  }

  let logoPath: string;
  try {
    logoPath = await storeBrandLogo(logoEntry);
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : "";
    return {
      error: LOGO_ERROR_MESSAGES[code] ?? "No se pudo guardar el logo.",
    };
  }

  const { colores, tipografia } = parsedPreset.data;
  const brandInput = {
    nombre: optionalTrimmed(formData.get("nombre")) ?? "",
    logo: logoPath,
    colores,
    tipografia: {
      display: { familia: tipografia.display.familia, pesos: tipografia.display.pesos },
      body: { familia: tipografia.body.familia, pesos: tipografia.body.pesos },
    },
    web: optionalTrimmed(formData.get("web")),
    telefono: optionalTrimmed(formData.get("telefono")),
    email: optionalTrimmed(formData.get("email")),
    instagram: optionalTrimmed(formData.get("instagram")),
    ctaHabitual: optionalTrimmed(formData.get("ctaHabitual")),
  };

  const parsedBrand = brandConfigSchema.safeParse(brandInput);
  if (!parsedBrand.success) {
    const firstIssue = parsedBrand.error.issues[0];
    return { error: firstIssue?.message ?? "Datos de marca invalidos." };
  }

  await persistBrand(parsedBrand.data);

  redirect("/dashboard");
}

/**
 * Escritura Prisma del wizard, extraida para poder testearla sin pasar por
 * FormData/redirect (test de regresion: tests/unit/onboarding-brand-persist.test.ts).
 * Bug historico (2026-07-30): esta funcion serializaba colores/tipografia con
 * JSON.stringify() antes de guardarlos en las columnas Json de Prisma, dejando
 * un STRING doble-codificado donde los consumidores (preview, email, video)
 * esperan el objeto plano. Los campos Json de Prisma NO necesitan stringify.
 */
export async function persistBrand(data: BrandConfig): Promise<Brand> {
  // Una instalacion = una agencia = UNA marca (ADR: v1 es monoinquilino). Esto
  // creaba una marca nueva cada vez, y como el dashboard mostraba "la ultima
  // creada", repetir el onboarding cambiaba la marca activa de toda la app sin
  // decir nada — con 35 marcas en la base, ninguna de ellas la buena.
  const existente = await prisma.brand.findFirst({ orderBy: { createdAt: "asc" } });
  if (existente) {
    return prisma.brand.update({
      where: { id: existente.id },
      data: {
        nombre: data.nombre,
        logo: data.logo,
        colores: data.colores,
        tipografia: data.tipografia,
        web: data.web,
        telefono: data.telefono,
        email: data.email,
        instagram: data.instagram,
        ctaHabitual: data.ctaHabitual,
      },
    });
  }

  return prisma.brand.create({
    data: {
      nombre: data.nombre,
      logo: data.logo,
      colores: data.colores,
      tipografia: data.tipografia,
      web: data.web,
      telefono: data.telefono,
      email: data.email,
      instagram: data.instagram,
      ctaHabitual: data.ctaHabitual,
    },
  });
}
