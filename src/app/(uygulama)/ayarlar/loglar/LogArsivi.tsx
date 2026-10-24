"use client";

import { useActionState, useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { ARSIV_YIL_SECENEKLERI } from "@/lib/logArsivi";
import { arsivlenenLoglariSil, type LogDurumu } from "./eylemler";

/**
 * Eski logların arşivlenmesi.
 *
 * "Kayıtlar silinmez" kuralı duruyor; burada yapılan, eski kayıtları önce
 * dosyaya almak sonra tablodan düşürmek. Sıra bilerek bu: indirilmemiş
 * kayıt silinemiyor ve silme işleminin kendisi de loga yazılıyor.
 *
 * Ekranın yavaşlaması ölçüldü ve çıkmadı (3 milyon kayıtta 221–463 ms);
 * bu kart ekran hızı için değil, her gün yedeklenen veritabanı dosyası
 * büyümesin diye var.
 */
export function LogArsivi({
  tumKayit,
  tumKayitOzeti,
  varsayilanYil,
  arsivlenebilir,
}: {
  tumKayit: number;
  tumKayitOzeti: string;
  varsayilanYil: number;
  arsivlenebilir: number;
}) {
  const [yil, setYil] = useState(String(varsayilanYil));
  const [acik, setAcik] = useState(false);
  const [durum, sil] = useActionState<LogDurumu, FormData>(
    arsivlenenLoglariSil,
    {},
  );

  return (
    <div
      data-test="log-arsivi"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Arşiv</h2>
          <p className="mt-0.5 text-sm text-slate-500" data-test="log-boyutu">
            Toplam {tumKayitOzeti}. Loglar silinmez; arşivleme, eski kayıtları
            önce dosyaya alıp sonra tablodan düşürmektir — veritabanı her gün
            yedeklendiği için dosya boyutu doğrudan yedek süresine yazılıyor.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[190px]">
          <label
            htmlFor="arsivYil"
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Şu kadar yıldan eski kayıtlar
          </label>
          <select
            id="arsivYil"
            data-test="arsiv-yil"
            value={yil}
            onChange={(e) => {
              setYil(e.target.value);
              // Yıl değişince indirilmiş arşiv artık bu aralığı kapsamıyor.
              setAcik(false);
            }}
            className={GIRDI_SINIFI}
          >
            {ARSIV_YIL_SECENEKLERI.map((y) => (
              <option key={y} value={y}>
                {y} yıl
              </option>
            ))}
          </select>
        </div>
        <a
          href={`/ayarlar/loglar/arsiv?yil=${yil}`}
          data-test="arsiv-indir"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
        >
          Arşivi İndir (CSV)
        </a>
        {!acik ? (
          <button
            type="button"
            data-test="arsiv-sil-ac"
            onClick={() => setAcik(true)}
            className="rounded-lg border border-red-300 bg-white px-3.5 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
          >
            İndirilenleri Sil
          </button>
        ) : null}
        <span className="text-xs text-slate-500" data-test="arsivlenebilir">
          {String(varsayilanYil) === yil
            ? `${arsivlenebilir.toLocaleString("tr-TR")} kayıt bu sınırdan eski`
            : "Sınırı değiştirdiniz; adedi görmek için arşivi indirin"}
        </span>
      </div>

      {acik ? (
        <form
          action={sil}
          data-test="arsiv-silme-formu"
          className="mt-3 space-y-2"
        >
          <input type="hidden" name="yil" value={yil} />
          <p className="text-xs text-slate-700">
            Yalnız <strong>indirdiğiniz</strong> aralık silinir. İndirmediyseniz
            silme reddedilir. Silme işlemi de loga yazılır: kaç kayıt, hangi
            tarihten öncesi, kim sildi.
          </p>
          <div className="flex flex-wrap gap-2">
            <GonderDugmesi bekleyenMetin="Siliniyor…">
              Evet, Arşivlenenleri Sil
            </GonderDugmesi>
            <button
              type="button"
              onClick={() => setAcik(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Vazgeç
            </button>
          </div>
        </form>
      ) : null}

      {durum.hata ? (
        <p
          role="alert"
          data-test="arsiv-hata"
          className="mt-2 text-sm text-red-600"
        >
          {durum.hata}
        </p>
      ) : null}
      {durum.basari ? (
        <p
          role="status"
          data-test="arsiv-basari"
          className="mt-2 text-sm text-emerald-700"
        >
          {durum.basari}
        </p>
      ) : null}
      {tumKayit === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Henüz log kaydı yok.</p>
      ) : null}
    </div>
  );
}
