import { timingSafeEqual } from "node:crypto";
import { logYaz } from "@/lib/log";
import { LOG_ISLEM } from "@/lib/sabitler";
import { yedekAl } from "@/lib/yedek";

/** Sabit zamanlı anahtar karşılaştırması. */
function anahtarDogru(gelen: string | null, beklenen: string): boolean {
  if (!gelen) return false;
  const a = Buffer.from(gelen);
  const b = Buffer.from(beklenen);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Sunucudaki zamanlanmış görevin (cron / systemd timer) çağırdığı yedekleme ucu.
 * Oturum çerezi değil, YEDEK_ANAHTARI ile korunur.
 *
 *   curl -fsS -H "X-Yedek-Anahtari: $ANAHTAR" http://127.0.0.1:3000/api/yedek
 */
export async function POST(istek: Request) {
  const beklenen = process.env.YEDEK_ANAHTARI;
  if (!beklenen || beklenen.length < 16) {
    return Response.json(
      { hata: "YEDEK_ANAHTARI tanımlı değil veya çok kısa (en az 16 karakter)." },
      { status: 503 },
    );
  }

  const url = new URL(istek.url);
  const gelen = istek.headers.get("x-yedek-anahtari") ?? url.searchParams.get("anahtar");
  if (!anahtarDogru(gelen, beklenen)) {
    return Response.json({ hata: "Yetkisiz." }, { status: 401 });
  }

  const sonuc = await yedekAl();

  await logYaz(null, {
    islem: LOG_ISLEM.YEDEK_AL,
    hedefTip: "Yedek",
    detay: sonuc.basarili
      ? `Zamanlanmış yedek: ${sonuc.dosyaAdi} (${sonuc.boyutBayt} bayt)`
      : `Zamanlanmış yedek başarısız: ${sonuc.hata}`,
  });

  return Response.json(sonuc, { status: sonuc.basarili ? 200 : 500 });
}

/** Sağlık kontrolü — cron'un doğru adrese vurduğunu doğrulamak için. */
export async function GET() {
  return Response.json({ durum: "hazir", yontem: "POST" });
}
