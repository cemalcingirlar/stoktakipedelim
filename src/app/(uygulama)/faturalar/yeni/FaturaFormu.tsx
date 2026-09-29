"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { TedarikciSecici } from "@/bilesenler/TedarikciSecici";
import { VadeAlani } from "@/bilesenler/VadeAlani";
import { kurusuTLYaz, tlyiKurusaCevir } from "@/lib/para";
import { inputTarih, tarihYaz } from "@/lib/tarih";
import type { FaturaSatiriGirdisi } from "../dogrulama";
import {
  barkodBilgisiGetir,
  faturaKaydet,
  seriNoKontrolEt,
  type FaturaDurumu,
} from "../eylemler";

export type KategoriSecimi = {
  id: number;
  ad: string;
  seriNoZorunlu: boolean;
  altKategoriler: { id: number; ad: string }[];
};

/**
 * Faturaya giren bir ürün kalemi: tek barkod, altında o barkoda ait cihazlar.
 *
 * Seri no zorunlu kategorilerde cihazlar `imeiler` dizisiyle, gerekmeyen
 * kategorilerde (aksesuar) `adet` ile sayılır. Kayıtta her cihaz ayrı bir
 * stok satırına açılır.
 */
type Urun = {
  anahtar: number;
  barkod: string;
  kategoriId: string;
  altKategoriId: string;
  marka: string;
  model: string;
  renk: string;
  kapasite: string;
  alisFiyati: string;
  not: string;
  imeiler: string[];
  adet: string;
  /** Barkod sorgusundan gelen bilgi notu ("en son ... girilmiş"). */
  bilgi: string;
};

