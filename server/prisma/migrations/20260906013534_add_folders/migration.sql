-- CreateTable
CREATE TABLE "folders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "folders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cards" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "folder_id" INTEGER,
    "title" TEXT NOT NULL,
    "general" TEXT NOT NULL,
    "card_name" TEXT,
    "tribe_name" TEXT,
    "species" TEXT,
    "uniqueness" TEXT,
    "class" TEXT,
    "personality" TEXT,
    "size" TEXT,
    "life" TEXT,
    "move" TEXT,
    "range" TEXT,
    "attack" TEXT,
    "defense" TEXT,
    "points" TEXT,
    "theme_primary_hex" TEXT,
    "theme_secondary_hex" TEXT,
    "theme_background_hex" TEXT,
    "hitbox_json" TEXT,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cards_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_cards" ("attack", "card_name", "class", "created_at", "defense", "general", "hitbox_json", "id", "life", "move", "personality", "points", "range", "schema_version", "size", "species", "theme_background_hex", "theme_primary_hex", "theme_secondary_hex", "title", "tribe_name", "uniqueness", "updated_at", "user_id") SELECT "attack", "card_name", "class", "created_at", "defense", "general", "hitbox_json", "id", "life", "move", "personality", "points", "range", "schema_version", "size", "species", "theme_background_hex", "theme_primary_hex", "theme_secondary_hex", "title", "tribe_name", "uniqueness", "updated_at", "user_id" FROM "cards";
DROP TABLE "cards";
ALTER TABLE "new_cards" RENAME TO "cards";
CREATE INDEX "cards_user_id_folder_id_idx" ON "cards"("user_id", "folder_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "folders_user_id_parent_id_idx" ON "folders"("user_id", "parent_id");

