import "server-only";
import { statfs } from "node:fs/promises";
import { stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";
import { veritabaniYolu } from "./sqliteAnlik";
import {
  diskSatiri,
  genelDurum,
  veritabaniSatiri,
  yedekSatiri,
  type DurumSatiri,
  type Siddet,
} from "./sistemDurumu";

/**
 * Sunucunun o anki sağlık ölçümleri.
 *
 * Dosya sistemi okumaları hataya dayanıklı: ölçüm alınamadığı için Ayarlar
 * ekranının düşmesi, ölçümün kendisinden daha kötü olurdu.
 */
export async function sistemOlcumu(): Promise<{
  satirlar: DurumSatiri[];
  durum: Siddet;
}> {
  const vtYolu = veritabaniYolu();

  const [diskBilgisi, vtBoyut, sonYedek] = await Promise.all([
    statfs(path.dirname(vtYolu)).catch(() => null),
    veritabaniBoyutu(vtYolu),
    prisma.yedek
      .findFirst({
        where: { durum: "BASARILI" },
        orderBy: { id: "desc" },
        select: { tarih: true, dogrulandi: true },
      })
      .catch(() => null),
  ]);

  const satirlar = [
    diskBilgisi
      ? diskSatiri(
          diskBilgisi.blocks * diskBilgisi.bsize,
          diskBilgisi.bavail * diskBilgisi.bsize,
        )
      : diskSatiri(0, 0),
    veritabaniSatiri(vtBoyut),
    yedekSatiri(sonYedek?.tarih ?? null, sonYedek?.dogrulandi ?? false),
  ];

  return { satirlar, durum: genelDurum(satirlar) };
}

/**
 * Veritabanı dosyası + WAL günlüğü.
 *
 * WAL ayrı dosyada tutuluyor ve yoğun günlerde yüzlerce MB olabiliyor;
 * yalnız ana dosyaya bakmak yanıltıcı olurdu.
 */
async function veritabaniBoyutu(yol: string): Promise<number> {
  const boyutlar = await Promise.all(
    [yol, `${yol}-wal`, `${yol}-shm`].map((d) =>
      stat(d)
        .then((s) => s.size)
        .catch(() => 0),
    ),
  );
  return boyutlar.reduce((t, b) => t + b, 0);
}
