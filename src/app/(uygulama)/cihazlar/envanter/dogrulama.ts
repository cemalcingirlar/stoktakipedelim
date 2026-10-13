import { z } from "zod";

const kurusTutar = z
  .number()
  .int("Tutar geçersiz.")
  .min(0, "Tutar negatif olamaz.")
  .max(1_000_000_00_00, "Tutar çok yüksek.");

export const envanterSatiriSemasi = z.object({
  magazaId: z.number().int().positive("Mağaza bulunamadı."),
  marka: z.string().trim().min(1, "Marka zorunlu.").max(60),
  model: z.string().trim().min(1, "Model zorunlu.").max(80),
  seriNo: z.string().trim().max(40).nullable(),
  barkod: z.string().trim().max(40).nullable(),
  alisFiyatiKurus: kurusTutar,
  not: z.string().trim().max(500).nullable(),
});

/**
 * Envanter dökümü faturasız girilir: satırlar birden çok mağazaya dağıldığı
 * için tek bir alış faturasına bağlanamıyor (AlisFaturasi tek depo tutar).
 * Devir girişi olduğu için tedarikçi ve vade de yok.
 */
export const envanterKaydiSemasi = z.object({
  kategoriId: z.number().int().positive("Kategori seçin."),
  altKategoriId: z.number().int().positive().nullable(),
  girisTarihi: z.coerce.date({ message: "Giriş tarihi geçersiz." }),
  aciklama: z.string().trim().max(200).nullable(),
  satirlar: z
    .array(envanterSatiriSemasi)
    .min(1, "En az bir cihaz satırı olmalı.")
    .max(5000, "Tek seferde en çok 5000 cihaz yüklenebilir."),
});

export type EnvanterKaydiGirdisi = z.infer<typeof envanterKaydiSemasi>;
