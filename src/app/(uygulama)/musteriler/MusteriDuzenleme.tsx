"use client";

import { useActionState, useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import {
  ADRES_EN_COK,
  AD_EN_AZ,
  AD_EN_COK,
  NOT_EN_COK,
  TCKN_EN_COK,
  TELEFON_EN_COK,
  silmeOzeti,
} from "@/lib/musteriDuzenleme";
import { musteriGuncelle, musteriSil, type MusteriDurumu } from "./eylemler";

type Musteri = {
  id: number;
  adSoyad: string;
  telefon: string | null;
  tcknVkn: string | null;
  adres: string | null;
  not: string | null;
};

/**
 * Müşteri bilgilerinin düzeltilmesi ve kaydın silinmesi.
 *
 * Düzeltme her kullanıcıya açık: kaydı satış ekranında oluşturan ve yanlış
 * yazılan telefonu fark eden genelde aynı kişi.
 *
 * Silme yalnız yöneticide ve iki adımlı; ne olacağı önceden yazılı, çünkü
 * satışı olan müşteride kayıt silinmiyor, kişisel alanlar boşaltılıyor.
 */
export function MusteriDuzenleme({
  musteri,
  satisAdedi,
  silebilir,
}: {
  musteri: Musteri;
  satisAdedi: number;
  silebilir: boolean;
}) {
  const [acik, setAcik] = useState(false);
  const [silmeAcik, setSilmeAcik] = useState(false);
  const [guncelDurum, guncelle] = useActionState<MusteriDurumu, FormData>(
    musteriGuncelle,
    {},
  );
  const [silmeDurumu, sil] = useActionState<MusteriDurumu, FormData>(
    musteriSil,
    {},
  );

  if (!acik) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-test="musteri-duzenle-ac"
          onClick={() => setAcik(true)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
        >
          Bilgileri düzelt
        </button>
        {guncelDurum.basari ? (
          <span role="status" className="text-xs text-emerald-700">
            {guncelDurum.basari}
          </span>
        ) : null}
        {silmeDurumu.basari ? (
          <span
            role="status"
            data-test="musteri-silme-basari"
            className="text-xs text-emerald-700"
          >
            {silmeDurumu.basari}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <form
        action={guncelle}
        data-test="musteri-duzenleme-formu"
        className="space-y-2"
      >
        <input type="hidden" name="musteriId" value={musteri.id} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label
              htmlFor={`ad-${musteri.id}`}
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Ad soyad
            </label>
            <input
              id={`ad-${musteri.id}`}
              name="adSoyad"
              data-test="musteri-ad"
              required
              minLength={AD_EN_AZ}
              maxLength={AD_EN_COK}
              defaultValue={musteri.adSoyad}
              className={GIRDI_SINIFI}
            />
          </div>
          <div>
            <label
              htmlFor={`tel-${musteri.id}`}
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Telefon
            </label>
            <input
              id={`tel-${musteri.id}`}
              name="telefon"
              data-test="musteri-telefon"
              inputMode="tel"
              maxLength={TELEFON_EN_COK}
              defaultValue={musteri.telefon ?? ""}
              className={GIRDI_SINIFI}
            />
          </div>
          <div>
            <label
              htmlFor={`tckn-${musteri.id}`}
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              TCKN / VKN
            </label>
            <input
              id={`tckn-${musteri.id}`}
              name="tcknVkn"
              data-test="musteri-tckn"
              inputMode="numeric"
              maxLength={TCKN_EN_COK}
              defaultValue={musteri.tcknVkn ?? ""}
              className={GIRDI_SINIFI}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`adres-${musteri.id}`}
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Adres
            </label>
            <input
              id={`adres-${musteri.id}`}
              name="adres"
              data-test="musteri-adres"
              maxLength={ADRES_EN_COK}
              defaultValue={musteri.adres ?? ""}
              className={GIRDI_SINIFI}
            />
          </div>
          <div>
            <label
              htmlFor={`not-${musteri.id}`}
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Not
            </label>
            <input
              id={`not-${musteri.id}`}
              name="not"
              data-test="musteri-not"
              maxLength={NOT_EN_COK}
              defaultValue={musteri.not ?? ""}
              className={GIRDI_SINIFI}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <GonderDugmesi tur="ikincil" bekleyenMetin="Kaydediliyor…">
            Kaydet
          </GonderDugmesi>
          <button
            type="button"
            onClick={() => setAcik(false)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Kapat
          </button>
        </div>
        {guncelDurum.hata ? (
          <p
            role="alert"
            data-test="musteri-hata"
            className="text-sm text-red-600"
          >
            {guncelDurum.hata}
          </p>
        ) : null}
        {guncelDurum.basari ? (
          <p role="status" className="text-sm text-emerald-700">
            {guncelDurum.basari}
          </p>
        ) : null}
      </form>

      {silebilir ? (
        <div className="border-t border-slate-200 pt-2">
          {!silmeAcik ? (
            <button
              type="button"
              data-test="musteri-sil-ac"
              onClick={() => setSilmeAcik(true)}
              className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50"
            >
              Kaydı sil (KVKK talebi)
            </button>
          ) : (
            <form
              action={sil}
              data-test="musteri-silme-formu"
              className="space-y-2"
            >
              <input type="hidden" name="musteriId" value={musteri.id} />
              {/* Ne olacağı önceden yazılı: satışı olan müşteride kayıt
                  silinmiyor, yalnız kişisel alanlar boşaltılıyor. */}
              <p
                data-test="musteri-silme-ozeti"
                className="text-xs text-slate-700"
              >
                {silmeOzeti(satisAdedi)}
              </p>
              <div className="flex flex-wrap gap-2">
                <GonderDugmesi bekleyenMetin="Siliniyor…">
                  Evet, Sil
                </GonderDugmesi>
                <button
                  type="button"
                  onClick={() => setSilmeAcik(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Vazgeç
                </button>
              </div>
            </form>
          )}
          {silmeDurumu.hata ? (
            <p
              role="alert"
              data-test="musteri-silme-hata"
              className="mt-2 text-sm text-red-600"
            >
              {silmeDurumu.hata}
            </p>
          ) : null}
          {silmeDurumu.basari ? (
            <p
              role="status"
              data-test="musteri-silme-basari"
              className="mt-2 text-sm text-emerald-700"
            >
              {silmeDurumu.basari}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
