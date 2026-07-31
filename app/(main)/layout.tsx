import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "../globals.css";
import { AppNav } from "./AppNav";

// Tipografia de la UI de la app — preset editorial-crema (ver globals.css y
// .claude/design/DESIGN.md). No introducir fuentes nuevas fuera del catalogo
// de brand-presets.json.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "InmoContent OS",
  description: "Generador de piezas de marketing inmobiliario",
};

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${fraunces.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
