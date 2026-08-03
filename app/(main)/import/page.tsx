import type { Metadata } from "next";
import { pageTitle } from "@/lib/branding";
import { ImportScreen } from "./ImportScreen";

export const metadata: Metadata = {
  title: pageTitle("Importar del CRM"),
};

export default function ImportPage() {
  return <ImportScreen />;
}
