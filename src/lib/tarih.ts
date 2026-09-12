/** Tarih yardımcıları — tümü yerel (Türkiye) biçiminde çıktı verir. */

const gunBicim = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const gunSaatBicim = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 20.07.2026 */
export function tarihYaz(tarih: Date | string | null | undefined): string {
  if (!tarih) return "";
  return gunBicim.format(new Date(tarih));
}

/** 20.07.2026 14:35 */
export function tarihSaatYaz(tarih: Date | string | null | undefined): string {
  if (!tarih) return "";
  return gunSaatBicim.format(new Date(tarih));
}

/** <input type="date"> için gg.aa.yyyy yerine yyyy-aa-gg */
export function inputTarih(tarih: Date | string | null | undefined): string {
  if (!tarih) return "";
  const d = new Date(tarih);
  const ay = String(d.getMonth() + 1).padStart(2, "0");
  const gun = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${ay}-${gun}`;
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
export function formTarihiCevir(deger: FormDataEntryValue | null | undefined): Date | null {
  if (typeof deger !== "string" || deger.trim() === "") return null;
  const d = new Date(deger);
  return Number.isNaN(d.getTime()) ? null : d;
}
