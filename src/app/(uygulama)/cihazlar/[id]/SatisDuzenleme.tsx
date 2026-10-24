"use client";

import { useActionState, useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { kurusuTLYaz, tlyiKurusaCevir } from "@/lib/para";
import { ODEME_TIPI, ODEME_TIPI_ETIKET, type OdemeTipi } from "@/lib/sabitler";
import { inputTarih } from "@/lib/tarih";
import {
  satisiDuzenle,
  satisiGeriAl,
  type SatisDuzenlemeDurumu,
} from "./eylemler";

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export type SatisBilgisi = {
  cihazId: number;
  satisFiyatiKurus: number | null;
  odemeTipi: string | null;
  satisTarihi: string | null;
  satanKullaniciId: number | null;
  musteriId: number | null;
  not: string | null;
  alisFiyatiKurus: number;
};

/**
 * Yöneticinin kaydedilmiş bir satışı düzeltmesi.
 *
 * Varsayılan olarak kapalı duruyor: cihaz sayfasına çoğunlukla bakmak için
 * giriliyor, düzeltme bilinçli bir adım olmalı.
 */
export function SatisDuzenleme({
  satis,
  kullanicilar,
  musteriler,
  bugun,
}: {
  /** Bugünün tarihi, sunucunun saat diliminde (bkz. SatisFormu'ndaki not). */
  bugun: string;
  satis: SatisBilgisi;
  kullanicilar: { id: number; adSoyad: string }[];
  musteriler: { id: number; adSoyad: string; telefon: string | null }[];
}) {
  const [acik, setAcik] = useState(false);
  const [durum, eylem] = useActionState<SatisDuzenlemeDurumu, FormData>(
    satisiDuzenle,
    {},
  );
  const [geriDurum, geriEylem] = useActionState<SatisDuzenlemeDurumu, FormData>(
    satisiGeriAl,
    {},
  );
  const [geriAlOnayi, setGeriAlOnayi] = useState(false);

  const [fiyat, setFiyat] = useState(kurusuTLYaz(satis.satisFiyatiKurus ?? 0));
  const [odemeTipi, setOdemeTipi] = useState(
    satis.odemeTipi ?? ODEME_TIPI.NAKIT,
  );
  const [tarih, setTarih] = useState(
    satis.satisTarihi ? inputTarih(new Date(satis.satisTarihi)) : bugun,
  );
  const [satanId, setSatanId] = useState(
    satis.satanKullaniciId ?? kullanicilar[0]?.id ?? 0,
  );
  const [musteriId, setMusteriId] = useState<number | "">(
    satis.musteriId ?? "",
  );
  const [not, setNot] = useState(satis.not ?? "");

  const satisKurus = tlyiKurusaCevir(fiyat);
  const kar = satisKurus === null ? null : satisKurus - satis.alisFiyatiKurus;

  function veriyiHazirla(): FormData {
    const yuk = {
      cihazId: satis.cihazId,
      satisFiyatiKurus: satisKurus ?? -1,
      odemeTipi,
      satisTarihi: tarih,
      satanKullaniciId: Number(satanId) || 0,
      musteriId: Number(musteriId) || null,
      not: not.trim() || null,
    };
    const form = new FormData();
    form.set("veri", JSON.stringify(yuk));
    return form;
  }

  if (!acik) {
    return (
      <div className="mt-3 border-t border-slate-100 pt-3">
        <button
          type="button"
          data-test="satis-duzenle-ac"
          onClick={() => setAcik(true)}
          className="text-sm font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
        >
          Satış bilgilerini düzelt
        </button>
        {durum.basari || geriDurum.basari ? (
          <p
            role="status"
            className="mt-2 text-sm font-medium text-emerald-700"
          >
            {durum.basari ?? geriDurum.basari}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-test="satis-duzenleme"
      className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Satışı düzelt</h3>
        <button
          type="button"
          onClick={() => setAcik(false)}
          className="text-xs font-medium text-slate-500 underline hover:text-slate-800"
        >
          Kapat
        </button>
      </div>

      {durum.hata ? (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {durum.hata}
        </p>
      ) : null}
      {durum.basari ? (
        <p
          role="status"
          className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {durum.basari}
        </p>
      ) : null}

      <form action={() => eylem(veriyiHazirla())} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="duzeltFiyat" className={KUCUK_ETIKET}>
              Satış Fiyatı (TL)
            </label>
            <input
              id="duzeltFiyat"
              data-test="duzelt-satis-fiyati"
              value={fiyat}
              onChange={(e) => setFiyat(e.target.value)}
              inputMode="decimal"
              className={`${GIRDI_SINIFI} text-right tabular-nums`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Kâr:{" "}
              <span
                className={
                  kar === null
                    ? ""
                    : kar < 0
                      ? "text-red-600"
                      : "text-emerald-700"
                }
              >
                {kar === null ? "—" : `${kurusuTLYaz(kar)} TL`}
              </span>
            </p>
          </div>

          <div>
            <label htmlFor="duzeltOdeme" className={KUCUK_ETIKET}>
              Ödeme Tipi
            </label>
            <select
              id="duzeltOdeme"
              data-test="duzelt-odeme-tipi"
              value={odemeTipi}
              onChange={(e) => setOdemeTipi(e.target.value)}
              className={GIRDI_SINIFI}
            >
              {Object.values(ODEME_TIPI).map((t) => (
                <option key={t} value={t}>
                  {ODEME_TIPI_ETIKET[t as OdemeTipi]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="duzeltTarih" className={KUCUK_ETIKET}>
              Satış Tarihi
            </label>
            <input
              id="duzeltTarih"
              type="date"
              value={tarih}
              onChange={(e) => setTarih(e.target.value)}
              className={GIRDI_SINIFI}
            />
          </div>

          <div>
            <label htmlFor="duzeltSatan" className={KUCUK_ETIKET}>
              Satışı Yapan
            </label>
            <select
              id="duzeltSatan"
              data-test="duzelt-satan"
              value={satanId}
              onChange={(e) => setSatanId(Number(e.target.value))}
              className={GIRDI_SINIFI}
            >
              {kullanicilar.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.adSoyad}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="duzeltMusteri" className={KUCUK_ETIKET}>
              Müşteri
            </label>
            <select
              id="duzeltMusteri"
              data-test="duzelt-musteri"
              value={musteriId}
              onChange={(e) =>
                setMusteriId(e.target.value ? Number(e.target.value) : "")
              }
              className={GIRDI_SINIFI}
            >
              <option value="">— müşterisiz —</option>
              {musteriler.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.adSoyad}
                  {m.telefon ? ` · ${m.telefon}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="duzeltNot" className={KUCUK_ETIKET}>
              Not
            </label>
            <input
              id="duzeltNot"
              value={not}
              onChange={(e) => setNot(e.target.value)}
              maxLength={300}
              className={GIRDI_SINIFI}
            />
          </div>
        </div>

        <GonderDugmesi bekleyenMetin="Kaydediliyor…">
          Değişiklikleri Kaydet
        </GonderDugmesi>
      </form>

      {/* ---------------------------------------------- satışı geri alma */}
      <div className="border-t border-slate-200 pt-3">
        {geriDurum.hata ? (
          <p
            role="alert"
            className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {geriDurum.hata}
          </p>
        ) : null}
        {geriDurum.basari ? (
          <p
            role="status"
            className="mb-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            {geriDurum.basari}
          </p>
        ) : null}

        {geriAlOnayi ? (
          <form
            action={geriEylem}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="cihazId" value={satis.cihazId} />
            <span className="text-sm text-slate-700">
              Satış silinecek, cihaz tekrar stoğa dönecek. Emin misiniz?
            </span>
            <GonderDugmesi tur="tehlike" bekleyenMetin="Geri alınıyor…">
              Evet, satışı geri al
            </GonderDugmesi>
            <button
              type="button"
              onClick={() => setGeriAlOnayi(false)}
              className="text-sm font-medium text-slate-600 underline hover:text-slate-900"
            >
              Vazgeç
            </button>
          </form>
        ) : (
          <button
            type="button"
            data-test="satis-geri-al"
            onClick={() => setGeriAlOnayi(true)}
            className="text-sm font-medium text-red-700 underline underline-offset-2 hover:text-red-900"
          >
            Satışı geri al (cihaz stoğa dönsün)
          </button>
        )}
      </div>
    </div>
  );
}
