import "server-only";
import { oturumuOku, type OturumBilgisi } from "./oturum";
import { oturumBilgisiKur } from "./oturumKur";
import { prisma } from "./prisma";

/**
 * Oturumu çerezden okur, sonra yetkileri veritabanından tazeler.
 *
 * Çerezdeki JWT giriş anındaki mağaza listesini taşır. Yönetici bir kişiye
 * yeni mağaza yetkisi verdiğinde ya da yetkisini aldığında, o kişi zaten
 * giriş yapmışsa çerez eski listeyi göstermeye devam eder; değişiklik ancak
 * çıkıp yeniden girince veya 12 saatlik süre dolunca işlerdi. Yetkiyi her
 * istekte veritabanından okuyarak bunu kapatıyoruz.
 *
 * Aynı sebeple pasife alınan veya silinen kullanıcı da anında dışarı düşer;
 * eskiden çerezi geçerli kaldığı sürece işlem yapmaya devam edebiliyordu.
 *
 * Çerezi yeniden yazmıyoruz: bir istekteki okuma, çerezin kendisini
 * tazelemek için yeterli sebep değil ve her sayfada Set-Cookie göndermek
 * önbelleklemeyi bozar.
 */
export async function oturumuTazeOku(): Promise<OturumBilgisi | null> {
  const cerez = await oturumuOku();
  if (!cerez) return null;

  const kullanici = await prisma.kullanici.findUnique({
    where: { id: cerez.kullaniciId },
    select: {
      id: true,
      kullaniciAdi: true,
      adSoyad: true,
      rol: true,
      aktif: true,
      magazaId: true,
      magaza: { select: { id: true, ad: true } },
      ekMagazalar: {
        where: { aktif: true },
        orderBy: { kod: "asc" },
        select: { id: true, ad: true },
      },
    },
  });

  if (!kullanici || !kullanici.aktif) return null;
  return oturumBilgisiKur(kullanici);
}
