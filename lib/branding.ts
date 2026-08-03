/**
 * Nombre del producto, en un solo sitio.
 *
 * Estaba escrito a mano en diez ficheros. Eso valia mientras el producto tenia
 * un unico dueño, pero el modelo de venta es una instalacion por agencia y cada
 * cliente puede querer verlo con SU nombre — o dejar el nuestro. Con el nombre
 * repartido por el codigo, "personalizar" era editar diez ficheros y rezar por
 * no dejarse uno.
 *
 * `NEXT_PUBLIC_` porque la barra de navegacion es un componente de cliente. No
 * hay nada sensible en un nombre comercial: lo sensible sigue siendo server-only.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "ListingKit";

/** Titulo de pestaña: `<pagina> — <producto>`. */
export function pageTitle(section?: string): string {
  return section ? `${section} — ${APP_NAME}` : APP_NAME;
}
