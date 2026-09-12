-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StokKalemi" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barkod" TEXT,
    "seriNo" TEXT,
    "kategoriId" INTEGER NOT NULL,
    "altKategoriId" INTEGER,
    "marka" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "renk" TEXT,
    "kapasite" TEXT,
    "alisFaturasiId" INTEGER,
    "tedarikciId" INTEGER,
    "alisFiyatiKurus" INTEGER NOT NULL DEFAULT 0,
    "girisTarihi" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "magazaId" INTEGER NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'STOKTA',
    "satisTarihi" DATETIME,
    "satisFiyatiKurus" INTEGER,
    "satanKullaniciId" INTEGER,
    "musteriId" INTEGER,
    "odemeTipi" TEXT,
    "cikisTarihi" DATETIME,
    "not" TEXT,
    "aramaMetni" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StokKalemi_kategoriId_fkey" FOREIGN KEY ("kategoriId") REFERENCES "Kategori" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StokKalemi_altKategoriId_fkey" FOREIGN KEY ("altKategoriId") REFERENCES "AltKategori" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StokKalemi_alisFaturasiId_fkey" FOREIGN KEY ("alisFaturasiId") REFERENCES "AlisFaturasi" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StokKalemi_tedarikciId_fkey" FOREIGN KEY ("tedarikciId") REFERENCES "Tedarikci" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StokKalemi_magazaId_fkey" FOREIGN KEY ("magazaId") REFERENCES "Magaza" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StokKalemi_satanKullaniciId_fkey" FOREIGN KEY ("satanKullaniciId") REFERENCES "Kullanici" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StokKalemi_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StokKalemi" ("alisFaturasiId", "alisFiyatiKurus", "altKategoriId", "barkod", "cikisTarihi", "createdAt", "durum", "girisTarihi", "id", "kapasite", "kategoriId", "magazaId", "marka", "model", "musteriId", "not", "odemeTipi", "renk", "satanKullaniciId", "satisFiyatiKurus", "satisTarihi", "seriNo", "tedarikciId", "updatedAt") SELECT "alisFaturasiId", "alisFiyatiKurus", "altKategoriId", "barkod", "cikisTarihi", "createdAt", "durum", "girisTarihi", "id", "kapasite", "kategoriId", "magazaId", "marka", "model", "musteriId", "not", "odemeTipi", "renk", "satanKullaniciId", "satisFiyatiKurus", "satisTarihi", "seriNo", "tedarikciId", "updatedAt" FROM "StokKalemi";
DROP TABLE "StokKalemi";
ALTER TABLE "new_StokKalemi" RENAME TO "StokKalemi";
CREATE UNIQUE INDEX "StokKalemi_seriNo_key" ON "StokKalemi"("seriNo");
CREATE INDEX "StokKalemi_barkod_idx" ON "StokKalemi"("barkod");
CREATE INDEX "StokKalemi_aramaMetni_idx" ON "StokKalemi"("aramaMetni");
CREATE INDEX "StokKalemi_magazaId_durum_idx" ON "StokKalemi"("magazaId", "durum");
CREATE INDEX "StokKalemi_durum_idx" ON "StokKalemi"("durum");
CREATE INDEX "StokKalemi_kategoriId_idx" ON "StokKalemi"("kategoriId");
CREATE INDEX "StokKalemi_girisTarihi_idx" ON "StokKalemi"("girisTarihi");
CREATE INDEX "StokKalemi_satisTarihi_idx" ON "StokKalemi"("satisTarihi");
CREATE INDEX "StokKalemi_model_idx" ON "StokKalemi"("model");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
