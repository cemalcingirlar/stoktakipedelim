import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { MESGUL_BEKLEME_MS, walKipiniAc } from "./sqliteAyar";

/**
 * Geliştirmede hot-reload her seferinde yeni bağlantı açmasın diye
 * istemci global üzerinde tekil tutulur.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function istemciOlustur() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";

  const adapter = new PrismaBetterSqlite3({
    url,
    // Kilit beklemesi: aynı anda yazmaya çalışan ikinci işlem hemen
    // "database is locked" ile düşmek yerine sırasını bekliyor.
    timeout: MESGUL_BEKLEME_MS,
  });
  const istemci = new PrismaClient({ adapter });

  // WAL kipi istemcinin KENDİ bağlantısında açılıyor. Önce ayrı bir
  // bağlantı açılıp kapatılıyordu; ölçüldü ki Next üretimde dört ayrı
  // süreçte çalışıyor ve WAL'da bağlantı kapanışı checkpoint tetiklediği
  // için süreçler birbirini eziyordu (SQLITE_CORRUPT). Mevcut bağlantıda
  // pragma çalıştırmak kapanış yaratmıyor, yarış da kalmıyor.
  void walKipiniAc(istemci);
  return istemci;
}

export const prisma = globalForPrisma.prisma ?? istemciOlustur();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
