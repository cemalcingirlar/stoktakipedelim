import { YakindaKarti } from "@/bilesenler/YakindaKarti";
import { oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Sayım — Stok Takip" };

export default async function SayimSayfasi() {
  await oturumGerekli();
  return (
    <YakindaKarti
      baslik="Stok Sayımı"
      faz="Faz 4"
      maddeler={[
        "Sayım mağaza bazında bağımsız başlatılır; yalnız o mağazanın stoğu sayılır",
        "Seri no okutuldukça 'Stokta bulundu' bildirimi",
        "Başka mağazada kayıtlı veya sistemde olmayan okutmalar ayrıca uyarır",
        "Üstte canlı sayaç: okutulan / toplam / okutulmayan / fazla",
        "Sayım kapanışında eksik-fazla raporu ve Excel çıktısı",
      ]}
    />
  );
}
