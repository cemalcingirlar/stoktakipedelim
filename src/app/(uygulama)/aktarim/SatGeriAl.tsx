"use client";

import { useState, useTransition } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { aktarimSatisSorunu, alisRevizeSorunu } from "@/lib/aktarimSatisi";
import { kurusuTLYaz, tlyiKurusaCevir } from "@/lib/para";
import { aktarilanCihaziDuzelt, aktarimSatisiKaydet } from "./eylemler";

/** Ekranın üstünde bir kez girilen, tüm satırlarda ortak olan satış bilgileri. */
export type SatisBasligi = {
  /** İşlem tarihi (yyyy-aa-gg); geçmişe dönük kayıt için ekranda seçiliyor. */
  satisTarihi: string;
  odemeTipi: string;
  satanKullaniciId: number | null;
  musteriId: number | null;
  musteriAdSoyad: string | null;
  musteriTelefon: string | null;
};

/**
 * Aktarılan cihazın müşteriye satılıp geri alınması.
 *
 * İki fiyat yan yana duruyor: müşteriye satılan tutar ve geri alırken ödenen
 * tutar. İkincisi cihazın yeni maliyeti oluyor — stok değeri ve bir sonraki
 * satışın kârı buna göre çıkıyor.
 *
 * Satır kaydedilmediği sürece "satış kaydedilmedi" uyarısı duruyor: beş cihaz
 * okutup fiyat yazmayı unutmak kolay, uyarı olmazsa satış sessizce kaybolur.
 */
export function SatGeriAl({
  cihazId,
  kaynakMagazaId,
  etiket,
  baslangicAlisKurus,
  baslik,
  not,
}: {
  cihazId: number;
  /** Satışın yazılacağı mağaza: aktarımın kaynağı, cihazın yeni yeri değil. */
  kaynakMagazaId: number;
  etiket: string;
  baslangicAlisKurus: number;
  baslik: SatisBasligi;
  not: string | null;
}) {
  const [satisFiyati, setSatisFiyati] = useState("");
  const [yeniAlis, setYeniAlis] = useState(kurusuTLYaz(baslangicAlisKurus));
  const [hata, setHata] = useState<string | null>(null);
  const [kayitli, setKayitli] = useState<{
    musteriAdi: string | null;
    alisKurus: number;
  } | null>(null);
  const [bekliyor, basla] = useTransition();

  const satisKurus = tlyiKurusaCevir(satisFiyati);
  const alisKurus = tlyiKurusaCevir(yeniAlis);
  const kar = satisKurus === null ? null : satisKurus - baslangicAlisKurus;

  // Satış fiyatı boşsa yalnız alış fiyatı revize ediliyor; satış kaydı
  // açılmıyor. Ekranın asıl işi alış fiyatını düzeltmek, müşteriye satıp geri
  // alma bunun üstüne gelen bir durum — satış fiyatını zorunlu tutmak
  // kullanıcıyı olmayan bir satış uydurmaya iter.
  const yalnizFiyat = satisFiyati.trim() === "";

  function kaydet() {
    const sorun = yalnizFiyat
      ? alisRevizeSorunu(alisKurus)
      : aktarimSatisSorunu({
          satisFiyatiKurus: satisKurus,
          yeniAlisFiyatiKurus: alisKurus,
        });
    if (sorun) {
      setHata(sorun);
      return;
    }
    setHata(null);

    basla(async () => {
      if (yalnizFiyat) {
        const sonuc = await aktarilanCihaziDuzelt(
          cihazId,
          alisKurus!,
          not ?? "",
        );
        if (sonuc.durum === "HATA") {
          setHata(sonuc.mesaj);
          return;
        }
        setKayitli({ musteriAdi: null, alisKurus: sonuc.alisFiyatiKurus });
        return;
      }

      const sonuc = await aktarimSatisiKaydet({
        cihazId,
        kaynakMagazaId,
        satisFiyatiKurus: satisKurus!,
        yeniAlisFiyatiKurus: alisKurus!,
        satisTarihi: baslik.satisTarihi,
        odemeTipi: baslik.odemeTipi,
        satanKullaniciId: baslik.satanKullaniciId,
        musteriId: baslik.musteriId,
        musteriAdSoyad: baslik.musteriAdSoyad,
        musteriTelefon: baslik.musteriTelefon,
        not,
      });
      if (sonuc.durum === "HATA") {
        setHata(sonuc.mesaj);
        return;
      }
      setKayitli({
        musteriAdi: sonuc.musteriAdi,
        alisKurus: sonuc.alisFiyatiKurus,
      });
    });
  }

  if (kayitli) {
    return (
      <div
        data-test={kayitli.musteriAdi ? "satis-kaydedildi" : "fiyat-kaydedildi"}
        className="mt-2 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
      >
        {kayitli.musteriAdi ? (
          <>
            <strong>{kayitli.musteriAdi}</strong> müşterisine {satisFiyati}{" "}
            TL&apos;ye satılıp geri alındı. Yeni alış fiyatı{" "}
            <strong className="tabular-nums">
              {kurusuTLYaz(kayitli.alisKurus)} TL
            </strong>
            . Satış raporlarına yansıdı.
          </>
        ) : (
          <>
            Alış fiyatı{" "}
            <strong className="tabular-nums">
              {kurusuTLYaz(kayitli.alisKurus)} TL
            </strong>{" "}
            olarak güncellendi. Satış fiyatı girilmediği için satış kaydı
            açılmadı.
          </>
        )}
      </div>
    );
  }

  return (
    <div
      data-test="sat-geri-al"
      className="mt-2 w-full space-y-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2"
    >
      <p className="text-xs font-medium text-amber-900">
        {etiket} · kaydedilmedi
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <label
            htmlFor={`satis-${cihazId}`}
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Satış Fiyatı (TL){" "}
            <span className="font-normal text-slate-500">
              — boş bırakılabilir
            </span>
          </label>
          <input
            id={`satis-${cihazId}`}
            data-test="satis-fiyati"
            value={satisFiyati}
            onChange={(e) => setSatisFiyati(e.target.value)}
            inputMode="decimal"
            placeholder="örn. 13.000,00"
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
          <label
            htmlFor={`yeniAlis-${cihazId}`}
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Yeni Alış Fiyatı (TL)
          </label>
          <input
            id={`yeniAlis-${cihazId}`}
            data-test="yeni-alis-fiyati"
            value={yeniAlis}
            onChange={(e) => setYeniAlis(e.target.value)}
            inputMode="decimal"
            className={`${GIRDI_SINIFI} text-right tabular-nums`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Stok bu fiyattan takip edilir.
          </p>
        </div>

        <div className="flex items-start pt-5">
          <button
            type="button"
            data-test="satisi-kaydet"
            onClick={kaydet}
            disabled={bekliyor}
            className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50"
          >
            {bekliyor
              ? "Kaydediliyor…"
              : yalnizFiyat
                ? "Alış Fiyatını Kaydet"
                : "Satışı Kaydet"}
          </button>
        </div>
      </div>

      <p data-test="ne-olacak" className="text-xs text-amber-900">
        {yalnizFiyat
          ? "Satış fiyatı boş: yalnız alış fiyatı güncellenecek, satış kaydı açılmayacak."
          : "Satış fiyatı dolu: müşteriye satış kaydedilecek ve satış raporlarına yansıyacak."}
      </p>

      {hata ? (
        <p
          data-test="satis-hata"
          role="alert"
          className="text-xs font-medium text-red-700"
        >
          {hata}
        </p>
      ) : null}
    </div>
  );
}
