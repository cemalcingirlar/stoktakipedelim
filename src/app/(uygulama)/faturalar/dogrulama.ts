import { z } from "zod";
import { VADE_SECENEKLERI } from "@/lib/sabitler";

const kirusTutar = z
  .number()
  .int("Tutar geçersiz.")
  .min(0, "Tutar negatif olamaz.")
  .max(1_000_000_00_00, "Tutar çok yüksek.");

export const faturaSatiriSemasi = z.object({
  kategoriId: z.number().int().positive("Kategori seçin."),
  altKategoriId: z.number().int().positive().nullable(),
  marka: z.string().trim().min(1, "Marka zorunlu.").max(60),
  model: z.string().trim().min(1, "Model zorunlu.").max(80),
  renk: z.string().trim().max(40).nullable(),
  kapasite: z.string().trim().max(40).nullable(),
  seriNo: z.string().trim().max(40).nullable(),
  barkod: z.string().trim().max(40).nullable(),
  alisFiyatiKurus: kirusTutar,
  not: z.string().trim().max(500).nullable(),
});

export const faturaSemasi = z.object({
  tedarikciId: z.number().int().positive("Tedarikçi seçin."),
  magazaId: z.number().int().positive("Depo seçin."),
  faturaNo: z.string().trim().min(1, "Fatura numarası zorunlu.").max(40),
  faturaTarihi: z.coerce.date({ message: "Fatura tarihi geçersiz." }),
  vadeGun: z
    .number()
    .int()
    .refine((v) => (VADE_SECENEKLERI as readonly number[]).includes(v), "Vade seçeneği geçersiz."),
  not: z.string().trim().max(500).nullable(),
  satirlar: z.array(faturaSatiriSemasi).min(1, "En az bir cihaz satırı ekleyin."),
});

export type FaturaSatiriGirdisi = z.infer<typeof faturaSatiriSemasi>;
export type FaturaGirdisi = z.infer<typeof faturaSemasi>;
