"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { SutunAnahtari } from "@/lib/sutunlar";

/**
 * Cihaz tablosunda sütun başına filtre hücresi — Excel'in filtre satırı gibi.
 *
 * Metin kutuları yazdıkça süzüyor ama her tuşta sunucuya gitmiyor: 400 ms
 * bekleniyor. Liste 50 satırlık sayfalar hâlinde sunucudan geldiği için her
 * harfte sorgu atmak hem yavaş hem gereksiz.
 *
 * Filtre değişince sayfa 1'e dönüyor — 7. sayfadayken filtreleyip boş ekran
 * görmek kafa karıştırıcı olurdu.
 */

const KUTU =
  "w-full min-w-0 rounded border border-slate-300 bg-white px-1.5 py-1 text-xs " +
  "text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";

export type FiltreSecenekleri = {
  markalar: string[];
  tedarikciler: { id: number; ad: string }[];
  saticilar: { id: number; adSoyad: string }[];
};

/** Sütun → hangi URL parametresini süzüyor. */
export const SUTUN_PARAMETRESI: Partial<Record<SutunAnahtari, string>> = {
  marka: "marka",
  model: "model",
  seriNo: "seriNo",
  barkod: "barkod",
  tedarikci: "tedarikci",
  satanKullanici: "satan",
  musteri: "musteri",
  not: "not",
  alisFiyati: "alisMin",
  satisFiyati: "satisMin",
};

function useParametreYazici() {
  const router = useRouter();
  const yol = usePathname();
  const params = useSearchParams();

  return (degisiklikler: Record<string, string | null>) => {
    const sorgu = new URLSearchParams(params.toString());
    for (const [ad, deger] of Object.entries(degisiklikler)) {
      if (deger === null || deger === "") sorgu.delete(ad);
      else sorgu.set(ad, deger);
    }
    // Filtre değişti: ilk sayfadan başla.
    sorgu.delete("sayfa");
    const metin = sorgu.toString();
    router.replace(metin ? `${yol}?${metin}` : yol, { scroll: false });
  };
}

/** Yazdıkça süzen metin kutusu. */
function MetinFiltresi({
  parametre,
  deger,
  ipucu,
  genislik,
}: {
  parametre: string;
  deger: string;
  ipucu: string;
  genislik?: string;
}) {
  const yaz = useParametreYazici();
  const [yerel, setYerel] = useState(deger);

  // URL'deki değer dışarıdan değişirse (temizle düğmesi, tarayıcının geri
  // tuşu) kutu da güncellensin. React'in "prop değişince state'i ayarla"
  // deseni: effect değil, render sırasında karşılaştırma. Effect kullanmak
  // kutuya her yazışta fazladan bir render turu doğuruyor ve imleç kayıyor.
  const [oncekiDeger, setOncekiDeger] = useState(deger);
  if (deger !== oncekiDeger) {
    setOncekiDeger(deger);
    setYerel(deger);
  }

  // Her tuşta sunucuya gitmemek için bekleme. Kutu URL ile zaten aynıysa
  // zamanlayıcı kurulmuyor — ilk render ve dışarıdan gelen değişiklik bu
  // sayede sorgu tetiklemiyor.
  useEffect(() => {
    if (yerel === deger) return;
    const zaman = setTimeout(() => yaz({ [parametre]: yerel.trim() || null }), 400);
    return () => clearTimeout(zaman);
    // `yaz` her render'da yeniden üretiliyor; bağımlılığa eklemek her
    // render'da zamanlayıcıyı sıfırlardı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yerel, deger, parametre]);

  return (
    <input
      data-test={`filtre-${parametre}`}
      value={yerel}
      onChange={(e) => setYerel(e.target.value)}
      placeholder={ipucu}
      aria-label={`${ipucu} filtresi`}
      className={`${KUTU} ${genislik ?? ""}`}
    />
  );
}

/** Seçenekten süzen açılır liste. */
function SecimFiltresi({
  parametre,
  deger,
  secenekler,
  ipucu,
}: {
  parametre: string;
  deger: string;
  secenekler: { deger: string; etiket: string }[];
  ipucu: string;
}) {
  const yaz = useParametreYazici();
  return (
    <select
      data-test={`filtre-${parametre}`}
      value={deger}
      onChange={(e) => yaz({ [parametre]: e.target.value || null })}
      aria-label={`${ipucu} filtresi`}
      className={KUTU}
    >
      <option value="">{ipucu}</option>
      {secenekler.map((s) => (
        <option key={s.deger} value={s.deger}>
          {s.etiket}
        </option>
      ))}
    </select>
  );
}

/** Alt–üst sınır kutusu (fiyat sütunları). */
function AralikFiltresi({
  altParametre,
  ustParametre,
  alt,
  ust,
}: {
  altParametre: string;
  ustParametre: string;
  alt: string;
  ust: string;
}) {
  return (
    <div className="flex gap-1">
      <MetinFiltresi parametre={altParametre} deger={alt} ipucu="en az" />
      <MetinFiltresi parametre={ustParametre} deger={ust} ipucu="en çok" />
    </div>
  );
}

/**
 * Bir sütunun filtre hücresi. Filtresi olmayan sütunlarda boş hücre dönüyor —
 * tablo hizası bozulmasın.
 */
export function SutunFiltresi({
  anahtar,
  degerler,
  secenekler,
}: {
  anahtar: SutunAnahtari;
  degerler: Record<string, string>;
  secenekler: FiltreSecenekleri;
}) {
  switch (anahtar) {
    case "marka":
      return (
        <SecimFiltresi
          parametre="marka"
          deger={degerler.marka ?? ""}
          ipucu="Tüm markalar"
          secenekler={secenekler.markalar.map((m) => ({ deger: m, etiket: m }))}
        />
      );
    case "model":
      return <MetinFiltresi parametre="model" deger={degerler.model ?? ""} ipucu="model" />;
    case "seriNo":
      return <MetinFiltresi parametre="seriNo" deger={degerler.seriNo ?? ""} ipucu="seri no" />;
    case "barkod":
      return <MetinFiltresi parametre="barkod" deger={degerler.barkod ?? ""} ipucu="barkod" />;
    case "tedarikci":
      return (
        <SecimFiltresi
          parametre="tedarikci"
          deger={degerler.tedarikci ?? ""}
          ipucu="Tüm satıcılar"
          secenekler={secenekler.tedarikciler.map((t) => ({
            deger: String(t.id),
            etiket: t.ad,
          }))}
        />
      );
    case "satanKullanici":
      return (
        <SecimFiltresi
          parametre="satan"
          deger={degerler.satan ?? ""}
          ipucu="Herkes"
          secenekler={secenekler.saticilar.map((k) => ({
            deger: String(k.id),
            etiket: k.adSoyad,
          }))}
        />
      );
    case "musteri":
      return <MetinFiltresi parametre="musteri" deger={degerler.musteri ?? ""} ipucu="alıcı" />;
    case "not":
      return <MetinFiltresi parametre="not" deger={degerler.not ?? ""} ipucu="not" />;
    case "alisFiyati":
      return (
        <AralikFiltresi
          altParametre="alisMin"
          ustParametre="alisMax"
          alt={degerler.alisMin ?? ""}
          ust={degerler.alisMax ?? ""}
        />
      );
    case "satisFiyati":
      return (
        <AralikFiltresi
          altParametre="satisMin"
          ustParametre="satisMax"
          alt={degerler.satisMin ?? ""}
          ust={degerler.satisMax ?? ""}
        />
      );
    default:
      return null;
  }
}
