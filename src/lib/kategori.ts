import "server-only";
import { prisma } from "./prisma";

/**
 * Kategorisi henüz belirlenmemiş cihazlar için kullanılan kategori.
 *
 * Tedarikçi dosyasında kategori bilgisi olmadığı için her ürüne elle kategori
 * seçmek zorunlu değil; seçilmeyenler buraya girer ve sonradan düzeltilir.
 * Seri no zorunluluğu kapalıdır, yoksa seri numarası taşımayan kalemler
 * kaydedilemezdi.
 */
export const SINIFLANDIRILMAMIS = "Sınıflandırılmamış";

/** Kategori yoksa oluşturur; her durumda kimliğini döner. */
export async function sinifIandirilmamisKategoriId(): Promise<number> {
  const mevcut = await prisma.kategori.findFirst({
    where: { ad: SINIFLANDIRILMAMIS },
    select: { id: true, aktif: true },
  });
  if (mevcut) {
    if (!mevcut.aktif) {
      await prisma.kategori.update({ where: { id: mevcut.id }, data: { aktif: true } });
    }
    return mevcut.id;
  }

  const olusan = await prisma.kategori.create({
    // Listelerin sonunda dursun diye yüksek sıra numarası.
    data: { ad: SINIFLANDIRILMAMIS, sira: 999, seriNoZorunlu: false },
    select: { id: true },
  });
  return olusan.id;
}
