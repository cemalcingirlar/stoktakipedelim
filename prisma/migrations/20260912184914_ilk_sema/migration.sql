-- CreateTable
CREATE TABLE "Magaza" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kod" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "adres" TEXT,
    "telefon" TEXT,
    "merkezMi" BOOLEAN NOT NULL DEFAULT false,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Kullanici" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kullaniciAdi" TEXT NOT NULL,
    "adSoyad" TEXT NOT NULL,
    "sifreHash" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "magazaId" INTEGER,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "sutunTercihi" TEXT,
    "sonGiris" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Kullanici_magazaId_fkey" FOREIGN KEY ("magazaId") REFERENCES "Magaza" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Kategori" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ad" TEXT NOT NULL,
    "sira" INTEGER NOT NULL DEFAULT 0,
    "aktif" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "AltKategori" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kategoriId" INTEGER NOT NULL,
    "ad" TEXT NOT NULL,
    "sira" INTEGER NOT NULL DEFAULT 0,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "AltKategori_kategoriId_fkey" FOREIGN KEY ("kategoriId") REFERENCES "Kategori" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tedarikci" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ad" TEXT NOT NULL,
    "telefon" TEXT,
    "vergiNo" TEXT,
    "adres" TEXT,
    "not" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Musteri" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "adSoyad" TEXT NOT NULL,
    "telefon" TEXT,
    "tcknVkn" TEXT,
    "adres" TEXT,
    "not" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AlisFaturasi" (
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
    CONSTRAINT "AlisFaturasi_tedarikciId_fkey" FOREIGN KEY ("tedarikciId") REFERENCES "Tedarikci" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AlisFaturasi_magazaId_fkey" FOREIGN KEY ("magazaId") REFERENCES "Magaza" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AlisFaturasi_olusturanId_fkey" FOREIGN KEY ("olusturanId") REFERENCES "Kullanici" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StokKalemi" (
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

