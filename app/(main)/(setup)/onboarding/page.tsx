import presetsFile from "@/niches/inmobiliaria/brand-presets.json";
import { OnboardingWizard } from "./OnboardingWizard";

export default function OnboardingPage() {
  const presets = presetsFile.presets.map((preset) => ({
    id: preset.id,
    nombre: preset.nombre,
    descripcion: preset.descripcion,
    colores: preset.colores,
    tipografia: preset.tipografia,
  }));

  return <OnboardingWizard presets={presets} defaultPresetId={presetsFile.default} />;
}
