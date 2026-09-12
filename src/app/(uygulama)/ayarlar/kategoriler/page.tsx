import Link from "next/link";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { EylemFormu } from "@/bilesenler/EylemFormu";
import { Kart } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { prisma } from "@/lib/prisma";
import { adminSayfasi } from "@/lib/yetki";
import {
  altKategoriEkle,
  altKategoriSil,
  kategoriEkle,
  kategoriGuncelle,
  kategoriSil,
} from "../eylemler";

export const metadata = { title: "Kategoriler — Stok Takip" };

export default async function KategorilerSayfasi() {
  await adminSayfasi();

  const kategoriler = await prisma.kategori.findMany({
    orderBy: { sira: "asc" },
    include: {
      altKategoriler: { orderBy: { sira: "asc" } },
      _count: { select: { stokKalemleri: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Kategoriler</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            IMEI zorunlu işaretlenen kategorilerde seri no girilmeden cihaz kaydedilemez.
          </p>
        </div>
        <Link
          href="/ayarlar"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Ayarlar
        </Link>
      </div>

      <Kart baslik="Yeni Kategori">
        <EylemFormu eylem={kategoriEkle}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label htmlFor="yeniKategoriAd" className="mb-1 block text-xs font-medium text-slate-600">
                Kategori adı
              </label>
              <input id="yeniKategoriAd" name="ad" required maxLength={60} className={GIRDI_SINIFI} />
            </div>
            <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-700">
              <input type="checkbox" name="seriNoZorunlu" className="h-4 w-4 rounded border-slate-300" />
              IMEI zorunlu
            </label>
            <GonderDugmesi bekleyenMetin="Ekleniyor…">Ekle</GonderDugmesi>
          </div>
        </EylemFormu>
      </Kart>

      <div className="space-y-4">
        {kategoriler.map((k) => (
          <div key={k.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              {/*
                 Aşağıdaki girdiler `key` ile sunucu değerine bağlanır. React monte
                 edilmiş bir girdinin defaultValue/defaultChecked değerini güncellemez;
                 sunucuda değişen alanın ekrana yansıması için alanın yeniden kurulması
                 gerekir (ör. kategori pasife alındığında onay kutusu).
              */}
              <EylemFormu eylem={kategoriGuncelle}>
                <input type="hidden" name="id" value={k.id} />
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[200px] flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Kategori adı
                    </label>
                    <input
                      key={`ad-${k.ad}`}
                      name="ad"
                      defaultValue={k.ad}
                      required
                      maxLength={60}
                      className={GIRDI_SINIFI}
                    />
                  </div>
                  <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-700">
                    <input
                      key={`seri-${k.seriNoZorunlu}`}
                      type="checkbox"
                      name="seriNoZorunlu"
                      defaultChecked={k.seriNoZorunlu}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    IMEI zorunlu
                  </label>
                  <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-700">
                    <input
                      key={`aktif-${k.aktif}`}
                      type="checkbox"
                      name="aktif"
                      defaultChecked={k.aktif}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Aktif
                  </label>
                  <GonderDugmesi tur="ikincil" bekleyenMetin="Kaydediliyor…">
                    Kaydet
                  </GonderDugmesi>
                  <Rozet ton={k._count.stokKalemleri > 0 ? "mavi" : "nötr"}>
                    {k._count.stokKalemleri} cihaz
                  </Rozet>
                </div>
              </EylemFormu>
            </div>

            <div className="p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Alt kategoriler
              </h3>
              {k.altKategoriler.length === 0 ? (
                <p className="mb-3 text-sm text-slate-500">Alt kategori yok.</p>
              ) : (
                <ul className="mb-3 flex flex-wrap gap-2">
                  {k.altKategoriler.map((a) => (
                    <li
                      key={a.id}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm ${
                        a.aktif
                          ? "border-slate-200 bg-slate-50 text-slate-700"
                          : "border-slate-200 bg-slate-100 text-slate-400 line-through"
                      }`}
                    >
                      {a.ad}
                      <EylemFormu eylem={altKategoriSil} sonucuGizle className="flex">
                        <input type="hidden" name="id" value={a.id} />
                        <GonderDugmesi
                          tur="ikincil"
                          className="!border-0 !bg-transparent !px-1 !py-0 !text-red-500 hover:!bg-red-50"
                          aria-label={`${a.ad} alt kategorisini sil`}
                        >
                          ×
                        </GonderDugmesi>
                      </EylemFormu>
                    </li>
                  ))}
                </ul>
              )}

              <EylemFormu eylem={altKategoriEkle}>
                <input type="hidden" name="kategoriId" value={k.id} />
                <div className="flex flex-wrap items-end gap-2">
                  <input
                    name="ad"
                    required
                    maxLength={60}
                    placeholder="Yeni alt kategori"
                    className={`${GIRDI_SINIFI} max-w-xs`}
                  />
                  <GonderDugmesi tur="ikincil" bekleyenMetin="…">
                    + Alt Kategori
                  </GonderDugmesi>
                </div>
              </EylemFormu>
            </div>

            <div className="border-t border-slate-100 px-4 py-3">
              <EylemFormu eylem={kategoriSil}>
                <input type="hidden" name="id" value={k.id} />
                <GonderDugmesi tur="tehlike" bekleyenMetin="Siliniyor…">
                  Kategoriyi Sil
                </GonderDugmesi>
                <p className="mt-1.5 text-xs text-slate-500">
                  Bağlı cihazı olan kategori silinmez, pasife alınır.
                </p>
              </EylemFormu>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
