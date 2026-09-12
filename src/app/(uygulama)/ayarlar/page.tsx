import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { adminSayfasi } from "@/lib/yetki";

export const metadata = { title: "Ayarlar — Stok Takip" };

type BolumProps = { baslik: string; aciklama: string; yol?: string; sayi?: string; faz?: string };

function Bolum({ baslik, aciklama, yol, sayi, faz }: BolumProps) {
  const icerik = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">{baslik}</h2>
        {sayi ? (
          <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {sayi}
          </span>
        ) : null}
        {faz ? (
          <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
            {faz}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-500">{aciklama}</p>
    </>
  );

  if (!yol) {
    return <div className="rounded-xl border border-slate-200 bg-white p-4 opacity-70">{icerik}</div>;
  }

  return (
    <Link
      href={yol}
      className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
    >
      {icerik}
    </Link>
  );
}

export default async function AyarlarSayfasi() {
  await adminSayfasi();

  const [kategoriSayisi, tedarikciSayisi, magazaSayisi, kullaniciSayisi] = await Promise.all([
    prisma.kategori.count({ where: { aktif: true } }),
    prisma.tedarikci.count({ where: { aktif: true } }),
    prisma.magaza.count({ where: { aktif: true } }),
    prisma.kullanici.count({ where: { aktif: true } }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Ayarlar</h1>
        <p className="mt-0.5 text-sm text-slate-500">Yalnızca yönetici erişebilir.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Bolum
          baslik="Kategoriler"
          aciklama="Kategori ve alt kategori ağacını düzenleyin, IMEI zorunluluğunu belirleyin."
          yol="/ayarlar/kategoriler"
          sayi={`${kategoriSayisi} kategori`}
        />
        <Bolum
          baslik="Tedarikçiler"
          aciklama="Alış faturalarında seçilen tedarikçileri yönetin."
          yol="/ayarlar/tedarikciler"
          sayi={`${tedarikciSayisi} tedarikçi`}
        />
        <Bolum
          baslik="Mağazalar ve Kullanıcılar"
          aciklama={`${magazaSayisi} mağaza, ${kullaniciSayisi} kullanıcı. Rol ve yetki yönetimi.`}
          faz="Faz 5"
        />
        <Bolum
          baslik="İşlem Logları"
          aciklama="Kim ne zaman hangi işlemi yaptı."
          faz="Faz 5"
        />
        <Bolum
          baslik="Google Drive Yedekleme"
          aciklama="Günlük otomatik yedek ve 'Şimdi yedekle'."
          faz="Faz 6"
        />
      </div>
    </div>
  );
}
