"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { z } from "zod";
import { propertyInputSchema } from "@/niches/inmobiliaria/schema";
import {
  CheckboxField,
  FormSection,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
} from "./fields";

/**
 * Formulario de nueva propiedad (Fase 5.2). Usa EL MISMO propertyInputSchema
 * del nicho en cliente (zodResolver) y en servidor (POST /api/properties) —
 * no duplica validacion. Autoguarda borrador en localStorage.
 */

const DRAFT_STORAGE_KEY = "inmocontent:property-draft";

// Tipo de ENTRADA del schema (los campos con .default() son opcionales al
// rellenar; el resolver los completa al validar). El tipo de salida validado
// es z.output = PropertyInput.
type PropertyFormValues = z.input<typeof propertyInputSchema>;
type PropertyOutput = z.output<typeof propertyInputSchema>;

interface UploadedPhoto {
  readonly assetId: string;
  readonly previewUrl: string;
  readonly name: string;
}

// Valores iniciales alineados con el schema (los opcionales van a undefined).
const DEFAULT_VALUES: PropertyFormValues = {
  internalName: "",
  operation: "sale",
  propertyType: "apartment",
  price: Number.NaN,
  currency: "EUR",
  pricePeriod: undefined,
  city: "",
  district: undefined,
  publicAddress: undefined,
  privateAddress: "",
  builtAreaM2: Number.NaN,
  usableAreaM2: undefined,
  bedrooms: Number.NaN,
  bathrooms: Number.NaN,
  floor: undefined,
  elevator: false,
  terrace: false,
  balcony: false,
  garage: false,
  storageRoom: false,
  pool: false,
  garden: false,
  condition: "good",
  constructionYear: undefined,
  energyCertificate: { rating: "en-tramite", identifier: undefined },
  description: "",
  highlights: ["", "", "", "", ""],
  cta: "",
  listingUrl: undefined,
  agent: { name: "", phone: "", email: "" },
  agency: { name: "", website: undefined },
  photoAssetIds: [],
  primaryPhotoAssetId: "",
  musicAssetId: undefined,
  narrationAssetId: undefined,
  explicitlyAllowedClaims: [],
};

function loadDraft(): Partial<PropertyFormValues> | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Partial<PropertyFormValues>;
  } catch {
    return null;
  }
}

