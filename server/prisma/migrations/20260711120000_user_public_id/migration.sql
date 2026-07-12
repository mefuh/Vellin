-- Публичный id пользователя для URL профиля/диалога.
-- Добавляем nullable, бэкфиллим существующих, затем NOT NULL + UNIQUE.
ALTER TABLE "User" ADD COLUMN "publicId" TEXT;

-- Бэкфилл: 14 hex-символов из случайного UUID (url-safe, практически уникальны).
UPDATE "User" SET "publicId" = substr(replace(gen_random_uuid()::text, '-', ''), 1, 14) WHERE "publicId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "publicId" SET NOT NULL;

CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");
