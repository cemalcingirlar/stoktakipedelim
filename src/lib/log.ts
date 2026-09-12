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

async function istemciIp(): Promise<string | undefined> {
  try {
    const basliklar = await headers();
    return (
      basliklar.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      basliklar.get("x-real-ip") ??
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
