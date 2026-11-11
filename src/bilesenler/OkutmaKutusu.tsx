"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { GIRDI_SINIFI } from "./Alan";
import { KameraDugmesi } from "./KameraOkuyucu";
import { okutmayiSeslendir, sesiHazirla } from "./ses";
import {
  SES_TERCIHI_ANAHTARI,
  sesAcikMi,
  sesTercihiYaz,
} from "@/lib/sesliOkutma";

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
  sesli = false,
  yanAlan,
}: {
  etiket: string;
  ipucu?: string;
  yerTutucu?: string;
  okut: (kod: string) => Promise<OkutmaGeriBildirimi>;
  devreDisi?: boolean;
  /**
   * Okutma kutusunun soluna eklenen ek denetim (kabul ekranındaki adet alanı
   * gibi). Ayrı bir kart açmak yerine aynı satırda duruyor: okutma ve ona
   * eşlik eden ayar birbirinden kopmamalı.
   */
  yanAlan?: ReactNode;
  /** Kamera okumada: true ise açık kalır, false ise ilk okumada kapanır. */
  kameraSurekli?: boolean;
  /**
   * Ekran açılır açılmaz imleci kutuya koyar; barkod okuyucu doğrudan buraya
   * yazsın diye. Yalnız fare/klavyeli cihazlarda çalışır: dokunmatikte her
   * açılışta ekran klavyesini açmak işi zorlaştırıyor.
   */
  odakVer?: boolean;
  /**
   * Okutma sonucunu sesle de bildirir: sayılan cihazda "okudu", diğer
   * durumlarda "hata var". Sayımda raftaki cihaza bakılırken göz ekranda
   * olmuyor. Öntanımlı kapalı; yalnız isteyen ekran açıyor.
   */
  sesli?: boolean;
}) {
  const [deger, setDeger] = useState("");
  const [geriBildirim, setGeriBildirim] = useState<OkutmaGeriBildirimi>(null);
  // Ses tercihi tarayıcıda saklanıyor: kalabalık mağazada kapatan kişi her
  // sayımda yeniden kapatmak zorunda kalmasın.
  const [sesAcik, setSesAcik] = useState(true);
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

  useEffect(() => {
    if (!sesli) return;
    try {
      setSesAcik(sesAcikMi(window.localStorage.getItem(SES_TERCIHI_ANAHTARI)));
    } catch {
      // Gizli kipte localStorage okunamıyor; öntanımlı açık kalır.
    }
  }, [sesli]);

  const kodGonder = useCallback(
    (kod: string, odakGeri = false) => {
      const temiz = kod.trim();
      if (!temiz) return;
      odagiGeriVer.current = odakGeri;
      setDeger("");
      // Konuşma motoru okutma ANINDA uyandırılıyor: iOS ilk konuşmayı
      // kullanıcı hareketine bağlıyor, sonuç ise sunucu cevabından sonra
      // geliyor.
      if (sesli && sesAcik) sesiHazirla();
      basla(async () => {
        const sonuc = await okut(temiz);
        setGeriBildirim(sonuc);
        if (sesli && sesAcik && sonuc) okutmayiSeslendir(sonuc.tur);
      });
    },
    [okut, sesli, sesAcik],
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
      {/* basis-full: dar ekranda okutma kutusu kendi satırını alıyor. Yan
          yana dizilince telefonda 132 piksele kadar iniyordu ve barkod
          okuyucunun yazdığı 13 haneli kod görünmüyordu. sm'den itibaren
          yine aynı satırı paylaşıyor. */}
      <div className="flex flex-wrap items-center gap-2">
        {yanAlan}
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
          className={`okutma-girdisi min-w-0 flex-1 basis-full ${GIRDI_SINIFI} font-mono read-only:bg-slate-100 sm:basis-0`}
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
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        {ipucu ? <p className="text-xs text-blue-800">{ipucu}</p> : <span />}
        {sesli ? (
          <button
            type="button"
            data-test="ses-dugmesi"
            aria-pressed={sesAcik}
            onClick={() => {
              const yeni = !sesAcik;
              setSesAcik(yeni);
              try {
                window.localStorage.setItem(
                  SES_TERCIHI_ANAHTARI,
                  sesTercihiYaz(yeni),
                );
              } catch {
                // Saklanamıyorsa tercih yalnız bu ekran için geçerli.
              }
              if (yeni) sesiHazirla();
            }}
            className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              sesAcik
                ? "border-blue-300 bg-white text-blue-800 hover:bg-blue-100"
                : "border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {sesAcik ? "🔊 Sesli bildirim açık" : "🔇 Sesli bildirim kapalı"}
          </button>
        ) : null}
      </div>
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
