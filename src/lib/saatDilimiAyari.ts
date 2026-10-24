import "server-only";
import { prisma } from "./prisma";
import {
  BEKLENEN_SAAT_DILIMI,
  mevcutSaatDilimi,
  saatDilimiCoz,
} from "./saatDilimi";

/** Ayar tablosundaki anahtar. */
export const SAAT_DILIMI_ANAHTARI = "saat_dilimi";

/**
 * Seçilen dilimin süreç içi önbelleği.
 *
 * Dilim her istekte uygulanıyor; her istekte bir de veritabanı okuması
 * yapmanın anlamı yok. Kısa bir ömür veriliyor ki yönetici dilimi
 * değiştirdiğinde değişiklik birkaç saniye içinde bütün işçi süreçlere
 * yayılsın — yazan süreç kendi önbelleğini hemen boşaltıyor, diğerleri
 * ömür dolunca.
 */
const ONBELLEK_OMRU_MS = 10_000;
let onbellek: { dilim: string; zaman: number } | null = null;

/** Yazma sonrası: bu sürecin önbelleğini boşaltır. */
export function saatDilimiOnbelleginiBosalt(): void {
  onbellek = null;
}

/**
 * Yöneticinin seçtiği dilim; seçim yoksa ya da geçersizse Türkiye.
 *
 * Geçersiz değer sessizce yoksayılıyor: `Intl` tanımadığı dilim adıyla
 * fırlatır ve bu, her sayfayı 500'e düşürürdü.
 */
export async function secilenSaatDilimi(): Promise<string> {
  const simdi = Date.now();
  if (onbellek && simdi - onbellek.zaman < ONBELLEK_OMRU_MS)
    return onbellek.dilim;

  let dilim = BEKLENEN_SAAT_DILIMI;
  try {
    const kayit = await prisma.ayar.findUnique({
      where: { anahtar: SAAT_DILIMI_ANAHTARI },
    });
    dilim = saatDilimiCoz(kayit?.deger) ?? BEKLENEN_SAAT_DILIMI;
  } catch (hata) {
    // Veritabanı okunamıyorsa dilim yüzünden sayfa düşmemeli.
    console.error("Saat dilimi ayarı okunamadı:", hata);
  }

  onbellek = { dilim, zaman: simdi };
  return dilim;
}

/**
 * Seçilen dilimi çalışan sürece uygular; uygulanan dilimi döner.
 *
 * `process.env.TZ` atamak Node'da ICU'nun varsayılan dilimini de
 * değiştiriyor — ölçüldü: atamadan sonra `Date` okuyucuları ve YENİ
 * oluşturulan `Intl` biçimlendiricileri yeni dilime geçiyor, ama atamadan
 * ÖNCE oluşturulmuş biçimlendiriciler eski dilimde kalıyor. Bu yüzden
 * src/lib/tarih.ts biçimlendiricileri modül yüklenirken bir kez değil,
 * dilim başına önbellekleyerek oluşturuyor.
 *
 * İstek başında çağrılıyor (src/lib/oturumTaze.ts): hangi işçi süreç
 * karşılarsa karşılasın, render'dan önce dilim yerine oturuyor.
 */
export async function saatDiliminiUygula(): Promise<string> {
  const secilen = await secilenSaatDilimi();
  if (mevcutSaatDilimi() !== secilen) process.env.TZ = secilen;
  return secilen;
}
