-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "videoResolvedJson" TEXT;

-- CreateTable
CREATE TABLE "ResolvedMedia" (
    "sourceUrl" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "mime" TEXT,
    "title" TEXT,
    "durationSec" DOUBLE PRECISION,
    "poster" TEXT,
    "rawJson" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ResolvedMedia_pkey" PRIMARY KEY ("sourceUrl")
);

-- CreateIndex
CREATE INDEX "ResolvedMedia_expiresAt_idx" ON "ResolvedMedia"("expiresAt");
