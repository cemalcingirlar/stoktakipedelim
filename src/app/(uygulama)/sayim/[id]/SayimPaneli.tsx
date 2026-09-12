"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { OkutmaKutusu, type OkutmaGeriBildirimi } from "@/bilesenler/OkutmaKutusu";
import { sayimIptal, sayimKapat, sayimOkut, type SayimDurumu } from "../eylemler";

function Sayac({
  etiket,
  deger,
  ton,
}: {
  etiket: string;
  deger: number;
  ton: "nötr" | "yesil" | "sari" | "mor";
}) {
  const renkler = {
    nötr: "border-slate-200 bg-white text-slate-900",
    yesil: "border-emerald-200 bg-emerald-50 text-emerald-700",
    sari: "border-amber-200 bg-amber-50 text-amber-700",
    mor: "border-violet-200 bg-violet-50 text-violet-700",
  }[ton];

  return (
    <div className={`rounded-xl border p-3 text-center ${renkler}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">{etiket}</div>
      <div className="mt-0.5 text-3xl font-semibold tabular-nums">{deger}</div>
    </div>
  );
}

export function SayimPaneli({
  sayimId,
  toplam,
  okutulan,
  fazla,
}: {
  sayimId: number;
  toplam: number;
  okutulan: number;
  fazla: number;
}) {
  const router = useRouter();
  const [kapatDurumu, kapatEylem] = useActionState<SayimDurumu, FormData>(sayimKapat, {});
  const [iptalDurumu, iptalEylem] = useActionState<SayimDurumu, FormData>(sayimIptal, {});
  const [iptalAcik, setIptalAcik] = useState(false);

  const okutulmayan = toplam - okutulan;

  async function okut(kod: string): Promise<OkutmaGeriBildirimi> {
    const sonuc = await sayimOkut(sayimId, kod);
    // Sayaçlar sunucudan geliyor; her okutmadan sonra tazelenir.
    if (sonuc.sonuc !== "HATA") router.refresh();

    if (sonuc.sonuc === "BULUNDU") return { tur: "basari", mesaj: sonuc.mesaj };
    if (sonuc.sonuc === "ZATEN_SAYILDI") return { tur: "uyari", mesaj: sonuc.mesaj };
    if (sonuc.sonuc === "BASKA_MAGAZADA" || sonuc.sonuc === "SATILMIS") {
      return { tur: "uyari", mesaj: sonuc.mesaj };
    }
    return { tur: "hata", mesaj: sonuc.mesaj };
  }

  return (
    <div className="space-y-4">
      {/* Sayım boyunca ekranın üstünde duran canlı sayaçlar. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Sayac etiket="Toplam" deger={toplam} ton="nötr" />
        <Sayac etiket="Okutulan" deger={okutulan} ton="yesil" />
        <Sayac etiket="Okutulmayan" deger={okutulmayan} ton="sari" />
        <Sayac etiket="Fazla" deger={fazla} ton="mor" />
      </div>

      <OkutmaKutusu
        etiket="Cihazı Okut"
        ipucu="Raftaki her cihazı okutun. Bu mağazaya ait olmayan veya kayıtsız cihazlar fazla listesine düşer."
        okut={okut}
      />

      <form action={kapatEylem} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="sayimId" value={sayimId} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {okutulmayan === 0
              ? "Beklenen tüm cihazlar okutuldu. Sayımı kapatabilirsiniz."
              : `${okutulmayan} cihaz henüz okutulmadı. Şimdi kapatırsanız bunlar eksik olarak raporlanır.`}
          </p>
          <GonderDugmesi tur="basari" bekleyenMetin="Kapatılıyor…">
            Sayımı Kapat
          </GonderDugmesi>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Kapatma stok miktarına dokunmaz; eksik ve fazlalar rapor olarak kalır.
        </p>
        {kapatDurumu.hata ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {kapatDurumu.hata}
          </p>
        ) : null}
      </form>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        {!iptalAcik ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Yanlışlıkla açtıysanız sayımı iptal edebilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => setIptalAcik(true)}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Sayımı İptal Et
            </button>
          </div>
        ) : (
          <form action={iptalEylem} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="sayimId" value={sayimId} />
            <p className="text-sm text-slate-700">
              Sayım iptal edilecek, okutmalar kaydedilmiş olarak kalır ama rapor üretilmez.
            </p>
            <GonderDugmesi tur="tehlike" bekleyenMetin="İptal ediliyor…">
              Evet, İptal Et
            </GonderDugmesi>
            <button
              type="button"
              onClick={() => setIptalAcik(false)}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Vazgeç
            </button>
            {iptalDurumu.hata ? (
              <p role="alert" className="w-full text-sm text-red-600">
                {iptalDurumu.hata}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
