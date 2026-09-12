"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { kurusuTLYaz, tlyiKurusaCevir } from "@/lib/para";
import { VADE_ETIKET, VADE_SECENEKLERI } from "@/lib/sabitler";
import { inputTarih } from "@/lib/tarih";
import { faturaKaydet, type FaturaDurumu } from "../eylemler";

export type KategoriSecimi = {
  id: number;
  ad: string;
  seriNoZorunlu: boolean;
  altKategoriler: { id: number; ad: string }[];
};

type Satir = {
  anahtar: number;
  kategoriId: string;
  altKategoriId: string;
  marka: string;
  model: string;
  renk: string;
  kapasite: string;
  seriNo: string;
  barkod: string;
  alisFiyati: string;
  not: string;
};

let sayac = 0;
function bosSatir(kalip?: Partial<Satir>): Satir {
  sayac += 1;
  return {
    anahtar: sayac,
    kategoriId: "",
    altKategoriId: "",
    marka: "",
    model: "",
    renk: "",
    kapasite: "",
    seriNo: "",
    barkod: "",
    alisFiyati: "",
    not: "",
    ...kalip,
  };
}

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export function FaturaFormu({
  kategoriler,
  tedarikciler,
  magazalar,
  varsayilanMagazaId,
}: {
  kategoriler: KategoriSecimi[];
  tedarikciler: { id: number; ad: string }[];
  magazalar: { id: number; kod: string; ad: string }[];
  varsayilanMagazaId: number | null;
}) {
  const [durum, eylem] = useActionState<FaturaDurumu, FormData>(faturaKaydet, {});
  const [satirlar, setSatirlar] = useState<Satir[]>([bosSatir()]);
  const [okutma, setOkutma] = useState("");
  const [okutmaUyarisi, setOkutmaUyarisi] = useState("");
  const okutmaRef = useRef<HTMLInputElement>(null);

  // Sunucudan hata döndüyse kullanıcı listenin başını görsün.
  useEffect(() => {
    if (durum.hata) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [durum]);

  function satirGuncelle(anahtar: number, alan: keyof Satir, deger: string) {
    setSatirlar((mevcut) =>
      mevcut.map((s) => {
        if (s.anahtar !== anahtar) return s;
        // Kategori değişince ona ait olmayan alt kategori seçimi temizlenir.
        if (alan === "kategoriId") return { ...s, kategoriId: deger, altKategoriId: "" };
        return { ...s, [alan]: deger };
      }),
    );
  }

  function satirSil(anahtar: number) {
    setSatirlar((mevcut) =>
      mevcut.length === 1 ? [bosSatir()] : mevcut.filter((s) => s.anahtar !== anahtar),
    );
  }

  /** Barkod okuyucu Enter ile bitirir: yeni satır açıp bir önceki satırın bilgilerini kopyalar. */
  function okutmayiIsle() {
    const kod = okutma.trim().toUpperCase();
    if (!kod) return;

    if (satirlar.some((s) => s.seriNo.trim().toUpperCase() === kod)) {
      setOkutmaUyarisi(`${kod} zaten bu faturada var.`);
      setOkutma("");
      return;
    }

    const son = satirlar[satirlar.length - 1];
    const sonBos =
      son && !son.seriNo && !son.marka && !son.model && !son.kategoriId && !son.alisFiyati;

    if (sonBos) {
      // İlk okutma: boş duran satırı doldur.
      satirGuncelle(son.anahtar, "seriNo", kod);
    } else {
      // Sonraki okutmalar: aynı ürün grubundan devam etmek yaygın, bilgileri kopyala.
      setSatirlar((mevcut) => [
        ...mevcut,
        bosSatir({
          kategoriId: son?.kategoriId ?? "",
          altKategoriId: son?.altKategoriId ?? "",
          marka: son?.marka ?? "",
          model: son?.model ?? "",
          renk: son?.renk ?? "",
          kapasite: son?.kapasite ?? "",
          alisFiyati: son?.alisFiyati ?? "",
          seriNo: kod,
        }),
      ]);
    }

    setOkutmaUyarisi("");
    setOkutma("");
    okutmaRef.current?.focus();
  }

  const toplamKurus = satirlar.reduce((t, s) => t + (tlyiKurusaCevir(s.alisFiyati) ?? 0), 0);

  function veriyiHazirla(form: FormData): FormData {
    const yuk = {
      tedarikciId: Number(form.get("tedarikciId")) || 0,
      magazaId: Number(form.get("magazaId")) || 0,
      faturaNo: String(form.get("faturaNo") ?? ""),
      faturaTarihi: String(form.get("faturaTarihi") ?? ""),
      vadeGun: Number(form.get("vadeGun")) || 0,
      not: String(form.get("not") ?? "").trim() || null,
      satirlar: satirlar.map((s) => ({
        kategoriId: Number(s.kategoriId) || 0,
        altKategoriId: Number(s.altKategoriId) || null,
        marka: s.marka,
        model: s.model,
        renk: s.renk.trim() || null,
        kapasite: s.kapasite.trim() || null,
        seriNo: s.seriNo.trim() || null,
        barkod: s.barkod.trim() || null,
        alisFiyatiKurus: tlyiKurusaCevir(s.alisFiyati) ?? 0,
        not: s.not.trim() || null,
      })),
    };

    const yeni = new FormData();
    yeni.set("veri", JSON.stringify(yuk));
    return yeni;
  }

  return (
    <form action={(form) => eylem(veriyiHazirla(form))} className="space-y-5">
      {durum.hata ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{durum.hata}</p>
          {durum.alanHatalari?.length ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-red-700">
              {durum.alanHatalari.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------------- Fatura başlığı */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Fatura Bilgileri</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="tedarikciId" className={KUCUK_ETIKET}>
              Tedarikçi *
            </label>
            <select id="tedarikciId" name="tedarikciId" required className={GIRDI_SINIFI}>
              <option value="">Seçin…</option>
              {tedarikciler.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.ad}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="faturaNo" className={KUCUK_ETIKET}>
              Fatura No *
            </label>
            <input id="faturaNo" name="faturaNo" required maxLength={40} className={GIRDI_SINIFI} />
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
              defaultValue={inputTarih(new Date())}
              className={GIRDI_SINIFI}
            />
          </div>

          <div>
            <label htmlFor="magazaId" className={KUCUK_ETIKET}>
              Giriş Yapılacak Depo *
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

          <div>
            <label htmlFor="vadeGun" className={KUCUK_ETIKET}>
              Vade (tedarikçinin uyguladığı)
            </label>
            <select id="vadeGun" name="vadeGun" defaultValue="0" className={GIRDI_SINIFI}>
              {VADE_SECENEKLERI.map((v) => (
                <option key={v} value={v}>
                  {VADE_ETIKET[v]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="not" className={KUCUK_ETIKET}>
              Fatura Notu
            </label>
            <input id="not" name="not" maxLength={500} className={GIRDI_SINIFI} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Barkod okutma */}
      <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <label htmlFor="okutma" className="mb-1 block text-sm font-medium text-blue-900">
          Seri No / Barkod Okut
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="okutma"
            ref={okutmaRef}
            value={okutma}
            onChange={(e) => setOkutma(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Okuyucu Enter gönderir; formu göndermeden satır eklenmeli.
                e.preventDefault();
                okutmayiIsle();
              }
            }}
            placeholder="Okuyucuyu kullanın veya IMEI yazıp Enter'a basın"
            className={`okutma-girdisi min-w-0 flex-1 ${GIRDI_SINIFI}`}
          />
          <button
            type="button"
            onClick={okutmayiIsle}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Satır Ekle
          </button>
        </div>
        <p className="mt-1.5 text-xs text-blue-800">
          Her okutmada yeni satır açılır ve bir önceki satırın marka/model/fiyat bilgileri kopyalanır.
        </p>
        {okutmaUyarisi ? (
          <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
            {okutmaUyarisi}
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------------- Satırlar */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            Cihazlar <span className="font-normal text-slate-500">({satirlar.length} satır)</span>
          </h2>
          <button
            type="button"
            onClick={() => setSatirlar((m) => [...m, bosSatir()])}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            + Boş Satır
          </button>
        </div>

        {satirlar.map((satir, sira) => {
          const kategori = kategoriler.find((k) => String(k.id) === satir.kategoriId);
          return (
            <div
              key={satir.anahtar}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{sira + 1}. cihaz</span>
                <button
                  type="button"
                  onClick={() => satirSil(satir.anahtar)}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                >
                  Sil
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={KUCUK_ETIKET}>Kategori *</label>
                  <select
                    value={satir.kategoriId}
                    onChange={(e) => satirGuncelle(satir.anahtar, "kategoriId", e.target.value)}
                    className={GIRDI_SINIFI}
                  >
                    <option value="">Seçin…</option>
                    {kategoriler.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.ad}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={KUCUK_ETIKET}>Alt Kategori</label>
                  <select
                    value={satir.altKategoriId}
                    onChange={(e) => satirGuncelle(satir.anahtar, "altKategoriId", e.target.value)}
                    disabled={!kategori}
                    className={GIRDI_SINIFI}
                  >
                    <option value="">—</option>
                    {kategori?.altKategoriler.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.ad}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={KUCUK_ETIKET}>Marka *</label>
                  <input
                    value={satir.marka}
                    onChange={(e) => satirGuncelle(satir.anahtar, "marka", e.target.value)}
                    className={GIRDI_SINIFI}
                  />
                </div>

                <div>
                  <label className={KUCUK_ETIKET}>Model *</label>
                  <input
                    value={satir.model}
                    onChange={(e) => satirGuncelle(satir.anahtar, "model", e.target.value)}
                    className={GIRDI_SINIFI}
                  />
                </div>

                <div>
                  <label className={KUCUK_ETIKET}>
                    Seri No / IMEI
                    {kategori?.seriNoZorunlu ? <span className="text-red-500"> *</span> : null}
                  </label>
                  <input
                    value={satir.seriNo}
                    onChange={(e) => satirGuncelle(satir.anahtar, "seriNo", e.target.value)}
                    className={`${GIRDI_SINIFI} font-mono`}
                  />
                </div>

                <div>
                  <label className={KUCUK_ETIKET}>Barkod</label>
                  <input
                    value={satir.barkod}
                    onChange={(e) => satirGuncelle(satir.anahtar, "barkod", e.target.value)}
                    className={`${GIRDI_SINIFI} font-mono`}
                  />
                </div>

                <div>
                  <label className={KUCUK_ETIKET}>Renk</label>
                  <input
                    value={satir.renk}
                    onChange={(e) => satirGuncelle(satir.anahtar, "renk", e.target.value)}
                    className={GIRDI_SINIFI}
                  />
                </div>

                <div>
                  <label className={KUCUK_ETIKET}>Kapasite</label>
                  <input
                    value={satir.kapasite}
                    onChange={(e) => satirGuncelle(satir.anahtar, "kapasite", e.target.value)}
                    placeholder="128 GB"
                    className={GIRDI_SINIFI}
                  />
                </div>

                <div>
                  <label className={KUCUK_ETIKET}>Alış Fiyatı (TL) *</label>
                  <input
                    value={satir.alisFiyati}
                    onChange={(e) => satirGuncelle(satir.anahtar, "alisFiyati", e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className={`${GIRDI_SINIFI} text-right tabular-nums`}
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={KUCUK_ETIKET}>Not</label>
                  <input
                    value={satir.not}
                    onChange={(e) => satirGuncelle(satir.anahtar, "not", e.target.value)}
                    className={GIRDI_SINIFI}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ---------------------------------------------------------- Alt bar */}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
        <div className="text-sm text-slate-600">
          {satirlar.length} cihaz ·{" "}
          <span className="font-semibold text-slate-900">{kurusuTLYaz(toplamKurus)} TL</span>
        </div>
        <GonderDugmesi bekleyenMetin="Kaydediliyor…">Faturayı Kaydet</GonderDugmesi>
      </div>
    </form>
  );
}
