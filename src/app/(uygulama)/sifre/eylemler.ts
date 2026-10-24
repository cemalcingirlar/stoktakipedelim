"use server";

import { logYaz } from "@/lib/log";
import { oturumAc } from "@/lib/oturum";
import { oturumBilgisiKur } from "@/lib/oturumKur";
import { prisma } from "@/lib/prisma";
import { LOG_ISLEM } from "@/lib/sabitler";
import { sifreDogrula, sifreHashle } from "@/lib/sifre";
import { sifreSorunu } from "@/lib/sifrePolitikasi";
import { YetkiHatasi, oturumZorunlu } from "@/lib/yetki";

export type SifreDurumu = { hata?: string; basari?: string };

/**
 * Kullanıcının kendi şifresini değiştirmesi.
 *
 * Önceden yolu yoktu: şifreyi yalnız yönetici koyabiliyordu. Bu, şifrelerin
 * sözlü paylaşılmasına ve kâğıda yazılmasına yol açıyor — yöneticinin herkesin
 * şifresini bilmesi de ayrı bir sorun. Kendi şifresini değiştirebilen
 * kullanıcı, yöneticinin verdiği geçici şifreyi hemen kendininkiyle
 * değiştirebiliyor.
 *
 * Mevcut şifre soruluyor: başkasının açık bıraktığı ekranda şifre
 * değiştirilip hesabın ele geçirilmesini engelliyor.
 */
export async function kendiSifremiDegistir(
  _onceki: SifreDurumu,
  form: FormData,
): Promise<SifreDurumu> {
  try {
    const oturum = await oturumZorunlu();

    const mevcut = String(form.get("mevcutSifre") ?? "");
    const yeni = String(form.get("yeniSifre") ?? "");
    const tekrar = String(form.get("yeniSifreTekrar") ?? "");

    const kullanici = await prisma.kullanici.findUnique({
      where: { id: oturum.kullaniciId },
      select: {
        id: true,
        kullaniciAdi: true,
        adSoyad: true,
        sifreHash: true,
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
    if (!kullanici) return { hata: "Kullanıcı bulunamadı." };

    if (!(await sifreDogrula(mevcut, kullanici.sifreHash))) {
      return { hata: "Mevcut şifreniz hatalı." };
    }
    if (yeni !== tekrar) {
      return {
        hata: "Yeni şifreler eşleşmiyor. İki alana da aynı şifreyi yazın.",
      };
    }
    if (yeni === mevcut) {
      return { hata: "Yeni şifre eskisiyle aynı olamaz." };
    }

    const kuralHatasi = sifreSorunu(
      yeni,
      kullanici.kullaniciAdi,
      kullanici.adSoyad,
    );
    if (kuralHatasi) return { hata: kuralHatasi };

    await prisma.kullanici.update({
      where: { id: kullanici.id },
      data: {
        sifreHash: await sifreHashle(yeni),
        // Bu damga, eski jetonları geçersiz kılıyor: başka cihazlarda açık
        // kalan oturumlar düşüyor (src/lib/oturumGecerlilik.ts).
        sifreDegisikligi: new Date(),
      },
    });

    // Kullanıcının KENDİ oturumu düşmesin diye yeni jeton yazılıyor; eski
    // jetonu zaten geçersiz oldu.
    await oturumAc(oturumBilgisiKur(kullanici));

    await logYaz(oturum, {
      islem: LOG_ISLEM.SIFRE_DEGISTIR,
      hedefTip: "Kullanici",
      hedefId: kullanici.id,
      detay: "Kullanıcı kendi şifresini değiştirdi",
    });

    return {
      basari:
        "Şifreniz değişti. Başka cihazlarda açık kalan oturumlarınız kapandı.",
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Şifre değiştirilemedi:", hata);
    return { hata: "İşlem tamamlanamadı. Lütfen tekrar deneyin." };
  }
}
