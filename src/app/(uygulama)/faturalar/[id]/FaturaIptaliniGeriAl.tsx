"use client";

import { useActionState, useState } from "react";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { faturaIptaliniGeriAl, type FaturaIptalDurumu } from "../eylemler";

/**
 * Yanlışlıkla iptal edilen alış faturasının geri alınması.
 *
 * İptal kaydı silmiyor, işaretliyor — bu yüzden geri alınabiliyor. İki adımlı:
 * önce düğme, sonra onay. Fatura iptali bir cihazdan fazlasını etkiliyor,
 * geri alması da öyle; tek tıkla olmamalı.
 *
 * Numara ya da seri numarası çakışması varsa sunucu açık mesajla reddediyor;
 * burada önden denetlenmiyor çünkü ikisi de veritabanına bakmayı gerektiriyor
 * ve ekranı açarken sorulacak soru değil.
 */
export function FaturaIptaliniGeriAl({
  faturaId,
  geriAlinacakAdet,
}: {
  faturaId: number;
  geriAlinacakAdet: number;
}) {
  const [acik, setAcik] = useState(false);
  const [durum, geriAl] = useActionState<FaturaIptalDurumu, FormData>(
    faturaIptaliniGeriAl,
    {},
  );

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <p className="text-sm text-slate-600">
        İptal yanlışlıkla yapıldıysa geri alınabilir:{" "}
        <strong>{geriAlinacakAdet} cihaz</strong> tekrar stoğa döner, fatura
        numarası eski haline gelir ve tutar yeniden vade/borç raporlarına girer.
      </p>

      {!acik ? (
        <button
          type="button"
          data-test="fatura-geri-al-ac"
          onClick={() => setAcik(true)}
          className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
        >
          İptali Geri Al
        </button>
      ) : (
        <form action={geriAl} className="space-y-2" data-test="fatura-geri-al-formu">
          <input type="hidden" name="faturaId" value={faturaId} />
          <div className="flex flex-wrap gap-2">
            <GonderDugmesi tur="basari" bekleyenMetin="Geri alınıyor…">
              Evet, İptali Geri Al
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

      {durum.hata ? (
        <p role="alert" data-test="fatura-geri-al-hata" className="text-sm text-red-600">
          {durum.hata}
        </p>
      ) : null}
      {durum.basari ? (
        <p role="status" data-test="fatura-geri-al-basari" className="text-sm font-medium text-emerald-700">
          {durum.basari}
        </p>
      ) : null}
    </div>
  );
}
