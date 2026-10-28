/**
 * Adetle izlenen ürünlerde "kaç adet" sorusu.
 *
 * Aksesuarların bir kısmı adet bazlı tutuluyor: aynı barkodtan 20 şarj aleti
 * birbirinin tıpatıp aynısı, hangisinin sevk edildiği hiç fark etmiyor. Bu
 * ürünlerde cihazı tek tek seçtirmek ya da 20 kez okutturmak boş iş: sevk
 * ederken "20 adet", kabul ederken yine "20 adet" demek yetiyor.
 *
 * Seri numaralı cihazlarda (telefon) bu geçerli değil — orada hangi cihazın
 * taşındığı IMEI düzeyinde kayıt altında olmalı. Ayrım veriden okunuyor,
 * ayrıca bir ürün ayarı tutulmuyor: seri numarası yoksa cihaz birbirinin
 * yerine geçer, varsa geçmez.
 */

export type AdetAdayi = {
  id: number;
  seriNo: string | null;
};

/**
 * Bu okutma adetle mi işlenmeli?
 *
 * Üç şart birden: en az iki aday olacak, okutulan kod bir seri numarası
 * OLMAYACAK (seri no okutulduysa tek bir cihaz kastediliyor) ve adayların
 * hiçbirinin seri numarası bulunmayacak. Karışık gruplarda — bazısı seri
 * numaralı, bazısı değil — cihazlar birbirinin yerine geçmez, eski tek tek
 * seçim yolu sürüyor.
 */
export function adetliMi(aranan: string, adaylar: readonly AdetAdayi[]): boolean {
  if (adaylar.length < 2) return false;
  if (adaylar.some((a) => a.seriNo !== null && a.seriNo === aranan)) return false;
  return adaylar.every((a) => a.seriNo === null);
}

/**
 * Girilen adedi geçerli aralığa çeker.
 *
 * Sayı değilse ya da 1'in altındaysa 1; mevcuttan fazlaysa mevcut. Kullanıcı
 * 50 yazdığında 20 adet varsa 20 alınıyor, işlem hata vermiyor — kaç adet
 * işlendiği mesajda ayrıca söyleniyor.
 */
export function adediSinirla(istenen: number, mevcut: number): number {
  if (mevcut <= 0) return 0;
  if (!Number.isFinite(istenen)) return 1;
  const tam = Math.floor(istenen);
  if (tam < 1) return 1;
  return Math.min(tam, mevcut);
}

/**
 * İşlenen adedi anlatan not. Sonunda nokta yok; çağıran ilerleme ekleyebilsin.
 *
 * İstenen adet mevcuttan fazlaysa bunu söylemek şart: kullanıcı 20 yazıp 5
 * adet işlendiğinde farkı ekranda görmeli, yoksa eksik malı tam sanır.
 */
export function adetSonucNotu(islenen: number, istenen: number, fiil: string): string {
  if (islenen < istenen) {
    return `${istenen} adet istendi ama ${islenen} adet kaldı; ${islenen} adet ${fiil}`;
  }
  return `${islenen} adet ${fiil}`;
}
