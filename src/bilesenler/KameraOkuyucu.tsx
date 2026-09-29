"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

/**
 * Telefon kamerasıyla barkod / IMEI okuma.
 *
 * Çözümleyici (@zxing) yalnızca kamera açıldığında indiriliyor; ana paketi
 * büyütmüyor. Tek bir yol kullanılıyor (native BarcodeDetector denenmiyor):
 * iOS Safari'de o API yok, iki ayrı yol tutmak da hata yüzeyini büyütürdü.
 */

/** Cihazın arkasındaki kamera tercih edilir; yoksa tarayıcı öndekine düşer. */
const KAMERA_KISITI: MediaStreamConstraints = {
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
};

/** Aynı kod kamera önünde dururken tekrar tekrar okunmasın. */
const TEKRAR_BEKLEME_MS = 2500;

function sesVer() {
  try {
    navigator.vibrate?.(60);
    const Baglam = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Baglam) return;
    const baglam = new Baglam();
    const osilator = baglam.createOscillator();
    const kazanc = baglam.createGain();
    osilator.frequency.value = 880;
    kazanc.gain.value = 0.08;
    osilator.connect(kazanc).connect(baglam.destination);
    osilator.start();
    osilator.stop(baglam.currentTime + 0.08);
    setTimeout(() => void baglam.close(), 200);
  } catch {
    // Ses/titreşim olmazsa okuma yine de çalışır.
  }
}

function hataMetni(hata: unknown): string {
  const ad = (hata as { name?: string })?.name ?? "";
  if (ad === "NotAllowedError" || ad === "SecurityError") {
    return "Kamera izni verilmedi. Tarayıcı adres çubuğundaki kilit simgesinden kamerayı açın.";
  }
  if (ad === "NotFoundError" || ad === "OverconstrainedError") {
    return "Cihazda kullanılabilir kamera bulunamadı.";
  }
  if (ad === "NotReadableError") {
    return "Kamera başka bir uygulama tarafından kullanılıyor. Diğer uygulamaları kapatıp tekrar deneyin.";
  }
  return "Kamera açılamadı. Sayfayı yenileyip tekrar deneyin.";
}

export function KameraDugmesi({
  onKod,
  surekli = true,
  baslik = "Kamera ile Okut",
}: {
  onKod: (kod: string) => void;
  /** true: kamera açık kalır, arka arkaya okutulur. false: ilk okumada kapanır. */
  surekli?: boolean;
  baslik?: string;
}) {
  const [acik, setAcik] = useState(false);
  const [hata, setHata] = useState("");
  const [hazir, setHazir] = useState(false);
  const [okunanlar, setOkunanlar] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const kontrolRef = useRef<IScannerControls | null>(null);
  const sonKodRef = useRef<{ kod: string; zaman: number } | null>(null);

  const kapat = useCallback(() => {
    kontrolRef.current?.stop();
    kontrolRef.current = null;
    setAcik(false);
    setHazir(false);
    setOkunanlar([]);
    sonKodRef.current = null;
  }, []);

  useEffect(() => {
    if (!acik) return;

    let iptal = false;

    async function basla() {
      setHata("");
      setHazir(false);

      if (typeof window !== "undefined" && !window.isSecureContext) {
        setHata(
          "Kamera yalnızca güvenli bağlantıda (https) çalışır. Programa alan adıyla girin.",
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setHata("Bu tarayıcı kamera erişimini desteklemiyor.");
        return;
      }

      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (iptal) return;

        // Ürün barkodları ve IMEI etiketlerinde kullanılan biçimler.
        const ipuclari = new Map();
        ipuclari.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
        ]);
        ipuclari.set(DecodeHintType.TRY_HARDER, true);

        const okuyucu = new BrowserMultiFormatReader(ipuclari);
        const video = videoRef.current;
        if (!video) return;

        kontrolRef.current = await okuyucu.decodeFromConstraints(
          KAMERA_KISITI,
          video,
          (sonuc) => {
            if (!sonuc) return;
            const kod = sonuc.getText().trim().toUpperCase();
            if (!kod) return;

            const son = sonKodRef.current;
            const simdi = Date.now();
            if (son && son.kod === kod && simdi - son.zaman < TEKRAR_BEKLEME_MS) return;
            sonKodRef.current = { kod, zaman: simdi };

            sesVer();
            onKod(kod);
            setOkunanlar((mevcut) => [kod, ...mevcut].slice(0, 12));
            if (!surekli) kapat();
          },
        );
        if (iptal) {
          kontrolRef.current?.stop();
          kontrolRef.current = null;
          return;
        }
        setHazir(true);
      } catch (h) {
        if (!iptal) setHata(hataMetni(h));
      }
    }

    void basla();

    return () => {
      iptal = true;
      kontrolRef.current?.stop();
      kontrolRef.current = null;
    };
  }, [acik, surekli, onKod, kapat]);

  // Sekme arkaya atıldığında kamerayı serbest bırak.
  useEffect(() => {
    if (!acik) return;
    const gizlendi = () => {
      if (document.visibilityState === "hidden") kapat();
    };
    document.addEventListener("visibilitychange", gizlendi);
    return () => document.removeEventListener("visibilitychange", gizlendi);
  }, [acik, kapat]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100"
      >
        📷 Kamera
      </button>

      {acik ? (
        <div
          role="dialog"
          aria-label={baslik}
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-3 text-white">
            <span className="text-sm font-medium">{baslik}</span>
            <button
              type="button"
              onClick={kapat}
              className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium transition hover:bg-white/25"
            >
              Kapat
            </button>
          </div>

          <div className="relative flex-1 overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />
            {/* Nişangâh: kullanıcı barkodu ortalasın. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-4/5 max-w-md rounded-lg border-2 border-emerald-400/80" />
            </div>
            {!hazir && !hata ? (
              <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white/80">
                Kamera açılıyor…
              </p>
            ) : null}
          </div>

          {hata ? (
            <p role="alert" className="mt-2 rounded-lg bg-red-600 px-3 py-2 text-sm text-white">
              {hata}
            </p>
          ) : (
            <p className="mt-2 text-center text-xs text-white/70">
              Barkodu yeşil çerçeveye ortalayın.
              {surekli ? " Okunan her kod eklenir; bittiğinde Kapat'a basın." : ""}
            </p>
          )}

          {okunanlar.length > 0 ? (
            <div className="mt-2 max-h-28 overflow-y-auto rounded-lg bg-white/10 p-2">
              <p className="mb-1 text-xs text-white/70">{okunanlar.length} kod okundu</p>
              <ul className="flex flex-wrap gap-1.5">
                {okunanlar.map((kod) => (
                  <li
                    key={kod}
                    className="rounded bg-white/15 px-2 py-0.5 font-mono text-xs text-white"
                  >
                    {kod}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
