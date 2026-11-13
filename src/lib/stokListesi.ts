/**
 * Günlük stok listesi: yedekle birlikte Drive'a yüklenen Excel.
 *
 * Veritabanı yedeği tek başına okunamıyor; sistem açılmadığında elde
 * telefondan açılabilen bir liste olmuyor. Ayrıca program "şu tarihte stokta
 * ne vardı" sorusunu geriye dönük cevaplayamıyor. Her gün alınan liste ikisini
 * de karşılıyor.
 *
 * Bu dosya saf: sorgu, dosya yazma ve Drive çağrıları src/lib/yedek.ts içinde;
 * içerik ve kurallar burada, testleriyle.
 */
import type { ExcelSutunu } from "./excel";
import { aramaNormalize } from "./metin";
import { STOK_DURUM, STOK_DURUM_ETIKET, type StokDurum } from "./sabitler";

/** Drive'daki dosya adının başı. Yedek dosyalarının adıyla ("stok-yedek-")
 *  çakışmamalı: yedek rotasyonu ve geri yükleme provası o adı arıyor. */
export const STOK_LISTESI_ONEKI = "stok-listesi-";

/** Listelerin konduğu alt klasör. */
export const STOK_LISTESI_KLASORU = "Stok Listeleri";

/** Saklanan gün sayısı; daha eski listeler silinir. */
export const STOK_LISTESI_SAKLAMA = 30;

/** Son yüklemenin sonucunun saklandığı ayar anahtarı. */
export const STOK_LISTESI_ANAHTARI = "stok_listesi_son";

/**
 * Listeye giren durumlar: elde olan her şey.
 *
 * Yalnız "stokta" değil: yoldaki (transferde), iade gelen ve arızalı cihaz da
 * dükkânın malı. Satılan ve iptal edilen kayıtlar girmiyor.
 */
export const LISTEYE_GIREN_DURUMLAR: StokDurum[] = [
  STOK_DURUM.STOKTA,
  STOK_DURUM.TRANSFERDE,
  STOK_DURUM.IADE,
  STOK_DURUM.ARIZALI,
];

/** "stok-listesi-2026-11-13.xlsx" — yerel gün; günde bir dosya. */
export function stokListesiDosyaAdi(tarih: Date): string {
  const iki = (n: number) => String(n).padStart(2, "0");
  return `${STOK_LISTESI_ONEKI}${tarih.getFullYear()}-${iki(tarih.getMonth() + 1)}-${iki(tarih.getDate())}.xlsx`;
}

export type StokListesiCihazi = {
  magaza: string;
  durum: string;
  kategori: string;
  altKategori: string | null;
  marka: string;
  model: string;
  renk: string | null;
  kapasite: string | null;
  seriNo: string | null;
  barkod: string | null;
  tedarikci: string | null;
  alisFiyatiKurus: number;
  girisTarihi: Date;
  not: string | null;
};

export const STOK_SUTUNLARI: ExcelSutunu[] = [
  { baslik: "Mağaza", genislik: 20 },
  { baslik: "Durum", genislik: 12 },
  { baslik: "Kategori", genislik: 16 },
  { baslik: "Alt Kategori", genislik: 14 },
  { baslik: "Marka", genislik: 14 },
  { baslik: "Model", genislik: 30 },
  { baslik: "Renk", genislik: 12 },
  { baslik: "Kapasite", genislik: 10 },
  { baslik: "Seri No / IMEI", genislik: 20 },
  { baslik: "Barkod", genislik: 18 },
  { baslik: "Tedarikçi", genislik: 22 },
  { baslik: "Alış Fiyatı (TL)", genislik: 16, sayisal: true },
  { baslik: "Giriş Tarihi", genislik: 14 },
  { baslik: "Not", genislik: 30 },
];

function tl(kurus: number): number {
  return Number((kurus / 100).toFixed(2));
}

function gunYaz(tarih: Date): string {
  const iki = (n: number) => String(n).padStart(2, "0");
  return `${iki(tarih.getDate())}.${iki(tarih.getMonth() + 1)}.${tarih.getFullYear()}`;
}

