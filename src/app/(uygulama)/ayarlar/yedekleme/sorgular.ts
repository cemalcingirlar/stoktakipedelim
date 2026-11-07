import "server-only";
import { prisma } from "@/lib/prisma";
import { PROVA_ANAHTARI, type ProvaKaydi } from "@/lib/yedekProvasi";

/**
 * Son geri yükleme provasının kaydı; bozuksa yok sayılır.
 *
 * Neden "use server" dosyasında değil: oradaki her dışa verim Next tarafında
 * herkesin çağırabileceği bir uca dönüşüyor. Bu okuma sayfanın kendi
 * verisini hazırlıyor, dışarıya açık bir uç olmasına gerek yok.
 */
export async function provaKaydiniOku(): Promise<ProvaKaydi | null> {
  const kayit = await prisma.ayar.findUnique({
    where: { anahtar: PROVA_ANAHTARI },
  });
  if (!kayit) return null;
  try {
    const coz = JSON.parse(kayit.deger) as ProvaKaydi;
    return typeof coz.tarihISO === "string" ? coz : null;
  } catch {
    return null;
  }
}