-- CreateTable
CREATE TABLE "StokHareketi" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stokKalemiId" INTEGER NOT NULL,
    "tip" TEXT NOT NULL,
    "kaynakMagazaId" INTEGER,
    "hedefMagazaId" INTEGER,
    "kullaniciId" INTEGER NOT NULL,
    "transferId" INTEGER,
    "aciklama" TEXT,
    "tarih" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StokHareketi_stokKalemiId_fkey" FOREIGN KEY ("stokKalemiId") REFERENCES "StokKalemi" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StokHareketi_kaynakMagazaId_fkey" FOREIGN KEY ("kaynakMagazaId") REFERENCES "Magaza" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StokHareketi_hedefMagazaId_fkey" FOREIGN KEY ("hedefMagazaId") REFERENCES "Magaza" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StokHareketi_kullaniciId_fkey" FOREIGN KEY ("kullaniciId") REFERENCES "Kullanici" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StokHareketi_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transferNo" TEXT NOT NULL,
    "kaynakMagazaId" INTEGER NOT NULL,
    "hedefMagazaId" INTEGER NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "gonderenId" INTEGER NOT NULL,
    "gonderimTarihi" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kabulEdenId" INTEGER,
    "kabulTarihi" DATETIME,
    "redNedeni" TEXT,
    "not" TEXT,
    CONSTRAINT "Transfer_kaynakMagazaId_fkey" FOREIGN KEY ("kaynakMagazaId") REFERENCES "Magaza" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transfer_hedefMagazaId_fkey" FOREIGN KEY ("hedefMagazaId") REFERENCES "Magaza" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transfer_gonderenId_fkey" FOREIGN KEY ("gonderenId") REFERENCES "Kullanici" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transfer_kabulEdenId_fkey" FOREIGN KEY ("kabulEdenId") REFERENCES "Kullanici" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransferKalemi" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transferId" INTEGER NOT NULL,
    "stokKalemiId" INTEGER NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "kabulTarihi" DATETIME,
    "not" TEXT,
    CONSTRAINT "TransferKalemi_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransferKalemi_stokKalemiId_fkey" FOREIGN KEY ("stokKalemiId") REFERENCES "StokKalemi" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sayim" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "magazaId" INTEGER NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'DEVAM',
    "baslangicTarihi" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bitisTarihi" DATETIME,
    "baslatanId" INTEGER NOT NULL,
    "kapatanId" INTEGER,
    "beklenenAdet" INTEGER NOT NULL DEFAULT 0,
    "not" TEXT,
    CONSTRAINT "Sayim_magazaId_fkey" FOREIGN KEY ("magazaId") REFERENCES "Magaza" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sayim_baslatanId_fkey" FOREIGN KEY ("baslatanId") REFERENCES "Kullanici" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sayim_kapatanId_fkey" FOREIGN KEY ("kapatanId") REFERENCES "Kullanici" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SayimKalemi" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sayimId" INTEGER NOT NULL,
    "stokKalemiId" INTEGER,
    "okutulanKod" TEXT,
    "beklenen" BOOLEAN NOT NULL DEFAULT true,
    "sayildi" BOOLEAN NOT NULL DEFAULT false,
    "sonuc" TEXT,
    "okutmaTarihi" DATETIME,
    "okutanId" INTEGER,
    "not" TEXT,
    CONSTRAINT "SayimKalemi_sayimId_fkey" FOREIGN KEY ("sayimId") REFERENCES "Sayim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SayimKalemi_stokKalemiId_fkey" FOREIGN KEY ("stokKalemiId") REFERENCES "StokKalemi" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SayimKalemi_okutanId_fkey" FOREIGN KEY ("okutanId") REFERENCES "Kullanici" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kullaniciId" INTEGER,
    "kullaniciAdi" TEXT NOT NULL,
    "islem" TEXT NOT NULL,
    "hedefTip" TEXT,
    "hedefId" INTEGER,
    "detay" TEXT,
    "ip" TEXT,
    "tarih" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Log_kullaniciId_fkey" FOREIGN KEY ("kullaniciId") REFERENCES "Kullanici" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ayar" (
    "anahtar" TEXT NOT NULL PRIMARY KEY,
    "deger" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Yedek" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dosyaAdi" TEXT NOT NULL,
    "boyutBayt" INTEGER NOT NULL DEFAULT 0,
    "driveDosyaId" TEXT,
    "durum" TEXT NOT NULL,
    "hata" TEXT,
    "tarih" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Magaza_kod_key" ON "Magaza"("kod");

-- CreateIndex
CREATE UNIQUE INDEX "Kullanici_kullaniciAdi_key" ON "Kullanici"("kullaniciAdi");

-- CreateIndex
CREATE INDEX "Kullanici_magazaId_idx" ON "Kullanici"("magazaId");

-- CreateIndex
CREATE UNIQUE INDEX "Kategori_ad_key" ON "Kategori"("ad");

-- CreateIndex
CREATE UNIQUE INDEX "AltKategori_kategoriId_ad_key" ON "AltKategori"("kategoriId", "ad");

-- CreateIndex
CREATE UNIQUE INDEX "Tedarikci_ad_key" ON "Tedarikci"("ad");

-- CreateIndex
CREATE INDEX "Musteri_telefon_idx" ON "Musteri"("telefon");

-- CreateIndex
CREATE INDEX "Musteri_adSoyad_idx" ON "Musteri"("adSoyad");

-- CreateIndex
CREATE INDEX "AlisFaturasi_vadeTarihi_idx" ON "AlisFaturasi"("vadeTarihi");

-- CreateIndex
CREATE INDEX "AlisFaturasi_faturaTarihi_idx" ON "AlisFaturasi"("faturaTarihi");

-- CreateIndex
CREATE UNIQUE INDEX "AlisFaturasi_tedarikciId_faturaNo_key" ON "AlisFaturasi"("tedarikciId", "faturaNo");

-- CreateIndex
CREATE UNIQUE INDEX "StokKalemi_seriNo_key" ON "StokKalemi"("seriNo");

-- CreateIndex
CREATE INDEX "StokKalemi_barkod_idx" ON "StokKalemi"("barkod");

-- CreateIndex
CREATE INDEX "StokKalemi_magazaId_durum_idx" ON "StokKalemi"("magazaId", "durum");

-- CreateIndex
CREATE INDEX "StokKalemi_durum_idx" ON "StokKalemi"("durum");

-- CreateIndex
CREATE INDEX "StokKalemi_kategoriId_idx" ON "StokKalemi"("kategoriId");

-- CreateIndex
CREATE INDEX "StokKalemi_girisTarihi_idx" ON "StokKalemi"("girisTarihi");

-- CreateIndex
CREATE INDEX "StokKalemi_satisTarihi_idx" ON "StokKalemi"("satisTarihi");

-- CreateIndex
CREATE INDEX "StokKalemi_model_idx" ON "StokKalemi"("model");

-- CreateIndex
CREATE INDEX "StokHareketi_stokKalemiId_tarih_idx" ON "StokHareketi"("stokKalemiId", "tarih");

-- CreateIndex
CREATE INDEX "StokHareketi_tarih_idx" ON "StokHareketi"("tarih");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_transferNo_key" ON "Transfer"("transferNo");

-- CreateIndex
CREATE INDEX "Transfer_hedefMagazaId_durum_idx" ON "Transfer"("hedefMagazaId", "durum");

-- CreateIndex
CREATE INDEX "Transfer_kaynakMagazaId_durum_idx" ON "Transfer"("kaynakMagazaId", "durum");

-- CreateIndex
CREATE UNIQUE INDEX "TransferKalemi_transferId_stokKalemiId_key" ON "TransferKalemi"("transferId", "stokKalemiId");

-- CreateIndex
CREATE INDEX "Sayim_magazaId_durum_idx" ON "Sayim"("magazaId", "durum");

-- CreateIndex
CREATE INDEX "SayimKalemi_sayimId_sayildi_idx" ON "SayimKalemi"("sayimId", "sayildi");

-- CreateIndex
CREATE UNIQUE INDEX "SayimKalemi_sayimId_stokKalemiId_key" ON "SayimKalemi"("sayimId", "stokKalemiId");

-- CreateIndex
CREATE INDEX "Log_tarih_idx" ON "Log"("tarih");

-- CreateIndex
CREATE INDEX "Log_kullaniciId_idx" ON "Log"("kullaniciId");

-- CreateIndex
CREATE INDEX "Log_islem_idx" ON "Log"("islem");

-- CreateIndex
CREATE INDEX "Yedek_tarih_idx" ON "Yedek"("tarih");
