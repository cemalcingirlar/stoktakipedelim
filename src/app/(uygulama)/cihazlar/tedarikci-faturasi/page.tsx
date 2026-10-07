import Link from "next/link";
import { sinifIandirilmamisKategoriId } from "@/lib/kategori";
import { prisma } from "@/lib/prisma";
import { adminSayfasi } from "@/lib/yetki";
import { TedarikciFaturasiFormu } from "./TedarikciFaturasiFormu";

export const metadata = { title: "Tedarikçi Faturası Yükle — Stok Takip" };

export default async function TedarikciFaturasiSayfasi() {
  const oturum = await adminSayfasi();

  // Kategori seçimi zorunlu değil; seçilmeyenler bu kategoriye girer.
  const varsayilanKategoriId = await sinifIandirilmamisKategoriId();

  const [kategoriler, tedarikciler, magazalar] = await Promise.all([
    prisma.kategori.findMany({
      where: { aktif: true },
      orderBy: { sira: "asc" },
      select: {
        id: true,
        ad: true,
        seriNoZorunlu: true,
        altKategoriler: {
          where: { aktif: true },
          orderBy: { sira: "asc" },
          select: { id: true, ad: true },
        },
      },
    }),
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
          <h1 className="text-xl font-semibold text-slate-900">Tedarikçi Faturası Yükle</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Tedarikçi portalından indirdiğiniz seri no listesini doğrudan stoğa işler. Fatura
            numarası, tarih, barkod, marka, seri numaraları ve birim tutar dosyadan okunur.
          </p>
        </div>
        <Link
          href="/cihazlar"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Cihazlar
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-800">Nasıl çalışır</h2>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-600">
          <li>
            Tedarikçi portalında <span className="font-medium text-slate-700">Seri No
            Kontrolü</span> ekranını açıp <span className="font-medium text-slate-700">Excel&apos;e
            Aktar</span> düğmesine basın.
          </li>
          <li>
            İnen dosyayı <span className="font-medium text-slate-700">olduğu gibi</span> buraya
            yükleyin — sütunları düzenlemeniz gerekmez.
          </li>
          <li>
            Program satırları ürün koduna göre gruplar. Daha önce girdiğiniz bir ürünse
            kategorisi otomatik gelir. Kategori seçmek zorunlu değil — seçmediklerinizi
            <span className="font-medium text-slate-700"> Sınıflandırılmamış</span> olarak
            kaydeder, sonra cihaz sayfasından düzeltebilirsiniz.
          </li>
          <li>
            Tedarikçi, depo ve vadeyi seçip kaydedin. Her seri numarası ayrı bir stok kaydı olur.
            Fatura numarası olarak dosyadaki <span className="font-medium text-slate-700">E-Fatura
            No</span> kullanılır; <span className="font-medium text-slate-700">Fatura No</span>
            sütunundaki sipariş numarası fatura notuna yazılır.
          </li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          Dosyada zaten kayıtlı bir seri numarası varsa o cihaz atlanır — aynı faturayı iki kez
          yüklerseniz stok ikiye katlanmaz.
        </p>
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
        <TedarikciFaturasiFormu
          kategoriler={kategoriler}
          varsayilanKategoriId={varsayilanKategoriId}
          tedarikciler={tedarikciler}
          magazalar={magazalar}
          varsayilanMagazaId={oturum.magazaId}
        />
      )}
    </div>
  );
}
