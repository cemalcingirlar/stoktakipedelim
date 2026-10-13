import { magazadaIslemYapabilirMi, type YetkiSahibi } from "./yetkiKurallari";

/**
 * Dükkân içi aktarım kuralları.
 *
 * İki mağaza aynı fiziksel dükkânda duruyorsa (aynı `dukkanKodu`), aralarında
 * cihaz taşımak için sevkiyat onayı beklemek gereksizdir: mal yola çıkmıyor,
 * kabul adımı da aynı kişinin kendi gönderdiğini onaylaması oluyor. Bu yüzden
 * bu mağazalar arasında tek adımlı aktarım açılıyor.
 *
 * Kodun boş olması "hiçbir gruba ait değil" demektir; boş kodlu mağazalar
 * birbiriyle eşleşmez, yoksa dükkân kodu girilmemiş tüm mağazalar tek bir
 * dev dükkân sayılır ve gerçek sevkiyatlar kayıt dışı kalırdı.
 */

export type DukkanMagazasi = {
  id: number;
  dukkanKodu: string | null;
};

/** Dükkân kodunu karşılaştırmaya hazır hale getirir; boş değerler null olur. */
export function dukkanKoduNormalize(ham: string | null | undefined): string | null {
  const temiz = (ham ?? "").trim().toUpperCase();
  return temiz === "" ? null : temiz;
}

/** İki mağaza aynı fiziksel dükkânda mı? */
export function ayniDukkanMi(a: DukkanMagazasi, b: DukkanMagazasi): boolean {
  if (a.id === b.id) return false;
  const kodA = dukkanKoduNormalize(a.dukkanKodu);
  const kodB = dukkanKoduNormalize(b.dukkanKodu);
  if (kodA === null || kodB === null) return false;
  return kodA === kodB;
}

/**
 * Kullanıcı bu iki mağaza arasında tek adımlı aktarım yapabilir mi?
 *
 * Aynı dükkân olması yetmez; kişinin iki mağazada da yetkili olması gerekir.
 * Aksi halde yetkisi olmayan bir depodan kendi mağazasına cihaz çekebilirdi.
 */
export function dukkanIciAktarabilirMi(
  oturum: YetkiSahibi,
  kaynak: DukkanMagazasi,
  hedef: DukkanMagazasi,
): boolean {
  if (!ayniDukkanMi(kaynak, hedef)) return false;
  return (
    magazadaIslemYapabilirMi(oturum, kaynak.id) && magazadaIslemYapabilirMi(oturum, hedef.id)
  );
}

/**
 * Verilen mağazanın aynı dükkânındaki diğer mağazaları döner — aktarım
 * ekranındaki hedef listesi bu.
 */
export function ayniDukkandakiler<T extends DukkanMagazasi>(kaynak: DukkanMagazasi, tumu: T[]): T[] {
  return tumu.filter((m) => ayniDukkanMi(kaynak, m));
}

/**
 * Kullanıcının aktarım yapabileceği kaynak mağazalar: yetkili olduğu ve aynı
 * dükkânda en az bir yetkili eşi bulunan mağazalar. Hiçbiri yoksa ekran
 * kurulumun eksik olduğunu söyler.
 */
export function aktarimaUygunKaynaklar<T extends DukkanMagazasi>(
  oturum: YetkiSahibi,
  tumu: T[],
): T[] {
  return tumu.filter(
    (m) =>
      magazadaIslemYapabilirMi(oturum, m.id) &&
      tumu.some((d) => dukkanIciAktarabilirMi(oturum, m, d)),
  );
}
