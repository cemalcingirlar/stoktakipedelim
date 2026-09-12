import { YakindaKarti } from "@/bilesenler/YakindaKarti";
import { oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Cihazlar — Stok Takip" };

export default async function CihazlarSayfasi() {
  await oturumGerekli();
  return (
    <YakindaKarti
      baslik="Cihazlar"
      faz="Faz 2"
      maddeler={[
        "Her fiziksel cihaz için tek satır: barkod, seri no (IMEI), marka, model, renk, kapasite",
        "Durum, depo, kategori/alt kategori, alış ve satış tarihi filtreleri",
        "Vadesi geçen satırlar kırmızı, 7 gün kalanlar sarı",
        "Arama kutusuna tam IMEI/barkod girildiğinde doğrudan cihaz detayına yönlendirme",
        "Sütun seçici ve aktif filtreye göre Excel çıktısı",
        "Cihaz detayında sevkiyat tarihçesi ve işlem logları",
      ]}
    />
  );
}
