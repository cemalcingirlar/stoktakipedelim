-- Satış kartı: bir satışta birden çok cihaz olabiliyor, hangilerinin birlikte
-- satıldığı artık ortak bir Satis kaydında duruyor.
--
-- DİKKAT: Aşağıdaki RedefineTables bloğu StokKalemi'yi yeniden kuruyor ve
-- Prisma'nın şemada göremediği KISMİ benzersiz dizini
-- (StokKalemi_seriNo_aktif_key) düşürüyor. Dizin blok sonunda yeniden
-- kuruluyor. StokKalemi'yi yeniden kuran HER göçte aynısı yapılmalı; yoksa
-- aktif cihazlarda aynı IMEI iki kez girilebilir hale gelir.
-- betikler/fatura-geri-al-dogrula.mjs dizinin varlığını denetliyor.

-- CreateTable
CREATE TABLE "Satis" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "satisNo" TEXT NOT NULL,
    "musteriId" INTEGER NOT NULL,
    "satanKullaniciId" INTEGER NOT NULL,
    "odemeTipi" TEXT NOT NULL,
    "satisTarihi" DATETIME NOT NULL,
    "not" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Satis_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Satis_satanKullaniciId_fkey" FOREIGN KEY ("satanKullaniciId") REFERENCES "Kullanici" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
    "satisId" INTEGER,
    "iceAktarimId" INTEGER,
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
    CONSTRAINT "StokKalemi_satisId_fkey" FOREIGN KEY ("satisId") REFERENCES "Satis" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StokKalemi_iceAktarimId_fkey" FOREIGN KEY ("iceAktarimId") REFERENCES "IceAktarim" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StokKalemi_tedarikciId_fkey" FOREIGN KEY ("tedarikciId") REFERENCES "Tedarikci" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StokKalemi_magazaId_fkey" FOREIGN KEY ("magazaId") REFERENCES "Magaza" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StokKalemi_satanKullaniciId_fkey" FOREIGN KEY ("satanKullaniciId") REFERENCES "Kullanici" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StokKalemi_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StokKalemi" ("alisFaturasiId", "alisFiyatiKurus", "altKategoriId", "aramaMetni", "barkod", "cikisTarihi", "createdAt", "durum", "girisTarihi", "iceAktarimId", "id", "kapasite", "kategoriId", "magazaId", "marka", "model", "musteriId", "not", "odemeTipi", "renk", "satanKullaniciId", "satisFiyatiKurus", "satisTarihi", "seriNo", "tedarikciId", "updatedAt") SELECT "alisFaturasiId", "alisFiyatiKurus", "altKategoriId", "aramaMetni", "barkod", "cikisTarihi", "createdAt", "durum", "girisTarihi", "iceAktarimId", "id", "kapasite", "kategoriId", "magazaId", "marka", "model", "musteriId", "not", "odemeTipi", "renk", "satanKullaniciId", "satisFiyatiKurus", "satisTarihi", "seriNo", "tedarikciId", "updatedAt" FROM "StokKalemi";
DROP TABLE "StokKalemi";
ALTER TABLE "new_StokKalemi" RENAME TO "StokKalemi";
CREATE INDEX "StokKalemi_barkod_idx" ON "StokKalemi"("barkod");
CREATE INDEX "StokKalemi_seriNo_idx" ON "StokKalemi"("seriNo");
CREATE INDEX "StokKalemi_satisId_idx" ON "StokKalemi"("satisId");
CREATE INDEX "StokKalemi_aramaMetni_idx" ON "StokKalemi"("aramaMetni");
CREATE INDEX "StokKalemi_magazaId_durum_idx" ON "StokKalemi"("magazaId", "durum");
CREATE INDEX "StokKalemi_durum_idx" ON "StokKalemi"("durum");
CREATE INDEX "StokKalemi_kategoriId_idx" ON "StokKalemi"("kategoriId");
CREATE INDEX "StokKalemi_girisTarihi_idx" ON "StokKalemi"("girisTarihi");
CREATE INDEX "StokKalemi_satisTarihi_idx" ON "StokKalemi"("satisTarihi");
CREATE INDEX "StokKalemi_model_idx" ON "StokKalemi"("model");
-- Kısmi benzersiz dizin yeniden kuruluyor: tablo yeniden kurulurken düştü.
-- Aktif kayıtlarda seri numarası tekil, iptal edilenler numarayı tutmuyor
-- (20261104115333_iptalde_seri_no_serbest).
CREATE UNIQUE INDEX "StokKalemi_seriNo_aktif_key"
  ON "StokKalemi"("seriNo")
  WHERE "seriNo" IS NOT NULL AND "durum" <> 'IPTAL';

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Satis_satisNo_key" ON "Satis"("satisNo");

-- CreateIndex
CREATE INDEX "Satis_satisTarihi_idx" ON "Satis"("satisTarihi");

-- CreateIndex
CREATE INDEX "Satis_musteriId_idx" ON "Satis"("musteriId");

-- CreateIndex
CREATE INDEX "Satis_satanKullaniciId_satisTarihi_idx" ON "Satis"("satanKullaniciId", "satisTarihi");

-- Mevcut satışları ortak kayda topla.
--
-- Eskiden satış kaydı yoktu; müşteri, satan, ödeme tipi ve tarih cihazın
-- kendi satırındaydı. Aynı anda satılan cihazlar bu dördü de aynı olanlar.
-- Satış tarihi gün hassasiyetinde olduğu için, aynı güne ait iki AYRI satış
-- (aynı müşteri, aynı satıcı, aynı ödeme tipi) tek kartta birleşir — eldeki
-- veriden daha iyisi çıkarılamıyor. Bundan sonraki satışlar ayrı kaydediliyor.
INSERT INTO "Satis" ("satisNo", "musteriId", "satanKullaniciId", "odemeTipi", "satisTarihi", "createdAt")
SELECT
  'SAT-' || strftime('%Y%m%d', "satisTarihi") || '-E' ||
    printf('%04d', ROW_NUMBER() OVER (
      PARTITION BY date("satisTarihi")
      ORDER BY "satisTarihi", "musteriId", "satanKullaniciId", "odemeTipi"
    )),
  "musteriId",
  "satanKullaniciId",
  COALESCE("odemeTipi", 'NAKIT'),
  "satisTarihi",
  CURRENT_TIMESTAMP
FROM "StokKalemi"
WHERE "durum" = 'SATILDI'
  AND "musteriId" IS NOT NULL
  AND "satanKullaniciId" IS NOT NULL
  AND "satisTarihi" IS NOT NULL
GROUP BY "musteriId", "satanKullaniciId", COALESCE("odemeTipi", 'NAKIT'), "satisTarihi";

UPDATE "StokKalemi"
SET "satisId" = (
  SELECT "Satis"."id" FROM "Satis"
  WHERE "Satis"."musteriId" = "StokKalemi"."musteriId"
    AND "Satis"."satanKullaniciId" = "StokKalemi"."satanKullaniciId"
    AND "Satis"."odemeTipi" = COALESCE("StokKalemi"."odemeTipi", 'NAKIT')
    AND "Satis"."satisTarihi" = "StokKalemi"."satisTarihi"
)
WHERE "durum" = 'SATILDI'
  AND "musteriId" IS NOT NULL
  AND "satanKullaniciId" IS NOT NULL
  AND "satisTarihi" IS NOT NULL;
