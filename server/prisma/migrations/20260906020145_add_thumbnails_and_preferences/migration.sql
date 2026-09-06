-- AlterTable
ALTER TABLE "users" ADD COLUMN "preferences" TEXT;

-- CreateTable
CREATE TABLE "card_thumbnails" (
    "card_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mime" TEXT NOT NULL,
    "blob" BLOB NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "card_thumbnails_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

