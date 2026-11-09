/**
 * Satış numarası: `SAT-20261109-003`.
 *
 * Numara kullanıcının kartı sözle anmasına yarıyor ("SAT-20261109-003'ü aç");
 * tekilliği veritabanındaki benzersiz dizin güvenceye alıyor. Sıra hesabı ve
 * çakışmada yeniden deneme ortak dosyada (src/lib/gunlukNumara.ts): sevkiyat
 * numarası da aynı kuralla üretiliyor.
 *
 * Göçle toplanan eski satışlar "SAT-20261101-E0001" biçiminde numaralandı;
 * onlar da aynı günün numaraları arasında sayılıyor.
 */
import {
  cakismadaYenidenDene as cakismadaDene,
  gunOneki,
  numaraYaz,
  sonrakiNumara,
  sonrakiSira,
  type NumaraKaynagi,
} from "./gunlukNumara";

/** Satış numarasının benzersiz alan adı; çakışma denetimi bunu arıyor. */
export const SATIS_NO_ALANI = "satisNo";

/** Numaranın gün öneki: `SAT-20261109-`. */
export function satisNoOneki(tarih: Date): string {
  return gunOneki("SAT-", tarih);
}

/** Tarih ve gün içi sıradan numara metni. */
export function satisNoYaz(tarih: Date, sira: number): string {
  return numaraYaz(satisNoOneki(tarih), sira);
}

/** Yalnız gereken en küçük arayüz; Prisma istemcisi de işlem nesnesi de uyuyor. */
export type SatisNoKaynagi = { satis: NumaraKaynagi };

/** Sıradaki satış numarası. */
export async function satisNoUret(
  kaynak: SatisNoKaynagi,
  tarih: Date,
): Promise<string> {
  return sonrakiNumara(kaynak.satis, SATIS_NO_ALANI, satisNoOneki(tarih));
}

/** İşlemi, satış numarası çakışmasında yeniden dener. */
export async function cakismadaYenidenDene<T>(
  islem: () => Promise<T>,
): Promise<T> {
  return cakismadaDene(islem, SATIS_NO_ALANI);
}

export { sonrakiSira };