/** Bir cihazın Excel satırı. Seri no ve barkod METİN: sayı olursa Excel
 *  15 haneli IMEI'yi bilimsel gösterime çevirip son hanelerini bozuyor. */
export function stokSatiri(c: StokListesiCihazi): (string | number | null)[] {
  return [
    c.magaza,
    STOK_DURUM_ETIKET[c.durum as StokDurum] ?? c.durum,
    c.kategori,
    c.altKategori ?? "",
    c.marka,
    c.model,
    c.renk ?? "",
    c.kapasite ?? "",
    c.seriNo ?? "",
    c.barkod ?? "",
    c.tedarikci ?? "",
    tl(c.alisFiyatiKurus),
    gunYaz(c.girisTarihi),
    c.not ?? "",
  ];
}

/** Özet sayfaları için biriken toplamlar; cihazlar akarken dolduruluyor. */
export type StokOzeti = {
  adet: number;
  kurus: number;
  magazalar: Map<string, { adet: number; kurus: number }>;
  urunler: Map<string, { marka: string; model: string; adet: number; kurus: number }>;
};

export function bosOzet(): StokOzeti {
  return { adet: 0, kurus: 0, magazalar: new Map(), urunler: new Map() };
}

/**
 * Bir cihazı özete ekler. Ürün anahtarı harf büyüklüğünden ve Türkçe
 * harflerden bağımsız: "SAMSUNG" ile "Samsung", "XIAOMI" ile "Xiaomi" aynı
 * ürün.
 *
 * Anahtar programın arama normalleştirmesinden geçiyor. Türkçe kurallı
 * küçültme (toLocaleLowerCase("tr")) burada YANLIŞ: "XIAOMI"yi "xıaomı"
 * yapıyor ve "Xiaomi" ile eşleşmiyor (testte yakalandı).
 */
export function ozeteEkle(ozet: StokOzeti, c: StokListesiCihazi): void {
  ozet.adet += 1;
  ozet.kurus += c.alisFiyatiKurus;

  const m = ozet.magazalar.get(c.magaza) ?? { adet: 0, kurus: 0 };
  m.adet += 1;
  m.kurus += c.alisFiyatiKurus;
  ozet.magazalar.set(c.magaza, m);

  const anahtar = `${aramaNormalize(c.marka)}\u0000${aramaNormalize(c.model)}`;
  const u = ozet.urunler.get(anahtar) ?? { marka: c.marka, model: c.model, adet: 0, kurus: 0 };
  u.adet += 1;
  u.kurus += c.alisFiyatiKurus;
  ozet.urunler.set(anahtar, u);
}

export const MAGAZA_OZETI_SUTUNLARI: ExcelSutunu[] = [
  { baslik: "Mağaza", genislik: 24 },
  { baslik: "Adet", genislik: 10 },
  { baslik: "Toplam Alış Değeri (TL)", genislik: 24, sayisal: true },
];

/** Mağaza özeti satırları: ada göre sıralı, sonda toplam. */
export function magazaOzetiSatirlari(ozet: StokOzeti): (string | number | null)[][] {
  const satirlar = [...ozet.magazalar.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "tr", { numeric: true }))
    .map(([ad, m]): (string | number | null)[] => [ad, m.adet, tl(m.kurus)]);
  return [...satirlar, ["TOPLAM", ozet.adet, tl(ozet.kurus)]];
}

export const URUN_OZETI_SUTUNLARI: ExcelSutunu[] = [
  { baslik: "Marka", genislik: 16 },
  { baslik: "Model", genislik: 34 },
  { baslik: "Adet", genislik: 10 },
  { baslik: "Toplam Alış Değeri (TL)", genislik: 24, sayisal: true },
];

/** Ürün özeti satırları: en çok bulunan en üstte. */
export function urunOzetiSatirlari(ozet: StokOzeti): (string | number | null)[][] {
  return [...ozet.urunler.values()]
    .sort(
      (a, b) =>
        b.adet - a.adet ||
        a.marka.localeCompare(b.marka, "tr") ||
        a.model.localeCompare(b.model, "tr", { numeric: true }),
    )
    .map((u) => [u.marka, u.model, u.adet, tl(u.kurus)]);
}

