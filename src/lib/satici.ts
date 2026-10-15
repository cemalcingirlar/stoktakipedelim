/**
 * Satışı kimin yaptığının seçilmesi.
 *
 * Yönetici ve muhasebeci de satış kaydı girebiliyor ama satışı fiilen mağaza
 * personeli yapıyor. Satan kullanıcı oturumdan alınırsa personel bazlı satış
 * raporu yanlış çıkıyor, bu yüzden satışı yapan ayrıca seçilebiliyor.
 *
 * Buradaki her şey saf: aynı kurallar hem ekranda listeyi süzüyor hem sunucuda
 * seçimi denetliyor.
 */
import { adminMi, magazadaIslemYapabilirMi, type Rol } from "./yetkiKurallari";

export type SaticiAdayi = {
  id: number;
  adSoyad: string;
  rol: Rol;
  aktif: boolean;
  /** Ana mağazası ve ek yetkili olduğu mağazalar. */
  magazaIdleri: number[];
};

/** Adayın yetki denetimlerinde kullanılan hali. */
function yetkiSahibi(aday: SaticiAdayi) {
  return { rol: aday.rol, magazaId: aday.magazaIdleri[0] ?? null, magazaIdleri: aday.magazaIdleri };
}

/** Aday, verilen mağazaların hepsinde işlem yapabiliyor mu? */
export function magazalardaSatabilirMi(aday: SaticiAdayi, magazaIdleri: number[]): boolean {
  if (!aday.aktif) return false;
  return magazaIdleri.every((id) => magazadaIslemYapabilirMi(yetkiSahibi(aday), id));
}

/**
 * Satışı yapan olarak seçilebilecek kişiler.
 *
 * Yönetici herkesi seçebiliyor; diğer roller yalnız kendi yetkili oldukları
 * mağazalarda çalışanları — başka şubenin satışını kimse başkasının üstüne
 * yazamasın. Oturum sahibi her zaman listede: kendi sattığını işaretleyebilmeli.
 */
export function saticiAdaylari(
  oturum: { kullaniciId: number; rol: Rol; magazaIdleri: number[] },
  adaylar: SaticiAdayi[],
): SaticiAdayi[] {
  const secilebilir = adaylar.filter((aday) => {
    if (!aday.aktif) return false;
    if (aday.id === oturum.kullaniciId) return true;
    if (adminMi({ rol: oturum.rol, magazaId: null, magazaIdleri: oturum.magazaIdleri })) {
      return true;
    }
    // Ortak mağazası olanlar: aynı şubede çalışanlar birbirini seçebilir.
    return aday.magazaIdleri.some((id) => oturum.magazaIdleri.includes(id));
  });

  return secilebilir.sort((a, b) => {
    // Oturum sahibi başa: en sık seçilecek olan o.
    if (a.id === oturum.kullaniciId) return -1;
    if (b.id === oturum.kullaniciId) return 1;
    return a.adSoyad.localeCompare(b.adSoyad, "tr");
  });
}

/**
 * Seçilen satıcı bu satışa uygun mu? Uygunsa null, değilse kullanıcıya
 * gösterilecek mesaj.
 */
export function saticiSorunu(
  satici: SaticiAdayi | undefined,
  magazaIdleri: number[],
): string | null {
  if (!satici) return "Satışı yapan kişi bulunamadı.";
  if (!satici.aktif) return `${satici.adSoyad} pasif bir kullanıcı; satış ona yazılamaz.`;
  if (!magazalardaSatabilirMi(satici, magazaIdleri)) {
    return `${satici.adSoyad} bu cihazların bulunduğu mağazada yetkili değil.`;
  }
  return null;
}
