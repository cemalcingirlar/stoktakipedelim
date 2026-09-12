import { YakindaKarti } from "@/bilesenler/YakindaKarti";
import { oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Sevkiyat — Stok Takip" };

export default async function SevkiyatSayfasi() {
  await oturumGerekli();
  return (
    <YakindaKarti
      baslik="Sevkiyat"
      faz="Faz 3"
      maddeler={[
        "Gönderen kullanıcı cihazları okutur, hedef mağazayı seçer ve sevkiyatı başlatır",
        "Cihazlar yolda iken 'Transferde' durumunda tutulur",
        "Hedef mağaza kullanıcısı cihazları tek tek okutarak kabul eder",
        "Kısmi kabul ve red desteği; eksik cihazlar raporlanır",
        "Her adım kullanıcı ve zaman damgasıyla loglanır",
      ]}
    />
  );
}
