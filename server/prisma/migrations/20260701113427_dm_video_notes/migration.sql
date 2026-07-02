-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "videoDurationSec" DOUBLE PRECISION,
ADD COLUMN     "videoStatus" TEXT,
ADD COLUMN     "videoThumbUrl" TEXT,
ADD COLUMN     "videoUrl" TEXT;

-- CreateIndex
CREATE INDEX "DirectMessage_videoStatus_idx" ON "DirectMessage"("videoStatus");
