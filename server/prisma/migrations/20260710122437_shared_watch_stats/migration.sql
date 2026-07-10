-- CreateTable
CREATE TABLE "SharedWatchStat" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "totalSeconds" INTEGER NOT NULL DEFAULT 0,
    "sessionsCount" INTEGER NOT NULL DEFAULT 0,
    "longestSessionSeconds" INTEGER NOT NULL DEFAULT 0,
    "firstWatchedAt" TIMESTAMP(3),
    "lastWatchedAt" TIMESTAMP(3),

    CONSTRAINT "SharedWatchStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedWatchStat_userBId_idx" ON "SharedWatchStat"("userBId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedWatchStat_userAId_userBId_key" ON "SharedWatchStat"("userAId", "userBId");

-- AddForeignKey
ALTER TABLE "SharedWatchStat" ADD CONSTRAINT "SharedWatchStat_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedWatchStat" ADD CONSTRAINT "SharedWatchStat_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
