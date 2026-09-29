"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { GIRDI_SINIFI } from "./Alan";
import { KameraDugmesi } from "./KameraOkuyucu";

export type OkutmaGeriBildirimi = {
  tur: "basari" | "uyari" | "hata";
  mesaj: string;
} | null;

const TONLAR = {
  basari: "border-emerald-300 bg-emerald-50 text-emerald-800",
  uyari: "border-amber-300 bg-amber-50 text-amber-800",
  hata: "border-red-300 bg-red-50 text-red-800",
} as const;

/**
 * Barkod okuyucu için giriş kutusu. Okuyucu sonda Enter gönderir; her okutmadan
 * sonra alan temizlenir ve odak geri alınır, böylece arka arkaya okutma yapılabilir.
 */
export function OkutmaKutusu({
  etiket,
  ipucu,
  yerTutucu = "Okuyucuyu kullanın veya kodu yazıp Enter'a basın",
  okut,
  devreDisi = false,
  kameraSurekli = true,
}: {
  etiket: string;
  ipucu?: string;
  yerTutucu?: string;
  okut: (kod: string) => Promise<OkutmaGeriBildirimi>;
  devreDisi?: boolean;
  /** Kamera okumada: true ise açık kalır, false ise ilk okumada kapanır. */
  kameraSurekli?: boolean;
}) {
  const [deger, setDeger] = useState("");
  const [geriBildirim, setGeriBildirim] = useState<OkutmaGeriBildirimi>(null);
  const [bekliyor, basla] = useTransition();
  const girdiRef = useRef<HTMLInputElement>(null);

  const kodGonder = useCallback(
    (kod: string) => {
      const temiz = kod.trim();
      if (!temiz) return;
      setDeger("");
      basla(async () => {
        const sonuc = await okut(temiz);
        setGeriBildirim(sonuc);
      });
    },
    [okut],
  );

  function gonder() {
    if (bekliyor) return;
    kodGonder(deger);
    girdiRef.current?.focus();
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <label htmlFor="okutmaKutusu" className="mb-1 block text-sm font-medium text-blue-900">
        {etiket}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="okutmaKutusu"
          ref={girdiRef}
          value={deger}
          disabled={devreDisi || bekliyor}
          autoFocus
          onChange={(e) => setDeger(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              gonder();
            }
          }}
          placeholder={yerTutucu}
          className={`okutma-girdisi min-w-0 flex-1 ${GIRDI_SINIFI} font-mono`}
        />
        <button
          type="button"
          onClick={gonder}
          disabled={devreDisi || bekliyor}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {bekliyor ? "Aranıyor…" : "Okut"}
        </button>
        {devreDisi ? null : (
          <KameraDugmesi onKod={kodGonder} surekli={kameraSurekli} baslik={etiket} />
        )}
      </div>
      {ipucu ? <p className="mt-1.5 text-xs text-blue-800">{ipucu}</p> : null}
      {geriBildirim ? (
        <p
          role="status"
          className={`mt-2 rounded-lg border px-3 py-2 text-sm font-medium ${TONLAR[geriBildirim.tur]}`}
        >
          {geriBildirim.mesaj}
        </p>
      ) : null}
    </div>
  );
}
