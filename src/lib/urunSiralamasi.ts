/**
 * Paneldeki "en çok" ürün dökümleri: stokta en çok bulunan ve en çok satan.
 *
 * Buradaki "ürün" bir fiziksel cihaz değil, marka + model birleşimi. Bir
 * cihaz bir satır olduğu için "en çok satan ürün" sorusu ancak cihazlar
 * ürününe göre gruplanınca cevaplanabiliyor.
 *
 * Burada veritabanı yok: gruplama, birleştirme ve sıralama saf kalsın diye
 * sorgular raporlar.ts tarafında.
 */
import { aramaNormalize } from "./metin";

export type UrunDonemAnahtari = "hafta" | "ay" | "tum";

export type UrunDonemi = {
  anahtar: UrunDonemAnahtari;
  /** Düğme metni. */
  etiket: string;
  /** Kart başlığında kullanılan hali. */
  baslik: string;
  /** Geriye kaç gün gidileceği; "tüm zamanlar" için null. */
  gun: number | null;
};

/**
 * Dönemler kayan pencere: "son 1 hafta" pazartesiden beri değil, bugünden
 * geriye 7 gün. Paneldeki satış dökümünün takvim dönemlerinden (bugün / bu
 * hafta / bu ay) bilerek ayrı — "en çok satan" sorusu takvim sınırına değil
 * yakın geçmişe bakar.
 */
export const URUN_DONEMLERI: UrunDonemi[] = [
  { anahtar: "hafta", etiket: "Son 1 Hafta", baslik: "son 1 haftada", gun: 7 },
  { anahtar: "ay", etiket: "Son 1 Ay", baslik: "son 1 ayda", gun: 30 },
  {
    anahtar: "tum",
    etiket: "Tüm Zamanlar",
    baslik: "tüm zamanlarda",
    gun: null,
  },
];

export const VARSAYILAN_URUN_DONEMI: UrunDonemAnahtari = "ay";

/** Panelde kaç ürün listeleniyor; kart kısa kalsın. */
export const PANEL_URUN_SAYISI = 5;

/** URL parametresini döneme çevirir; tanınmayan değer varsayılana düşer. */
export function urunDonemiCoz(deger: unknown): UrunDonemi {
  const anahtar = typeof deger === "string" ? deger : "";
  return (
    URUN_DONEMLERI.find((d) => d.anahtar === anahtar) ??
    URUN_DONEMLERI.find((d) => d.anahtar === VARSAYILAN_URUN_DONEMI)!
  );
}

/**
 * Dönemin başlangıç tarihi; "tüm zamanlar" için null (sınır yok).
 *
 * Başlangıç günün başına çekiliyor: 7 günü saatinden başlatmak bugünün
 * sabahında yapılan satışı pencerenin dışında bırakırdı.
 */
export function urunDonemBaslangici(
  donem: UrunDonemi,
  bugun: Date = new Date(),
): Date | null {
  if (donem.gun === null) return null;
  const baslangic = new Date(
    bugun.getFullYear(),
    bugun.getMonth(),
    bugun.getDate(),
  );
  baslangic.setDate(baslangic.getDate() - (donem.gun - 1));
  return baslangic;
}

export type UrunSatiri = {
  marka: string;
  model: string;
  adet: number;
  /** Stokta alış tutarı, satışta ciro. */
  tutarKurus: number;
};

/**
 * Gruplama anahtarı. Normalleştirilmiş: gerçek veride aynı ürün "SAMSUNG" ve
 * "Samsung" diye iki ayrı satır olarak girilmiş olabiliyor; ayrı sayılırsa
 * ikisi de listeye giremeyecek kadar küçük görünür.
 */
export function urunAnahtari(marka: string, model: string): string {
  return `${aramaNormalize(marka)}|${aramaNormalize(model)}`;
}

/**
 * Aynı ürünün satırlarını toplar. İki kaynak birleştiği için gerekli: normal
 * satışlar ile aktarımdaki sat-geri al işlemleri ayrı sorgulanıyor, ikisi de
 * satış. Ayrıca yazım farkları bu adımda tek satıra iniyor.
 *
 * Görünen ad ilk görülen yazımdan alınıyor; anahtar normalleştirilmiş olsa da
 * ekranda kullanıcının girdiği hali durmalı.
 */
export function urunleriBirlestir(satirlar: UrunSatiri[]): UrunSatiri[] {
  const harita = new Map<string, UrunSatiri>();
  for (const s of satirlar) {
    const anahtar = urunAnahtari(s.marka, s.model);
    const mevcut = harita.get(anahtar);
    if (mevcut) {
      mevcut.adet += s.adet;
      mevcut.tutarKurus += s.tutarKurus;
    } else {
      harita.set(anahtar, { ...s });
    }
  }
  return [...harita.values()];
}

/**
 * En çok adetliden aza sıralar ve listeyi kısaltır.
 *
 * Eşitlikte önce tutar, sonra ad belirleyici: sıralama her yüklemede aynı
 * çıksın, iki ürün aynı adette diye liste sayfa yenilendikçe yer değiştirmesin.
 */
export function enCokSatirlar(
  satirlar: UrunSatiri[],
  limit: number,
): UrunSatiri[] {
  return [...satirlar]
    .filter((s) => s.adet > 0)
    .sort(
      (a, b) =>
        b.adet - a.adet ||
        b.tutarKurus - a.tutarKurus ||
        urunAdi(a).localeCompare(urunAdi(b), "tr"),
    )
    .slice(0, Math.max(0, limit));
}

/** Ekranda görünen ürün adı. */
export function urunAdi(satir: { marka: string; model: string }): string {
  return `${satir.marka} ${satir.model}`.trim();
}
