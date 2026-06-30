-- CreateTable
CREATE TABLE "PushJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "PushJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDelivery" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clickedAt" TIMESTAMP(3),

    CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushJob_status_nextAttemptAt_idx" ON "PushJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PushJob_dedupeKey_idx" ON "PushJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "PushJob_userId_idx" ON "PushJob"("userId");

-- CreateIndex
CREATE INDEX "PushDelivery_type_sentAt_idx" ON "PushDelivery"("type", "sentAt");

-- CreateIndex
CREATE INDEX "PushDelivery_userId_idx" ON "PushDelivery"("userId");

-- CreateIndex
CREATE INDEX "PushDelivery_status_sentAt_idx" ON "PushDelivery"("status", "sentAt");
