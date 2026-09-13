// Zamanlanmış görevlerden doğrudan çağrılabilen yedekleme betiği.
// Uygulama sunucusu çalışmıyorken de yedek alır.
//
//   npm run yedek
//   veya: node --import tsx betikler/yedek-al.mts
//
// Cron örneği (her gece 03:00):
//   0 3 * * * cd /opt/stok && /usr/bin/npm run yedek >> /var/log/stok-yedek.log 2>&1

import "dotenv/config";
import { yedekAl, yedekAyariniOku } from "../src/lib/yedek";
import { prisma } from "../src/lib/prisma";

const ayar = yedekAyariniOku();
if (ayar.yontem === "YOK") {
  console.error(`Yedekleme yapılandırılmamış. Eksik: ${ayar.eksik.join(", ")}`);
  process.exit(1);
}

const sonuc = await yedekAl();

if (sonuc.basarili) {
  const kb = Math.round(sonuc.boyutBayt / 1024);
  console.log(
    `${new Date().toISOString()} ✓ ${sonuc.dosyaAdi} yüklendi (${kb} KB)` +
      (sonuc.silinen ? `, ${sonuc.silinen} eski yedek silindi` : ""),
  );
} else {
  console.error(`${new Date().toISOString()} ✗ Yedekleme başarısız: ${sonuc.hata}`);
}

await prisma.$disconnect();
process.exit(sonuc.basarili ? 0 : 1);
