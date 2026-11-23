"use client";

import { useActionState, useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import {
  GEREKCE_EN_AZ,
  GEREKCE_EN_COK,
  cihazIptalEngeli,
} from "@/lib/kayitIptali";
import {
  cihazIptaliniGeriAl,
  cihaziIptalEt,
  type SatisDuzenlemeDurumu,
} from "./eylemler";

/**
 * Yanlış girilmiş cihazın iptali ve iptalin geri alınması.
 *
 * İptal iki adımlı: önce düğme, sonra gerekçe ve onay. Tek tıkla stok
 * değerini değiştirebilmek, yanlışlıkla basmayı fazla kolaylaştırırdı.
 *
 * Gerekçe zorunlu çünkü asıl değer kaydın kendisinde değil, neden iptal
 * edildiğinin tarihçede durmasında.
 */
export function KayitIptali({
  cihazId,
  durum,
  aktarimSatisiVar = false,
}: {
  cihazId: number;
  durum: string;
  /** Cihazın mağaza içi aktarım satışı var mı? Varsa ayrıca uyarılıyor. */
  aktarimSatisiVar?: boolean;
}) {
  const iptalli = durum === "IPTAL";
  // Engel varsa düğme yerine sebebi gösteriliyor. Sunucu eylemi zaten
  // reddediyor ama hep başarısız olacak bir düğme sunmak kullanıcıyı
  // "neden çalışmıyor" diye uğraştırır.
  const engel = cihazIptalEngeli({ durum });
  const [acik, setAcik] = useState(false);
  const [iptalDurumu, iptalEt] = useActionState<SatisDuzenlemeDurumu, FormData>(
    cihaziIptalEt,
    {},
  );
  const [geriDurumu, geriAl] = useActionState<SatisDuzenlemeDurumu, FormData>(
    cihazIptaliniGeriAl,
    {},
  );

  if (iptalli) {
    return (
      <div data-test="iptal-geri-alma" className="space-y-2">
        <p className="text-sm text-slate-600">
          Bu cihaz iptal edilmiş; stok toplamlarına girmiyor. Yanlışlıkla iptal
          edildiyse geri alabilirsiniz.
        </p>
        <form action={geriAl}>
          <input type="hidden" name="cihazId" value={cihazId} />
          <GonderDugmesi bekleyenMetin="Geri alınıyor…">
            İptali Geri Al
          </GonderDugmesi>
        </form>
        {geriDurumu.hata ? (
          <p role="alert" className="text-sm text-red-600">
            {geriDurumu.hata}
          </p>
        ) : null}
        {geriDurumu.basari ? (
          <p role="status" className="text-sm text-emerald-700">
            {geriDurumu.basari}
          </p>
        ) : null}
      </div>
    );
  }

  if (engel) {
    return (
      <p data-test="iptal-engeli" className="text-sm text-slate-600">
        {engel}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* "Kaydı iptal et" yazısı satış kaydını iptal ediyor gibi okunuyordu:
          kullanıcı aktarım satışını düzeltmek isterken cihazı iptal etti ve
          cihaz stoktan düştü. Ne iptal edildiği artık açıkça yazıyor. */}
      <p className="text-sm text-slate-600">
        <strong>Satışı değil, cihazın kendisini</strong> iptal eder: sehven
        girilmiş bir cihaz kaydı içindir. Cihaz stoktan düşer, durumu
        &quot;İptal Edildi&quot; olur; kayıt silinmez ve tarihçede kimin hangi
        gerekçeyle iptal ettiği kalır.
      </p>
      {aktarimSatisiVar ? (
        <p
          data-test="iptal-aktarim-uyarisi"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Bu cihazın mağaza içi aktarım satışı var. Satışı düzeltmek ya da geri
          almak için bu düğmeyi değil, yukarıdaki{" "}
          <strong>Mağaza İçi Aktarım Satışları</strong> kartını kullanın.
        </p>
      ) : null}

      {!acik ? (
        <button
          type="button"
          data-test="iptal-ac"
          onClick={() => setAcik(true)}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
        >
          Cihazı İptal Et
        </button>
      ) : (
        <form action={iptalEt} className="space-y-2" data-test="iptal-formu">
          <input type="hidden" name="cihazId" value={cihazId} />
          <div>
            <label
              htmlFor="gerekce"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              İptal gerekçesi (en az {GEREKCE_EN_AZ} karakter)
            </label>
            <input
              id="gerekce"
              name="gerekce"
              required
              minLength={GEREKCE_EN_AZ}
              maxLength={GEREKCE_EN_COK}
              placeholder="Örn: Yanlış IMEI girilmiş, aynı cihaz iki kez kaydedilmiş"
              className={GIRDI_SINIFI}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <GonderDugmesi bekleyenMetin="İptal ediliyor…">
              Evet, İptal Et
            </GonderDugmesi>
            <button
              type="button"
              onClick={() => setAcik(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}

      {iptalDurumu.hata ? (
        <p role="alert" data-test="iptal-hata" className="text-sm text-red-600">
          {iptalDurumu.hata}
        </p>
      ) : null}
      {iptalDurumu.basari ? (
        <p role="status" className="text-sm text-emerald-700">
          {iptalDurumu.basari}
        </p>
      ) : null}
    </div>
  );
}
