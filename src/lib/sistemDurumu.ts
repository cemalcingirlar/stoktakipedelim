/**
 * Sunucunun sağlık göstergeleri: disk, veritabanı boyutu, son yedeğin yaşı.
 *
 * Hiçbiri görünmüyordu. Disk dolduğunda SQLite yazamaz hale gelir ve bu,
 * satış ekranında "işlem tamamlanamadı" olarak çıkar — sebebi ekranda yazmaz.
 * Aynı şekilde yedek alma üç gündür hata veriyorsa bunu kimse fark etmez;
 * yedekleme ekranına girmek gerekir.
 *
 * Eşikler erken uyarmak için seçildi: disk %85'te uyarı verir, çünkü %100'de
 * uyarmanın bir faydası kalmaz. Yedek 48 saat eskiyse uyarır, çünkü günlük
 * yedek bir gün atlarsa makul, iki gün atlarsa bozulmuş demektir.
 */

export const DISK_UYARI_YUZDE = 85;
export const DISK_KRITIK_YUZDE = 95;
export const YEDEK_UYARI_SAAT = 48;
export const VERITABANI_UYARI_MB = 1024;

export type Siddet = "iyi" | "uyari" | "kritik";

export type DurumSatiri = {
  etiket: string;
  deger: string;
  siddet: Siddet;
  /** Sorun varsa ne yapılacağını söyleyen kısa cümle. */
  oneri?: string;
};

/** Bayt değerini okunur birime çevirir. */
export function boyutYaz(bayt: number): string {
  if (bayt >= 1_073_741_824) {
    return `${(bayt / 1_073_741_824).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} GB`;
  }
  if (bayt >= 1_048_576) {
    return `${(bayt / 1_048_576).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bayt / 1024))} KB`;
}

/** Disk doluluk satırı. */
export function diskSatiri(toplamBayt: number, bosBayt: number): DurumSatiri {
  if (toplamBayt <= 0) {
    return { etiket: "Disk", deger: "okunamadı", siddet: "uyari" };
  }
  const kullanilan = toplamBayt - bosBayt;
  const yuzde = Math.round((kullanilan / toplamBayt) * 100);
  const deger = `%${yuzde} dolu · ${boyutYaz(bosBayt)} boş`;
  if (yuzde >= DISK_KRITIK_YUZDE) {
    return {
      etiket: "Disk",
      deger,
      siddet: "kritik",
      oneri:
        "Disk dolmak üzere; dolduğunda veritabanı yazamaz ve satış kaydedilemez.",
    };
  }
  if (yuzde >= DISK_UYARI_YUZDE) {
    return {
      etiket: "Disk",
      deger,
      siddet: "uyari",
      oneri: "Eski yedekleri ve logları temizlemeyi düşünün.",
    };
  }
  return { etiket: "Disk", deger, siddet: "iyi" };
}

/** Veritabanı boyutu satırı. */
export function veritabaniSatiri(bayt: number): DurumSatiri {
  const deger = boyutYaz(bayt);
  if (bayt >= VERITABANI_UYARI_MB * 1_048_576) {
    return {
      etiket: "Veritabanı",
      deger,
      siddet: "uyari",
      oneri:
        "Her gün yedeklenip Drive'a yükleniyor; eski logları arşivleyerek küçültebilirsiniz.",
    };
  }
  return { etiket: "Veritabanı", deger, siddet: "iyi" };
}

/** Son başarılı yedeğin yaşı. */
export function yedekSatiri(
  sonBasarili: Date | null,
  dogrulandi: boolean,
  simdi: Date = new Date(),
): DurumSatiri {
  if (!sonBasarili) {
    return {
      etiket: "Son yedek",
      deger: "hiç alınmamış",
      siddet: "kritik",
      oneri: "Yedekleme kurulmamış; bir arıza bütün veriyi götürür.",
    };
  }
  const saat = Math.floor(
    (simdi.getTime() - sonBasarili.getTime()) / 3_600_000,
  );
  const deger =
    saat < 1
      ? "az önce"
      : saat < 48
        ? `${saat} saat önce`
        : `${Math.floor(saat / 24)} gün önce`;

  if (saat >= YEDEK_UYARI_SAAT) {
    return {
      etiket: "Son yedek",
      deger,
      siddet: "kritik",
      oneri:
        "Günlük yedek çalışmıyor olabilir; yedekleme ekranındaki hataya bakın.",
    };
  }
  if (!dogrulandi) {
    return {
      etiket: "Son yedek",
      deger: `${deger} · doğrulanmadı`,
      siddet: "uyari",
      oneri: "Yedek alındı ama bütünlüğü/boyutu doğrulanamadı.",
    };
  }
  return { etiket: "Son yedek", deger: `${deger} · doğrulandı`, siddet: "iyi" };
}

/** Satırların en kötüsü: kartın genel durumu. */
export function genelDurum(satirlar: DurumSatiri[]): Siddet {
  if (satirlar.some((s) => s.siddet === "kritik")) return "kritik";
  if (satirlar.some((s) => s.siddet === "uyari")) return "uyari";
  return "iyi";
}
