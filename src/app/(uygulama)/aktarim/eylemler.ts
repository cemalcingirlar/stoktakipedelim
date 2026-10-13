"use server";

import { revalidatePath } from "next/cache";
import { dukkanIciAktarabilirMi } from "@/lib/dukkan";
import { logYaz } from "@/lib/log";
import { kodNormalize } from "@/lib/metin";
import { prisma } from "@/lib/prisma";
import { HAREKET_TIP, LOG_ISLEM, STOK_DURUM } from "@/lib/sabitler";
import { YetkiHatasi, oturumZorunlu } from "@/lib/yetki";

export type AktarilanCihaz = {
  id: number;
  marka: string;
  model: string;
  seriNo: string | null;
  barkod: string | null;
};

export type AktarimSonucu =
  | { durum: "TAMAM"; mesaj: string; cihaz: AktarilanCihaz }
  | { durum: "HATA"; mesaj: string };

/**
 * Aynı dükkândaki iki mağaza arasında cihazı tek adımda taşır.
 *
 * Sevkiyat akışından farkı: Transfer kaydı açılmaz, cihaz TRANSFERDE durumuna
 * girmez ve karşı tarafın kabul etmesi beklenmez. Mal fiziken yola çıkmadığı
 * için kabul adımı aynı kişinin kendi gönderdiğini onaylamasına dönüşüyordu.
 * Cihazın geçmişi korunur: DUKKAN_ICI tipinde bir stok hareketi yazılır, kaynak
 * ve hedef mağazalarıyla birlikte.
 *
 * Yanlış okutma pahalı değil: aktarımı ters yönde tekrarlamak cihazı geri
 * getirir, ekranda bunun için düğme var.
 */
export async function dukkanIciAktar(
  kod: string,
  kaynakMagazaId: number,
  hedefMagazaId: number,
): Promise<AktarimSonucu> {
  try {
    const oturum = await oturumZorunlu();

    if (!Number.isInteger(kaynakMagazaId) || !Number.isInteger(hedefMagazaId)) {
      return { durum: "HATA", mesaj: "Mağaza seçimi okunamadı. Sayfayı yenileyin." };
    }

    const magazalar = await prisma.magaza.findMany({
      where: { id: { in: [kaynakMagazaId, hedefMagazaId] } },
      select: { id: true, ad: true, aktif: true, dukkanKodu: true },
    });
    const kaynak = magazalar.find((m) => m.id === kaynakMagazaId);
    const hedef = magazalar.find((m) => m.id === hedefMagazaId);

    if (!kaynak || !hedef) return { durum: "HATA", mesaj: "Mağaza bulunamadı." };
    if (!hedef.aktif) return { durum: "HATA", mesaj: `${hedef.ad} pasif durumda.` };

    if (!dukkanIciAktarabilirMi(oturum, kaynak, hedef)) {
      return {
        durum: "HATA",
        mesaj:
          `${kaynak.ad} ile ${hedef.ad} aynı dükkân değil ya da ikisinde de yetkiniz yok. ` +
          "Farklı dükkânlar arasında Sevkiyat ekranını kullanın.",
      };
    }

    const aranan = kodNormalize(kod);
    if (aranan.length < 3) {
      return { durum: "HATA", mesaj: "Geçerli bir seri no veya barkod girin." };
    }

    const sonuc = await prisma.$transaction(async (tx) => {
      // Cihazın hâlâ kaynak mağazada ve stokta olduğunu işlem içinde doğrula;
      // iki kişi aynı anda okutursa ikincisi hata almalı.
      const cihaz = await tx.stokKalemi.findFirst({
        where: { OR: [{ seriNo: aranan }, { barkod: aranan }] },
        include: { magaza: { select: { ad: true } } },
      });

      if (!cihaz) return { durum: "HATA" as const, mesaj: `${aranan} sistemde kayıtlı değil.` };
      if (cihaz.durum === STOK_DURUM.SATILDI) {
        return { durum: "HATA" as const, mesaj: `${aranan} satılmış, aktarılamaz.` };
      }
      if (cihaz.durum === STOK_DURUM.TRANSFERDE) {
        return { durum: "HATA" as const, mesaj: `${aranan} bir sevkiyatta, önce kabul edilmeli.` };
      }
      if (cihaz.durum !== STOK_DURUM.STOKTA) {
        return {
          durum: "HATA" as const,
          mesaj: `${aranan} stokta değil (${cihaz.durum}), aktarılamaz.`,
        };
      }
      if (cihaz.magazaId === hedefMagazaId) {
        return { durum: "HATA" as const, mesaj: `${aranan} zaten ${hedef.ad} deposunda.` };
      }
      if (cihaz.magazaId !== kaynakMagazaId) {
        return {
          durum: "HATA" as const,
          mesaj: `${aranan} ${cihaz.magaza.ad} deposunda, ${kaynak.ad} deposunda değil.`,
        };
      }

      await tx.stokKalemi.update({
        where: { id: cihaz.id },
        data: { magazaId: hedefMagazaId, durum: STOK_DURUM.STOKTA, cikisTarihi: null },
      });
      await tx.stokHareketi.create({
        data: {
          stokKalemiId: cihaz.id,
          tip: HAREKET_TIP.DUKKAN_ICI,
          kaynakMagazaId: kaynakMagazaId,
          hedefMagazaId: hedefMagazaId,
          kullaniciId: oturum.kullaniciId,
          aciklama: `Dükkân içi aktarım: ${kaynak.ad} → ${hedef.ad}`,
        },
      });

      return {
        durum: "TAMAM" as const,
        cihaz: {
          id: cihaz.id,
          marka: cihaz.marka,
          model: cihaz.model,
          seriNo: cihaz.seriNo,
          barkod: cihaz.barkod,
        },
      };
    });

    if (sonuc.durum === "HATA") return sonuc;

    await logYaz(oturum, {
      islem: LOG_ISLEM.DUKKAN_ICI_AKTARIM,
      hedefTip: "StokKalemi",
      hedefId: sonuc.cihaz.id,
      detay: `${sonuc.cihaz.marka} ${sonuc.cihaz.model} · ${kaynak.ad} → ${hedef.ad}`,
    });

    revalidatePath("/aktarim");
    revalidatePath("/cihazlar");
    revalidatePath("/satis");
    revalidatePath("/panel");

    return {
      durum: "TAMAM",
      mesaj: `${sonuc.cihaz.marka} ${sonuc.cihaz.model} → ${hedef.ad}`,
      cihaz: sonuc.cihaz,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { durum: "HATA", mesaj: hata.message };
    console.error("Dükkân içi aktarım başarısız:", hata);
    return { durum: "HATA", mesaj: "Aktarım yapılamadı. Lütfen tekrar deneyin." };
  }
}
