import { YakindaKarti } from "@/bilesenler/YakindaKarti";
import { adminSayfasi } from "@/lib/yetki";

export const metadata = { title: "Ayarlar — Stok Takip" };

export default async function AyarlarSayfasi() {
  // Yalnızca yönetici; diğer roller panele döner.
  await adminSayfasi();
  return (
    <YakindaKarti
      baslik="Ayarlar"
      faz="Faz 2 / 5 / 6"
      maddeler={[
        "Mağaza, kullanıcı ve rol yönetimi",
        "Kategori ve alt kategori ağacı",
        "Tedarikçi yönetimi",
        "İşlem logları (kim, ne zaman, ne yaptı)",
        "Google Drive yedekleme ayarları ve 'Şimdi yedekle'",
      ]}
    />
  );
}
