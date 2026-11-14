"use client";

import { useActionState, useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { kurusuTLYaz, kurusuTLYazSembollu, tlyiKurusaCevir } from "@/lib/para";
import { ODEME_TIPI, ODEME_TIPI_ETIKET, type OdemeTipi } from "@/lib/sabitler";
import { SATIS_NOTU_EN_COK } from "@/lib/satisDuzeltme";
import { satisKartiniDuzenle, type SatisKartiDurumu } from "./eylemler";

const ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export type DuzenlenenSatis = {
  id: number;
  musteriId: number;
  satanKullaniciId: number;
  odemeTipi: string;
  /** Satış günü, sunucunun saat diliminde: "2026-11-14". */
  satisGunu: string;
  not: string | null;
  kalemler: {
    id: number;
    ad: string;
    kod: string;
    satisFiyatiKurus: number;
  }[];
};

/**
 * Satış kartının yönetici tarafından düzeltilmesi.
 *
 * Varsayılan olarak kapalı: karta çoğunlukla bakmak için giriliyor, düzeltme
 * bilinçli bir adım olmalı. Bileşenin görünmesi bir koruma değil; yetki
 * sunucu eyleminde sınanıyor.
 *
 * Müşterinin kendi bilgileri (ad, telefon, TCKN, adres) burada değil müşteri
 * kaydında düzeltiliyor: o bilgiler müşterinin bütün satışlarında ortak.
 * Burada satışın HANGİ müşteriye ait olduğu değiştirilebiliyor.
 */
export function SatisKartiDuzenleme({
  satis,
  bugun,
  kullanicilar,
  musteriler,
}: {
  satis: DuzenlenenSatis;
  /** Bugün, sunucunun saat diliminde; ileri tarih seçilemesin diye. */
  bugun: string;
  kullanicilar: { id: number; adSoyad: string; aktif: boolean }[];
  musteriler: { id: number; adSoyad: string; telefon: string | null }[];
}) {
  // Form açıldığı andaki eylem durumu; kapalıyken null. Başarılı bir sonuç
  // gelince form kapanıyor, hata gelince açık kalıyor.
  const [acilisDurumu, setAcilisDurumu] = useState<SatisKartiDurumu | null>(null);
  const [durum, eylem] = useActionState<SatisKartiDurumu, FormData>(
    satisKartiniDuzenle,
    {},
  );

  const [musteriId, setMusteriId] = useState(satis.musteriId);
  const [satanId, setSatanId] = useState(satis.satanKullaniciId);
  const [odemeTipi, setOdemeTipi] = useState(satis.odemeTipi);
  const [gun, setGun] = useState(satis.satisGunu);
  const [not, setNot] = useState(satis.not ?? "");
  const [aciklama, setAciklama] = useState("");
  const [fiyatlar, setFiyatlar] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      satis.kalemler.map((k) => [k.id, kurusuTLYaz(k.satisFiyatiKurus)]),
    ),
  );

  const kuruslar = satis.kalemler.map((k) => tlyiKurusaCevir(fiyatlar[k.id] ?? ""));
  const fiyatHatasi = kuruslar.some((k) => k === null || k < 0);
  const toplam = kuruslar.reduce<number>((t, k) => t + (k ?? 0), 0);

  const kapali =
    acilisDurumu === null ||
    (durum !== acilisDurumu && durum.basari !== undefined);

  if (kapali) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-test="satis-karti-duzenle"
          onClick={() => setAcilisDurumu(durum)}
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Satışı Düzenle
        </button>
        {durum.basari ? (
          <span role="status" data-test="satis-karti-basari" className="text-sm font-medium text-emerald-700">
            {durum.basari}
          </span>
        ) : null}
      </div>
    );
  }

  function veri(): FormData {
    const form = new FormData();
    form.set(
      "veri",
      JSON.stringify({
        satisId: satis.id,
        musteriId: Number(musteriId) || 0,
        satanKullaniciId: Number(satanId) || 0,
        odemeTipi,
        satisTarihi: gun,
        not: not.trim() || null,
        aciklama: aciklama.trim() || null,
        fiyatlar: satis.kalemler.map((k, i) => ({
          cihazId: k.id,
          kurus: kuruslar[i] ?? -1,
        })),
      }),
    );
    return form;
  }

  return (
    <form
      action={() => eylem(veri())}
      data-test="satis-karti-formu"
      className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Satışı düzenle</h2>
        <button
          type="button"
          onClick={() => setAcilisDurumu(null)}
          className="text-xs font-medium text-slate-500 underline hover:text-slate-800"
        >
          Kapat
        </button>
      </div>

      {durum.hata ? (
        <p role="alert" data-test="satis-karti-hata" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {durum.hata}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="duzenMusteri" className={ETIKET}>Müşteri</label>
          <select
            id="duzenMusteri"
            data-test="duzen-musteri"
            value={musteriId}
            onChange={(e) => setMusteriId(Number(e.target.value))}
            className={GIRDI_SINIFI}
          >
            {musteriler.map((m) => (
              <option key={m.id} value={m.id}>
                {m.adSoyad}
                {m.telefon ? ` · ${m.telefon}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="duzenSatan" className={ETIKET}>Satışı yapan</label>
          <select
            id="duzenSatan"
            data-test="duzen-satan"
            value={satanId}
            onChange={(e) => setSatanId(Number(e.target.value))}
            className={GIRDI_SINIFI}
          >
            {kullanicilar.map((k) => (
              <option key={k.id} value={k.id}>
                {k.adSoyad}
                {k.aktif ? "" : " (pasif)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="duzenOdeme" className={ETIKET}>Ödeme tipi</label>
          <select
            id="duzenOdeme"
            data-test="duzen-odeme"
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
          <label htmlFor="duzenTarih" className={ETIKET}>Satış tarihi</label>
          <input
            id="duzenTarih"
            data-test="duzen-tarih"
            type="date"
            max={bugun}
            value={gun}
            onChange={(e) => setGun(e.target.value)}
            required
            className={GIRDI_SINIFI}
          />
        </div>
        <div className="sm:col-span-1 lg:col-span-3">
          <label htmlFor="duzenNot" className={ETIKET}>Satış notu</label>
          <input
            id="duzenNot"
            data-test="duzen-not"
            value={not}
            maxLength={SATIS_NOTU_EN_COK}
            onChange={(e) => setNot(e.target.value)}
            className={GIRDI_SINIFI}
          />
        </div>
      </div>

      <div>
        <p className={ETIKET}>Satış fiyatları</p>
        <div className="space-y-2">
          {satis.kalemler.map((k, i) => (
            <div key={k.id} className="flex flex-wrap items-center gap-2" data-test="duzen-kalem">
              <span className="min-w-0 flex-1 text-sm text-slate-800">
                {k.ad} <span className="font-mono text-xs text-slate-500">{k.kod}</span>
              </span>
              <input
                aria-label={`${k.ad} satış fiyatı`}
                data-test="duzen-fiyat"
                inputMode="decimal"
                autoComplete="off"
                value={fiyatlar[k.id] ?? ""}
                onChange={(e) =>
                  setFiyatlar((onceki) => ({ ...onceki, [k.id]: e.target.value }))
                }
                className={`${GIRDI_SINIFI} w-36 text-right font-mono ${
                  kuruslar[i] === null || (kuruslar[i] ?? 0) < 0 ? "border-red-400" : ""
                }`}
              />
              <span className="text-xs text-slate-500">TL</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-right text-sm text-slate-700">
          Toplam: <strong data-test="duzen-toplam">{kurusuTLYazSembollu(toplam)}</strong>
        </p>
      </div>

      <div>
        <label htmlFor="duzenAciklama" className={ETIKET}>
          Düzeltme açıklaması (isteğe bağlı, işlem kaydına yazılır)
        </label>
        <input
          id="duzenAciklama"
          data-test="duzen-aciklama"
          value={aciklama}
          maxLength={300}
          placeholder="Örn. ödeme tipi yanlış seçilmiş"
          onChange={(e) => setAciklama(e.target.value)}
          className={GIRDI_SINIFI}
        />
      </div>

      <p className="text-xs text-slate-600">
        Neyin neyden neye değiştiği işlem kaydına ve cihazların tarihçesine
        yazılır. Müşterinin adı, telefonu ve adresi müşteri kaydından düzeltilir.
      </p>

      <GonderDugmesi bekleyenMetin="Kaydediliyor…" disabled={fiyatHatasi}>
        Değişiklikleri Kaydet
      </GonderDugmesi>
    </form>
  );
}
