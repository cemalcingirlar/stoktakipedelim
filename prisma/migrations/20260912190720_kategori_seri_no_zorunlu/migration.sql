-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Kategori" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ad" TEXT NOT NULL,
    "sira" INTEGER NOT NULL DEFAULT 0,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "seriNoZorunlu" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Kategori" ("ad", "aktif", "id", "sira") SELECT "ad", "aktif", "id", "sira" FROM "Kategori";
DROP TABLE "Kategori";
ALTER TABLE "new_Kategori" RENAME TO "Kategori";
CREATE UNIQUE INDEX "Kategori_ad_key" ON "Kategori"("ad");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
