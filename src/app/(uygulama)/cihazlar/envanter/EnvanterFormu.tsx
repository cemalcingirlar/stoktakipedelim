"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { magazayaGoreToplam } from "@/lib/envanterDosyasi";
import { kurusuTLYaz } from "@/lib/para";
import { inputTarih } from "@/lib/tarih";
import {
  envanteriKaydet,
  envanteriOnizle,
  type EnvanterKaydiDurumu,
  type EnvanterOnizlemesi,
} from "./eylemler";

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export type EnvanterKategorisiSecenegi = {
  id: number;
  ad: string;
  seriNoZorunlu: boolean;
  altKategoriler: { id: number; ad: string }[];
};

export function EnvanterFormu({
  kategoriler,
  varsayilanKategoriId,
}: {
  kategoriler: EnvanterKategorisiSecenegi[];
  varsayilanKategoriId: number | null;
}) {
  const [onizleme, onizleEylem] = useActionState<EnvanterOnizlemesi, FormData>(
    envanteriOnizle,
    {},
  );
  const [kayit, kaydetEylem] = useActionState<EnvanterKaydiDurumu, FormData>(
    envanteriKaydet,
    {},
  );
  const [kategoriId, setKategoriId] = useState<number | "">(varsayilanKategoriId ?? "");
  const [altKategoriId, setAltKategoriId] = useState<number | "">("");
  const [girisTarihi, setGirisTarihi] = useState(inputTarih(new Date()));
  const [tumunuGoster, setTumunuGoster] = useState(false);

  const satirlar = onizleme.satirlar ?? [];
  const hatalar = onizleme.hatalar ?? [];
  const toplamKurus = satirlar.reduce((t, s) => t + s.alisFiyatiKurus, 0);
  const gosterilen = tumunuGoster ? satirlar : satirlar.slice(0, 25);
  const magazaOzeti = magazayaGoreToplam(satirlar);

  const secilenKategori = kategoriler.find((k) => k.id === Number(kategoriId));
  // Önizleme hangi kategoriyle okunduysa kayıt da onunla yapılmalı; kullanıcı
  // dosyayı okuduktan sonra kategoriyi değiştirirse seri no zorunluluğu
  // yeniden denetlenmemiş olur.
  const kategoriDegisti =
    onizleme.kategoriId !== undefined && onizleme.kategoriId !== Number(kategoriId);

  function veriyiHazirla(): FormData {
    const yuk = {
      kategoriId: Number(kategoriId) || 0,
      altKategoriId: Number(altKategoriId) || null,
      girisTarihi,
      aciklama: onizleme.dosyaAdi ? `Envanter dökümü: ${onizleme.dosyaAdi}` : null,
      satirlar: satirlar.map((s) => ({
        magazaId: s.magazaId,
        marka: s.marka,
        model: s.model,
        seriNo: s.seriNo,
        barkod: s.barkod,
        alisFiyatiKurus: s.alisFiyatiKurus,
        not: s.not,
      })),
    };
    const form = new FormData();
    form.set("veri", JSON.stringify(yuk));
    return form;
  }

  if (kayit.eklenen) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="text-base font-semibold text-emerald-900">
          {kayit.eklenen} cihaz stoğa eklendi
        </h2>
        <p className="mt-1 text-sm text-emerald-800">
          Cihazlar bulundukları mağazalara yazıldı. Listede görmek için aşağıdaki bağlantıyı
          kullanın.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/cihazlar"
            className="rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
          >
            Cihaz listesine git
          </Link>
          <Link
            href="/cihazlar/envanter"
            className="rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-50"
          >
            Yeni dosya yükle
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------- 1. Dosya */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">
          1. Kategoriyi seçin ve dosyayı yükleyin
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Dökümde kategori sütunu olmadığı için kategori burada bir kez seçilir ve dosyadaki tüm
          satırlara uygulanır. Dosya yüklendiğinde hiçbir kayıt oluşmaz.
        </p>

        <form action={onizleEylem} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="kategoriId" className={KUCUK_ETIKET}>
                Kategori *
              </label>
              <select
                id="kategoriId"
                name="kategoriId"
                required
                value={kategoriId}
                onChange={(e) => {
                  setKategoriId(e.target.value ? Number(e.target.value) : "");
                  setAltKategoriId("");
                }}
                className={GIRDI_SINIFI}
              >
                <option value="">Seçin…</option>
                {kategoriler.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.ad}
                    {k.seriNoZorunlu ? " (seri no zorunlu)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="altKategoriId" className={KUCUK_ETIKET}>
                Alt kategori
              </label>
              <select
                id="altKategoriId"
                name="altKategoriId"
                value={altKategoriId}
                onChange={(e) => setAltKategoriId(e.target.value ? Number(e.target.value) : "")}
                disabled={!secilenKategori?.altKategoriler.length}
                className={GIRDI_SINIFI}
              >
                <option value="">Yok</option>
                {secilenKategori?.altKategoriler.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.ad}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="dosya" className={KUCUK_ETIKET}>
                Envanter dosyası (.xlsx · .csv)
              </label>
              <input
                id="dosya"
                name="dosya"
                type="file"
                accept=".xlsx,.csv,.txt,.xls,.xml"
                required
                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
              />
            </div>
          </div>

          <GonderDugmesi tur="ikincil" bekleyenMetin="Okunuyor…">
            Dosyayı Oku ve Önizle
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
          <h2 className="mb-1 text-sm font-semibold text-slate-800">2. Önizleme</h2>
          <p className="mb-3 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{onizleme.dosyaAdi}</span> ·{" "}
            {onizleme.kategoriAdi ? (
              <>
                kategori <span className="font-medium text-slate-700">{onizleme.kategoriAdi}</span>{" "}
                ·{" "}
              </>
            ) : null}
            <span className="font-medium text-emerald-700">{satirlar.length} geçerli satır</span>
            {hatalar.length > 0 ? (
              <>
                {" · "}
                <span className="font-medium text-red-700">{hatalar.length} hatalı satır</span>
              </>
            ) : null}
            {satirlar.length > 0 ? ` · toplam ${kurusuTLYaz(toplamKurus)} TL` : null}
          </p>

          {magazaOzeti.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2" data-test="magaza-ozeti">
              {magazaOzeti.map((o) => (
                <span
                  key={o.magazaId}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
                >
                  <span className="font-medium">{o.magazaAdi}</span>
                  <span className="text-slate-500">
                    {" "}
                    · {o.adet} cihaz · {kurusuTLYaz(o.tutarKurus)} TL
                  </span>
                </span>
              ))}
            </div>
          ) : null}

          {onizleme.eslesmeyenAmbarlar?.length ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-900">
                Bu ambar adları hiçbir mağazaya denk gelmedi:
              </p>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
                {onizleme.eslesmeyenAmbarlar.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-amber-800">
                Mağaza adını ya da kodunu dökümdeki yazımla aynı yapmak için{" "}
                <Link href="/ayarlar/magazalar" className="font-medium underline">
                  Ayarlar → Mağazalar
                </Link>{" "}
                ekranını kullanın.
              </p>
            </div>
          ) : null}

          {hatalar.length > 0 ? (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-800">
                Aşağıdaki satırlar atlanacak. Dosyayı düzeltip yeniden yükleyebilirsiniz.
              </p>
              <ul
                data-test="satir-hatalari"
                className="mt-2 max-h-60 list-inside list-disc space-y-0.5 overflow-y-auto text-sm text-red-700"
              >
                {hatalar.map((h) => (
                  <li key={`${h.satirNo}-${h.mesaj}`}>
                    {h.satirNo > 0 ? `${h.satirNo}. satır: ` : ""}
                    {h.mesaj}
                  </li>
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
                      <th className="px-3 py-2">Mağaza</th>
                      <th className="px-3 py-2">Marka</th>
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">Seri No</th>
                      <th className="px-3 py-2">Malzeme Kodu</th>
                      <th className="px-3 py-2 text-right">Alış (TL)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {gosterilen.map((s) => (
                      <tr key={s.satirNo}>
                        <td className="px-3 py-1.5 text-slate-400">{s.satirNo}</td>
                        <td className="px-3 py-1.5">
                          {s.magazaAdi}
                          {s.ambarMetni !== s.magazaAdi ? (
                            <span className="text-slate-400"> ← {s.ambarMetni}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5">{s.marka}</td>
                        <td className="px-3 py-1.5">{s.model}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{s.seriNo ?? "—"}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-slate-500">
                          {s.barkod ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right">{kurusuTLYaz(s.alisFiyatiKurus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {satirlar.length > 25 ? (
                <button
                  type="button"
                  onClick={() => setTumunuGoster((o) => !o)}
                  className="mt-2 text-sm font-medium text-slate-600 underline hover:text-slate-900"
                >
                  {tumunuGoster
                    ? "İlk 25 satırı göster"
                    : `Tümünü göster (${satirlar.length} satır)`}
                </button>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {/* ------------------------------------------------- 3. Kayıt */}
      {satirlar.length > 0 ? (
        <form action={() => kaydetEylem(veriyiHazirla())}>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">3. Stoğa aktar</h2>
            <p className="mb-3 text-sm text-slate-500">
              Bu bir devir girişidir: alış faturası oluşturulmaz, vade takibine girmez. Her cihaz
              dökümdeki mağazasına yazılır.
            </p>

            {kayit.hata ? (
              <div
                role="alert"
                className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
              >
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

            {kategoriDegisti ? (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-900">
                  Kategoriyi dosyayı okuduktan sonra değiştirdiniz. Dosyayı yeni kategoriyle
                  yeniden okutun.
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="girisTarihi" className={KUCUK_ETIKET}>
                  Giriş tarihi *
                </label>
                <input
                  id="girisTarihi"
                  name="girisTarihi"
                  type="date"
                  required
                  value={girisTarihi}
                  onChange={(e) => setGirisTarihi(e.target.value)}
                  className={GIRDI_SINIFI}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Cihazların stok yaşı bu tarihten sayılır.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
              {/* Kategori değiştiyse buton hiç çizilmiyor: GonderDugmesi'ne
                  disabled geçmek bekleme kilidini de etkisizleştiriyor. */}
              {kategoriDegisti ? null : (
                <GonderDugmesi bekleyenMetin="Kaydediliyor…">
                  {satirlar.length} Cihazı Stoğa Aktar
                </GonderDugmesi>
              )}
              <span className="text-sm text-slate-500">
                Toplam {kurusuTLYaz(toplamKurus)} TL · {magazaOzeti.length} mağaza
              </span>
            </div>
          </section>
        </form>
      ) : null}
    </div>
  );
}
