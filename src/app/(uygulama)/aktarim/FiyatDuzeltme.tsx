"use client";

import { useState, useTransition } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { kurusuTLYaz, tlyiKurusaCevir } from "@/lib/para";
import { aktarilanCihaziDuzelt } from "./eylemler";

/**
 * Aktarılan cihazın alış fiyatını ve notunu satır içinde düzeltir.
 *
 * Bazı ürünler nakit depoya girerken fiyatı revize oluyor; aktarımı yapan kişi
 * aynı ekranda düzeltebilsin diye burada. Kapalı başlıyor: aktarımların çoğunda
 * fiyata dokunulmuyor, açık bir kutu yanlışlıkla kaydedilmeye davet olurdu.
 */
export function FiyatDuzeltme({
  cihazId,
  baslangicFiyatiKurus,
  baslangicNotu,
}: {
  cihazId: number;
  baslangicFiyatiKurus: number;
  baslangicNotu: string | null;
}) {
  const [acik, setAcik] = useState(false);
  const [kayitli, setKayitli] = useState({
    fiyatKurus: baslangicFiyatiKurus,
    not: baslangicNotu ?? "",
  });
  const [fiyat, setFiyat] = useState(kurusuTLYaz(baslangicFiyatiKurus));
  const [not, setNot] = useState(baslangicNotu ?? "");
  const [hata, setHata] = useState<string | null>(null);
  const [basari, setBasari] = useState<string | null>(null);
  const [bekliyor, basla] = useTransition();

  const girilenKurus = tlyiKurusaCevir(fiyat);

  function kaydet() {
    if (girilenKurus === null) {
      setHata("Fiyatı 12.500,00 gibi yazın.");
      return;
    }
    setHata(null);
    setBasari(null);
    basla(async () => {
      const sonuc = await aktarilanCihaziDuzelt(cihazId, girilenKurus, not);
      if (sonuc.durum === "HATA") {
        setHata(sonuc.mesaj);
        return;
      }
      setKayitli({ fiyatKurus: sonuc.alisFiyatiKurus, not: sonuc.not ?? "" });
      setBasari(sonuc.mesaj);
      setAcik(false);
    });
  }

  if (!acik) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-600 tabular-nums">
          Alış: <strong>{kurusuTLYaz(kayitli.fiyatKurus)} TL</strong>
        </span>
        {kayitli.not ? (
          <span className="max-w-xs truncate text-xs text-slate-500">
            · {kayitli.not}
          </span>
        ) : null}
        <button
          type="button"
          data-test="fiyat-duzelt-ac"
          onClick={() => {
            setFiyat(kurusuTLYaz(kayitli.fiyatKurus));
            setNot(kayitli.not);
            setBasari(null);
            setAcik(true);
          }}
          className="text-xs font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900"
        >
          Fiyat / not düzelt
        </button>
        {basari ? (
          <span
            role="status"
            data-test="fiyat-basari"
            className="text-xs font-medium text-emerald-700"
          >
            {basari}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-test="fiyat-duzeltme"
      className="mt-2 w-full space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-2"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr]">
        <div>
          <label
            htmlFor={`fiyat-${cihazId}`}
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Alış Fiyatı (TL)
          </label>
          <input
            id={`fiyat-${cihazId}`}
            data-test="fiyat-girdisi"
            value={fiyat}
            onChange={(e) => setFiyat(e.target.value)}
            inputMode="decimal"
            className={`${GIRDI_SINIFI} text-right tabular-nums`}
          />
        </div>
        <div>
          <label
            htmlFor={`not-${cihazId}`}
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Cihaz notu
          </label>
          <input
            id={`not-${cihazId}`}
            data-test="fiyat-notu"
            value={not}
            onChange={(e) => setNot(e.target.value)}
            maxLength={500}
            placeholder="Örn. nakit depo girişinde fiyat revize edildi"
            className={GIRDI_SINIFI}
          />
        </div>
      </div>

      {hata ? (
        <p data-test="fiyat-hata" className="text-xs font-medium text-red-700">
          {hata}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-test="fiyat-kaydet"
          onClick={kaydet}
          disabled={bekliyor}
          className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:opacity-50"
        >
          {bekliyor ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAcik(false);
            setHata(null);
          }}
          className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
        >
          Vazgeç
        </button>
        <span className="text-xs text-slate-500">
          Eski fiyat cihazın tarihçesine düzeltme olarak yazılır.
        </span>
      </div>
    </div>
  );
}
