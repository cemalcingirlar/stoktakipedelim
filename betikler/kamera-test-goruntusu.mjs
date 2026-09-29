// Sahte kamera görüntüsü üretir: verilen kodu CODE_128 barkoduna çevirip
// Y4M video dosyası olarak yazar. Chromium --use-file-for-fake-video-capture
// ile bu dosyayı kamera gibi kullanır.
import { writeFileSync } from "node:fs";
import zxing from "@zxing/library";
const { BarcodeFormat, MultiFormatWriter } = zxing;

const [, , kod, cikti] = process.argv;
if (!kod || !cikti) {
  console.error("kullanım: node _barkod-y4m-uret.mjs <kod> <cikti.y4m>");
  process.exit(1);
}

const G = 1280;
const Y = 720;
const KARE = 30;

// Kodu bit matrisine çevir. @zxing'in JS sürümü yalnız QR üretebiliyor;
// okuma tarafı CODE_128/EAN dahil hepsini destekliyor.
const yazici = new MultiFormatWriter();
const matris = yazici.encode(kod, BarcodeFormat.QR_CODE, 400, 400, new Map());
const mGenislik = matris.getWidth();
const mYukseklik = matris.getHeight();

// Luma düzlemi: beyaz zemin, ortada barkod.
const luma = Buffer.alloc(G * Y, 235); // beyaz
const olcek = 1; // 400x400 matris zaten kare içine sığıyor
const solBosluk = Math.floor((G - mGenislik * olcek) / 2);
const ustBosluk = Math.floor((Y - mYukseklik * olcek) / 2);

for (let my = 0; my < mYukseklik; my++) {
  for (let mx = 0; mx < mGenislik; mx++) {
    if (!matris.get(mx, my)) continue;
    for (let oy = 0; oy < olcek; oy++) {
      const satir = (ustBosluk + my * olcek + oy) * G;
      for (let ox = 0; ox < olcek; ox++) {
        luma[satir + solBosluk + mx * olcek + ox] = 16; // siyah
      }
    }
  }
}

// Renk düzlemleri nötr gri (renksiz görüntü).
const kroma = Buffer.alloc((G / 2) * (Y / 2), 128);

const parcalar = [Buffer.from(`YUV4MPEG2 W${G} H${Y} F25:1 Ip A1:1 C420mpeg2\n`)];
for (let i = 0; i < KARE; i++) {
  parcalar.push(Buffer.from("FRAME\n"), luma, kroma, kroma);
}
writeFileSync(cikti, Buffer.concat(parcalar));
console.log(`${cikti} yazıldı — kod: ${kod}, ${KARE} kare, ${G}x${Y}`);
