-- Seri numarası tekilliği artık KISMİ: iptal edilen kayıtlar numarayı tutmuyor.
--
-- Bildirilen hata: yanlış girilen faturayı iptal edip doğrusunu aynı
-- IMEI'lerle girmek mümkün değildi. İptal, kaydı silmiyor (denetim izi
-- kalsın diye durumu IPTAL oluyor) ve seri numarası alan üzerinde genel
-- benzersiz olduğu için numara iptal edilen kayıtta asılı kalıyordu. Aynı
-- sorun fatura numarasında daha önce görülüp çözülmüştü (kayitIptali.ts,
-- iptalliFaturaNo); seri numarası gözden kaçmış.
--
-- DİKKAT: Prisma kısmi dizini şemada ifade edemiyor. `prisma migrate dev`
-- ileride bunu "şemada olmayan dizin" diye bildirip düşürmeyi önerebilir —
-- KABUL ETMEYİN. Düşerse aktif cihazlarda aynı IMEI iki kez girilebilir hale
-- gelir. Göçler sunucuda `migrate deploy` ile uygulanıyor, orası dizine
-- dokunmuyor.

-- DropIndex
DROP INDEX "StokKalemi_seriNo_key";

-- CreateIndex
CREATE INDEX "StokKalemi_seriNo_idx" ON "StokKalemi"("seriNo");

-- CreateIndex: aktif kayıtlarda seri numarası hâlâ tekil.
CREATE UNIQUE INDEX "StokKalemi_seriNo_aktif_key"
  ON "StokKalemi"("seriNo")
  WHERE "seriNo" IS NOT NULL AND "durum" <> 'IPTAL';
