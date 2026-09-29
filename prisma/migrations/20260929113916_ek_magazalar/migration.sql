-- CreateTable
CREATE TABLE "_KullaniciEkMagaza" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_KullaniciEkMagaza_A_fkey" FOREIGN KEY ("A") REFERENCES "Kullanici" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_KullaniciEkMagaza_B_fkey" FOREIGN KEY ("B") REFERENCES "Magaza" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_KullaniciEkMagaza_AB_unique" ON "_KullaniciEkMagaza"("A", "B");

-- CreateIndex
CREATE INDEX "_KullaniciEkMagaza_B_index" ON "_KullaniciEkMagaza"("B");
