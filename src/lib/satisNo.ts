/**
 * Satış numarası: `SAT-20261106-001`.
 *
 * Gün içindeki sıra, o gün oluşturulmuş satış kaydı sayısından geliyor.
 * Numara kullanıcının kartı sözle anmasına yarıyor ("SAT-20261106-003'ü aç");
 * tekilliği veritabanındaki benzersiz dizin güvenceye alıyor.
 *
 * Göçle toplanan eski satışlar "SAT-20261101-E0001" biçiminde numaralandı;
 * yeni satışlar onlarla çakışmasın diye ek kullanmıyor.
 */

/** Yalnız `satis.count` gereken en küçük arayüz; Prisma istemcisi de uyuyor. */
export type SatisSayaci = {
  satis: {
    count: (secenekler: {
      where: { createdAt: { gte: Date; lt: Date } };
    }) => Promise<number>;
  };
};

/** Tarih ve gün içi sıradan numara metni. */
export function satisNoYaz(tarih: Date, sira: number): string {
  const yil = tarih.getFullYear();
  const ay = String(tarih.getMonth() + 1).padStart(2, "0");
  const gun = String(tarih.getDate()).padStart(2, "0");
  return `SAT-${yil}${ay}${gun}-${String(sira).padStart(3, "0")}`;
}

/** Verilen günün başı ve (dahil olmayan) sonu — yerel saat diliminde. */
export function gunAraligi(tarih: Date): { gunBas: Date; gunBit: Date } {
  const gunBas = new Date(tarih);
  gunBas.setHours(0, 0, 0, 0);
  const gunBit = new Date(gunBas);
  gunBit.setDate(gunBit.getDate() + 1);
  return { gunBas, gunBit };
}

/** Sıradaki satış numarası. */
export async function satisNoUret(
  sayac: SatisSayaci,
  tarih: Date,
): Promise<string> {
  const { gunBas, gunBit } = gunAraligi(tarih);
  const bugunkuAdet = await sayac.satis.count({
    where: { createdAt: { gte: gunBas, lt: gunBit } },
  });
  return satisNoYaz(gunBas, bugunkuAdet + 1);
}
