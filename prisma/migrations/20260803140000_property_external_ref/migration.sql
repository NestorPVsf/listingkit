-- Referencia de la propiedad en el feed del CRM de origen.
--
-- Nullable porque las propiedades creadas a mano no vienen de ningun feed, y
-- UNIQUE porque es lo que impide que reimportar el mismo fichero duplique la
-- cartera. En SQLite varios NULL conviven en un indice unico, que es
-- exactamente el comportamiento que hace falta: muchas propiedades sin origen,
-- una sola por cada id del feed.
ALTER TABLE "Property" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "Property_externalRef_key" ON "Property"("externalRef");
