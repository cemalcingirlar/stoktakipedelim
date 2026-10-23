"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sifreDogrula } from "@/lib/sifre";
import { oturumAc, oturumKapat, oturumuOku } from "@/lib/oturum";
import { oturumBilgisiKur } from "@/lib/oturumKur";
import { logYaz } from "@/lib/log";
import { LOG_ISLEM } from "@/lib/sabitler";
import { guvenliHedef } from "@/lib/yonlendirme";
import {
  basarisizDenemeSonrasi,
  kilitDurumu,
  kilitMesaji,
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

  // Deneme sınırı şifre kontrolünden ÖNCE: kilitliyken scrypt çalıştırmak
  // hem boşuna işlemci harcar hem de saldırgana zamanlama bilgisi verir.
  const sayac = await prisma.girisDenemesi.findUnique({
    where: { kullaniciAdi },
  });
  const kilit = kilitDurumu(sayac);
  if (kilit.kilitli) {
    return { hata: kilitMesaji(kilit.kalanSn), kullaniciAdi, deneme };
  }

  const kullanici = await prisma.kullanici.findUnique({
    where: { kullaniciAdi },
    include: {
      magaza: true,
      ekMagazalar: { where: { aktif: true }, orderBy: { kod: "asc" } },
    },
  });

  // Kullanıcı yok / şifre yanlış ayrımı yapılmaz: hesap taramasını zorlaştırır.
  const gecerli = kullanici
    ? await sifreDogrula(sifre, kullanici.sifreHash)
    : false;
  if (!kullanici || !gecerli) {
    // Var olmayan kullanıcı adları da sayılıyor: yalnız var olanlar sayılsaydı
    // "bu ad kilitlendi mi" sorusu hesap taramasının cevabı olurdu.
    const yeni = basarisizDenemeSonrasi(sayac);
    await prisma.girisDenemesi.upsert({
      where: { kullaniciAdi },
      update: {
        basarisiz: yeni.basarisiz,
        pencereBasi: yeni.pencereBasi,
        kilitBitis: yeni.kilitBitis,
      },
      create: {
        kullaniciAdi,
        basarisiz: yeni.basarisiz,
        pencereBasi: yeni.pencereBasi,
        kilitBitis: yeni.kilitBitis,
      },
    });

    const yeniKilit = kilitDurumu(yeni);
    if (yeniKilit.kilitli) {
      return { hata: kilitMesaji(yeniKilit.kalanSn), kullaniciAdi, deneme };
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

  // Başarılı giriş sayacı sıfırlıyor: kilit, şifresini hatırlayan kullanıcıyı
  // cezalandırmamalı.
  await prisma.girisDenemesi.deleteMany({ where: { kullaniciAdi } });

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

export async function cikisYap(): Promise<void> {
  const oturum = await oturumuOku();
  if (oturum) {
    await logYaz(oturum, { islem: LOG_ISLEM.CIKIS_YAP });
  }
  await oturumKapat();
  redirect("/giris");
}
