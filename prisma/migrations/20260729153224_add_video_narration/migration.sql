-- AlterTable
ALTER TABLE "GeneratedPiece" ADD COLUMN "metadata" JSONB;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "narrationAssetId" TEXT;
