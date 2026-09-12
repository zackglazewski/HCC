-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_card_images" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "card_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "scale" REAL NOT NULL,
    "rotation" REAL,
    "name" TEXT,
    "blob" BLOB,
    "object_key" TEXT,
    "mime" TEXT,
    "size_bytes" INTEGER,
    "sha256" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "card_images_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_card_images" ("blob", "card_id", "created_at", "id", "name", "order", "rotation", "scale", "x", "y") SELECT "blob", "card_id", "created_at", "id", "name", "order", "rotation", "scale", "x", "y" FROM "card_images";
DROP TABLE "card_images";
ALTER TABLE "new_card_images" RENAME TO "card_images";
CREATE INDEX "card_images_object_key_idx" ON "card_images"("object_key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

