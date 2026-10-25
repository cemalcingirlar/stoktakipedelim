-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AlisFaturasi" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "faturaNo" TEXT NOT NULL,
    "faturaTarihi" DATETIME NOT NULL,
    "tedarikciId" INTEGER NOT NULL,
    "magazaId" INTEGER NOT NULL,
    "vadeGun" INTEGER NOT NULL DEFAULT 0,
    "vadeTarihi" DATETIME,
    "vadeOdendi" BOOLEAN NOT NULL DEFAULT false,
    "odemeTarihi" DATETIME,
    "not" TEXT,
    "olusturanId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iptalEdildi" BOOLEAN NOT NULL DEFAULT false,
    "iptalTarihi" DATETIME,
    "iptalGerekce" TEXT,
    "iptalEdenId" INTEGER,
    CONSTRAINT "AlisFaturasi_tedarikciId_fkey" FOREIGN KEY ("tedarikciId") REFERENCES "Tedarikci" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AlisFaturasi_magazaId_fkey" FOREIGN KEY ("magazaId") REFERENCES "Magaza" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AlisFaturasi_olusturanId_fkey" FOREIGN KEY ("olusturanId") REFERENCES "Kullanici" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AlisFaturasi_iptalEdenId_fkey" FOREIGN KEY ("iptalEdenId") REFERENCES "Kullanici" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AlisFaturasi" ("createdAt", "faturaNo", "faturaTarihi", "id", "magazaId", "not", "odemeTarihi", "olusturanId", "tedarikciId", "vadeGun", "vadeOdendi", "vadeTarihi") SELECT "createdAt", "faturaNo", "faturaTarihi", "id", "magazaId", "not", "odemeTarihi", "olusturanId", "tedarikciId", "vadeGun", "vadeOdendi", "vadeTarihi" FROM "AlisFaturasi";
DROP TABLE "AlisFaturasi";
ALTER TABLE "new_AlisFaturasi" RENAME TO "AlisFaturasi";
CREATE INDEX "AlisFaturasi_iptalEdildi_idx" ON "AlisFaturasi"("iptalEdildi");
CREATE INDEX "AlisFaturasi_vadeTarihi_idx" ON "AlisFaturasi"("vadeTarihi");
CREATE INDEX "AlisFaturasi_faturaTarihi_idx" ON "AlisFaturasi"("faturaTarihi");
CREATE UNIQUE INDEX "AlisFaturasi_tedarikciId_faturaNo_key" ON "AlisFaturasi"("tedarikciId", "faturaNo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
