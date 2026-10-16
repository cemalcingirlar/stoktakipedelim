"use client";

import { useState, useTransition } from "react";
import { GIRDI_SINIFI } from "./Alan";
import {
  degisiklikVarMi,
  duzenlemeSorunu,
  kapsamSorulmali,
  kapsamSorusu,
  type DuzenlemeKapsami,
  type KunyeDegisikligi,
} from "@/lib/cihazDuzenleme";
import { cihazKunyesiniDuzenle } from "@/app/(uygulama)/cihazlar/eylemler";

export type KategoriSecenegi = {
  id: number;
  ad: string;
  altKategoriler: { id: number; ad: string }[];
};

export type DuzenlenecekCihaz = {
  id: number;
  marka: string;
  model: string;
  barkod: string | null;
  kategoriId: number;
  altKategoriId: number | null;
  /** Aynı barkodu taşıyan toplam cihaz sayısı (bu cihaz dahil). */
  ayniBarkodAdedi: number;
};

/**
 * Cihaz listesinde marka/model ve kategoriyi yerinde düzeltme.
 *
 * Aynı ürün çoğu zaman çok sayıda satır: 20 adet aynı kablo. Bu yüzden
 * kaydederken "aynı barkodtaki hepsine uygulansın mı" diye soruluyor —
 * soru yalnız o barkodda birden çok cihaz varken çıkıyor, tek cihazda
 * gereksiz tıklama olurdu.
 */
export function KunyeDuzenleyici({
  cihaz,
  kategoriler,
  etiket,
  kapat,
}: {
  cihaz: DuzenlenecekCihaz;
  kategoriler: KategoriSecenegi[];
  /** Düğme üzerinde görünen mevcut değer. */
  etiket: string;
  kapat?: () => void;
}) {
  const [acik, setAcik] = useState(false);
  const [marka, setMarka] = useState(cihaz.marka);
  const [model, setModel] = useState(cihaz.model);
  const [kategoriId, setKategoriId] = useState(cihaz.kategoriId);
  const [altKategoriId, setAltKategoriId] = useState<number | null>(cihaz.altKategoriId);
  const [hata, setHata] = useState<string | null>(null);
  const [basari, setBasari] = useState<string | null>(null);
  // Kapsam sorusu ekranda duruyorsa, kaydetme onu bekliyor demektir.
  const [kapsamSoruluyor, setKapsamSoruluyor] = useState(false);
  const [bekliyor, basla] = useTransition();

  const secilenKategori = kategoriler.find((k) => k.id === kategoriId);

  function degisikligiTopla(): KunyeDegisikligi {
    const d: KunyeDegisikligi = {};
    if (marka.trim() !== cihaz.marka) d.marka = marka;
    if (model.trim() !== cihaz.model) d.model = model;
    if (kategoriId !== cihaz.kategoriId) d.kategoriId = kategoriId;
    if (altKategoriId !== cihaz.altKategoriId) d.altKategoriId = altKategoriId;
    return d;
  }

  function kaydetmeyiBaslat() {
    const degisiklik = degisikligiTopla();
    const sorun = duzenlemeSorunu(degisiklik);
    if (sorun) {
      setHata(sorun);
      return;
    }
    setHata(null);

    if (kapsamSorulmali(cihaz.barkod, cihaz.ayniBarkodAdedi)) {
      setKapsamSoruluyor(true);
      return;
    }
    kaydet("TEK");
  }

  function kaydet(kapsam: DuzenlemeKapsami) {
    setKapsamSoruluyor(false);
    basla(async () => {
      const sonuc = await cihazKunyesiniDuzenle({
        cihazId: cihaz.id,
        kapsam,
        degisiklik: degisikligiTopla(),
      });
      if (sonuc.durum === "HATA") {
        setHata(sonuc.mesaj);
        return;
      }
      setBasari(sonuc.mesaj);
      setAcik(false);
      kapat?.();
    });
  }

  if (!acik) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          data-test="kunye-duzelt-ac"
          onClick={() => {
            setBasari(null);
            setAcik(true);
          }}
          title="Marka ve kategoriyi düzelt"
          className="text-left underline decoration-dotted underline-offset-2 hover:text-blue-700"
        >
          {etiket || "—"}
        </button>
        {basari ? (
          <span data-test="kunye-basari" role="status" className="text-xs text-emerald-700">
            ✓
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div
      data-test="kunye-duzenleme"
      className="min-w-[260px] space-y-2 rounded-lg border border-blue-300 bg-blue-50/70 p-2"
    >
      <div>
        <label className="mb-0.5 block text-[11px] font-medium text-slate-600">Marka</label>
        <input
          data-test="kunye-marka"
          value={marka}
          onChange={(e) => setMarka(e.target.value)}
          maxLength={60}
          className={`${GIRDI_SINIFI} py-1 text-xs`}
        />
      </div>

      <div>
        <label className="mb-0.5 block text-[11px] font-medium text-slate-600">Model</label>
        <input
          data-test="kunye-model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          maxLength={120}
          className={`${GIRDI_SINIFI} py-1 text-xs`}
        />
      </div>

      <div>
        <label className="mb-0.5 block text-[11px] font-medium text-slate-600">Kategori</label>
        <select
          data-test="kunye-kategori"
          value={kategoriId}
          onChange={(e) => {
            setKategoriId(Number(e.target.value));
            // Kategori değişince eski alt kategori artık geçersiz.
            setAltKategoriId(null);
          }}
          className={`${GIRDI_SINIFI} py-1 text-xs`}
        >
          {kategoriler.map((k) => (
            <option key={k.id} value={k.id}>
              {k.ad}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-0.5 block text-[11px] font-medium text-slate-600">Alt Kategori</label>
        <select
          data-test="kunye-alt-kategori"
          value={altKategoriId ?? ""}
          onChange={(e) => setAltKategoriId(e.target.value ? Number(e.target.value) : null)}
          className={`${GIRDI_SINIFI} py-1 text-xs`}
        >
          <option value="">—</option>
          {(secilenKategori?.altKategoriler ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.ad}
            </option>
          ))}
        </select>
      </div>

      {hata ? (
        <p data-test="kunye-hata" role="alert" className="text-xs font-medium text-red-700">
          {hata}
        </p>
      ) : null}

      {kapsamSoruluyor && cihaz.barkod ? (
        <div
          data-test="kapsam-sorusu"
          className="space-y-2 rounded border border-amber-300 bg-amber-50 p-2"
        >
          <p className="text-xs font-medium text-amber-900">
            {kapsamSorusu(cihaz.barkod, cihaz.ayniBarkodAdedi)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-test="kapsam-barkod"
              onClick={() => kaydet("BARKOD")}
              className="rounded bg-amber-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-800"
            >
              Evet, {cihaz.ayniBarkodAdedi} cihazın hepsi
            </button>
            <button
              type="button"
              data-test="kapsam-tek"
              onClick={() => kaydet("TEK")}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Yalnız bu cihaz
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-test="kunye-kaydet"
            onClick={kaydetmeyiBaslat}
            disabled={bekliyor || !degisiklikVarMi(degisikligiTopla())}
            className="rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {bekliyor ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAcik(false);
              setHata(null);
              setMarka(cihaz.marka);
              setModel(cihaz.model);
              setKategoriId(cihaz.kategoriId);
              setAltKategoriId(cihaz.altKategoriId);
            }}
            className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
          >
            Vazgeç
          </button>
        </div>
      )}
    </div>
  );
}
