-- CreateTable
CREATE TABLE "AktarimSatisi" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stokKalemiId" INTEGER NOT NULL,
    "magazaId" INTEGER NOT NULL,
    "musteriId" INTEGER,
    "satanKullaniciId" INTEGER NOT NULL,
    "satisFiyatiKurus" INTEGER NOT NULL,
    "maliyetKurus" INTEGER NOT NULL,
    "yeniAlisFiyatiKurus" INTEGER NOT NULL,
    "odemeTipi" TEXT NOT NULL,
    "satisTarihi" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "not" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AktarimSatisi_stokKalemiId_fkey" FOREIGN KEY ("stokKalemiId") REFERENCES "StokKalemi" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AktarimSatisi_magazaId_fkey" FOREIGN KEY ("magazaId") REFERENCES "Magaza" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AktarimSatisi_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AktarimSatisi_satanKullaniciId_fkey" FOREIGN KEY ("satanKullaniciId") REFERENCES "Kullanici" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AktarimSatisi_satisTarihi_idx" ON "AktarimSatisi"("satisTarihi");

-- CreateIndex
CREATE INDEX "AktarimSatisi_magazaId_satisTarihi_idx" ON "AktarimSatisi"("magazaId", "satisTarihi");

-- CreateIndex
CREATE INDEX "AktarimSatisi_satanKullaniciId_satisTarihi_idx" ON "AktarimSatisi"("satanKullaniciId", "satisTarihi");

-- CreateIndex
CREATE INDEX "AktarimSatisi_stokKalemiId_idx" ON "AktarimSatisi"("stokKalemiId");
