import { redirect } from "next/navigation";

/**
 * La raiz no tiene contenido propio: el producto empieza en el panel de
 * propiedades, y el dashboard ya resuelve el caso "todavia no hay marca"
 * llevando al onboarding — asi que no hay nada que decidir aqui.
 *
 * Hasta el cierre de la Fase 8 esto era la plantilla de create-next-app
 * ("To get started, edit the page.tsx file" con el logo de Next): lo primero
 * que veia cualquiera que abriese la app en una demo.
 */
export default function Home() {
  redirect("/dashboard");
}
