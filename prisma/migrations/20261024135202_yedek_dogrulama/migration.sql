-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Yedek" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dosyaAdi" TEXT NOT NULL,
    "boyutBayt" INTEGER NOT NULL DEFAULT 0,
    "driveDosyaId" TEXT,
    "durum" TEXT NOT NULL,
    "hata" TEXT,
    "tarih" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dogrulandi" BOOLEAN NOT NULL DEFAULT false,
    "dogrulama" TEXT,
    "uzakBoyutBayt" INTEGER
);
INSERT INTO "new_Yedek" ("boyutBayt", "dosyaAdi", "driveDosyaId", "durum", "hata", "id", "tarih") SELECT "boyutBayt", "dosyaAdi", "driveDosyaId", "durum", "hata", "id", "tarih" FROM "Yedek";
DROP TABLE "Yedek";
ALTER TABLE "new_Yedek" RENAME TO "Yedek";
CREATE INDEX "Yedek_tarih_idx" ON "Yedek"("tarih");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
