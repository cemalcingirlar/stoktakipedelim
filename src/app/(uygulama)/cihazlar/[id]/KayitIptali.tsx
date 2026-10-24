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
}: {
  cihazId: number;
  durum: string;
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
      <p className="text-sm text-slate-600">
        Sehven girilmiş bir kayıtsa iptal edin. Kayıt silinmez: durumu
        &quot;İptal Edildi&quot; olur, stok toplamlarından düşer ve tarihçede
        kimin hangi gerekçeyle iptal ettiği kalır.
      </p>

      {!acik ? (
        <button
          type="button"
          data-test="iptal-ac"
          onClick={() => setAcik(true)}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
        >
          Kaydı İptal Et
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
