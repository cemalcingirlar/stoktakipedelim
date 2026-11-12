-- Hareketsiz kalan oturumun kapanması.
--
-- Oturum jetonu 12 saat geçerli ve kendi başına duruyor: mağazada açık
-- bırakılan ekran, kimse dokunmasa da 12 saat boyunca işlem yapabiliyordu.
-- Hareketsizliği ölçmek için oturumun son etkinlik anı sunucuda tutulmalı;
-- jetonun içine yazılamaz (her istekte çerez yenilemek gerekirdi).
--
-- Kayıt jeton başına (jti): aynı kişinin telefonu açık diye tezgâhtaki
-- ekranın oturumu canlı kalmamalı.
--
-- Yeni tablo; mevcut tablolar yeniden kurulmuyor, kısmi benzersiz dizin
-- etkilenmiyor.

-- CreateTable
CREATE TABLE "OturumEtkinligi" (
    "jti" TEXT NOT NULL PRIMARY KEY,
    "sonEtkinlik" DATETIME NOT NULL,
    "bitis" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "OturumEtkinligi_bitis_idx" ON "OturumEtkinligi"("bitis");
