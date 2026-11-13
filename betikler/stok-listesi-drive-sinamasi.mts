/**
 * Stok listesinin Drive'a yüklenme akışını SAHTE bir Drive istemcisiyle sınar.
 *
 * Test ortamında gerçek Drive yok; akışın kendisi (klasörü bul ya da aç,
 * yükle, eskileri ayıkla, sonucu kaydet) yine de sınanabilmeli. Sahte istemci
 * yapılan çağrıları kaydediyor; sonuç JSON olarak basılıyor ve
 * stok-listesi-dogrula.mjs tarafından okunuyor.
 *
 * Çalıştırma: node --conditions=react-server --import tsx <bu dosya>
 */
import { prisma } from "../src/lib/prisma";
import { stokListesiniYukle } from "../src/lib/yedek";
import { STOK_LISTESI_ANAHTARI } from "../src/lib/stokListesi";

type Dosya = { id: string; name: string; createdTime: string; parents: string[]; klasor: boolean; bayt: number };

function sahteDrive(baslangic: Dosya[], ayar: { yuklemeHatasi?: string } = {}) {
  const dosyalar = [...baslangic];
  const silinen: string[] = [];
  let sira = 0;
  const drive = {
    files: {
      list: async ({ q }: { q: string }) => {
        const klasorMu = q.includes("mimeType = 'application/vnd.google-apps.folder'");
        const ust = /'([^']+)' in parents/.exec(q)?.[1];
        const ad = /name = '([^']+)'/.exec(q)?.[1];
        const icerir = /name contains '([^']+)'/.exec(q)?.[1];
        const files = dosyalar.filter(
          (d) =>
            d.klasor === klasorMu &&
            (!ust || d.parents.includes(ust)) &&
            (!ad || d.name === ad) &&
            (!icerir || d.name.includes(icerir)),
        );
        return { data: { files } };
      },
      create: async ({ requestBody, media }: { requestBody: { name: string; parents?: string[]; mimeType?: string }; media?: { body: NodeJS.ReadableStream } }) => {
        const klasor = requestBody.mimeType === "application/vnd.google-apps.folder";
        let bayt = 0;
        if (media) {
          if (ayar.yuklemeHatasi) throw new Error(ayar.yuklemeHatasi);
          for await (const parca of media.body) bayt += (parca as Buffer).length;
        }
        const yeni: Dosya = {
          id: `yeni-${++sira}`,
          name: requestBody.name,
          createdTime: new Date().toISOString(),
          parents: requestBody.parents ?? [],
          klasor,
          bayt,
        };
        dosyalar.push(yeni);
        return { data: { id: yeni.id, name: yeni.name } };
      },
      delete: async ({ fileId }: { fileId: string }) => {
        silinen.push(fileId);
        const i = dosyalar.findIndex((d) => d.id === fileId);
        if (i >= 0) dosyalar.splice(i, 1);
        return { data: {} };
      },
    },
  };
  return { drive, dosyalar, silinen };
}

const gun = (n: number) => {
  const t = new Date(2026, 10, 13 - n, 2);
  return `stok-listesi-${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}.xlsx`;
};
const kayit = async () =>
  JSON.parse((await prisma.ayar.findUnique({ where: { anahtar: STOK_LISTESI_ANAHTARI } }))?.deger ?? "null");

// Yedekleme "yapılandırılmış" görünmeli ki üst klasör kimliği okunsun; gerçek
// istemci hiç kurulmuyor (sahtesi veriliyor), bu değerler bir yere gitmiyor.
process.env.GOOGLE_ISTEMCI_ID = "test";
process.env.GOOGLE_ISTEMCI_SIRRI = "test";
process.env.GOOGLE_YENILEME_JETONU = "test";
process.env.GOOGLE_DRIVE_KLASOR_ID = "ust-klasor";
const tarih = new Date(2026, 10, 13, 2, 5);
const cikti: Record<string, unknown> = {};

// 1) Klasör yok: açılmalı, dosya içine yüklenmeli.
{
  const s = sahteDrive([]);
  const sonuc = await stokListesiniYukle(tarih, 30, s.drive as never);
  const klasor = s.dosyalar.find((d) => d.klasor);
  const dosya = s.dosyalar.find((d) => !d.klasor);
  cikti.ilk = {
    sonuc,
    klasorAdi: klasor?.name,
    klasorUstu: klasor?.parents,
    dosyaAdi: dosya?.name,
    dosyaKlasorde: dosya?.parents[0] === klasor?.id,
    bayt: dosya?.bayt,
    silinen: s.silinen,
    kayit: await kayit(),
  };
}

// 2) Klasör var, içinde 31 eski gün + bugünün eski kopyası + yabancı dosya +
//    üst klasörde yedek dosyası: yalnız fazlalıklar silinmeli.
{
  const eski: Dosya[] = [{ id: "klasor", name: "Stok Listeleri", createdTime: "2026-01-01T00:00:00Z", parents: ["ust-klasor"], klasor: true, bayt: 0 }];
  for (let n = 1; n <= 31; n++) eski.push({ id: `gun-${n}`, name: gun(n), createdTime: `2026-10-01T00:00:${String(n).padStart(2, "0")}Z`, parents: ["klasor"], klasor: false, bayt: 1 });
  eski.push({ id: "bugun-eski", name: gun(0), createdTime: "2026-11-12T23:00:00Z", parents: ["klasor"], klasor: false, bayt: 1 });
  eski.push({ id: "yabanci", name: "notlarim.xlsx", createdTime: "2020-01-01T00:00:00Z", parents: ["klasor"], klasor: false, bayt: 1 });
  eski.push({ id: "yedek", name: "stok-yedek-202611130200.db.gz", createdTime: "2026-11-13T00:00:00Z", parents: ["ust-klasor"], klasor: false, bayt: 1 });
  const s = sahteDrive(eski);
  const sonuc = await stokListesiniYukle(tarih, 30, s.drive as never);
  cikti.rotasyon = {
    sonuc,
    klasorSayisi: s.dosyalar.filter((d) => d.klasor).length,
    silinen: [...s.silinen].sort(),
    kalanListe: s.dosyalar.filter((d) => !d.klasor && d.name.startsWith("stok-listesi-")).length,
    bugununDosyasi: s.dosyalar.filter((d) => d.name === gun(0)).map((d) => d.id),
    yabanciDuruyor: s.dosyalar.some((d) => d.id === "yabanci"),
    yedekDuruyor: s.dosyalar.some((d) => d.id === "yedek"),
  };
}

// 3) Yükleme hatası: hata fırlatmamalı, sonuç ve kayıt başarısız olmalı,
//    hiçbir dosya silinmemeli.
{
  const s = sahteDrive(
    [
      { id: "klasor", name: "Stok Listeleri", createdTime: "2026-01-01T00:00:00Z", parents: ["ust-klasor"], klasor: true, bayt: 0 },
      { id: "dun", name: gun(1), createdTime: "2026-11-12T02:00:00Z", parents: ["klasor"], klasor: false, bayt: 1 },
    ],
    { yuklemeHatasi: "Depolama kotası doldu" },
  );
  const sonuc = await stokListesiniYukle(tarih, 30, s.drive as never);
  cikti.hata = { sonuc, silinen: s.silinen, kayit: await kayit() };
}

console.log(`SONUC ${JSON.stringify(cikti)}`);
await prisma.$disconnect();
process.exit(0);
