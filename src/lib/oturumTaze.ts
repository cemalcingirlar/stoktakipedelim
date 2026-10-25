import "server-only";
import { cache } from "react";
import { oturumuOku, type OturumBilgisi } from "./oturum";
import { oturumBilgisiKur } from "./oturumKur";
import { prisma } from "./prisma";
import { jetonAni, oturumGecerliMi } from "./oturumGecerlilik";
import { saatDiliminiUygula } from "./saatDilimiAyari";

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
 * Saat dilimi de burada uygulanıyor. Burası her sayfa ve her server action'ın
 * geçtiği tek nokta — dilimi render başlamadan yerine oturtmanın en erken ve
 * en kesin yeri. `instrumentation` kancasında denenmişti, işçi süreçlerin bir
 * kısmı eski dilimde kalıyordu (src/lib/saatDilimi.ts başındaki not).
 *
 * Çerezi yeniden yazmıyoruz: bir istekteki okuma, çerezin kendisini
 * tazelemek için yeterli sebep değil ve her sayfada Set-Cookie göndermek
 * önbelleklemeyi bozar.
 *
 * Sonuç istek boyunca `cache` ile tutuluyor. Her sayfa bu okumayı iki kez
 * tetikliyordu: bir kez düzen (menü), bir kez sayfanın kendisi. Ölçüldü:
 * kullanıcı + ana mağaza + ek mağazalar üç ayrı sorgu, yani her sayfa
 * görüntülemede üç gereksiz sorgu ve bir fazladan JWT doğrulaması. Tek
 * render içinde iki okumanın farklı sonuç vermesi beklenmez; vermesi
 * hâlinde menü ile sayfanın yetkisi çelişirdi.
 */
async function oturumuTazeOkuHam(): Promise<OturumBilgisi | null> {
  await saatDiliminiUygula();

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
      sifreDegisikligi: true,
      magaza: { select: { id: true, ad: true } },
      ekMagazalar: {
        where: { aktif: true },
        orderBy: { kod: "asc" },
        select: { id: true, ad: true },
      },
    },
  });

  if (!kullanici || !kullanici.aktif) return null;

  // Şifre bu jetondan sonra değiştiyse jeton eski şifre döneminden kalmıştır.
  // Şifre sıfırlamanın asıl amacı buydu: ele geçirilmiş oturumu kesmek.
  if (
    !oturumGecerliMi(jetonAni(cerez.jetonAniSn), kullanici.sifreDegisikligi)
  ) {
    return null;
  }

  return oturumBilgisiKur(kullanici);
}

/** İstek boyunca tek okuma. Server Action'larda render bağlamı yoksa cache etkisizdir, sonuç aynı kalır. */
export const oturumuTazeOku = cache(oturumuTazeOkuHam);
