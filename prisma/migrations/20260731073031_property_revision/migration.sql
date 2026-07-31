-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Property" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT,
    "internalName" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "pricePeriod" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "publicAddress" TEXT,
    "privateAddress" TEXT NOT NULL,
    "builtAreaM2" REAL NOT NULL,
    "usableAreaM2" REAL,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "floor" TEXT,
    "elevator" BOOLEAN NOT NULL DEFAULT false,
    "terrace" BOOLEAN NOT NULL DEFAULT false,
    "balcony" BOOLEAN NOT NULL DEFAULT false,
    "garage" BOOLEAN NOT NULL DEFAULT false,
    "storageRoom" BOOLEAN NOT NULL DEFAULT false,
    "pool" BOOLEAN NOT NULL DEFAULT false,
    "garden" BOOLEAN NOT NULL DEFAULT false,
    "condition" TEXT NOT NULL,
    "constructionYear" INTEGER,
    "energyCertificateRating" TEXT,
    "energyCertificateIdentifier" TEXT,
    "description" TEXT NOT NULL,
    "highlights" JSONB NOT NULL,
    "cta" TEXT NOT NULL,
    "listingUrl" TEXT,
    "agentName" TEXT NOT NULL,
    "agentPhone" TEXT NOT NULL,
    "agentEmail" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL,
    "agencyWebsite" TEXT,
    "primaryPhotoAssetId" TEXT,
    "musicAssetId" TEXT,
    "narrationAssetId" TEXT,
    "explicitlyAllowedClaims" JSONB NOT NULL DEFAULT [],
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Property_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Property" ("agencyName", "agencyWebsite", "agentEmail", "agentName", "agentPhone", "balcony", "bathrooms", "bedrooms", "brandId", "builtAreaM2", "city", "condition", "constructionYear", "createdAt", "cta", "currency", "description", "district", "elevator", "energyCertificateIdentifier", "energyCertificateRating", "explicitlyAllowedClaims", "floor", "garage", "garden", "highlights", "id", "internalName", "listingUrl", "musicAssetId", "narrationAssetId", "operation", "pool", "price", "pricePeriod", "primaryPhotoAssetId", "privateAddress", "propertyType", "publicAddress", "storageRoom", "terrace", "updatedAt", "usableAreaM2") SELECT "agencyName", "agencyWebsite", "agentEmail", "agentName", "agentPhone", "balcony", "bathrooms", "bedrooms", "brandId", "builtAreaM2", "city", "condition", "constructionYear", "createdAt", "cta", "currency", "description", "district", "elevator", "energyCertificateIdentifier", "energyCertificateRating", "explicitlyAllowedClaims", "floor", "garage", "garden", "highlights", "id", "internalName", "listingUrl", "musicAssetId", "narrationAssetId", "operation", "pool", "price", "pricePeriod", "primaryPhotoAssetId", "privateAddress", "propertyType", "publicAddress", "storageRoom", "terrace", "updatedAt", "usableAreaM2" FROM "Property";
DROP TABLE "Property";
ALTER TABLE "new_Property" RENAME TO "Property";
CREATE INDEX "Property_city_idx" ON "Property"("city");
CREATE INDEX "Property_operation_idx" ON "Property"("operation");
CREATE INDEX "Property_brandId_idx" ON "Property"("brandId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
