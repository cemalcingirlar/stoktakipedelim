/**
 * Satış ekranında stoktaki ürünleri adıyla bulma.
 *
 * Bazı ürünü okutmak yerine adıyla bulmak daha kolay: aksesuarın barkodu
 * silinmiş olabiliyor, ya da müşteri "şu powerbank" diyor. Arama sonucu cihaz
 * cihaz değil ürün ürün gösteriliyor — aynı aksesuardan 20 adet varsa 20 satır
 * dökmek listeyi okunmaz yapardı.
 *
 * Burada veritabanı yok: gruplama ve etiketler saf, böylece doğrudan test
 * edilebiliyor ve ekranla sunucu aynı kuralı kullanıyor.
 */
import { kurusuTLYaz } from "./para";

export type AranabilirCihaz = {
  id: number;
  marka: string;
  model: string;
  barkod: string | null;
  seriNo: string | null;
  kategori: string;
  magazaAdi: string;
  alisFiyatiKurus: number;
};

export type UrunGrubu = {
  /** Gruplama anahtarı; ekranda React anahtarı olarak da kullanılıyor. */
  anahtar: string;
  marka: string;
  model: string;
  kategori: string;
  barkod: string | null;
  /** Gruptaki cihaz sayısı. */
  adet: number;
  /** Gruptaki en düşük ve en yüksek alış fiyatı (kuruş). */
  enDusukAlisKurus: number;
  enYuksekAlisKurus: number;
  /** Cihazların bulunduğu mağazalar, tekilleştirilmiş. */
  magazalar: string[];
  /**
   * Gruptaki cihazların kimlikleri, seçim sırasıyla.
   *
   * Sıra cihazSecimi.ts'deki ile aynı tutuluyor (seri numaralı olanlar önce,
   * sonra numaraya göre): kullanıcı listede gördüğü fiyatın hangi cihaza ait
   * olduğunu tahmin edebilmeli.
   */
  cihazIdleri: number[];
};

/** Aramanın çalışması için gereken en az karakter. */
export const EN_AZ_ARAMA = 2;

/** Sonuç listesinde gösterilecek en çok ürün; fazlası ekranı boğar. */
export const EN_COK_GRUP = 30;

export function aramaYeterliMi(sorgu: string): boolean {
  return sorgu.trim().length >= EN_AZ_ARAMA;
}

/**
 * Cihazları ürün bazında gruplar.
 *
 * Anahtar barkod; barkodu olmayan ürünlerde marka + model. Barkodu olan iki
 * ayrı ürün aynı marka/modeli taşıyabildiği için önce barkoda bakılıyor.
 */
export function gruplaUrunler(cihazlar: AranabilirCihaz[]): UrunGrubu[] {
  const gruplar = new Map<string, UrunGrubu>();

  for (const cihaz of siralaCihazlar(cihazlar)) {
    const anahtar = cihaz.barkod
      ? `b:${cihaz.barkod}`
      : `m:${cihaz.marka.toLocaleLowerCase("tr")}|${cihaz.model.toLocaleLowerCase("tr")}`;

    const mevcut = gruplar.get(anahtar);
    if (!mevcut) {
      gruplar.set(anahtar, {
        anahtar,
        marka: cihaz.marka,
        model: cihaz.model,
        kategori: cihaz.kategori,
        barkod: cihaz.barkod,
        adet: 1,
        enDusukAlisKurus: cihaz.alisFiyatiKurus,
        enYuksekAlisKurus: cihaz.alisFiyatiKurus,
        magazalar: [cihaz.magazaAdi],
        cihazIdleri: [cihaz.id],
      });
      continue;
    }

    mevcut.adet += 1;
    mevcut.cihazIdleri.push(cihaz.id);
    mevcut.enDusukAlisKurus = Math.min(
      mevcut.enDusukAlisKurus,
      cihaz.alisFiyatiKurus,
    );
    mevcut.enYuksekAlisKurus = Math.max(
      mevcut.enYuksekAlisKurus,
      cihaz.alisFiyatiKurus,
    );
    if (!mevcut.magazalar.includes(cihaz.magazaAdi))
      mevcut.magazalar.push(cihaz.magazaAdi);
  }

  // Ada göre sırala: kullanıcı aradığı ürünü tahmin edilebilir bir yerde
  // bulmalı, veritabanı sırası rastgele görünür.
  return [...gruplar.values()].sort((a, b) =>
    `${a.marka} ${a.model}`.localeCompare(`${b.marka} ${b.model}`, "tr"),
  );
}