let sayac = 0;
function bosUrun(kalip?: Partial<Urun>): Urun {
  sayac += 1;
  return {
    anahtar: sayac,
    barkod: "",
    kategoriId: "",
    altKategoriId: "",
    marka: "",
    model: "",
    renk: "",
    kapasite: "",
    alisFiyati: "",
    not: "",
    imeiler: [],
    adet: "1",
    bilgi: "",
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
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [barkod, setBarkod] = useState("");
  const [barkodUyarisi, setBarkodUyarisi] = useState("");
  const [faturaTarihi, setFaturaTarihi] = useState(inputTarih(new Date()));
  const [barkodBekliyor, barkodBasla] = useTransition();
  const barkodRef = useRef<HTMLInputElement>(null);
  // Barkod okutulunca odak o ürünün IMEI kutusuna gitsin diye.
  const odakAnahtari = useRef<number | null>(null);

  useEffect(() => {
    if (durum.hata) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [durum]);

  function urunGuncelle(anahtar: number, alan: keyof Urun, deger: string) {
    setUrunler((mevcut) =>
      mevcut.map((u) => {
        if (u.anahtar !== anahtar) return u;
        if (alan === "kategoriId") return { ...u, kategoriId: deger, altKategoriId: "" };
        return { ...u, [alan]: deger };
      }),
    );
  }

  function urunSil(anahtar: number) {
    setUrunler((mevcut) => mevcut.filter((u) => u.anahtar !== anahtar));
  }

  /** Barkod okutuldu: kayıtlıysa son bilgileri getirir, yoksa boş ürün açar. */
  function barkoduIsle() {
    const kod = barkod.trim().toUpperCase();
    if (!kod) return;

    const mevcutUrun = urunler.find((u) => u.barkod === kod);
    if (mevcutUrun) {
      setBarkodUyarisi(`${kod} bu faturada zaten var — IMEI'leri o kartın altına okutun.`);
      setBarkod("");
      odakAnahtari.current = mevcutUrun.anahtar;
      document.getElementById(`imei-${mevcutUrun.anahtar}`)?.focus();
      return;
    }

    setBarkodUyarisi("");
    setBarkod("");

    barkodBasla(async () => {
      const bilgi = await barkodBilgisiGetir(kod);
      const yeni = bosUrun({
        barkod: kod,
        kategoriId: bilgi.kategoriId ? String(bilgi.kategoriId) : "",
        altKategoriId: bilgi.altKategoriId ? String(bilgi.altKategoriId) : "",
        marka: bilgi.marka,
        model: bilgi.model,
        renk: bilgi.renk,
        kapasite: bilgi.kapasite,
        alisFiyati:
          bilgi.alisFiyatiKurus !== null ? kurusuTLYaz(bilgi.alisFiyatiKurus) : "",
        bilgi: bilgi.bulundu
          ? `Bilgiler en son ${tarihYaz(bilgi.sonGirisTarihi)} tarihli girişten alındı. Değiştirebilirsiniz.`
          : "Bu barkod ilk kez giriliyor; bilgileri doldurun.",
      });
      setUrunler((mevcut) => [...mevcut, yeni]);
      odakAnahtari.current = yeni.anahtar;
    });
  }

  // Yeni ürün kartı eklendikten sonra odağı IMEI kutusuna taşı.
  useEffect(() => {
    if (odakAnahtari.current === null) return;
    const hedef = document.getElementById(`imei-${odakAnahtari.current}`);
    odakAnahtari.current = null;
    hedef?.focus();
  }, [urunler]);

  const [imeiUyarisi, setImeiUyarisi] = useState("");

  function imeiEkle(anahtar: number, kod: string) {
    // Faturanın hiçbir ürününde aynı IMEI iki kez olmamalı.
    if (urunler.some((u) => u.imeiler.includes(kod))) {
      setImeiUyarisi(`${kod} bu faturada zaten okutuldu.`);
      return;
    }
    setImeiUyarisi("");
    setUrunler((mevcut) =>
      mevcut.map((u) => (u.anahtar === anahtar ? { ...u, imeiler: [...u.imeiler, kod] } : u)),
    );

    // Sistemde kayıtlı mı? Kayıt anında değil, okutma anında uyarmak için.
    void seriNoKontrolEt(kod).then((sonuc) => {
      if (!sonuc.kullanimda) return;
      setImeiUyarisi(sonuc.aciklama ?? `${kod} sistemde zaten kayıtlı.`);
      setUrunler((mevcut) =>
        mevcut.map((u) =>
          u.anahtar === anahtar ? { ...u, imeiler: u.imeiler.filter((x) => x !== kod) } : u,
        ),
      );
    });
  }

  function imeiSil(anahtar: number, kod: string) {
    setUrunler((mevcut) =>
      mevcut.map((u) =>
        u.anahtar === anahtar ? { ...u, imeiler: u.imeiler.filter((x) => x !== kod) } : u,
      ),
    );
  }

  /** Ürün gruplarını tek tek cihaz satırlarına açar. */
  function satirlariUret(): FaturaSatiriGirdisi[] {
    return urunler.flatMap<FaturaSatiriGirdisi>((u) => {
      const kategori = kategoriler.find((k) => String(k.id) === u.kategoriId);
      const seriGerekli = kategori?.seriNoZorunlu ?? true;
      const ortak = {
        kategoriId: Number(u.kategoriId) || 0,
        altKategoriId: Number(u.altKategoriId) || null,
        marka: u.marka,
        model: u.model,
        renk: u.renk.trim() || null,
        kapasite: u.kapasite.trim() || null,
        barkod: u.barkod.trim() || null,
        alisFiyatiKurus: tlyiKurusaCevir(u.alisFiyati) ?? 0,
        not: u.not.trim() || null,
      };

      if (seriGerekli) {
        return u.imeiler.map((kod) => ({ ...ortak, seriNo: kod }));
      }
      const adet = Math.max(0, Math.min(500, Number(u.adet) || 0));
      return Array.from({ length: adet }, () => ({ ...ortak, seriNo: null }));
    });
  }

  const satirlar = satirlariUret();
  const toplamKurus = satirlar.reduce((t, s) => t + s.alisFiyatiKurus, 0);

  function veriyiHazirla(form: FormData): FormData {
    const yuk = {
      tedarikciId: Number(form.get("tedarikciId")) || 0,
      magazaId: Number(form.get("magazaId")) || 0,
      faturaNo: String(form.get("faturaNo") ?? ""),
      faturaTarihi: String(form.get("faturaTarihi") ?? ""),
      // "ozel" seçildiğinde gün sayısı sunucuda vade tarihinden hesaplanır.
      vadeGun: Number(form.get("vadeGun")) || 0,
      vadeTarihi: String(form.get("vadeTarihi") ?? "").trim() || null,
      not: String(form.get("not") ?? "").trim() || null,
      satirlar,
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
          <TedarikciSecici baslangic={tedarikciler} />

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
              value={faturaTarihi}
              onChange={(e) => setFaturaTarihi(e.target.value)}
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

          <VadeAlani faturaTarihi={faturaTarihi} />

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
          Barkod Okut
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="okutma"
            ref={barkodRef}
            value={barkod}
            onChange={(e) => setBarkod(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                barkoduIsle();
              }
            }}
            placeholder="Ürün barkodunu okutun veya yazıp Enter'a basın"
            className={`okutma-girdisi min-w-0 flex-1 font-mono ${GIRDI_SINIFI}`}
          />
          <button
            type="button"
            onClick={barkoduIsle}
            disabled={barkodBekliyor}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {barkodBekliyor ? "Aranıyor…" : "Ürün Ekle"}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-blue-800">
          Barkod daha önce girilmişse marka, model, kategori ve son alış fiyatı otomatik gelir.
          Ardından o ürünün IMEI&apos;lerini arka arkaya okutun — her barkodu bir kez okutmanız
          yeterli.
        </p>
        {barkodUyarisi ? (
          <p role="alert" className="mt-1.5 text-xs font-medium text-amber-800">
            {barkodUyarisi}
          </p>
        ) : null}
        {imeiUyarisi ? (
          <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
            {imeiUyarisi}
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------------- Ürünler */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">
            Cihazlar{" "}
            <span className="font-normal text-slate-500">
              ({urunler.length} ürün · {satirlar.length} cihaz)
            </span>
          </h2>
          <button
            type="button"
            onClick={() => setUrunler((m) => [...m, bosUrun({ bilgi: "Barkodsuz ürün." })])}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            + Barkodsuz Ürün
          </button>
        </div>

        {urunler.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="text-sm text-slate-500">
              Yukarıdaki kutuya bir barkod okutarak başlayın.
            </p>
          </div>
        ) : (
          urunler.map((urun, sira) => (
            <UrunKarti
              key={urun.anahtar}
              urun={urun}
              sira={sira}
              kategoriler={kategoriler}
              urunGuncelle={urunGuncelle}
              urunSil={urunSil}
              imeiEkle={imeiEkle}
              imeiSil={imeiSil}
            />
          ))
        )}
      </section>

      {/* ---------------------------------------------------------- Kaydet */}
      <section className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <div className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{satirlar.length}</span> cihaz ·{" "}
          <span className="font-semibold text-slate-900">{kurusuTLYaz(toplamKurus)} TL</span> toplam
          alış
        </div>
        <GonderDugmesi bekleyenMetin="Kaydediliyor…">Faturayı Kaydet</GonderDugmesi>
      </section>
    </form>
  );
}

/** Ürün kartı: barkod bilgileri ve altında IMEI okutma alanı. */
function UrunKarti({
  urun,
  sira,
  kategoriler,
  urunGuncelle,
  urunSil,
  imeiEkle,
  imeiSil,
}: {
  urun: Urun;
  sira: number;
  kategoriler: KategoriSecimi[];
  urunGuncelle: (anahtar: number, alan: keyof Urun, deger: string) => void;
  urunSil: (anahtar: number) => void;
  imeiEkle: (anahtar: number, kod: string) => void;
  imeiSil: (anahtar: number, kod: string) => void;
}) {
  const [imei, setImei] = useState("");
  const kategori = kategoriler.find((k) => String(k.id) === urun.kategoriId);
  const seriGerekli = kategori?.seriNoZorunlu ?? true;
  const adet = seriGerekli ? urun.imeiler.length : Number(urun.adet) || 0;
  const birimKurus = tlyiKurusaCevir(urun.alisFiyati) ?? 0;

  function gonder() {
    const kod = imei.trim().toUpperCase();
    if (!kod) return;
    imeiEkle(urun.anahtar, kod);
    setImei("");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{sira + 1}. ürün</span>
          {urun.barkod ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
              {urun.barkod}
            </span>
          ) : null}
          <span className="text-xs text-slate-500">
            {adet} adet · {kurusuTLYaz(birimKurus * adet)} TL
          </span>
        </div>
        <button
          type="button"
          onClick={() => urunSil(urun.anahtar)}
          className="rounded px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
        >
          Ürünü Sil
        </button>
      </div>

      {urun.bilgi ? <p className="mb-2 text-xs text-slate-500">{urun.bilgi}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={KUCUK_ETIKET}>Barkod</label>
          <input
            value={urun.barkod}
            onChange={(e) => urunGuncelle(urun.anahtar, "barkod", e.target.value.toUpperCase())}
            className={`${GIRDI_SINIFI} font-mono`}
          />
        </div>

        <div>
          <label className={KUCUK_ETIKET}>Kategori *</label>
          <select
            value={urun.kategoriId}
            onChange={(e) => urunGuncelle(urun.anahtar, "kategoriId", e.target.value)}
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
            value={urun.altKategoriId}
            onChange={(e) => urunGuncelle(urun.anahtar, "altKategoriId", e.target.value)}
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
            value={urun.marka}
            onChange={(e) => urunGuncelle(urun.anahtar, "marka", e.target.value)}
            className={GIRDI_SINIFI}
          />
        </div>

        <div>
          <label className={KUCUK_ETIKET}>Model *</label>
          <input
            value={urun.model}
            onChange={(e) => urunGuncelle(urun.anahtar, "model", e.target.value)}
            className={GIRDI_SINIFI}
          />
        </div>

        <div>
          <label className={KUCUK_ETIKET}>Renk</label>
          <input
            value={urun.renk}
            onChange={(e) => urunGuncelle(urun.anahtar, "renk", e.target.value)}
            className={GIRDI_SINIFI}
          />
        </div>

        <div>
          <label className={KUCUK_ETIKET}>Kapasite</label>
          <input
            value={urun.kapasite}
            onChange={(e) => urunGuncelle(urun.anahtar, "kapasite", e.target.value)}
            placeholder="128 GB"
            className={GIRDI_SINIFI}
          />
        </div>

        <div>
          <label className={KUCUK_ETIKET}>Birim Alış Fiyatı (TL) *</label>
          <input
            value={urun.alisFiyati}
            onChange={(e) => urunGuncelle(urun.anahtar, "alisFiyati", e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className={`${GIRDI_SINIFI} text-right tabular-nums`}
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-4">
          <label className={KUCUK_ETIKET}>Not</label>
          <input
            value={urun.not}
            onChange={(e) => urunGuncelle(urun.anahtar, "not", e.target.value)}
            className={GIRDI_SINIFI}
          />
        </div>
      </div>

      {/* ------------------------------------------------ IMEI / adet alanı */}
      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
        {seriGerekli ? (
          <>
            <label htmlFor={`imei-${urun.anahtar}`} className="mb-1 block text-xs font-medium text-blue-900">
              IMEI / Seri No okutun — bu barkoda ait tüm cihazları arka arkaya okutabilirsiniz
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id={`imei-${urun.anahtar}`}
                value={imei}
                onChange={(e) => setImei(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    gonder();
                  }
                }}
                placeholder="Okutun veya yazıp Enter'a basın"
                className={`min-w-0 flex-1 font-mono ${GIRDI_SINIFI}`}
              />
              <button
                type="button"
                onClick={gonder}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Ekle
              </button>
            </div>

            {urun.imeiler.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {urun.imeiler.map((kod, i) => (
                  <li
                    key={kod}
                    className="flex items-center gap-1.5 rounded bg-white px-2 py-1 font-mono text-xs text-slate-700 ring-1 ring-slate-200"
                  >
                    <span className="text-slate-400">{i + 1}.</span>
                    {kod}
                    <button
                      type="button"
                      onClick={() => imeiSil(urun.anahtar, kod)}
                      aria-label={`${kod} sil`}
                      className="text-red-600 transition hover:text-red-800"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs font-medium text-amber-800">
                Henüz IMEI okutulmadı — bu ürün faturaya eklenmez.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={`adet-${urun.anahtar}`} className="mb-1 block text-xs font-medium text-blue-900">
                Adet
              </label>
              <input
                id={`adet-${urun.anahtar}`}
                value={urun.adet}
                onChange={(e) => urunGuncelle(urun.anahtar, "adet", e.target.value)}
                inputMode="numeric"
                className={`w-28 text-right tabular-nums ${GIRDI_SINIFI}`}
              />
            </div>
            <p className="text-xs text-blue-800">
              {kategori?.ad} kategorisinde seri no zorunlu değil; adet kadar kayıt açılır.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
