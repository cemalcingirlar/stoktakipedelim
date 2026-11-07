-- Eksik dizinler.
--
-- EXPLAIN QUERY PLAN ile ölçüldü: aşağıdaki sorgular tabloyu tarıyordu.
-- 44.000 cihazlık veriyle sorgu başına ölçüm (önce → sonra):
--   müşteri kartı (bir müşterinin alımları)   3,23 ms → 0,10 ms
--   müşteriler listesi toplaması              4,97 ms → 1,87 ms
--   panel/satış: son 10 satış                 4,55 ms → 0,00 ms
--   fatura detayı (kalemleri)                 1,56 ms → 0,00 ms
--
-- DİKKAT: Bu göç tabloyu YENİDEN KURMUYOR, yalnız dizin ekliyor. Kısmi
-- benzersiz dizin (StokKalemi_seriNo_aktif_key) bu yüzden korunuyor;
-- StokKalemi'yi yeniden kuran bir göç yazılırsa o dizin elle yeniden
-- kurulmalı (bkz. 20261106190807_satis_karti).

-- CreateIndex
CREATE INDEX "StokKalemi_musteriId_idx" ON "StokKalemi"("musteriId");

-- CreateIndex
CREATE INDEX "StokKalemi_alisFaturasiId_idx" ON "StokKalemi"("alisFaturasiId");

-- CreateIndex
CREATE INDEX "StokKalemi_iceAktarimId_idx" ON "StokKalemi"("iceAktarimId");

-- CreateIndex
CREATE INDEX "StokKalemi_tedarikciId_idx" ON "StokKalemi"("tedarikciId");

-- CreateIndex
CREATE INDEX "StokKalemi_durum_satisTarihi_idx" ON "StokKalemi"("durum", "satisTarihi");

-- CreateIndex
CREATE INDEX "AktarimSatisi_musteriId_idx" ON "AktarimSatisi"("musteriId");

-- SQLite'ın sorgu planlayıcısı istatistik olmadan dizin seçimini tahminle
-- yapıyor. ANALYZE bir kez çalışınca sqlite_stat1 doluyor ve plan gerçek
-- dağılıma göre seçiliyor. Güncelleme betiği her dağıtımda tazeliyor.
ANALYZE;
