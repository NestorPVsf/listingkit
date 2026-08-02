/**
 * Base de hechos verificados de una propiedad, para la reescritura con IA.
 *
 * Es la lista CERRADA de datos que el modelo puede mencionar. Se construye por
 * inclusion explicita, igual que `toPublicPropertyView`: un campo nuevo en la
 * propiedad no llega al prompt hasta que alguien lo pone aqui a proposito. Y
 * por la misma razon — el motivo de la allowlist no es el prompt, es que de
 * aqui sale tambien el conjunto de numeros permitidos al validar la salida.
 *
 * Ojo con lo que NO va: la direccion privada y el nombre interno no aparecen
 * porque `PublicPropertyView` ya no los tiene. Esa garantia viene de tipos, no
 * de acordarse.
 */
import type { PublicPropertyView } from "./public-view";
import { PROPERTY_TYPE_LABELS } from "./text-labels";

export function propertyFactsForAi(
  view: Readonly<PublicPropertyView>,
): Readonly<Record<string, string | number | null | undefined>> {
  return {
    "Tipo de propiedad": PROPERTY_TYPE_LABELS[view.propertyType],
    Operación: view.operation === "rent" ? "alquiler" : "venta",
    Precio: `${view.price} ${view.currency}`,
    Ciudad: view.city,
    Zona: view.district,
    "Ubicación pública": view.publicAddress,
    "Superficie construida": `${view.builtAreaM2} m²`,
    "Superficie útil": view.usableAreaM2 ? `${view.usableAreaM2} m²` : undefined,
    Habitaciones: view.bedrooms,
    Baños: view.bathrooms,
    Planta: view.floor,
    "Año de construcción": view.constructionYear,
    "Certificado energético": view.energyCertificate?.rating,
    Estado: view.condition,
    Ascensor: view.elevator ? "sí" : "no",
    Terraza: view.terrace ? "sí" : "no",
    Balcón: view.balcony ? "sí" : "no",
    Garaje: view.garage ? "sí" : "no",
    Trastero: view.storageRoom ? "sí" : "no",
    Piscina: view.pool ? "sí" : "no",
    Jardín: view.garden ? "sí" : "no",
  };
}
