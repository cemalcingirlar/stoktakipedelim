-- Çıkışta oturumun gerçekten kapanması.
--
-- Çıkış yalnız çerezi siliyordu; jeton (JWT) kendi başına 12 saat geçerli
-- kaldığı için kopyalanmış bir çerez çıkıştan sonra da çalışıyordu. Ortak
-- tezgâh bilgisayarlarında bu gerçek bir senaryo.
--
-- İki mekanizma:
--   IptalJeton              — çıkış yapılan TEK jeton geçersiz olur.
--   Kullanici.oturumSifirlama — "tüm cihazlardan çık": bu andan önce
--                               üretilmiş bütün jetonlar geçersiz olur.
--
-- Tablo yeniden kurulmuyor (ALTER TABLE ADD COLUMN), kısmi benzersiz dizin
-- etkilenmiyor.

-- AlterTable
ALTER TABLE "Kullanici" ADD COLUMN "oturumSifirlama" DATETIME;

-- CreateTable
CREATE TABLE "IptalJeton" (
    "jti" TEXT NOT NULL PRIMARY KEY,
    "kullaniciId" INTEGER NOT NULL,
    "bitis" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "IptalJeton_bitis_idx" ON "IptalJeton"("bitis");
