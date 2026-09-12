import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Geliştirmede hot-reload her seferinde yeni bağlantı açmasın diye
 * istemci global üzerinde tekil tutulur.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function istemciOlustur() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? istemciOlustur();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
