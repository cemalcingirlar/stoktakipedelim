/**
 * Tarih yardımcıları — tümü yerel (sunucuda seçili, tarayıcıda cihazın)
 * dilimine göre çıktı verir.
 *
 * Biçimlendiriciler neden modül seviyesinde tutulmuyor: saat dilimi artık
 * Ayarlar'dan seçiliyor ve istek başında `process.env.TZ` ile sürece
 * uygulanıyor. Ölçüldü — atama, `Date` okuyucularını ve yeni
 * biçimlendiricileri etkiliyor, ama atamadan önce oluşturulmuş bir
 * `Intl.DateTimeFormat` dilimini çözdüğü anda dondurup eski dilimde
 * kalıyor. Modül uygulama açılışında yüklendiği için bütün tarihler eski
 * dilimde yazılırdı. Bu yüzden önbellek dilim başına tutuluyor: dilim
 * değişince yeni biçimlendirici oluşuyor, aynı dilimde ise yeniden
 * oluşturma maliyeti ödenmiyor.
 */

type BicimTuru = "gun" | "gunSaat" | "saat";

const BICIM_SECENEKLERI: Record<BicimTuru, Intl.DateTimeFormatOptions> = {
  gun: { day: "2-digit", month: "2-digit", year: "numeric" },
  gunSaat: {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  saat: { hour: "2-digit", minute: "2-digit" },
};

const bicimOnbellegi = new Map<string, Intl.DateTimeFormat>();

function bicim(tur: BicimTuru): Intl.DateTimeFormat {
  const dilim = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const anahtar = `${tur}|${dilim}`;
  let hazir = bicimOnbellegi.get(anahtar);
  if (!hazir) {
    hazir = new Intl.DateTimeFormat("tr-TR", BICIM_SECENEKLERI[tur]);
    bicimOnbellegi.set(anahtar, hazir);
  }
  return hazir;
}

/** 20.07.2026 */
export function tarihYaz(tarih: Date | string | null | undefined): string {
  if (!tarih) return "";
  return bicim("gun").format(new Date(tarih));
}

/** 20.07.2026 14:35 */
export function tarihSaatYaz(tarih: Date | string | null | undefined): string {
  if (!tarih) return "";
  return bicim("gunSaat").format(new Date(tarih));
}

/** 14:35 — aynı güne ait kayıtlarda tarihi tekrar yazmak yer kaplıyor. */
export function saatYaz(tarih: Date | string | null | undefined): string {
  if (!tarih) return "";
  return bicim("saat").format(new Date(tarih));
}

/** <input type="date"> için gg.aa.yyyy yerine yyyy-aa-gg */
export function inputTarih(tarih: Date | string | null | undefined): string {
  if (!tarih) return "";
  const d = new Date(tarih);
  const ay = String(d.getMonth() + 1).padStart(2, "0");
  const gun = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${ay}-${gun}`;
}

/**
 * Yalnız gün taşıyan bir değer için yerel öğlen (12:00).
 *
 * Neden gece yarısı değil: tarayıcı ile sunucunun saat dilimi farklı
 * olabiliyor (sunucu Türkiye'de, personelin telefonu UTC'de kalmış olabilir).
 * Gece yarısına sabitlenen bir gün, iki saat dilimi arasında bir gün
 * kayıyordu — e-fatura vade tarihi 08.12 yerine 07.12 görünüyordu. Öğlen,
 * ±12 saate kadar her farkta aynı günde kalıyor.
 *
 * Saat bileşeni hesaplarda kullanılmıyor: gün/hafta/ay gruplaması ve vade
 * hesabı gün bazlı (src/lib/vade.ts).
 */
export function gunOrtasi(yil: number, ay: number, gun: number): Date {
  return new Date(yil, ay, gun, 12, 0, 0, 0);
}

/** Günün başlangıcı (00:00:00.000) */
export function gunBasi(tarih: Date): Date {
  const d = new Date(tarih);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Günün sonu (23:59:59.999) — tarih aralığı filtrelerinde bitiş için */
export function gunSonu(tarih: Date): Date {
  const d = new Date(tarih);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Verilen tarihe gün ekler. */
export function gunEkle(tarih: Date, gun: number): Date {
  const d = new Date(tarih);
  d.setDate(d.getDate() + gun);
  return d;
}

/** İki tarih arasındaki tam gün farkı (saat bileşeni yok sayılır). */
export function gunFarki(baslangic: Date, bitis: Date): number {
  const a = gunBasi(baslangic).getTime();
  const b = gunBasi(bitis).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "2026-07-20" gibi bir form girdisini Date'e çevirir; geçersizse null. */
export function formTarihiCevir(
  deger: FormDataEntryValue | null | undefined,
): Date | null {
  if (typeof deger !== "string" || deger.trim() === "") return null;
  const d = new Date(deger);
  return Number.isNaN(d.getTime()) ? null : d;
}
