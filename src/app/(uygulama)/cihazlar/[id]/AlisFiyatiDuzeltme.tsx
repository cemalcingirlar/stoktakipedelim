"use client";

import { useActionState, useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import {
  DUZELTME_GEREKCE_EN_AZ,
  DUZELTME_GEREKCE_EN_COK,
} from "@/lib/alisFiyatiDuzeltme";
import { alisFiyatiniDuzelt, type SatisDuzenlemeDurumu } from "./eylemler";

/**
 * Alış fiyatı düzeltme formu — yalnız yöneticiye gösteriliyor.
 *
 * İki adımlı: önce "Düzelt", sonra yeni fiyat ve gerekçe. Fiyat stok
 * değerini ve kârı değiştirdiği için yanlışlıkla tek tıkla değişmemeli;
 * gerekçe de zorunlu, çünkü asıl değer neden değiştiğinin tarihçede
 * durmasında.
 *
 * Bileşenin görünmesi bir koruma değil: yetki sunucu eyleminde sınanıyor.
 */
export function AlisFiyatiDuzeltme({
  cihazId,
  simdikiFiyat,
  kardesSayisi,
}: {
  cihazId: number;
  /** Kutunun başlangıç değeri: "1.165,83". */
  simdikiFiyat: string;
  /** Aynı faturadaki aynı ürünün, fiyatı aynı olan DİĞER cihazları. */
  kardesSayisi: number;
}) {
  // Form açıldığı andaki eylem durumu; kapalıyken null.
  //
  // Form, eylem BAŞARIYLA yeni bir sonuç verene kadar açık kalıyor: hata
  // gelirse açık kalır (kullanıcı yazdığını kaybetmeden düzeltir), başarı
  // gelirse kapanır ve mesaj düğmenin yanında görünür. Kapanma bir effect ile
  // değil bu karşılaştırmayla türetiliyor.
  const [acilisDurumu, setAcilisDurumu] = useState<SatisDuzenlemeDurumu | null>(
    null,
  );
  const [durum, eylem] = useActionState<SatisDuzenlemeDurumu, FormData>(
    alisFiyatiniDuzelt,
    {},
  );

  const kapali =
    acilisDurumu === null ||
    (durum !== acilisDurumu && durum.basari !== undefined);

  if (kapali) {
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-2">
        {durum.basari ? (
          <span role="status" data-test="alis-fiyati-basari" className="text-xs text-emerald-700">
            {durum.basari}
          </span>
        ) : null}
        <button
          type="button"
          data-test="alis-fiyati-duzelt"
          onClick={() => setAcilisDurumu(durum)}
          className="text-xs font-medium text-blue-700 underline underline-offset-2"
        >
          Alış fiyatını düzelt
        </button>
      </span>
    );
  }

  return (
    <form
      action={eylem}
      data-test="alis-fiyati-formu"
      className="mt-2 w-full space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left"
    >
      <input type="hidden" name="cihazId" value={cihazId} />
      <div>
        <label htmlFor="yeniFiyat" className="mb-1 block text-xs font-medium text-slate-700">
          Yeni alış fiyatı (TL)
        </label>
        <input
          id="yeniFiyat"
          name="yeniFiyat"
          data-test="alis-fiyati-girdisi"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={simdikiFiyat}
          required
          className={`${GIRDI_SINIFI} font-mono`}
        />
      </div>
      <div>
        <label htmlFor="fiyatGerekcesi" className="mb-1 block text-xs font-medium text-slate-700">
          Gerekçe
        </label>
        <input
          id="fiyatGerekcesi"
          name="gerekce"
          data-test="alis-fiyati-gerekce"
          minLength={DUZELTME_GEREKCE_EN_AZ}
          maxLength={DUZELTME_GEREKCE_EN_COK}
          placeholder="Örn. fatura yanlış girilmiş, fiyat farkı faturası geldi"
          required
          className={GIRDI_SINIFI}
        />
      </div>
      {kardesSayisi > 0 ? (
        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input type="checkbox" name="hepsi" data-test="alis-fiyati-hepsi" className="mt-0.5" />
          <span>
            Aynı faturadaki aynı ürünün diğer{" "}
            <strong data-test="alis-fiyati-kardes">{kardesSayisi}</strong> cihazına da uygula
            (şu an aynı fiyatta olanlar).
          </span>
        </label>
      ) : null}
      <p className="text-xs text-slate-600">
        Eski fiyat, yeni fiyat ve gerekçe cihazın tarihçesine yazılır. Stok
        değeri ve kâr yeni fiyata göre hesaplanır.
      </p>
      {durum.hata ? (
        <p role="alert" data-test="alis-fiyati-hata" className="text-sm text-red-600">
          {durum.hata}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <GonderDugmesi bekleyenMetin="Kaydediliyor…">Fiyatı Kaydet</GonderDugmesi>
        <button
          type="button"
          onClick={() => setAcilisDurumu(null)}
          className="text-sm text-slate-600 underline underline-offset-2"
        >
          Kapat
        </button>
      </div>
    </form>
  );
}
