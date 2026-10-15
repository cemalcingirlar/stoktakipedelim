"use client";

import { useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { musteriAra, type MusteriOzeti } from "../satis/eylemler";

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

/**
 * Aktarımda sat-geri al için müşteri seçimi.
 *
 * Satış ekranının müşteri bölümünün sade hali: burada TCKN ve adres sorulmuyor,
 * çünkü ekran okutma odaklı ve cihaz dükkânda kalıyor. Aynı müşteri arama
 * eylemi paylaşılıyor — müşteri kayıtları tek yerde tutulsun.
 */
export function MusteriBlogu({
  secili,
  setSecili,
  yeniAd,
  setYeniAd,
  yeniTelefon,
  setYeniTelefon,
}: {
  secili: MusteriOzeti | null;
  setSecili: (m: MusteriOzeti | null) => void;
  yeniAd: string;
  setYeniAd: (v: string) => void;
  yeniTelefon: string;
  setYeniTelefon: (v: string) => void;
}) {
  const [sorgu, setSorgu] = useState("");
  const [sonuclar, setSonuclar] = useState<MusteriOzeti[]>([]);
  const [araniyor, setAraniyor] = useState(false);

  async function ara() {
    const temiz = sorgu.trim();
    if (temiz.length < 2) return;
    setAraniyor(true);
    try {
      setSonuclar(await musteriAra(temiz));
    } finally {
      setAraniyor(false);
    }
  }

  return (
    <div>
      <div className="mb-2">
        <label htmlFor="aktarimMusteriSorgu" className={KUCUK_ETIKET}>
          Kayıtlı müşteri ara (ad veya telefon)
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="aktarimMusteriSorgu"
            data-test="musteri-sorgu"
            value={sorgu}
            onChange={(e) => setSorgu(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ara();
              }
            }}
            placeholder="En az 2 karakter"
            className={`min-w-0 flex-1 ${GIRDI_SINIFI}`}
          />
          <button
            type="button"
            onClick={ara}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {araniyor ? "Aranıyor…" : "Ara"}
          </button>
        </div>

        {sonuclar.length > 0 ? (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {sonuclar.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  data-test="musteri-secenegi"
                  onClick={() => {
                    setSecili(m);
                    setSonuclar([]);
                    setSorgu("");
                  }}
                  className="w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50"
                >
                  <span className="font-medium text-slate-800">{m.adSoyad}</span>
                  {m.telefon ? <span className="ml-2 text-slate-500">{m.telefon}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {secili ? (
        <div
          data-test="secili-musteri"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
        >
          <div className="text-sm">
            <span className="font-medium text-emerald-900">{secili.adSoyad}</span>
            {secili.telefon ? <span className="ml-2 text-emerald-800">{secili.telefon}</span> : null}
          </div>
          <button
            type="button"
            onClick={() => setSecili(null)}
            className="text-xs font-medium text-emerald-800 hover:underline"
          >
            Kaldır
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="aktarimYeniAd" className={KUCUK_ETIKET}>
              Ad Soyad *
            </label>
            <input
              id="aktarimYeniAd"
              data-test="musteri-ad"
              value={yeniAd}
              onChange={(e) => setYeniAd(e.target.value)}
              maxLength={80}
              className={GIRDI_SINIFI}
            />
          </div>
          <div>
            <label htmlFor="aktarimYeniTelefon" className={KUCUK_ETIKET}>
              Telefon
            </label>
            <input
              id="aktarimYeniTelefon"
              data-test="musteri-telefon"
              value={yeniTelefon}
              onChange={(e) => setYeniTelefon(e.target.value)}
              maxLength={30}
              className={GIRDI_SINIFI}
            />
          </div>
        </div>
      )}
    </div>
  );
}
