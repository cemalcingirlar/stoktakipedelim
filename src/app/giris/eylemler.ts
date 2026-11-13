"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sifreDogrulaSabitSure } from "@/lib/sifre";
import {
  oturumAc,
  oturumKapat,
  oturumuOku,
  type CozulmusOturum,
} from "@/lib/oturum";
import { oturumBilgisiKur } from "@/lib/oturumKur";
import { istemciIp, logYaz } from "@/lib/log";
import { LOG_ISLEM } from "@/lib/sabitler";
import { guvenliHedef } from "@/lib/yonlendirme";
import {
  GENEL_EN_COK_DENEME,
  basarisizDenemeSonrasi,
  denemeAnahtarlari,
  kayitIcinAd,
  kilitDurumu,
  kilitMesaji,
  type DenemeKaydi,
} from "@/lib/girisSiniri";

export type GirisDurumu = {
  hata?: string;
  /** Hatalı denemeden sonra alanı yeniden doldurmak için geri verilir. */
  kullaniciAdi?: string;
  /** Her denemede artar; form alanlarını `key` ile tazelemek için. */
  deneme: number;
};

export async function girisYap(
  oncekiDurum: GirisDurumu,
  form: FormData,
): Promise<GirisDurumu> {
  const deneme = oncekiDurum.deneme + 1;
  const kullaniciAdi = String(form.get("kullaniciAdi") ?? "").trim();
  const sifre = String(form.get("sifre") ?? "");
  const devam = String(form.get("devam") ?? "");

  if (!kullaniciAdi || !sifre) {
    return { hata: "Kullanıcı adı ve şifre zorunludur.", kullaniciAdi, deneme };
  }

  // İki sayaç: bu adresten bu ad için, ve bu ad için bütün adreslerden
  // (bkz. girisSiniri.ts). Deneme sınırı şifre kontrolünden ÖNCE: kilitliyken
  // scrypt çalıştırmak hem boşuna işlemci harcar hem de saldırgana zamanlama
  // bilgisi verir.
  const ip = await istemciIp();
  const anahtar = denemeAnahtarlari(kullaniciAdi, ip);
  const sayaclar = await prisma.girisDenemesi.findMany({
    where: { kullaniciAdi: { in: [anahtar.ipli, anahtar.genel] } },
  });
  const ipliSayac = sayaclar.find((k) => k.kullaniciAdi === anahtar.ipli) ?? null;
  const genelSayac = sayaclar.find((k) => k.kullaniciAdi === anahtar.genel) ?? null;
  const kalanSn = Math.max(
    kilitDurumu(ipliSayac).kalanSn,
    kilitDurumu(genelSayac).kalanSn,
  );
  if (kalanSn > 0) {
    return { hata: kilitMesaji(kalanSn), kullaniciAdi, deneme };
  }

  const kullanici = await prisma.kullanici.findUnique({
    where: { kullaniciAdi },
    include: {
      magaza: true,
      ekMagazalar: { where: { aktif: true }, orderBy: { kod: "asc" } },
    },
  });

  // Kullanıcı yok / şifre yanlış ayrımı yapılmaz: hesap taramasını
  // zorlaştırır. Süre de ayırt etmemeli: kullanıcı yokken aynı maliyette
  // sahte bir doğrulama çalışıyor (bkz. sifreDogrulaSabitSure).
  const gecerli = await sifreDogrulaSabitSure(sifre, kullanici?.sifreHash);
  if (!kullanici || !gecerli) {
    // Var olmayan kullanıcı adları da sayılıyor: yalnız var olanlar sayılsaydı
    // "bu ad kilitlendi mi" sorusu hesap taramasının cevabı olurdu.
    const yeniIpli = basarisizDenemeSonrasi(ipliSayac);
    const yeniGenel = basarisizDenemeSonrasi(
      genelSayac,
      new Date(),
      GENEL_EN_COK_DENEME,
    );
    const sayacYaz = (ad: string, yeni: DenemeKaydi) =>
      prisma.girisDenemesi.upsert({
        where: { kullaniciAdi: ad },
        update: {
          basarisiz: yeni.basarisiz,
          pencereBasi: yeni.pencereBasi,
          kilitBitis: yeni.kilitBitis,
        },
        create: {
          kullaniciAdi: ad,
          basarisiz: yeni.basarisiz,
          pencereBasi: yeni.pencereBasi,
          kilitBitis: yeni.kilitBitis,
        },
      });
    await Promise.all([
      sayacYaz(anahtar.ipli, yeniIpli),
      sayacYaz(anahtar.genel, yeniGenel),
    ]);

    const yeniKalanSn = Math.max(
      kilitDurumu(yeniIpli).kalanSn,
      kilitDurumu(yeniGenel).kalanSn,
    );

    // Başarısız denemeler de denetim kaydına giriyor: yalnız başarılı girişler
    // yazılırken bir saldırı denemesi sonradan görülemiyordu. Şifre ASLA
    // yazılmıyor; denenen ad kırpılarak yazılıyor.
    await logYaz(
      kullanici
        ? { kullaniciId: kullanici.id, kullaniciAdi: kullanici.kullaniciAdi }
        : null,
      {
        islem:
          yeniKalanSn > 0
            ? LOG_ISLEM.GIRIS_KILITLENDI
            : LOG_ISLEM.GIRIS_BASARISIZ,
        hedefTip: "Giris",
        detay:
          `Denenen ad: ${kayitIcinAd(kullaniciAdi)}` +
          (kullanici ? "" : " (kayıtlı değil)") +
          ` · bu adresten ${yeniIpli.basarisiz}. deneme`,
      },
    );

    if (yeniKalanSn > 0) {
      return { hata: kilitMesaji(yeniKalanSn), kullaniciAdi, deneme };
    }
    return { hata: "Kullanıcı adı veya şifre hatalı.", kullaniciAdi, deneme };
  }

  if (!kullanici.aktif) {
    return {
      hata: "Bu hesap pasif durumda. Yönetici ile görüşün.",
      kullaniciAdi,
      deneme,
    };
  }

  // Başarılı giriş bu adresin sayacını sıfırlıyor: kilit, şifresini hatırlayan
  // kullanıcıyı cezalandırmamalı. Genel sayaç duruyor: başka adreslerden süren
  // bir saldırıya, sahibi giriş yaptı diye yeni deneme hakkı doğmamalı.
  await prisma.girisDenemesi.deleteMany({
    where: { kullaniciAdi: anahtar.ipli },
  });

  await prisma.kullanici.update({
    where: { id: kullanici.id },
    data: { sonGiris: new Date() },
  });

  const oturum = oturumBilgisiKur(kullanici);

  await oturumAc(oturum);
  await logYaz(oturum, { islem: LOG_ISLEM.GIRIS_YAP });

  // Süzgeç yonlendirme.ts içinde: "/" ile başlamak yetmiyor, "//site" de
  // "/" ile başlar ama tarayıcıyı dış siteye götürür.
  redirect(guvenliHedef(devam));
}

