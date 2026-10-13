-- AlterTable
ALTER TABLE "Magaza" ADD COLUMN "dukkanKodu" TEXT;

-- CreateIndex
CREATE INDEX "Magaza_dukkanKodu_idx" ON "Magaza"("dukkanKodu");
