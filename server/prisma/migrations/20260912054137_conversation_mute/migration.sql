-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "aMuted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bMuted" BOOLEAN NOT NULL DEFAULT false;
