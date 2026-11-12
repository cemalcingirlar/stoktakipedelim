/**
 * İstek sunucunun kendisinden mi geliyor?
 *
 * Yedekleme ucunu yalnız sunucudaki zamanlanmış görev çağırıyor
 * (`curl http://127.0.0.1:3000/api/yedek`), ama uç tünel üzerinden internete
 * de açıktı: anahtarla korunsa bile varlığı herkese görünüyor ve anahtar
 * sınırsız denenebiliyordu.
 *
 * Bağlantının adresine bakılamıyor: cloudflared da aynı makinede çalışıyor
 * ve uygulamaya 127.0.0.1'den bağlanıyor, yani internetten gelen istek de
 * "yerel" görünür. Ayırt eden başlıklar:
 *
 *   - Cloudflare kenarından geçen her isteğe `cf-connecting-ip` ve `cf-ray`
 *     yazılıyor; istemci bunları silemez.
 *   - Tünelden gelen istekte Host, sitenin alan adıdır; zamanlanmış görevde
 *     127.0.0.1.
 *
 * Cloudflare başlıklarından biri bile varsa ya da Host yerel değilse istek
 * dışarıdan sayılıyor. Bu anahtarın yerini tutmuyor, onun önüne ikinci bir kapı
 * koyuyor.
 *
 * `x-forwarded-for` / `x-forwarded-host` BİLEREK listede değil: Next bunları
 * her isteğe kendisi ekliyor, yerel istekte de. Listeye alındıklarında
 * zamanlanmış yedeğin kendisi 404 alıyordu (testte yakalandı).
 */
const VEKIL_BASLIKLARI = ["cf-connecting-ip", "cf-ray", "cf-ipcountry", "cdn-loop"];

const YEREL_ADLAR = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** "127.0.0.1:3000" -> "127.0.0.1"; "[::1]:3000" -> "[::1]". */
function hostAdi(host: string): string {
  const temiz = host.trim().toLowerCase();
  if (temiz.startsWith("[")) {
    const kapanis = temiz.indexOf("]");
    return kapanis > 0 ? temiz.slice(0, kapanis + 1) : temiz;
  }
  const iki = temiz.lastIndexOf(":");
  return iki > 0 && temiz.indexOf(":") === iki ? temiz.slice(0, iki) : temiz;
}

export function yerelIstekMi(basliklar: {
  get(ad: string): string | null;
}): boolean {
  for (const ad of VEKIL_BASLIKLARI) {
    if (basliklar.get(ad) !== null) return false;
  }
  const host = basliklar.get("host");
  if (!host) return false;
  return YEREL_ADLAR.has(hostAdi(host));
}
