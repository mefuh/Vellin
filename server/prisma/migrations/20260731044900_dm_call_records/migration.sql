-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "callDurationSec" INTEGER,
ADD COLUMN     "callId" TEXT,
ADD COLUMN     "callKind" TEXT,
ADD COLUMN     "callOutcome" TEXT;

-- CreateIndex
CREATE INDEX "DirectMessage_callId_idx" ON "DirectMessage"("callId");
