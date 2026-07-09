-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "inviteRoomId" TEXT,
ADD COLUMN     "inviteRoomName" TEXT,
ADD COLUMN     "inviteRoomSlug" TEXT,
ADD COLUMN     "inviteStatus" TEXT,
ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "inviteVideoPoster" TEXT,
ADD COLUMN     "inviteVideoTitle" TEXT;

-- CreateIndex
CREATE INDEX "DirectMessage_conversationId_inviteRoomId_inviteStatus_idx" ON "DirectMessage"("conversationId", "inviteRoomId", "inviteStatus");
