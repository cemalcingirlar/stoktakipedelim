/**
 * Paneldeki giriş/satış grafiğinin dönem seçenekleri ve kova (sütun) hesabı.
 *
 * Kova genişliği döneme göre değişiyor: bir haftayı aylık göstermek tek sütun
 * demek, bir yılı günlük göstermek 365 sütun. Her dönem için okunabilir sayıda
 * sütun kalsın diye gün / hafta / ay arasında geçiş yapılıyor.
 *
 * Burada veritabanı yok: tarih matematiği saf ve test edilebilir kalsın diye
 * sorgular raporlar.ts tarafında.
 */

export type KovaTuru = "gun" | "hafta" | "ay";

export type GrafikDonemi = {
  anahtar: string;
  etiket: string;
  /** Başlık metni: "Son 1 Hafta — Giriş ve Satış". */
  baslik: string;
  kova: KovaTuru;
  /** Geriye kaç gün gidileceği; ay bazlı dönemlerde null. */
  gun: number | null;
  /** Geriye kaç ay gidileceği; gün bazlı dönemlerde null. */
  ay: number | null;
};

export const GRAFIK_DONEMLERI: GrafikDonemi[] = [
  { anahtar: "1h", etiket: "1 Hafta", baslik: "Son 1 Hafta", kova: "gun", gun: 7, ay: null },
  { anahtar: "1a", etiket: "1 Ay", baslik: "Son 1 Ay", kova: "gun", gun: 30, ay: null },
  { anahtar: "3a", etiket: "3 Ay", baslik: "Son 3 Ay", kova: "hafta", gun: 90, ay: null },
  { anahtar: "6a", etiket: "6 Ay", baslik: "Son 6 Ay", kova: "ay", gun: null, ay: 6 },
  { anahtar: "12a", etiket: "12 Ay", baslik: "Son 12 Ay", kova: "ay", gun: null, ay: 12 },
];

export const VARSAYILAN_DONEM = "12a";

/** URL parametresini dönem nesnesine çevirir; tanınmayan değer varsayılana düşer. */
export function donemiCoz(deger: unknown): GrafikDonemi {
  const anahtar = typeof deger === "string" ? deger : "";
  return (
    GRAFIK_DONEMLERI.find((d) => d.anahtar === anahtar) ??
    GRAFIK_DONEMLERI.find((d) => d.anahtar === VARSAYILAN_DONEM)!
  );
}

function gunBasina(tarih: Date): Date {
  return new Date(tarih.getFullYear(), tarih.getMonth(), tarih.getDate());
}

/** Haftanın başı pazartesidir (Türkiye'de hafta pazartesi başlar). */
export function haftaBasi(tarih: Date): Date {
  const gun = gunBasina(tarih);
  const kaydirma = (gun.getDay() + 6) % 7; // pazar=0 -> 6, pazartesi=1 -> 0
  gun.setDate(gun.getDate() - kaydirma);
  return gun;
}

function ikiHane(sayi: number): string {
  return String(sayi).padStart(2, "0");
}

/**
 * Bir tarihi kovasının anahtarına çevirir. Yerel saat kullanılıyor: kullanıcı
 * günü yerel günle başlıyor, UTC'ye çevirmek akşam yapılan satışı ertesi güne
 * atabilirdi.
 */
export function kovaAnahtari(tarih: Date, tur: KovaTuru): string {
  if (tur === "ay") return `${tarih.getFullYear()}-${ikiHane(tarih.getMonth() + 1)}`;
  const temel = tur === "hafta" ? haftaBasi(tarih) : gunBasina(tarih);
  return `${temel.getFullYear()}-${ikiHane(temel.getMonth() + 1)}-${ikiHane(temel.getDate())}`;
}

function gunEtiketi(tarih: Date): string {
  return tarih.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

/** Kovanın ekranda görünen etiketi. */
export function kovaEtiketi(baslangic: Date, tur: KovaTuru): string {
  if (tur === "ay") {
    return baslangic.toLocaleDateString("tr-TR", { month: "short", year: "2-digit" });
  }
  if (tur === "hafta") {
    const bitis = new Date(baslangic);
    bitis.setDate(bitis.getDate() + 6);
    return `${baslangic.getDate()}-${gunEtiketi(bitis)}`;
  }
  return gunEtiketi(baslangic);
}

export type Kova = { anahtar: string; etiket: string; baslangic: Date };

/**
 * Dönemin kovalarını eskiden yeniye üretir ve sorgunun başlangıç tarihini verir.
 * Başlangıç ilk kovanın başıdır: yarım kalmış bir kovayı eksik göstermemek için
 * veri de o noktadan çekilmeli.
 */
export function donemKovalari(
  donem: GrafikDonemi,
  bugun: Date = new Date(),
): { baslangic: Date; kovalar: Kova[] } {
  const kovalar: Kova[] = [];

  if (donem.kova === "ay") {
    const ilk = new Date(bugun.getFullYear(), bugun.getMonth() - (donem.ay! - 1), 1);
    for (let i = 0; i < donem.ay!; i++) {
      const t = new Date(ilk.getFullYear(), ilk.getMonth() + i, 1);
      kovalar.push({ anahtar: kovaAnahtari(t, "ay"), etiket: kovaEtiketi(t, "ay"), baslangic: t });
    }
    return { baslangic: ilk, kovalar };
  }

  if (donem.kova === "hafta") {
    const haftaSayisi = Math.ceil(donem.gun! / 7);
    const buHafta = haftaBasi(bugun);
    const ilk = new Date(buHafta);
    ilk.setDate(ilk.getDate() - (haftaSayisi - 1) * 7);
    for (let i = 0; i < haftaSayisi; i++) {
      const t = new Date(ilk);
      t.setDate(t.getDate() + i * 7);
      kovalar.push({
        anahtar: kovaAnahtari(t, "hafta"),
        etiket: kovaEtiketi(t, "hafta"),
        baslangic: t,
      });
    }
    return { baslangic: ilk, kovalar };
  }

  const ilk = gunBasina(bugun);
  ilk.setDate(ilk.getDate() - (donem.gun! - 1));
  for (let i = 0; i < donem.gun!; i++) {
    const t = new Date(ilk);
    t.setDate(t.getDate() + i);
    kovalar.push({ anahtar: kovaAnahtari(t, "gun"), etiket: kovaEtiketi(t, "gun"), baslangic: t });
  }
  return { baslangic: ilk, kovalar };
}

/** Grafikte bir sütun: kova etiketi + o kovadaki giriş/satış sayıları. */
export type GrafikKovasi = {
  anahtar: string;
  etiket: string;
  giris: number;
  satis: number;
  ciroKurus: number;
};
