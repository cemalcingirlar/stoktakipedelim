/**
 * Kullanıcının hangi mağazaların verisini görebileceği.
 *
 * Kural tek cümle: yönetici her şeyi görür, diğer herkes yalnız yetkili
 * olduğu mağazaları. "Yetkili olduğu mağazalar" ana mağazası ve ek yetki
 * verilen mağazalardır — işlem yapabildiği yerlerle aynı küme, çünkü
 * göremediği bir mağazada işlem yapması da anlamsız.
 *
 * Bu dosya saf: oturum okumuyor, veritabanına gitmiyor. Böylece kural bir
 * kez yazılıp hem sorgulara hem ekran kararlarına aynı yerden veriliyor —
 * sorgu başına elle "where magazaId in ..." yazmak, bir yeri atlayınca
 * sessiz bir sızıntıya dönüşürdü.
 */
import { adminMi, yetkiliMagazalar, type YetkiSahibi } from "./yetkiKurallari";

/**
 * Görünür mağazalar. `null` = kısıt yok (yönetici).
 *
 * Boş dizi "hiçbir mağaza" demek: hiçbir mağazaya bağlı olmayan kullanıcı
 * veri göremez. Bu bilinçli — yanlışlıkla her şeyi göstermektense hiçbir şey
 * göstermek doğru.
 */
export function gorunurMagazaIdleri(oturum: YetkiSahibi): number[] | null {
  if (adminMi(oturum)) return null;
  return yetkiliMagazalar(oturum);
}

/**
 * Prisma `where` parçası: `magazaId` alanı olan modeller için.
 *
 * Dönüş tipi isteğe bağlı alanlı tek bir nesne (birleşim değil): böylece
 * doğrudan bir `Prisma...WhereInput` içine yayılabiliyor ve bu dosya Prisma'ya
 * bağımlı olmadan saf kalıyor.
 */
export function magazaKosulu(gorunur: number[] | null): { magazaId?: { in: number[] } } {
  if (gorunur === null) return {};
  return { magazaId: { in: gorunur } };
}

/** Bu mağazanın verisi kullanıcıya görünür mü? */
export function gorebilirMi(gorunur: number[] | null, magazaId: number): boolean {
  if (gorunur === null) return true;
  return gorunur.includes(magazaId);
}

/**
 * Sevkiyat için koşul: kaynağı ya da hedefi görünür mağaza olan sevkiyatlar.
 *
 * Tek taraf yetmez — kullanıcı kendisine gelen sevkiyatı da kendisinden
 * gideni de görmeli, yoksa kabul edeceği sevkiyatı bulamaz.
 */
export function transferKosulu(gorunur: number[] | null): {
  OR?: [{ kaynakMagazaId: { in: number[] } }, { hedefMagazaId: { in: number[] } }];
} {
  if (gorunur === null) return {};
  return {
    OR: [{ kaynakMagazaId: { in: gorunur } }, { hedefMagazaId: { in: gorunur } }],
  };
}

/**
 * Mağaza listesini görünür olanlara indirger. Ekranlarda mağaza seçicileri ve
 * özet kartları bundan geçiyor.
 */
export function gorunurMagazalar<T extends { id: number }>(
  magazalar: T[],
  gorunur: number[] | null,
): T[] {
  if (gorunur === null) return magazalar;
  return magazalar.filter((m) => gorunur.includes(m.id));
}

/** Kullanıcının hiç veri göremeyeceği durum. */
export function veriYokMu(gorunur: number[] | null): boolean {
  return gorunur !== null && gorunur.length === 0;
}

/**
 * Stok hareketleri için koşul: kaynağı ya da hedefi görünür mağaza olan
 * hareketler.
 *
 * Hareketin kendi mağazasına bakılıyor, cihazın bugün durduğu mağazaya değil:
 * cihaz başka mağazaya gittiyse eski mağazanın kendi geçmişi onda kalmalı,
 * yeni mağaza da devraldığı cihazın geldiği hareketi görmeli. Her hareket
 * oluşturulurken en az bir taraf yazılıyor (giriş ve iade `hedefMagazaId`,
 * satış ve düzeltme `kaynakMagazaId`), bu yüzden iki taraf da boş kalan
 * hareket yok.
 */
export function hareketKosulu(gorunur: number[] | null): {
  OR?: [{ kaynakMagazaId: { in: number[] } }, { hedefMagazaId: { in: number[] } }];
} {
  if (gorunur === null) return {};
  return {
    OR: [{ kaynakMagazaId: { in: gorunur } }, { hedefMagazaId: { in: gorunur } }],
  };
}
