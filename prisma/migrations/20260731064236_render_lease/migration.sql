-- CreateTable
CREATE TABLE "RenderLease" (
    "entityId" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "RenderLease_expiresAt_idx" ON "RenderLease"("expiresAt");
