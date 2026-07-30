-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "colores" JSONB NOT NULL,
    "tipografia" JSONB NOT NULL,
    "web" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "instagram" TEXT,
    "ctaHabitual" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Property" (
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
    "explicitlyAllowedClaims" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Property_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PropertyPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "esMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyPhoto_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedPiece" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "pieceKey" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "editableText" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GeneratedPiece_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCause" TEXT,
    "errorSolution" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RenderJob_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Property_city_idx" ON "Property"("city");

-- CreateIndex
CREATE INDEX "Property_operation_idx" ON "Property"("operation");

-- CreateIndex
CREATE INDEX "Property_brandId_idx" ON "Property"("brandId");

-- CreateIndex
CREATE INDEX "PropertyPhoto_propertyId_idx" ON "PropertyPhoto"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyPhoto_propertyId_order_key" ON "PropertyPhoto"("propertyId", "order");

-- CreateIndex
CREATE INDEX "GeneratedPiece_propertyId_idx" ON "GeneratedPiece"("propertyId");

-- CreateIndex
CREATE INDEX "GeneratedPiece_propertyId_pieceKey_idx" ON "GeneratedPiece"("propertyId", "pieceKey");

-- CreateIndex
CREATE INDEX "RenderJob_propertyId_idx" ON "RenderJob"("propertyId");

-- CreateIndex
CREATE INDEX "RenderJob_status_idx" ON "RenderJob"("status");
