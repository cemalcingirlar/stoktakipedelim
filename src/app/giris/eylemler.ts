"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sifreDogrula } from "@/lib/sifre";
import { oturumAc, oturumKapat, oturumuOku } from "@/lib/oturum";
import { logYaz } from "@/lib/log";
import { LOG_ISLEM, type Rol } from "@/lib/sabitler";

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

  const kullanici = await prisma.kullanici.findUnique({
    where: { kullaniciAdi },
    include: { magaza: true },
  });

  // Kullanıcı yok / şifre yanlış ayrımı yapılmaz: hesap taramasını zorlaştırır.
  const gecerli = kullanici ? await sifreDogrula(sifre, kullanici.sifreHash) : false;
  if (!kullanici || !gecerli) {
    return { hata: "Kullanıcı adı veya şifre hatalı.", kullaniciAdi, deneme };
  }

  if (!kullanici.aktif) {
    return { hata: "Bu hesap pasif durumda. Yönetici ile görüşün.", kullaniciAdi, deneme };
  }

  await prisma.kullanici.update({
    where: { id: kullanici.id },
    data: { sonGiris: new Date() },
  });

  const oturum = {
    kullaniciId: kullanici.id,
    kullaniciAdi: kullanici.kullaniciAdi,
    adSoyad: kullanici.adSoyad,
    rol: kullanici.rol as Rol,
    magazaId: kullanici.magazaId,
    magazaAdi: kullanici.magaza?.ad ?? null,
  };

  await oturumAc(oturum);
  await logYaz(oturum, { islem: LOG_ISLEM.GIRIS_YAP });

  redirect(devam && devam.startsWith("/") ? devam : "/panel");
}

export async function cikisYap(): Promise<void> {
  const oturum = await oturumuOku();
  if (oturum) {
    await logYaz(oturum, { islem: LOG_ISLEM.CIKIS_YAP });
  }
  await oturumKapat();
  redirect("/giris");
}
