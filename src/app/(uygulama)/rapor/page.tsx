import { YakindaKarti } from "@/bilesenler/YakindaKarti";
import { oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Rapor — Stok Takip" };

export default async function RaporSayfasi() {
  await oturumGerekli();
  return (
    <YakindaKarti
      baslik="Raporlar"
      faz="Faz 5"
      maddeler={[
        "Mağaza bazlı stok ve stok değeri",
        "Vadesi geçen ve yaklaşan faturalar",
        "Tarih aralıklı giriş-çıkış hareketleri",
        "Satış ve kâr raporu (mağaza, kullanıcı, kategori kırılımı)",
        "Transfer ve sayım raporları",
        "Tüm raporlarda sütun seçmeli Excel çıktısı",
      ]}
    />
  );
}
