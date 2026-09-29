import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { adminSayfasi } from "@/lib/yetki";
import { IceAktarFormu } from "./IceAktarFormu";

export const metadata = { title: "Excel ile Toplu Stok Yükleme — Stok Takip" };

export default async function IceAktarSayfasi() {
  const oturum = await adminSayfasi();

  const [tedarikciler, magazalar] = await Promise.all([
    prisma.tedarikci.findMany({
      where: { aktif: true },
      orderBy: { ad: "asc" },
      select: { id: true, ad: true },
    }),
    prisma.magaza.findMany({
      where: { aktif: true },
      orderBy: { kod: "asc" },
      select: { id: true, ad: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Excel ile Toplu Stok Yükleme</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Çok sayıda cihazı tek seferde girin. Satırlar bir alış faturasına bağlanır, vade takibi
            elle girişteki gibi çalışır.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Dosya indirme ucu; <Link> istemci tarafı gezinme yapıp indirmeyi bozar. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/cihazlar/ice-aktar/sablon"
            className="rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            ↓ Şablonu İndir
          </a>
          <Link
            href="/cihazlar"
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ← Cihazlar
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-800">Nasıl çalışır</h2>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-600">
          <li>
            <span className="font-medium text-slate-700">Şablonu indirin.</span> İkinci sayfada
            kullanabileceğiniz kategori ve alt kategori adları yazıyor; birebir aynı yazın.
          </li>
          <li>
            <span className="font-medium text-slate-700">Doldurun.</span> Her satır bir cihazdır.
            Telefon ve tablet kategorilerinde seri no (IMEI) zorunludur.
          </li>
          <li>
            <span className="font-medium text-slate-700">Yükleyin ve kontrol edin.</span> Hatalı
            satırlar listelenir ve atlanır; bu adımda hiçbir kayıt oluşmaz.
          </li>
          <li>
            <span className="font-medium text-slate-700">Fatura bilgilerini girip kaydedin.</span>{" "}
            Tüm cihazlar tek faturaya bağlanır.
          </li>
        </ol>
      </div>

      {tedarikciler.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Önce en az bir tedarikçi ekleyin —{" "}
            <Link href="/ayarlar/tedarikciler" className="font-medium underline">
              Ayarlar → Tedarikçiler
            </Link>
          </p>
        </div>
      ) : (
        <IceAktarFormu
          tedarikciler={tedarikciler}
          magazalar={magazalar}
          varsayilanMagazaId={oturum.magazaId}
        />
      )}
    </div>
  );
}
