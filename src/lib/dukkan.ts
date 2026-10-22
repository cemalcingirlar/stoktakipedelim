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

/**
 * Aktarım ekranının açılmama sebebi.
 *
 * İki sebep çok farklı ve kullanıcıyı farklı yere yönlendiriyor: dükkân kodu
 * hiç tanımlanmamışsa yöneticinin ayar yapması gerekir, tanımlıysa ama kişi
 * eşteki mağazada yetkisizse istenecek şey yetkidir. İkisine aynı mesajı
 * göstermek, personeli olmayan bir ayarın peşine düşürüyordu.
 */
export type AktarimEngeli =
  /** Hiçbir mağaza çifti aynı dükkân kodunu taşımıyor. */
  | { tur: "DUKKAN_YOK" }
  /** Dükkân tanımlı ama kullanıcı eşteki mağazada yetkili değil. */
  | { tur: "YETKI_YOK"; magazaAdlari: string[] };

export function aktarimEngeli<T extends DukkanMagazasi & { ad: string }>(
  oturum: YetkiSahibi,
  tumu: T[],
): AktarimEngeli | null {
  if (aktarimaUygunKaynaklar(oturum, tumu).length > 0) return null;

  // Kullanıcının yetkili olduğu mağazaların dükkân eşleri: yetki istenecek
  // yerler tam olarak bunlar.
  const eksikYetkiler = new Set<string>();
  for (const m of tumu) {
    if (!magazadaIslemYapabilirMi(oturum, m.id)) continue;
    for (const es of ayniDukkandakiler(m, tumu)) eksikYetkiler.add(es.ad);
  }
  if (eksikYetkiler.size > 0) {
    return {
      tur: "YETKI_YOK",
      magazaAdlari: [...eksikYetkiler].sort((a, b) => a.localeCompare(b, "tr")),
    };
  }

  // Kullanıcının hiçbir mağazasının dükkân eşi yok. Başka dükkânlarda grup
  // olması onu ilgilendirmiyor: ona "yetki iste" demek yanlış yere
  // yönlendirirdi, eksik olan şey kendi mağazasının dükkân kodu.
  return { tur: "DUKKAN_YOK" };
}
