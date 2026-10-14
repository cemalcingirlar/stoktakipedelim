/**
 * Okunan tedarikçi faturası üzerinde elle düzeltme kuralları.
 *
 * Dosyadan okunan değerler her zaman doğru çıkmayabilir: PDF'te ürün adı
 * bölünmüş olabilir, barkod yanlış sütundan gelebilir, bir seri numarası eksik
 * okunabilir. Kullanıcı kaydetmeden önce her alanı düzeltebilsin diye okunan
 * değerler "varsayılan", kullanıcının yazdıkları "üst yazım" olarak tutuluyor;
 * dosya yeniden okunduğunda düzeltmeler kaybolmuyor, okunan değer değişince de
 * dokunulmamış alanlar kendiliğinden güncelleniyor.
 */

export type OkunanUrun = {
  barkod: string;
  urunAdi: string;
  marka: string;
  alisFiyatiKurus: number;
};

export type UrunUstYazim = {
  marka?: string;
  model?: string;
  barkod?: string;
  alisFiyatiKurus?: number;
};

export type SeriUstYazim = {
  seriNo?: string;
  /** Kullanıcı bu cihazı faturadan çıkardı (kutudan eksik çıkmış olabilir). */
  cikarildi?: boolean;
};

/** Seri numarası üst yazımlarının anahtarı: grup + sıra. */
export function seriAnahtari(grupBarkodu: string, indeks: number): string {
  return `${grupBarkodu}#${indeks}`;
}

/**
 * Ürün adı markayla başlıyorsa modelde markayı tekrarlamamak için atar.
 * "INFINIX SMART 10" + marka "INFINIX" -> model "SMART 10".
 */
export function modelAdi(urunAdi: string, marka: string): string {
  const m = marka.trim();
  if (m && urunAdi.toLocaleUpperCase("tr").startsWith(m.toLocaleUpperCase("tr"))) {
    return urunAdi.slice(m.length).trim() || urunAdi;
  }
  return urunAdi;
}

export type UrunAlanlari = {
  marka: string;
  model: string;
  barkod: string;
  alisFiyatiKurus: number;
};

/** Dosyadan okunan değerlerin forma yansıyan hali (düzeltme öncesi). */
export function varsayilanUrun(urun: OkunanUrun): UrunAlanlari {
  return {
    marka: urun.marka || "",
    model: modelAdi(urun.urunAdi, urun.marka),
    barkod: urun.barkod,
    alisFiyatiKurus: urun.alisFiyatiKurus,
  };
}

/** Okunan değer + kullanıcının düzeltmesi. */
export function duzenlenmisUrun(urun: OkunanUrun, ustYazim?: UrunUstYazim): UrunAlanlari {
  const temel = varsayilanUrun(urun);
  if (!ustYazim) return temel;
  return {
    marka: ustYazim.marka ?? temel.marka,
    model: ustYazim.model ?? temel.model,
    barkod: ustYazim.barkod ?? temel.barkod,
    alisFiyatiKurus: ustYazim.alisFiyatiKurus ?? temel.alisFiyatiKurus,
  };
}

export type SeriAlani = { seriNo: string | null; cikarildi: boolean };

export function duzenlenmisSeri(
  okunan: string | null,
  ustYazim?: SeriUstYazim,
): SeriAlani {
  const yazilan = ustYazim?.seriNo;
  const seriNo = yazilan !== undefined ? yazilan.trim() || null : okunan;
  return { seriNo, cikarildi: ustYazim?.cikarildi === true };
}

export type DuzenlemeSatiri = {
  /** Hangi üründen geldiği — hata mesajında gösterilir. */
  urunAdi: string;
  seriNo: string | null;
};

/**
 * Düzeltmelerden sonra kalan sorunlar. Kayıt yine sunucuda doğrulanıyor;
 * buradaki liste kullanıcının hatayı kaydetmeden görmesi için.
 */
export function duzenlemeSorunlari(
  urunler: { alanlar: UrunAlanlari; urunAdi: string }[],
  satirlar: DuzenlemeSatiri[],
): string[] {
  const sorunlar: string[] = [];

  for (const { alanlar, urunAdi } of urunler) {
    if (!alanlar.marka.trim()) sorunlar.push(`${urunAdi}: marka boş olamaz.`);
    if (!alanlar.model.trim()) sorunlar.push(`${urunAdi}: model boş olamaz.`);
    if (!Number.isFinite(alanlar.alisFiyatiKurus) || alanlar.alisFiyatiKurus < 0) {
      sorunlar.push(`${urunAdi}: alış fiyatı geçersiz.`);
    }
  }

  // Aynı seri numarası iki cihazda olamaz; kullanıcı elle yazarken kopyalamış
  // olabilir ve kayıt sırasında anlaşılması geç olur.
  const gorulen = new Map<string, string>();
  for (const satir of satirlar) {
    if (!satir.seriNo) continue;
    const onceki = gorulen.get(satir.seriNo);
    if (onceki) {
      sorunlar.push(
        `${satir.seriNo} seri numarası iki kez yazılmış (${onceki} ve ${satir.urunAdi}).`,
      );
    } else {
      gorulen.set(satir.seriNo, satir.urunAdi);
    }
  }

  if (satirlar.length === 0) sorunlar.push("Kaydedilecek cihaz kalmadı.");

  return sorunlar;
}