export function PropertyForm() {
  const router = useRouter();
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [primaryAssetId, setPrimaryAssetId] = useState<string>("");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved">("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PropertyFormValues>({
    resolver: zodResolver(propertyInputSchema) as Resolver<PropertyFormValues>,
    defaultValues: DEFAULT_VALUES,
    mode: "onSubmit",
  });

  // Registra los campos de fotos (ocultos) para que setValue los persista y
  // el resolver los valide (min 3, primary en galeria).
  useEffect(() => {
    register("photoAssetIds");
    register("primaryPhotoAssetId");
  }, [register]);

  // Restaura borrador al montar.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      reset({ ...DEFAULT_VALUES, ...draft });
      setAutosaveState("saved");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoguardado (debounce) del borrador en localStorage.
  useEffect(() => {
    const subscription = watch((values) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      setAutosaveState("saving");
      autosaveTimer.current = setTimeout(() => {
        try {
          window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(values));
          setAutosaveState("saved");
        } catch {
          setAutosaveState("idle");
        }
      }, 600);
    });
    return () => {
      subscription.unsubscribe();
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [watch]);

  const operation = watch("operation");

  const handlePhotoUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      setPhotoError(null);
      setIsUploading(true);

      const uploaded: UploadedPhoto[] = [];
      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("kind", "image");
          try {
            const response = await fetch("/api/assets", {
              method: "POST",
              body: formData,
            });
            if (!response.ok) {
              setPhotoError(`No se pudo subir "${file.name}". Revisa el formato y el tamano.`);
              continue;
            }
            const asset = (await response.json()) as { id: string };
            uploaded.push({
              assetId: asset.id,
              previewUrl: `/api/assets/${asset.id}`,
              name: file.name,
            });
          } catch {
            setPhotoError(`Error de red subiendo "${file.name}".`);
          }
        }

        if (uploaded.length > 0) {
          const next = [...photos, ...uploaded];
          setPhotos(next);
          const nextIds = next.map((photo) => photo.assetId);
          setValue("photoAssetIds", nextIds, { shouldValidate: false });
          const primary = primaryAssetId || next[0].assetId;
          if (!primaryAssetId) {
            setPrimaryAssetId(primary);
            setValue("primaryPhotoAssetId", primary, { shouldValidate: false });
          }
        }
      } finally {
        setIsUploading(false);
        // Permite volver a subir el mismo archivo.
        event.target.value = "";
      }
    },
    [photos, primaryAssetId, setValue],
  );

  const handleSetPrimary = useCallback(
    (assetId: string) => {
      setPrimaryAssetId(assetId);
      setValue("primaryPhotoAssetId", assetId, { shouldValidate: false });
    },
    [setValue],
  );

  async function onValid(values: PropertyFormValues) {
    setSubmitError(null);
    const photoCount = (values.photoAssetIds ?? []).length;
    if (photoCount < 3) {
      setPhotoError("Sube al menos 3 fotografias de la propiedad.");
      return;
    }
    setIsSubmitting(true);
    try {
      // Revalida con el MISMO schema en cliente justo antes de enviar (el
      // servidor vuelve a validar con propertyInputSchema.parse).
      const payload: PropertyOutput = propertyInputSchema.parse(values);
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const detail =
          typeof body === "object" && body !== null && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : "Revisa los datos e intentalo de nuevo.";
        setSubmitError(`No se pudo crear la propiedad. ${detail}`);
        setIsSubmitting(false);
        return;
      }
      const { id } = (await response.json()) as { id: string };
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      router.push(`/properties/${id}`);
    } catch {
      setSubmitError("Error de red al crear la propiedad.");
      setIsSubmitting(false);
    }
  }

  function onInvalid(formErrors: FieldErrors<PropertyFormValues>) {
    const photoCount = (watch("photoAssetIds") ?? []).length;
    if (photoCount < 3) {
      setPhotoError("Sube al menos 3 fotografias de la propiedad.");
    }
    // Foco al primer campo con error — navegacion accesible tras validar.
    const firstErrorName = Object.keys(formErrors)[0];
    if (firstErrorName) {
      const element = document.querySelector<HTMLElement>(
        `[data-testid="field-${firstErrorName}"]`,
      );
      element?.focus();
    }
  }

  return (
    <form
      data-testid="property-form"
      onSubmit={handleSubmit(onValid, onInvalid)}
      noValidate
      aria-label="Formulario de nueva propiedad"
    >
      <p
        data-testid="draft-autosave-indicator"
        role="status"
        aria-live="polite"
        className="mb-6 text-sm text-foreground-muted"
      >
        {autosaveState === "saving"
          ? "Guardando borrador..."
          : autosaveState === "saved"
            ? "Borrador guardado automaticamente."
            : "El borrador se guarda automaticamente mientras escribes."}
      </p>

      {submitError ? (
        <p role="alert" className="mb-6 border border-primary bg-surface p-3 text-sm font-medium text-primary">
          {submitError}
        </p>
      ) : null}

      <FormSection title="Identificacion">
        <TextField
          name="internalName"
          label="Nombre interno"
          required
          register={register}
          errors={errors}
          hint="Solo lo ves tu; nunca aparece en las piezas publicas."
        />
        <SelectField
          name="operation"
          label="Operacion"
          required
          register={register}
          errors={errors}
          options={[
            { value: "sale", label: "Venta" },
            { value: "rent", label: "Alquiler" },
          ]}
        />
        <SelectField
          name="propertyType"
          label="Tipo de propiedad"
          required
          register={register}
          errors={errors}
          options={[
            { value: "apartment", label: "Piso" },
            { value: "house", label: "Casa" },
            { value: "penthouse", label: "Atico" },
            { value: "studio", label: "Estudio" },
            { value: "commercial", label: "Local comercial" },
            { value: "land", label: "Terreno" },
          ]}
        />
      </FormSection>

      <FormSection title="Precio">
        <NumberField
          name="price"
          label="Precio"
          required
          register={register}
          errors={errors}
        />
        <SelectField
          name="currency"
          label="Moneda"
          required
          register={register}
          errors={errors}
          options={[
            { value: "EUR", label: "EUR (€)" },
            { value: "USD", label: "USD ($)" },
            { value: "GBP", label: "GBP (£)" },
          ]}
        />
        {operation === "rent" ? (
          <SelectField
            name="pricePeriod"
            label="Periodo del precio"
            required
            register={register}
            errors={errors}
            options={[{ value: "month", label: "Por mes" }]}
          />
        ) : null}
      </FormSection>

      <FormSection title="Ubicacion">
        <TextField name="city" label="Ciudad" required register={register} errors={errors} />
        <TextField name="district" label="Zona / barrio" register={register} errors={errors} />
        <TextField
          name="publicAddress"
          label="Direccion publica"
          register={register}
          errors={errors}
          hint="La que aparecera en los anuncios (p.ej. una zona aproximada)."
        />
        <TextField
          name="privateAddress"
          label="Direccion privada"
          required
          register={register}
          errors={errors}
          hint="Uso interno. NUNCA aparece en las piezas generadas."
        />
      </FormSection>

      <FormSection title="Caracteristicas">
        <NumberField
          name="builtAreaM2"
          label="Superficie construida (m²)"
          required
          register={register}
          errors={errors}
        />
        <NumberField
          name="usableAreaM2"
          label="Superficie util (m²)"
          register={register}
          errors={errors}
        />
        <NumberField
          name="bedrooms"
          label="Habitaciones"
          required
          register={register}
          errors={errors}
        />
        <NumberField
          name="bathrooms"
          label="Banos"
          required
          register={register}
          errors={errors}
        />
        <TextField name="floor" label="Planta" register={register} errors={errors} />
        <NumberField
          name="constructionYear"
          label="Ano de construccion"
          register={register}
          errors={errors}
        />
        <SelectField
          name="condition"
          label="Estado"
          required
          register={register}
          errors={errors}
          options={[
            { value: "new", label: "Obra nueva" },
            { value: "excellent", label: "Excelente" },
            { value: "good", label: "Bueno" },
            { value: "renovation-needed", label: "A reformar" },
          ]}
        />
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium text-foreground">Extras</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CheckboxField name="elevator" label="Ascensor" register={register} />
            <CheckboxField name="terrace" label="Terraza" register={register} />
            <CheckboxField name="balcony" label="Balcon" register={register} />
            <CheckboxField name="garage" label="Garaje" register={register} />
            <CheckboxField name="storageRoom" label="Trastero" register={register} />
            <CheckboxField name="pool" label="Piscina" register={register} />
            <CheckboxField name="garden" label="Jardin" register={register} />
          </div>
        </fieldset>
      </FormSection>

      <FormSection title="Certificado energetico">
        <SelectField
          name="energyCertificate.rating"
          label="Calificacion energetica"
          register={register}
          errors={errors}
          options={[
            { value: "A", label: "A" },
            { value: "B", label: "B" },
            { value: "C", label: "C" },
            { value: "D", label: "D" },
            { value: "E", label: "E" },
            { value: "F", label: "F" },
            { value: "G", label: "G" },
            { value: "en-tramite", label: "En tramite" },
            { value: "exento", label: "Exento" },
          ]}
        />
        <TextField
          name="energyCertificate.identifier"
          label="Identificador del certificado"
          register={register}
          errors={errors}
        />
      </FormSection>

      <FormSection title="Descripcion y destacados">
        <TextareaField
          name="description"
          label="Descripcion"
          required
          register={register}
          errors={errors}
        />
        {[0, 1, 2, 3, 4].map((index) => (
          <TextField
            key={index}
            name={`highlights.${index}`}
            label={`Destacado ${index + 1}`}
            register={register}
            errors={errors}
          />
        ))}
        <TextField
          name="cta"
          label="Llamada a la accion (CTA)"
          required
          register={register}
          errors={errors}
          placeholder="Solicita visita"
        />
        <TextField
          name="listingUrl"
          label="URL del anuncio"
          register={register}
          errors={errors}
          placeholder="https://"
        />
      </FormSection>

      <FormSection title="Agente e inmobiliaria">
        <TextField name="agent.name" label="Nombre del agente" required register={register} errors={errors} />
        <TextField name="agent.phone" label="Telefono del agente" required register={register} errors={errors} />
        <TextField name="agent.email" label="Email del agente" required register={register} errors={errors} type="email" />
        <TextField name="agency.name" label="Nombre de la inmobiliaria" required register={register} errors={errors} />
        <TextField name="agency.website" label="Web de la inmobiliaria" register={register} errors={errors} placeholder="https://" />
      </FormSection>

      <FormSection title="Fotografias">
        <div className="sm:col-span-2">
          <label htmlFor="photo-upload" className="mb-1 block text-sm font-medium text-foreground">
            Fotos de la propiedad (minimo 3, maximo 20) *
          </label>
          <input
            id="photo-upload"
            data-testid="photo-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handlePhotoUpload}
            aria-describedby="photo-upload-hint"
            className="block w-full border border-border bg-surface p-3 text-sm"
          />
          <p id="photo-upload-hint" className="mt-2 text-sm text-foreground-muted">
            Formatos JPG, PNG o WebP. Maximo 10MB por foto.
          </p>
          {photoError ? (
            <p
              data-testid="photo-upload-error"
              role="alert"
              className="mt-2 text-sm font-medium text-primary"
            >
              {photoError}
            </p>
          ) : null}

          {photos.length > 0 ? (
            <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="Fotos subidas">
              {photos.map((photo, index) => (
                <li key={photo.assetId} className="border border-border bg-surface p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl}
                    alt={`Foto ${index + 1}: ${photo.name}`}
                    data-testid={`photo-thumbnail-${index}`}
                    className="h-28 w-full object-cover"
                  />
                  <button
                    type="button"
                    data-testid={`set-primary-photo-${index}`}
                    onClick={() => handleSetPrimary(photo.assetId)}
                    aria-pressed={primaryAssetId === photo.assetId}
                    className={
                      primaryAssetId === photo.assetId
                        ? "mt-2 w-full bg-secondary px-2 py-1 text-xs font-semibold text-on-primary"
                        : "mt-2 w-full border border-border px-2 py-1 text-xs font-medium text-foreground"
                    }
                  >
                    {primaryAssetId === photo.assetId ? "Foto principal" : "Usar como principal"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </FormSection>

      <div className="mt-10">
        <button
          type="submit"
          data-testid="submit-property"
          disabled={isSubmitting || isUploading}
          className="bg-primary px-8 py-3 text-sm font-semibold text-on-primary disabled:opacity-60"
        >
          {isUploading
            ? "Subiendo fotos..."
            : isSubmitting
              ? "Creando propiedad..."
              : "Crear propiedad y generar piezas"}
        </button>
      </div>
    </form>
  );
}
