"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
  odakVer = false,
}: {
  etiket: string;
  ipucu?: string;
  yerTutucu?: string;
  okut: (kod: string) => Promise<OkutmaGeriBildirimi>;
  devreDisi?: boolean;
  /** Kamera okumada: true ise açık kalır, false ise ilk okumada kapanır. */
  kameraSurekli?: boolean;
  /**
   * Ekran açılır açılmaz imleci kutuya koyar; barkod okuyucu doğrudan buraya
   * yazsın diye. Yalnız fare/klavyeli cihazlarda çalışır: dokunmatikte her
   * açılışta ekran klavyesini açmak işi zorlaştırıyor.
   */
  odakVer?: boolean;
}) {
  const [deger, setDeger] = useState("");
  const [geriBildirim, setGeriBildirim] = useState<OkutmaGeriBildirimi>(null);
  const [bekliyor, basla] = useTransition();
  const girdiRef = useRef<HTMLInputElement>(null);
  // Okutma kutudan başlatıldıysa, istek bitince imleci oraya geri veriyoruz.
  // Kameradan gelen okumada bayrak kalkmıyor; kullanıcı o sırada başka bir
  // alanda olabilir ve odağı ondan çalmak doğru olmaz.
  const odagiGeriVer = useRef(false);

  useEffect(() => {
    if (!odakVer || devreDisi) return;
    // Dokunmatik cihazda odak vermek ekran klavyesini açıyor; yalnız işaretçisi
    // olan (fare/klavye) cihazlarda imleci kutuya alıyoruz.
    const inceIsaretci =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: fine)").matches;
    if (inceIsaretci) girdiRef.current?.focus();
  }, [odakVer, devreDisi]);

  const kodGonder = useCallback(
    (kod: string, odakGeri = false) => {
      const temiz = kod.trim();
      if (!temiz) return;
      odagiGeriVer.current = odakGeri;
      setDeger("");
      basla(async () => {
        const sonuc = await okut(temiz);
        setGeriBildirim(sonuc);
      });
    },
    [okut],
  );

  /**
   * İstek bitince imleci kutuya geri verir.
   *
   * Arka arkaya cihaz okutulurken imlecin kutuda kalması şart; aksi halde her
   * cihazdan sonra elle tıklamak gerekiyor ve barkod okuyucunun yazdığı
   * karakterler hiçbir yere gitmiyor.
   */
  useEffect(() => {
    if (bekliyor || devreDisi) return;
    if (!odagiGeriVer.current) return;
    odagiGeriVer.current = false;
    girdiRef.current?.focus();
  }, [bekliyor, devreDisi]);

  function gonder() {
    if (bekliyor) return;
    kodGonder(deger, true);
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
          disabled={devreDisi}
          readOnly={bekliyor}
          autoFocus
          onChange={(e) => setDeger(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              gonder();
            }
          }}
          placeholder={yerTutucu}
          className={`okutma-girdisi min-w-0 flex-1 ${GIRDI_SINIFI} font-mono read-only:bg-slate-100`}
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
          <KameraDugmesi
            onKod={(kod) => kodGonder(kod)}
            surekli={kameraSurekli}
            baslik={etiket}
          />
        )}
      </div>
      {ipucu ? <p className="mt-1.5 text-xs text-blue-800">{ipucu}</p> : null}
      {geriBildirim ? (
        <p
          role="status"
          data-test="okutma-geri-bildirim"
          data-tur={geriBildirim.tur}
          className={`mt-2 rounded-lg border px-3 py-2 text-sm font-medium ${TONLAR[geriBildirim.tur]}`}
        >
          {geriBildirim.mesaj}
        </p>
      ) : null}
    </div>
  );
}
