-- CreateTable
CREATE TABLE "FavoriteTitle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kpId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalTitle" TEXT,
    "year" INTEGER,
    "posterUrl" TEXT,
    "ratingKp" DOUBLE PRECISION,
    "ratingImdb" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteTitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavoriteTitle_userId_idx" ON "FavoriteTitle"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteTitle_userId_position_key" ON "FavoriteTitle"("userId", "position");

-- AddForeignKey
ALTER TABLE "FavoriteTitle" ADD CONSTRAINT "FavoriteTitle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