/**
 * Çıkış.
 *
 * Çerezi silmek yetmiyordu: jeton (JWT) sunucuda tutulmadığı için kendi
 * başına 12 saat geçerli kalıyor ve kopyalanmış bir çerez çıkıştan sonra da
 * çalışıyordu. Ortak tezgâh bilgisayarında bu gerçek bir senaryo. Çıkışta
 * jetonun kimliği iptal listesine yazılıyor; oturum okuması her istekte
 * oraya bakıyor (src/lib/oturumTaze.ts).
 */
export async function cikisYap(): Promise<void> {
  const oturum = await oturumuOku();
  if (oturum) {
    await logYaz(oturum, { islem: LOG_ISLEM.CIKIS_YAP });
    await jetonuIptalEt(oturum);
  }
  await oturumKapat();
  redirect("/giris");
}

/**
 * Jetonu iptal listesine yazar ve süresi geçmiş kayıtları temizler.
 *
 * Temizlik burada: ayrı bir zamanlanmış göreve gerek yok, liste zaten her
 * çıkışta bir kayıt kadar büyüyor. Süresi dolmuş jeton zaten kabul
 * edilmiyor, kaydının durmasının bir anlamı yok.
 */
async function jetonuIptalEt(oturum: CozulmusOturum): Promise<void> {
  if (!oturum.jetonKimligi) return; // Bu alandan önce açılmış eski oturum.
  const bitis = oturum.jetonBitisSn
    ? new Date(oturum.jetonBitisSn * 1000)
    : new Date(Date.now() + 12 * 60 * 60 * 1000);
  try {
    await prisma.$transaction([
      prisma.iptalJeton.upsert({
        where: { jti: oturum.jetonKimligi },
        update: {},
        create: {
          jti: oturum.jetonKimligi,
          kullaniciId: oturum.kullaniciId,
          bitis,
        },
      }),
      prisma.iptalJeton.deleteMany({ where: { bitis: { lt: new Date() } } }),
      // Çıkış yapılan oturumun ve süresi dolmuşların etkinlik kayıtları da
      // gereksiz (bkz. hareketsizlik.ts).
      prisma.oturumEtkinligi.deleteMany({
        where: {
          OR: [{ jti: oturum.jetonKimligi }, { bitis: { lt: new Date() } }],
        },
      }),
    ]);
  } catch (hata) {
    // Çıkışın kendisi her hâlükârda tamamlanmalı: çerez siliniyor.
    console.error("Jeton iptal edilemedi:", hata);
  }
}