/**
 * Cihazları seçim sırasına dizer: seri numaralı olanlar önce, sonra numaraya
 * göre. cihazSecimi.ts'deki sıralamayla aynı — listede görünen fiyat ile
 * seçildiğinde gelen cihaz birbirini tutsun.
 */
function siralaCihazlar(cihazlar: AranabilirCihaz[]): AranabilirCihaz[] {
  return [...cihazlar].sort((a, b) => {
    if (Boolean(a.seriNo) !== Boolean(b.seriNo)) return a.seriNo ? -1 : 1;
    if (a.seriNo && b.seriNo) return a.seriNo.localeCompare(b.seriNo, "tr");
    return a.id - b.id;
  });
}

/** Listede görünen ürün adı. */
export function grupEtiketi(grup: UrunGrubu): string {
  return `${grup.marka} ${grup.model}`.replace(/\s+/g, " ").trim();
}

/**
 * Alış fiyatı metni. Gruptaki cihazların fiyatı farklıysa aralık yazılıyor:
 * tek bir rakam yazmak, seçilince gelen cihazın fiyatı başka olduğunda
 * kullanıcıyı yanıltırdı (satış fiyatı alış fiyatıyla dolu geliyor).
 */
export function grupFiyatMetni(grup: UrunGrubu): string {
  if (grup.enDusukAlisKurus === grup.enYuksekAlisKurus) {
    return `${kurusuTLYaz(grup.enDusukAlisKurus)} TL`;
  }
  return `${kurusuTLYaz(grup.enDusukAlisKurus)} – ${kurusuTLYaz(grup.enYuksekAlisKurus)} TL`;
}

/** Satır altındaki açıklama: adet ve mağazalar. */
export function grupAciklamasi(grup: UrunGrubu): string {
  const parcalar = [
    `${grup.adet} adet`,
    grup.kategori,
    grup.magazalar.join(", "),
  ];
  if (grup.barkod) parcalar.push(grup.barkod);
  return parcalar.filter(Boolean).join(" · ");
}

/**
 * Listeden seçimde "hangi cihaz?" diye sorulmalı mı?
 *
 * Seri numarası olan cihazlarda sorulur: hangi IMEI'nin satıldığı önemli ve
 * maliyetleri farklı olabiliyor. Seri numarası olmayan özdeş ürünlerde
 * (3 adet aynı powerbank) sorulmaz — kullanıcıya "(seri no yok · kayıt 12)"
 * diye üç satır göstermek anlamsız bir tıklama olurdu.
 */
export function secimSorulmali(adaylar: { seriNo: string | null }[]): boolean {
  return adaylar.some((a) => (a.seriNo ?? "") !== "");
}

/** Sonuç yokken gösterilecek mesaj. */
export function sonucYokMesaji(sorgu: string): string {
  return `"${sorgu.trim()}" için stokta ürün bulunamadı.`;
}

// ------------------------------------------------- Alış faturası ekranı

/**
 * Daha önce girilmiş bir ürün kartı.
 *
 * Alış faturasında aranan şey stok değil geçmiş: barkodu okutulduğunda
 * marka, model, kategori ve son alış fiyatı otomatik geliyor. Ürün tükenmiş
 * olsa bile kartı listede durmalı — yeniden alınan ürün tam da bu.
 */
export type GecmisUrun = {
  barkod: string;
  marka: string;
  model: string;
  kategoriAdi: string;
  altKategoriAdi: string | null;
  /** En son girişteki alış fiyatı (kuruş). */
  sonAlisKurus: number;
  sonGirisTarihi: Date;
  /** Bu barkodla bugüne kadar girilmiş toplam cihaz sayısı. */
  toplamAdet: number;
};

export type GecmisKayit = {
  barkod: string | null;
  marka: string;
  model: string;
  kategoriAdi: string;
  altKategoriAdi: string | null;
  alisFiyatiKurus: number;
  girisTarihi: Date;
};

/**
 * Geçmiş girişleri barkod bazında tek karta indirger.
 *
 * Kart bilgisi en son girişten alınıyor: aynı barkod yıllar içinde farklı
 * fiyatlarla girilmiş olabiliyor ve kullanıcı en güncelini bekler. Barkodu
 * olmayan kayıtlar listeye girmiyor — seçildiğinde okutulacak bir kod yok.
 */
