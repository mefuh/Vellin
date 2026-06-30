-- CreateTable
CREATE TABLE "PushBroadcast" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "audienceJson" TEXT NOT NULL DEFAULT '{}',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '/',
    "totalTargets" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushBroadcast_createdAt_idx" ON "PushBroadcast"("createdAt");
