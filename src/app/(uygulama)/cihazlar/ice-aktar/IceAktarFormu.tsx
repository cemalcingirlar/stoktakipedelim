"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { TedarikciSecici } from "@/bilesenler/TedarikciSecici";
import { VadeAlani } from "@/bilesenler/VadeAlani";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { kurusuTLYaz } from "@/lib/para";
import { inputTarih } from "@/lib/tarih";
import type { OkunanSatir } from "@/lib/iceAktar";
import {
  exceliOnizle,
  iceAktariKaydet,
  type KayitDurumu,
  type OnizlemeDurumu,
} from "./eylemler";

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export function IceAktarFormu({
  tedarikciler,
  magazalar,
  varsayilanMagazaId,
}: {
  tedarikciler: { id: number; ad: string }[];
  magazalar: { id: number; ad: string }[];
  varsayilanMagazaId: number | null;
}) {
  const yonlendirici = useRouter();
  const [onizleme, onizleEylem] = useActionState<OnizlemeDurumu, FormData>(exceliOnizle, {});
  const [kayit, kaydetEylem] = useActionState<KayitDurumu, FormData>(iceAktariKaydet, {});
  const [tumunuGoster, setTumunuGoster] = useState(false);
  const [faturaTarihi, setFaturaTarihi] = useState(inputTarih(new Date()));

  const satirlar = onizleme.satirlar ?? [];
  const hatalar = onizleme.hatalar ?? [];
  const toplamKurus = satirlar.reduce((t, s) => t + s.alisFiyatiKurus, 0);
  const gosterilen = tumunuGoster ? satirlar : satirlar.slice(0, 20);

  // Kayıt bitince oluşan faturaya git. Yönlendirme bir yan etki olduğundan
  // render içinde değil, effect içinde yapılmalı.
  useEffect(() => {
    if (kayit.faturaId) yonlendirici.push(`/faturalar/${kayit.faturaId}`);
  }, [kayit.faturaId, yonlendirici]);

  function veriyiHazirla(form: FormData): FormData {
    const yuk = {
      tedarikciId: Number(form.get("tedarikciId")) || 0,
      magazaId: Number(form.get("magazaId")) || 0,
      faturaNo: String(form.get("faturaNo") ?? ""),
      faturaTarihi: String(form.get("faturaTarihi") ?? ""),
      vadeGun: Number(form.get("vadeGun")) || 0,
      vadeTarihi: String(form.get("vadeTarihi") ?? "").trim() || null,
      not: String(form.get("not") ?? "").trim() || null,
      satirlar: satirlar.map((s) => ({
        kategoriId: s.kategoriId,
        altKategoriId: s.altKategoriId,
        marka: s.marka,
        model: s.model,
        renk: s.renk,
        kapasite: s.kapasite,
        seriNo: s.seriNo,
        barkod: s.barkod,
        alisFiyatiKurus: s.alisFiyatiKurus,
        not: s.not,
      })),
    };
    const yeni = new FormData();
    yeni.set("veri", JSON.stringify(yuk));
    return yeni;
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------- 1. Dosya seçme */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">1. Excel dosyasını yükleyin</h2>
        <p className="mb-3 text-sm text-slate-500">
          Şablonu indirip doldurun. Dosya yüklendiğinde hiçbir kayıt oluşmaz — önce satırları
          kontrol edersiniz.
        </p>

        <form action={onizleEylem} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="dosya" className={KUCUK_ETIKET}>
              Dosya (.xlsx)
            </label>
            <input
              id="dosya"
              name="dosya"
              type="file"
              accept=".xlsx"
              required
              className="block w-full max-w-sm text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            />
          </div>
          <GonderDugmesi tur="ikincil" bekleyenMetin="Okunuyor…">
            Dosyayı Oku
          </GonderDugmesi>
        </form>

        {onizleme.hata ? (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-800">{onizleme.hata}</p>
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------- 2. Önizleme */}
      {onizleme.dosyaAdi ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-slate-800">2. Okunan satırlar</h2>
          <p className="mb-3 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{onizleme.dosyaAdi}</span> ·{" "}
            <span className="font-medium text-emerald-700">{satirlar.length} geçerli satır</span>
            {hatalar.length > 0 ? (
              <>
                {" · "}
                <span className="font-medium text-red-700">{hatalar.length} hatalı satır</span>
              </>
            ) : null}
            {satirlar.length > 0 ? ` · toplam ${kurusuTLYaz(toplamKurus)} TL` : null}
          </p>

          {hatalar.length > 0 ? (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-800">
                Aşağıdaki satırlar atlanacak. Dosyayı düzeltip yeniden yükleyebilirsiniz.
              </p>
              <ul className="mt-2 max-h-52 list-inside list-disc space-y-0.5 overflow-y-auto text-sm text-red-700">
                {hatalar.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {satirlar.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Satır</th>
                      <th className="px-3 py-2">Kategori</th>
                      <th className="px-3 py-2">Marka</th>
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">Seri No</th>
                      <th className="px-3 py-2 text-right">Alış (TL)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {gosterilen.map((s: OkunanSatir) => (
                      <tr key={s.excelSatiri}>
                        <td className="px-3 py-1.5 text-slate-400">{s.excelSatiri}</td>
                        <td className="px-3 py-1.5">
                          {s.kategoriAdi}
                          {s.altKategoriAdi ? (
                            <span className="text-slate-400"> · {s.altKategoriAdi}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5">{s.marka}</td>
                        <td className="px-3 py-1.5">{s.model}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{s.seriNo ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right">
                          {kurusuTLYaz(s.alisFiyatiKurus)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {satirlar.length > gosterilen.length || tumunuGoster ? (
                <button
                  type="button"
                  onClick={() => setTumunuGoster((o) => !o)}
                  className="mt-2 text-sm font-medium text-slate-600 underline hover:text-slate-900"
                >
                  {tumunuGoster
                    ? "İlk 20 satırı göster"
                    : `Tümünü göster (${satirlar.length} satır)`}
                </button>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {/* ------------------------------------------------- 3. Fatura bilgileri ve kayıt */}
      {satirlar.length > 0 ? (
        <form action={(form) => kaydetEylem(veriyiHazirla(form))}>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">3. Alış faturası bilgileri</h2>
            <p className="mb-3 text-sm text-slate-500">
              Cihazlar bu faturaya bağlanır; vade takibi fatura üzerinden yürür.
            </p>

            {kayit.hata ? (
              <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-800">{kayit.hata}</p>
                {kayit.alanHatalari?.length ? (
                  <ul className="mt-2 max-h-52 list-inside list-disc space-y-0.5 overflow-y-auto text-sm text-red-700">
                    {kayit.alanHatalari.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TedarikciSecici baslangic={tedarikciler} />

              <div>
                <label htmlFor="faturaNo" className={KUCUK_ETIKET}>
                  Fatura No *
                </label>
                <input
                  id="faturaNo"
                  name="faturaNo"
                  required
                  maxLength={40}
                  className={GIRDI_SINIFI}
                />
              </div>

              <div>
                <label htmlFor="faturaTarihi" className={KUCUK_ETIKET}>
                  Fatura Tarihi *
                </label>
                <input
                  id="faturaTarihi"
                  name="faturaTarihi"
                  type="date"
                  required
                  value={faturaTarihi}
                  onChange={(e) => setFaturaTarihi(e.target.value)}
                  className={GIRDI_SINIFI}
                />
              </div>

              <div>
                <label htmlFor="magazaId" className={KUCUK_ETIKET}>
                  Giriş yapılacak depo *
                </label>
                <select
                  id="magazaId"
                  name="magazaId"
                  required
                  defaultValue={varsayilanMagazaId ?? ""}
                  className={GIRDI_SINIFI}
                >
                  <option value="">Seçin…</option>
                  {magazalar.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.ad}
                    </option>
                  ))}
                </select>
              </div>

              <VadeAlani faturaTarihi={faturaTarihi} />

              <div>
                <label htmlFor="not" className={KUCUK_ETIKET}>
                  Not
                </label>
                <input id="not" name="not" maxLength={500} className={GIRDI_SINIFI} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
              <GonderDugmesi bekleyenMetin="Kaydediliyor…">
                {satirlar.length} Cihazı Kaydet
              </GonderDugmesi>
              <span className="text-sm text-slate-500">
                Toplam alış tutarı {kurusuTLYaz(toplamKurus)} TL
              </span>
            </div>
          </section>
        </form>
      ) : null}
    </div>
  );
}
