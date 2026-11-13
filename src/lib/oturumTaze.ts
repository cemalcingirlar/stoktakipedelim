import "server-only";
import { cache } from "react";
import { oturumuOku, type OturumBilgisi } from "./oturum";
import { oturumBilgisiKur } from "./oturumKur";
import { prisma } from "./prisma";
import { jetonAni, oturumGecerliMi } from "./oturumGecerlilik";
import { etkinlikKarari } from "./hareketsizlik";
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

  const [kullanici, iptal, etkinlik] = await Promise.all([
    prisma.kullanici.findUnique({
    where: { id: cerez.kullaniciId },
    select: {
      id: true,
      kullaniciAdi: true,
      adSoyad: true,
      rol: true,
      aktif: true,
      magazaId: true,
      sifreDegisikligi: true,
      oturumSifirlama: true,
      magaza: { select: { id: true, ad: true } },
      ekMagazalar: {
        where: { aktif: true },
        orderBy: { kod: "asc" },
        select: { id: true, ad: true },
      },
    },
    }),
    // Çıkış yapılmış jeton mu? Birincil anahtar araması; kullanıcı okumasıyla
    // birlikte gidiyor, isteğe ölçülebilir bir yük bindirmiyor.
    cerez.jetonKimligi
      ? prisma.iptalJeton.findUnique({
          where: { jti: cerez.jetonKimligi },
          select: { jti: true },
        })
      : Promise.resolve(null),
    // Hareketsizlik sınırı için son etkinlik anı; bu da birincil anahtar
    // araması.
    cerez.jetonKimligi
      ? prisma.oturumEtkinligi.findUnique({
          where: { jti: cerez.jetonKimligi },
          select: { sonEtkinlik: true },
        })
      : Promise.resolve(null),
  ]);

  if (!kullanici || !kullanici.aktif) return null;

  // Çıkış yapılan jeton bir daha kabul edilmiyor: çerezi kopyalanmış olabilir.
  if (iptal) return null;

  // Şifre bu jetondan sonra değiştiyse jeton eski şifre döneminden kalmıştır.
  // Şifre sıfırlamanın asıl amacı buydu: ele geçirilmiş oturumu kesmek.
  // "Tüm cihazlardan çık" damgası da aynı şekilde kesiyor.
  if (
    !oturumGecerliMi(
      jetonAni(cerez.jetonAniSn),
      kullanici.sifreDegisikligi,
      kullanici.oturumSifirlama,
    )
  ) {
    return null;
  }

  // Hareketsizlik: son istekten bu yana fazla zaman geçtiyse oturum kapanır
  // (bkz. hareketsizlik.ts). Kimliksiz eski jetonlarda ölçülemiyor; onlar
  // zaten 12 saatte bitiyor.
  if (cerez.jetonKimligi) {
    const simdi = new Date();
    const karar = etkinlikKarari(etkinlik?.sonEtkinlik ?? null, simdi);
    if (!karar.gecerli) return null;
    if (karar.yaz) {
      const bitis = new Date(
        (cerez.jetonBitisSn ?? Math.floor(simdi.getTime() / 1000) + 43_200) *
          1000,
      );
      try {
        await prisma.oturumEtkinligi.upsert({
          where: { jti: cerez.jetonKimligi },
          update: { sonEtkinlik: simdi },
          create: { jti: cerez.jetonKimligi, sonEtkinlik: simdi, bitis },
        });
      } catch (hata) {
        // Etkinlik yazılamadı diye istek düşmemeli; bir sonraki istek yazar.
        console.error("Oturum etkinliği yazılamadı:", hata);
      }
    }
  }

  return oturumBilgisiKur(kullanici);
}

/** İstek boyunca tek okuma. Server Action'larda render bağlamı yoksa cache etkisizdir, sonuç aynı kalır. */
export const oturumuTazeOku = cache(oturumuTazeOkuHam);