/** Sayfanın üstündeki bilgi satırları. */
export function ustBilgiler(tarih: Date, ozet: StokOzeti): string[] {
  const saat = `${String(tarih.getHours()).padStart(2, "0")}:${String(tarih.getMinutes()).padStart(2, "0")}`;
  return [
    `Stok Listesi — ${gunYaz(tarih)} ${saat}`,
    `${ozet.adet} cihaz · toplam alış değeri ${tl(ozet.kurus).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL`,
    "Satılan ve iptal edilen kayıtlar listede yok.",
  ];
}

export type DriveDosyasi = {
  id?: string | null;
  name?: string | null;
  createdTime?: string | null;
};

/**
 * Drive'daki listelerden silinecekler.
 *
 * İki kural:
 *   1. Günde bir dosya: aynı adı taşıyanlardan (yedek aynı gün iki kez
 *      alınmışsa) yalnız en yenisi kalır.
 *   2. En yeni `saklama` gün kalır; daha eskiler silinir.
 *
 * Sıralama dosya adına göre: ad günü taşıyor ve yıl-ay-gün biçimi alfabetik
 * sırayla aynı. Öneki taşımayan ya da kimliği olmayan dosyaya dokunulmuyor:
 * klasöre kullanıcının koyduğu başka bir dosya silinmemeli.
 */
export function silinecekListeler(
  dosyalar: DriveDosyasi[],
  saklama: number = STOK_LISTESI_SAKLAMA,
): string[] {
  const bizim = dosyalar.filter(
    (d): d is DriveDosyasi & { id: string; name: string } =>
      typeof d.id === "string" &&
      typeof d.name === "string" &&
      d.name.startsWith(STOK_LISTESI_ONEKI) &&
      d.name.endsWith(".xlsx"),
  );

  // Aynı adın en yenisi kalıyor.
  const enYeni = new Map<string, DriveDosyasi & { id: string; name: string }>();
  const silinecek: string[] = [];
  for (const d of bizim) {
    const onceki = enYeni.get(d.name);
    if (!onceki) {
      enYeni.set(d.name, d);
      continue;
    }
    const yeniMi = (d.createdTime ?? "") > (onceki.createdTime ?? "");
    silinecek.push(yeniMi ? onceki.id : d.id);
    if (yeniMi) enYeni.set(d.name, d);
  }

  if (!Number.isFinite(saklama) || saklama <= 0) return silinecek;

  const gunler = [...enYeni.values()].sort((a, b) => b.name.localeCompare(a.name));
  for (const d of gunler.slice(saklama)) silinecek.push(d.id);
  return silinecek;
}

/** Son yüklemenin saklanan kaydı. */
export type StokListesiKaydi = {
  tarihISO: string;
  basarili: boolean;
  dosyaAdi: string;
  cihazSayisi: number;
  hata?: string;
};

/** Saklanan kaydı çözer; bozuksa null. */
export function stokListesiKaydiniCoz(ham: string | null | undefined): StokListesiKaydi | null {
  if (!ham) return null;
  try {
    const k = JSON.parse(ham) as StokListesiKaydi;
    if (typeof k.tarihISO !== "string" || typeof k.basarili !== "boolean") return null;
    return k;
  } catch {
    return null;
  }
}

/**
 * Yedek mesajına ve loga eklenen kısa özet; liste denenmediyse boş.
 * Başında boşluk var: önündeki cümlenin ardına ekleniyor.
 */
export function stokListesiOzeti(
  sonuc:
    | { basarili: boolean; dosyaAdi: string; cihazSayisi: number; hata?: string }
    | null
    | undefined,
): string {
  if (!sonuc) return "";
  return sonuc.basarili
    ? ` Stok listesi: ${sonuc.dosyaAdi} (${sonuc.cihazSayisi} cihaz).`
    : ` Stok listesi yüklenemedi: ${sonuc.hata ?? "bilinmeyen hata"}`;
}
