-- Panel sorguları için kapsayan dizinler.
--
-- Ölçüldü (90 bin cihaz, 60 bin satış): panel 378 ms sürüyordu ve sürenin
-- çoğu üç gruplamadaydı. Hepsi tabloyu satır satır geziyordu, çünkü dizinde
-- yalnız süzme sütunları vardı; toplanan tutar ve gruplanan marka/model için
-- her satırda tabloya gidiliyordu. Sütunlar dizine eklenince sorgu yalnız
-- dizini okuyor:
--
--   grafik, satışlar gün gün    53.5 ms -> 21.8 ms
--   grafik, girişler gün gün    47.0 ms -> 15.8 ms
--   en çok satanlar (tümü)      85.6 ms -> 39.7 ms
--   stokta en çok bulunanlar    18.0 ms -> 11.2 ms
--
-- Bedeli: veritabanı 90 bin cihazda ~7 MB büyüyor, her cihaz yazımında üç
-- dizin daha güncelleniyor. Günde birkaç yüz yazım için ölçülemez.
--
-- İki eski dizin yenilerinin öneki olduğu için kaldırılıyor
-- (durum+satisTarihi ve girisTarihi): aynı aramaları yenileri karşılıyor.
--
-- Yalnız CREATE/DROP INDEX: tablo yeniden kurulmuyor, kısmi benzersiz dizin
-- (StokKalemi_seriNo_aktif_key) etkilenmiyor.

-- DropIndex
DROP INDEX IF EXISTS "StokKalemi_durum_satisTarihi_idx";

-- DropIndex
DROP INDEX IF EXISTS "StokKalemi_girisTarihi_idx";

-- CreateIndex
CREATE INDEX "StokKalemi_durum_satisTarihi_magazaId_marka_model_satisFiyatiKurus_idx" ON "StokKalemi"("durum", "satisTarihi", "magazaId", "marka", "model", "satisFiyatiKurus");

-- CreateIndex
CREATE INDEX "StokKalemi_girisTarihi_magazaId_alisFiyatiKurus_idx" ON "StokKalemi"("girisTarihi", "magazaId", "alisFiyatiKurus");

-- CreateIndex
CREATE INDEX "StokKalemi_durum_magazaId_marka_model_alisFiyatiKurus_idx" ON "StokKalemi"("durum", "magazaId", "marka", "model", "alisFiyatiKurus");

-- İstatistikler: planlayıcı yeni dizinleri seçebilsin.
ANALYZE;
