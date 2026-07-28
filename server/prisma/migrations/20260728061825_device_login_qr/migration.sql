-- CreateTable
CREATE TABLE "DeviceLoginRequest" (
    "id" TEXT NOT NULL,
    "pollTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userId" TEXT,
    "token" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceLoginRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceLoginRequest_pollTokenHash_key" ON "DeviceLoginRequest"("pollTokenHash");

-- CreateIndex
CREATE INDEX "DeviceLoginRequest_userId_idx" ON "DeviceLoginRequest"("userId");

-- CreateIndex
CREATE INDEX "DeviceLoginRequest_expiresAt_idx" ON "DeviceLoginRequest"("expiresAt");

-- AddForeignKey
ALTER TABLE "DeviceLoginRequest" ADD CONSTRAINT "DeviceLoginRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
