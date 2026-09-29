"use client";

import { useState, useTransition } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { hizliTedarikciEkle } from "@/app/(uygulama)/faturalar/eylemler";

export type TedarikciSecenegi = { id: number; ad: string };

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

/**
 * Tedarikçi açılır listesi ve yanında hızlı ekleme paneli.
 *
 * Panel ayrı bir <form> değil: fatura formunun içinde durduğu için iç içe form
 * kurulamaz, kayıt düğmesi doğrudan sunucu eylemini çağırır.
 */
export function TedarikciSecici({
  baslangic,
  alanAdi = "tedarikciId",
}: {
  baslangic: TedarikciSecenegi[];
  alanAdi?: string;
}) {
  const [liste, setListe] = useState(baslangic);
  const [secili, setSecili] = useState("");
  const [acik, setAcik] = useState(false);
  const [ad, setAd] = useState("");
  const [telefon, setTelefon] = useState("");
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [bekliyor, basla] = useTransition();

  function ekle() {
    setHata("");
    setBilgi("");
    basla(async () => {
      const sonuc = await hizliTedarikciEkle(ad, telefon);
      if (!sonuc.basarili) {
        setHata(sonuc.hata);
        return;
      }
      setListe((oncekiListe) =>
        oncekiListe.some((t) => t.id === sonuc.tedarikci.id)
          ? oncekiListe
          : [...oncekiListe, sonuc.tedarikci].sort((a, b) => a.ad.localeCompare(b.ad, "tr")),
      );
      setSecili(String(sonuc.tedarikci.id));
      setBilgi(`"${sonuc.tedarikci.ad}" seçildi.`);
      setAd("");
      setTelefon("");
      setAcik(false);
    });
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={alanAdi} className={KUCUK_ETIKET + " mb-0"}>
          Tedarikçi *
        </label>
        <button
          type="button"
          onClick={() => {
            setAcik((o) => !o);
            setHata("");
          }}
          className="text-xs font-medium text-blue-700 underline hover:text-blue-900"
        >
          {acik ? "Vazgeç" : "+ Yeni tedarikçi"}
        </button>
      </div>

      <select
        id={alanAdi}
        name={alanAdi}
        required
        value={secili}
        onChange={(e) => {
          setSecili(e.target.value);
          setBilgi("");
        }}
        className={GIRDI_SINIFI}
      >
        <option value="">Seçin…</option>
        {liste.map((t) => (
          <option key={t.id} value={t.id}>
            {t.ad}
          </option>
        ))}
      </select>

      {bilgi ? <p className="mt-1 text-xs text-emerald-700">{bilgi}</p> : null}

      {acik ? (
        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="mb-2 text-xs text-blue-900">
            Ad zorunlu. Vergi no, adres gibi bilgileri sonra Ayarlar → Tedarikçiler bölümünden
            tamamlayabilirsiniz.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={ad}
              onChange={(e) => setAd(e.target.value)}
              placeholder="Tedarikçi adı *"
              maxLength={80}
              className={GIRDI_SINIFI}
            />
            <input
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              placeholder="Telefon (isteğe bağlı)"
              maxLength={30}
              className={GIRDI_SINIFI}
            />
          </div>
          {hata ? (
            <p role="alert" className="mt-2 text-xs font-medium text-red-700">
              {hata}
            </p>
          ) : null}
          <button
            type="button"
            onClick={ekle}
            disabled={bekliyor || ad.trim().length < 2}
            className="mt-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bekliyor ? "Ekleniyor…" : "Tedarikçiyi Ekle ve Seç"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
