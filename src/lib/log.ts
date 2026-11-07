import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";
import type { LogIslem } from "./sabitler";
import type { OturumBilgisi } from "./oturum";

type LogGirdisi = {
  islem: LogIslem;
  hedefTip?: string;
  hedefId?: number;
  detay?: string;
};

/**
 * İsteği yapanın IP'si.
 *
 * Önce `cf-connecting-ip`: uygulama cloudflared tüneli arkasında çalışıyor
 * ve Cloudflare bu başlığı kendi kenarında YAZIYOR, istemcinin gönderdiğini
 * ezerek. `x-forwarded-for` ise istemciden gelebildiği için sahte değer
 * taşıyabiliyordu — yani kayıttaki IP istenen her şey olabilirdi.
 *
 * Tüneli atlayıp sunucuya doğrudan ulaşabilen biri yine sahte başlık
 * yollayabilir; o noktada zaten sunucunun ağındadır. Dışarıdan gelen
 * istekler için kayıt artık güvenilir.
 */
async function istemciIp(): Promise<string | undefined> {
  try {
    const basliklar = await headers();
    return (
      basliklar.get("cf-connecting-ip")?.trim() ||
      basliklar.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      basliklar.get("x-real-ip")?.trim() ||
      undefined
    );
  } catch {
    return undefined;
  }
}

/**
 * İşlem kaydı bırakır. Loglama asla ana işlemi düşürmemeli,
 * bu yüzden hatalar yutulur ve sunucu konsoluna yazılır.
 */
export async function logYaz(
  oturum: Pick<OturumBilgisi, "kullaniciId" | "kullaniciAdi"> | null,
  girdi: LogGirdisi,
): Promise<void> {
  try {
    await prisma.log.create({
      data: {
        kullaniciId: oturum?.kullaniciId ?? null,
        kullaniciAdi: oturum?.kullaniciAdi ?? "bilinmiyor",
        islem: girdi.islem,
        hedefTip: girdi.hedefTip,
        hedefId: girdi.hedefId,
        detay: girdi.detay,
        ip: await istemciIp(),
      },
    });
  } catch (hata) {
    console.error("Log yazılamadı:", hata);
  }
}