export function gruplaGecmisUrunler(kayitlar: GecmisKayit[]): GecmisUrun[] {
  const gruplar = new Map<string, GecmisUrun>();

  for (const k of kayitlar) {
    if (!k.barkod) continue;

    const mevcut = gruplar.get(k.barkod);
    if (!mevcut) {
      gruplar.set(k.barkod, {
        barkod: k.barkod,
        marka: k.marka,
        model: k.model,
        kategoriAdi: k.kategoriAdi,
        altKategoriAdi: k.altKategoriAdi,
        sonAlisKurus: k.alisFiyatiKurus,
        sonGirisTarihi: k.girisTarihi,
        toplamAdet: 1,
      });
      continue;
    }

    mevcut.toplamAdet += 1;
    if (k.girisTarihi.getTime() > mevcut.sonGirisTarihi.getTime()) {
      mevcut.marka = k.marka;
      mevcut.model = k.model;
      mevcut.kategoriAdi = k.kategoriAdi;
      mevcut.altKategoriAdi = k.altKategoriAdi;
      mevcut.sonAlisKurus = k.alisFiyatiKurus;
      mevcut.sonGirisTarihi = k.girisTarihi;
    }
  }

  // En son girilenler önce: kullanıcı genelde yakın zamanda aldığı ürünü
  // yeniden alıyor.
  return [...gruplar.values()].sort(
    (a, b) => b.sonGirisTarihi.getTime() - a.sonGirisTarihi.getTime(),
  );
}

/** Listede görünen ürün adı. */
export function gecmisUrunEtiketi(urun: GecmisUrun): string {
  return `${urun.marka} ${urun.model}`.replace(/\s+/g, " ").trim();
}

/** Satır altındaki açıklama: kategori, barkod ve toplam giriş adedi. */
export function gecmisUrunAciklamasi(urun: GecmisUrun): string {
  const kategori = urun.altKategoriAdi
    ? `${urun.kategoriAdi} / ${urun.altKategoriAdi}`
    : urun.kategoriAdi;
  return [kategori, urun.barkod, `${urun.toplamAdet} adet girilmiş`].join(
    " · ",
  );
}

/**
 * Kısaltılmış arama sonucu.
 *
 * Arama hem veritabanında (ilk 500 cihaz) hem gruplamada (ilk 30 ürün)
 * kesiliyordu ve ekranda bunu söyleyen hiçbir şey yoktu. Gerçek veride
 * ölçüldü: "SAMSUNG", "A5", "PRO" gibi yaygın aramaların hepsi tam 30'da
 * duruyor. Satıcı müşterinin önünde 30 ürün görüp aradığını bulamayınca
 * "yok" diyor — oysa var. Bu doğrudan satış kaybı.
 */
export type AramaSonucu<T> = {
  gruplar: T[];
  /** Sonuç sınıra dayandı mı? */
  kesildi: boolean;
};

/**
 * Aramada veritabanından çekilen en çok cihaz sayısı.
 *
 * Gruplama veritabanında değil burada yapıldığı için önce cihazlar çekiliyor.
 * 500 cihaz 30 gruptan azına da düşebilir (aynı modelden çok adet varsa), bu
 * yüzden grup sınırına bakmak yetmiyor: bu sınıra dayanmak da "daha fazlası
 * var" demek.
 */
export const EN_COK_CIHAZ = 500;

/**
 * Listeyi sınıra kısaltır ve kesilip kesilmediğini bildirir.
 *
 * `oncedenKesildi`, gruplamadan önceki cihaz sınırına dayanıldığını söyler;
 * grup sayısı sınırın altında kalsa bile sonuç eksik demektir.
 */
export function sonucuKisalt<T>(
  tumu: T[],
  limit: number = EN_COK_GRUP,
  oncedenKesildi = false,
): AramaSonucu<T> {
  return {
    gruplar: tumu.slice(0, limit),
    kesildi: oncedenKesildi || tumu.length > limit,
  };
}

/** Kesilme varsa kullanıcıya gösterilecek uyarı; yoksa null. */
export function kesintiUyarisi(
  sonuc: { kesildi: boolean },
  limit: number = EN_COK_GRUP,
): string | null {
  if (!sonuc.kesildi) return null;
  return `İlk ${limit} ürün gösteriliyor; daha fazlası var. Aramayı daraltın.`;
}
