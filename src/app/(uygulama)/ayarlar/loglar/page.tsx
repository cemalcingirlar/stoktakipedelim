import Link from "next/link";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { Rozet, type RozetTonu } from "@/bilesenler/Rozet";
import { Sayfalama } from "@/bilesenler/Sayfalama";
import { prisma } from "@/lib/prisma";
import { LOG_ISLEM } from "@/lib/sabitler";
import { gunSonu, tarihSaatYaz } from "@/lib/tarih";
import { adminSayfasi } from "@/lib/yetki";

export const metadata = { title: "İşlem Logları — Stok Takip" };

const SAYFA_BOYUTU = 100;

const ISLEM_ETIKET: Record<string, string> = {
  GIRIS_YAP: "Giriş yaptı",
  CIKIS_YAP: "Çıkış yaptı",
  FATURA_EKLE: "Alış faturası ekledi",
  STOK_EKLE: "Stok ekledi",
  STOK_DUZENLE: "Stok düzenledi",
  STOK_SIL: "Stok sildi",
  TRANSFER_GONDER: "Sevkiyat gönderdi",
  TRANSFER_KABUL: "Sevkiyat kabul etti",
  TRANSFER_RED: "Sevkiyat reddetti / geri çekti",
  SATIS_YAP: "Satış yaptı",
  SAYIM_BASLAT: "Sayım başlattı",
  SAYIM_KAPAT: "Sayım kapattı",
  EXCEL_AKTAR: "Excel'e aktardı",
  AYAR_DEGISTIR: "Ayar değiştirdi",
  YEDEK_AL: "Yedek aldı",
};

const ISLEM_TONU: Record<string, RozetTonu> = {
  GIRIS_YAP: "nötr",
  CIKIS_YAP: "nötr",
  FATURA_EKLE: "mavi",
  TRANSFER_GONDER: "mor",
  TRANSFER_KABUL: "yesil",
  TRANSFER_RED: "kirmizi",
  SATIS_YAP: "yesil",
  SAYIM_BASLAT: "sari",
  SAYIM_KAPAT: "sari",
  EXCEL_AKTAR: "nötr",
  AYAR_DEGISTIR: "mavi",
  STOK_SIL: "kirmizi",
};

function tarihCoz(deger: string | string[] | undefined): Date | null {
  if (typeof deger !== "string" || !deger.trim()) return null;
  const d = new Date(deger);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function LoglarSayfasi({ searchParams }: PageProps<"/ayarlar/loglar">) {
  await adminSayfasi();
  const params = await searchParams;

  const islem = typeof params.islem === "string" ? params.islem : "";
  const kullaniciAdi = typeof params.kullanici === "string" ? params.kullanici.trim() : "";
  const bas = tarihCoz(params.bas);
  const bit = tarihCoz(params.bit);
  const sayfa = Math.max(1, Number(params.sayfa) || 1);

  const where = {
    ...(islem ? { islem } : {}),
    ...(kullaniciAdi ? { kullaniciAdi: { contains: kullaniciAdi } } : {}),
    ...(bas || bit
      ? { tarih: { ...(bas ? { gte: bas } : {}), ...(bit ? { lte: gunSonu(bit) } : {}) } }
      : {}),
  };

  const [toplam, loglar, kullanicilar] = await Promise.all([
    prisma.log.count({ where }),
    prisma.log.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (sayfa - 1) * SAYFA_BOYUTU,
      take: SAYFA_BOYUTU,
      include: { kullanici: { select: { adSoyad: true } } },
    }),
    prisma.kullanici.findMany({ select: { kullaniciAdi: true }, orderBy: { kullaniciAdi: "asc" } }),
  ]);

  const toplamSayfa = Math.max(1, Math.ceil(toplam / SAYFA_BOYUTU));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">İşlem Logları</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Kim, ne zaman, hangi işlemi yaptı. Kayıtlar silinmez.
          </p>
        </div>
        <Link
          href="/ayarlar"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Ayarlar
        </Link>
      </div>

      <form method="get" action="/ayarlar/loglar" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="islem" className="mb-1 block text-xs font-medium text-slate-600">
              İşlem
            </label>
            <select id="islem" name="islem" defaultValue={islem} className={GIRDI_SINIFI}>
              <option value="">Tümü</option>
              {Object.values(LOG_ISLEM).map((i) => (
                <option key={i} value={i}>
                  {ISLEM_ETIKET[i] ?? i}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="kullanici" className="mb-1 block text-xs font-medium text-slate-600">
              Kullanıcı
            </label>
            <select id="kullanici" name="kullanici" defaultValue={kullaniciAdi} className={GIRDI_SINIFI}>
              <option value="">Tümü</option>
              {kullanicilar.map((k) => (
                <option key={k.kullaniciAdi} value={k.kullaniciAdi}>
                  {k.kullaniciAdi}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bas" className="mb-1 block text-xs font-medium text-slate-600">
              Başlangıç
            </label>
            <input id="bas" name="bas" type="date" defaultValue={typeof params.bas === "string" ? params.bas : ""} className={GIRDI_SINIFI} />
          </div>
          <div>
            <label htmlFor="bit" className="mb-1 block text-xs font-medium text-slate-600">
              Bitiş
            </label>
            <input id="bit" name="bit" type="date" defaultValue={typeof params.bit === "string" ? params.bit : ""} className={GIRDI_SINIFI} />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900"
            >
              Filtrele
            </button>
            <Link
              href="/ayarlar/loglar"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Temizle
            </Link>
          </div>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">
          {toplam} kayıt
        </div>
        {loglar.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Bu filtrelere uyan log kaydı yok.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Zaman</th>
                  <th className="px-3 py-2 font-medium">Kullanıcı</th>
                  <th className="px-3 py-2 font-medium">İşlem</th>
                  <th className="px-3 py-2 font-medium">Detay</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loglar.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                      {tarihSaatYaz(l.tarih)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                      {l.kullanici?.adSoyad ?? l.kullaniciAdi}
                      <span className="ml-1 text-xs text-slate-400">{l.kullaniciAdi}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Rozet ton={ISLEM_TONU[l.islem] ?? "nötr"}>
                        {ISLEM_ETIKET[l.islem] ?? l.islem}
                      </Rozet>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{l.detay ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-400">
                      {l.ip ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Sayfalama
          sayfa={sayfa}
          toplamSayfa={toplamSayfa}
          params={params}
          temelYol="/ayarlar/loglar"
        />
      </div>
    </div>
  );
}
