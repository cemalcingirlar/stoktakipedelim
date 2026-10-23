-- CreateTable
CREATE TABLE "GirisDenemesi" (
    "kullaniciAdi" TEXT NOT NULL PRIMARY KEY,
    "basarisiz" INTEGER NOT NULL DEFAULT 0,
    "pencereBasi" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kilitBitis" DATETIME,
    "guncellendi" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "GirisDenemesi_kilitBitis_idx" ON "GirisDenemesi"("kilitBitis");
