/**
 * Gün bazlı sıra numaraları: `SAT-20261109-003`, `SVK-20261109-001`.
 *
 * Sıra, o güne ait EN BÜYÜK numaradan türetiliyor — kaç kayıt olduğundan
 * değil. Sayıma dayalı hâli canlıda çöktü: satış geri alınınca boşalan kart
 * siliniyor, sayı geri düşüyor ve bir sonraki kayıt var olan bir numarayı
 * istiyordu ("Unique constraint failed on the fields: (satisNo)"). En büyük
 * numara silmelerden etkilenmiyor.
 *
 * Eşzamanlı iki kayıt yine aynı numarayı isteyebilir (ikisi de aynı anı
 * okur); onu `cakismadaYenidenDene` kapatıyor.
 */

/** `SAT-` + tarih → `SAT-20261109-`. */
export function gunOneki(bas: string, tarih: Date): string {
  const yil = tarih.getFullYear();
  const ay = String(tarih.getMonth() + 1).padStart(2, "0");
  const gun = String(tarih.getDate()).padStart(2, "0");
  return `${bas}${yil}${ay}${gun}-`;
}

/**
 * Bir numaranın gün içi sırası. Tanınmayan biçimde 0 — "bu numara sırayı
 * ileri taşımaz" demek; yoksa elle girilmiş bozuk tek bir kayıt sırayı
 * kilitlerdi. Harfle başlayan göç numaraları da okunuyor (`E0007` → 7).
 */
export function numaraSirasi(numara: string, onek: string): number {
  if (!numara.startsWith(onek)) return 0;
  const rakamlar = numara.slice(onek.length).match(/\d+/);
  if (!rakamlar) return 0;
  const sayi = Number(rakamlar[0]);
  return Number.isSafeInteger(sayi) && sayi > 0 ? sayi : 0;
}

/** Eldeki numaralara bakarak sıradaki sırayı verir. */
export function sonrakiSira(numaralar: string[], onek: string): number {
  let enBuyuk = 0;
  for (const no of numaralar) {
    const sira = numaraSirasi(no, onek);
    if (sira > enBuyuk) enBuyuk = sira;
  }
  return enBuyuk + 1;
}

/** Sıradaki numaranın tam metni. */
export function numaraYaz(onek: string, sira: number): string {
  return `${onek}${String(sira).padStart(3, "0")}`;
}

/** Hata, verilen alanın benzersizlik kısıtına mı takıldı? */
export function benzersizlikCakismasiMi(hata: unknown, alan: string): boolean {
  if (typeof hata !== "object" || hata === null) return false;
  if ((hata as { code?: unknown }).code !== "P2002") return false;
  const hedef = (hata as { meta?: { target?: unknown } }).meta?.target;
  const metin = Array.isArray(hedef) ? hedef.join(",") : String(hedef ?? "");
  return metin.includes(alan);
}

/** Çakışma hâlinde kaç kez yeniden denenecek. */
export const EN_COK_DENEME = 5;

/**
 * İşlemi, verilen alanın çakışmasında yeniden dener.
 *
 * Yalnız o alanın çakışması yeniden deneniyor: aynı IMEI'nin ikinci kez
 * girilmesi gibi hatalar kullanıcıya söylenmeli, sessizce tekrarlanmamalı.
 */
export async function cakismadaYenidenDene<T>(
  islem: () => Promise<T>,
  alan: string,
  enCok: number = EN_COK_DENEME,
): Promise<T> {
  let sonHata: unknown;
  for (let deneme = 0; deneme < enCok; deneme += 1) {
    try {
      return await islem();
    } catch (hata) {
      if (!benzersizlikCakismasiMi(hata, alan)) throw hata;
      sonHata = hata;
    }
  }
  throw sonHata;
}

/** Numara okuyan en küçük arayüz; Prisma modeli de işlem nesnesi de uyuyor. */
export type NumaraKaynagi = {
  findMany: (secenekler: {
    where: Record<string, { startsWith: string }>;
    select: Record<string, true>;
  }) => Promise<Record<string, unknown>[]>;
};

/**
 * Sıradaki numara.
 *
 * Bir güne ait numaralar en çok birkaç yüz satır; hepsini okumak ucuz ve iki
 * biçimi (001 ve göçten gelen E0001) birlikte değerlendirmenin en basit yolu.
 */
export async function sonrakiNumara(
  kaynak: NumaraKaynagi,
  alan: string,
  onek: string,
): Promise<string> {
  const mevcutlar = await kaynak.findMany({
    where: { [alan]: { startsWith: onek } },
    select: { [alan]: true },
  });
  const numaralar = mevcutlar.map((k) => String(k[alan] ?? ""));
  return numaraYaz(onek, sonrakiSira(numaralar, onek));
}
