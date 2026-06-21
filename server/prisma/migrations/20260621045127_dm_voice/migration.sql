-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "voiceDurationSec" DOUBLE PRECISION,
ADD COLUMN     "voicePeaksJson" TEXT,
ADD COLUMN     "voicePlayedAt" TIMESTAMP(3),
ADD COLUMN     "voiceUrl" TEXT;
