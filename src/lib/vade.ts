import { VADE_UYARI_GUN } from "./sabitler";
import { gunEkle, gunFarki } from "./tarih";

export type VadeDurumu = "YOK" | "ODENDI" | "NORMAL" | "YAKLASIYOR" | "GECTI";

export type VadeBilgisi = {
  durum: VadeDurumu;
  /** Bugünden vade tarihine kalan gün. Geçmişse negatif. */
  kalanGun: number | null;
  vadeTarihi: Date | null;
  /** Listede satırı boyayacak Tailwind sınıfları. */
  satirSinifi: string;
  rozetSinifi: string;
  etiket: string;
};

/** Fatura tarihine vade gününü ekleyerek vade tarihini hesaplar. */
export function vadeTarihiHesapla(faturaTarihi: Date, vadeGun: number): Date | null {
  if (!vadeGun || vadeGun <= 0) return null;
  return gunEkle(faturaTarihi, vadeGun);
}

/**
 * Bir stok kaleminin bağlı olduğu alış faturasının vade durumunu çözer.
 * Ödenmemiş ve vadesi geçmiş -> kırmızı, 7 gün veya az kalmış -> sarı.
 */
export function vadeDurumu(
  fatura: { vadeGun: number; vadeTarihi: Date | null; vadeOdendi: boolean } | null | undefined,
  bugun: Date = new Date(),
): VadeBilgisi {
  if (!fatura || !fatura.vadeGun || !fatura.vadeTarihi) {
    return {
      durum: "YOK",
      kalanGun: null,
      vadeTarihi: null,
      satirSinifi: "",
      rozetSinifi: "bg-slate-100 text-slate-500",
      etiket: "Vadesiz",
    };
  }

  const vadeTarihi = new Date(fatura.vadeTarihi);

  if (fatura.vadeOdendi) {
    return {
      durum: "ODENDI",
      kalanGun: null,
      vadeTarihi,
      satirSinifi: "",
      rozetSinifi: "bg-emerald-100 text-emerald-700",
      etiket: "Ödendi",
    };
  }

  const kalanGun = gunFarki(bugun, vadeTarihi);

  if (kalanGun < 0) {
    return {
      durum: "GECTI",
      kalanGun,
      vadeTarihi,
      satirSinifi: "bg-red-50 hover:bg-red-100",
      rozetSinifi: "bg-red-100 text-red-700",
      etiket: `${Math.abs(kalanGun)} gün geçti`,
    };
  }

  if (kalanGun <= VADE_UYARI_GUN) {
    return {
      durum: "YAKLASIYOR",
      kalanGun,
      vadeTarihi,
      satirSinifi: "bg-amber-50 hover:bg-amber-100",
      rozetSinifi: "bg-amber-100 text-amber-700",
      etiket: kalanGun === 0 ? "Bugün" : `${kalanGun} gün kaldı`,
    };
  }

  return {
    durum: "NORMAL",
    kalanGun,
    vadeTarihi,
    satirSinifi: "",
    rozetSinifi: "bg-slate-100 text-slate-600",
    etiket: `${kalanGun} gün kaldı`,
  };
}
