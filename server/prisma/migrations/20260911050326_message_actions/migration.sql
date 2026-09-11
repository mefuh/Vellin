-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "pinnedMessageId" TEXT;

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "forwardedFromId" TEXT,
ADD COLUMN     "forwardedFromName" TEXT,
ADD COLUMN     "hiddenFor" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "replyToId" TEXT;
