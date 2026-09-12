import Link from "next/link";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { EylemFormu } from "@/bilesenler/EylemFormu";
import { Kart } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { prisma } from "@/lib/prisma";
import { adminSayfasi } from "@/lib/yetki";
import { tedarikciEkle, tedarikciGuncelle } from "../eylemler";

export const metadata = { title: "Tedarikçiler — Stok Takip" };

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export default async function TedarikcilerSayfasi() {
  await adminSayfasi();

  const tedarikciler = await prisma.tedarikci.findMany({
    orderBy: [{ aktif: "desc" }, { ad: "asc" }],
    include: { _count: { select: { faturalar: true, stokKalemleri: true } } },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Tedarikçiler</h1>
        <Link
          href="/ayarlar"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Ayarlar
        </Link>
      </div>

      <Kart baslik="Yeni Tedarikçi">
        <EylemFormu eylem={tedarikciEkle}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="yeniAd" className={KUCUK_ETIKET}>
                Ünvan *
              </label>
              <input id="yeniAd" name="ad" required maxLength={60} className={GIRDI_SINIFI} />
            </div>
            <div>
              <label htmlFor="yeniTelefon" className={KUCUK_ETIKET}>
                Telefon
              </label>
              <input id="yeniTelefon" name="telefon" maxLength={30} className={GIRDI_SINIFI} />
            </div>
            <div>
              <label htmlFor="yeniVergiNo" className={KUCUK_ETIKET}>
                Vergi No
              </label>
              <input id="yeniVergiNo" name="vergiNo" maxLength={20} className={GIRDI_SINIFI} />
            </div>
            <div>
              <label htmlFor="yeniAdres" className={KUCUK_ETIKET}>
                Adres
              </label>
              <input id="yeniAdres" name="adres" maxLength={200} className={GIRDI_SINIFI} />
            </div>
          </div>
          <div className="mt-3">
            <GonderDugmesi bekleyenMetin="Ekleniyor…">Tedarikçi Ekle</GonderDugmesi>
          </div>
        </EylemFormu>
      </Kart>

      <div className="space-y-3">
        {tedarikciler.map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <EylemFormu eylem={tedarikciGuncelle}>
              <input type="hidden" name="id" value={t.id} />
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Rozet ton={t.aktif ? "yesil" : "nötr"}>{t.aktif ? "Aktif" : "Pasif"}</Rozet>
                <Rozet>{t._count.faturalar} fatura</Rozet>
                <Rozet>{t._count.stokKalemleri} cihaz</Rozet>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={KUCUK_ETIKET}>Ünvan *</label>
                  <input key={`ad-${t.ad}`} name="ad" defaultValue={t.ad} required maxLength={60} className={GIRDI_SINIFI} />
                </div>
                <div>
                  <label className={KUCUK_ETIKET}>Telefon</label>
                  <input name="telefon" defaultValue={t.telefon ?? ""} maxLength={30} className={GIRDI_SINIFI} />
                </div>
                <div>
                  <label className={KUCUK_ETIKET}>Vergi No</label>
                  <input name="vergiNo" defaultValue={t.vergiNo ?? ""} maxLength={20} className={GIRDI_SINIFI} />
                </div>
                <div>
                  <label className={KUCUK_ETIKET}>Adres</label>
                  <input name="adres" defaultValue={t.adres ?? ""} maxLength={200} className={GIRDI_SINIFI} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={KUCUK_ETIKET}>Not</label>
                  <input name="not" defaultValue={t.not ?? ""} maxLength={300} className={GIRDI_SINIFI} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    key={`aktif-${t.aktif}`}
                    type="checkbox"
                    name="aktif"
                    defaultChecked={t.aktif}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Aktif (pasif tedarikçi fatura ekranında görünmez)
                </label>
                <GonderDugmesi tur="ikincil" bekleyenMetin="Kaydediliyor…">
                  Kaydet
                </GonderDugmesi>
              </div>
            </EylemFormu>
          </div>
        ))}
      </div>
    </div>
  );
}
