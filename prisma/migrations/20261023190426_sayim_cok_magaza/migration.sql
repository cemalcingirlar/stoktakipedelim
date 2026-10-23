-- CreateTable
CREATE TABLE "SayimMagazasi" (
    "sayimId" INTEGER NOT NULL,
    "magazaId" INTEGER NOT NULL,

    PRIMARY KEY ("sayimId", "magazaId"),
    CONSTRAINT "SayimMagazasi_sayimId_fkey" FOREIGN KEY ("sayimId") REFERENCES "Sayim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SayimMagazasi_magazaId_fkey" FOREIGN KEY ("magazaId") REFERENCES "Magaza" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SayimMagazasi_magazaId_idx" ON "SayimMagazasi"("magazaId");

-- Mevcut sayımların kapsamı: her biri kendi mağazasını kapsar. Böylece kod
-- her zaman bu tablodan okuyabiliyor; "boşsa magazaId'ye düş" gibi bir
-- istisnaya gerek kalmıyor.
INSERT INTO "SayimMagazasi" ("sayimId", "magazaId")
SELECT "id", "magazaId" FROM "Sayim";
