/**
 * Carga las 7 tipografias reales usadas por los 4 presets de
 * brand-presets.json, para que el paso 1 del wizard muestre cada preset
 * con su tipografia real (next/font/google, no solo el nombre en texto).
 */
import {
  Fraunces,
  Inter,
  Space_Grotesk,
  Playfair_Display,
  Work_Sans,
  Fredoka,
  Nunito_Sans,
} from "next/font/google";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["600", "700"] });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });
const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["600", "700"] });
const workSans = Work_Sans({ subsets: ["latin"], weight: ["300", "400", "500"] });
const fredoka = Fredoka({ subsets: ["latin"], weight: ["500", "600"] });
const nunitoSans = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700"] });

export const PRESET_FONT_CLASS: Record<string, string> = {
  Fraunces: fraunces.className,
  Inter: inter.className,
  "Space Grotesk": spaceGrotesk.className,
  "Playfair Display": playfairDisplay.className,
  "Work Sans": workSans.className,
  Fredoka: fredoka.className,
  "Nunito Sans": nunitoSans.className,
};
