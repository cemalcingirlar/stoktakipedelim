/**
 * Tedarikçi faturasındaki ürünler için kategori seçimi kuralları.
 *
 * Bir fatura genelde tek tür mal taşıyor (bir kutu telefon, bir koli aksesuar).
 * Bu yüzden faturada kategorisi bilinen ürünler varsa, bilinmeyenler de aynı
 * kategoriye düşüyor; kullanıcı her satırı tek tek seçmek zorunda kalmıyor.
 * Satır bazında değiştirmek yine mümkün, seçim yalnız varsayılanı belirliyor.
 */

export type Secim = { kat: string; alt: string };

export type BarkodGecmisKaydi = {
  barkod: string;
  kategoriId: number;
  altKategoriId: number | null;
};

/** Geçmiş kaydını forma uygun seçime çevirir. */
export function gecmistenSecim(kayit: BarkodGecmisKaydi): Secim {
  return {
    kat: String(kayit.kategoriId),
    alt: kayit.altKategoriId ? String(kayit.altKategoriId) : "",
  };
}

/**
 * Faturadaki baskın seçim: kategorisi bilinen ürünler arasında en çok geçen
 * kategori + alt kategori ikilisi. Hiçbiri bilinmiyorsa null.
 *
 * Kategori ve alt kategori birlikte sayılıyor: aynı kategorinin iki farklı alt
 * kategorisi varsa, çoğunluk hangisindeyse o geliyor.
 */
export function baskinSecim(
  barkodlar: string[],
  gecmis: Map<string, BarkodGecmisKaydi>,
): Secim | null {
  const sayac = new Map<string, { secim: Secim; adet: number }>();

  for (const barkod of barkodlar) {
    const kayit = gecmis.get(barkod);
    if (!kayit) continue;
    const secim = gecmistenSecim(kayit);
    const anahtar = `${secim.kat}|${secim.alt}`;
    const mevcut = sayac.get(anahtar);
    if (mevcut) mevcut.adet += 1;
    else sayac.set(anahtar, { secim, adet: 1 });
  }

  let enIyi: { secim: Secim; adet: number } | null = null;
  for (const aday of sayac.values()) {
    if (!enIyi || aday.adet > enIyi.adet) enIyi = aday;
  }
  return enIyi?.secim ?? null;
}

/**
 * Bir ürünün yürürlükteki seçimi. Öncelik sırası:
 *   1. Kullanıcının o satırda elle yaptığı seçim
 *   2. Bu barkodun geçmişi (daha önce bu ürün hangi kategoriye girdiyse)
 *   3. Faturadaki baskın seçim (fatura genelde tek tür mal taşır)
 *   4. "Sınıflandırılmamış"
 */
export function urunSecimi(
  barkod: string,
  kaynaklar: {
    ustYazim: Record<string, Secim>;
    gecmis: Map<string, BarkodGecmisKaydi>;
    baskin: Secim | null;
    varsayilanKategoriId: number;
  },
): Secim {
  const elle = kaynaklar.ustYazim[barkod];
  if (elle) return elle;

  const bilinen = kaynaklar.gecmis.get(barkod);
  if (bilinen) {
    const secim = gecmistenSecim(bilinen);
    // Geçmişte alt kategori yoksa bu bilinçli bir seçim değil, bir eksiklik:
    // aynı kategorideki baskın alt kategori varsa oradan tamamlanıyor. Dolu
    // olan alt kategoriye dokunulmuyor.
    if (
      secim.alt === "" &&
      kaynaklar.baskin &&
      kaynaklar.baskin.kat === secim.kat &&
      kaynaklar.baskin.alt !== ""
    ) {
      return { kat: secim.kat, alt: kaynaklar.baskin.alt };
    }
    return secim;
  }

  if (kaynaklar.baskin) return kaynaklar.baskin;

  return { kat: String(kaynaklar.varsayilanKategoriId), alt: "" };
}

/** Tüm barkodlara aynı seçimi yazar — "tümüne uygula" düğmesi için. */
export function tumuneUygula(barkodlar: string[], secim: Secim): Record<string, Secim> {
  const sonuc: Record<string, Secim> = {};
  for (const barkod of barkodlar) sonuc[barkod] = secim;
  return sonuc;
}
