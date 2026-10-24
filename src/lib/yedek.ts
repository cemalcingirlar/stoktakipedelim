import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { google } from "googleapis";
import { prisma } from "./prisma";
import {
  anlikGoruntuAl,
  butunlukKontrolu,
  gzipAc,
  gziple,
  veritabaniYolu,
  yedekDosyaAdi,
  yedekTablolariniSay,
} from "./sqliteAnlik";
import { provaSonucu } from "./yedekProvasi";
import {
  yedegiDogrula,
  yuklenmeyenDogrulama,
  type Dogrulama,
} from "./yedekDogrulama";

export { veritabaniYolu };

export type YedekAyari =
  | { yontem: "OAUTH"; klasorId: string | null }
  | { yontem: "SERVIS_HESABI"; klasorId: string | null }
  | { yontem: "YOK"; eksik: string[] };

export type YedekSonucu = {
  basarili: boolean;
  dosyaAdi: string;
  boyutBayt: number;
  driveDosyaId?: string;
  hata?: string;
  /** Rotasyonda silinen eski yedek sayısı. */
  silinen?: number;
  /** Bütünlük ve yüklenen boyut sınaması; src/lib/yedekDogrulama.ts. */
  dogrulama?: Dogrulama;
  /** Drive'ın bildirdiği dosya boyutu. */
  uzakBoyutBayt?: number | null;
};

/** Saklanacak yedek sayısı; daha eskiler rotasyonda silinir. */
const VARSAYILAN_SAKLAMA = 14;

function ortam(ad: string): string | null {
  const deger = process.env[ad];
  return deger && deger.trim() !== "" ? deger.trim() : null;
}

/**
 * Hangi kimlik yönteminin yapılandırıldığını söyler.
 *
 * OAuth (kullanıcının kendi Drive'ı) kişisel Gmail hesaplarıyla da çalışır.
 * Servis hesabının kendi depolama kotası olmadığı için yalnız Ortak Drive
 * (Shared Drive) klasörlerine yükleyebilir — Google Workspace gerektirir.
 */
export function yedekAyariniOku(): YedekAyari {
  const klasorId = ortam("GOOGLE_DRIVE_KLASOR_ID");

  const istemciId = ortam("GOOGLE_ISTEMCI_ID");
  const istemciSirri = ortam("GOOGLE_ISTEMCI_SIRRI");
  const yenilemeJetonu = ortam("GOOGLE_YENILEME_JETONU");
  if (istemciId && istemciSirri && yenilemeJetonu) {
    return { yontem: "OAUTH", klasorId };
  }

  if (ortam("GOOGLE_SERVIS_HESABI_JSON")) {
    return { yontem: "SERVIS_HESABI", klasorId };
  }

  const eksik: string[] = [];
  if (!istemciId) eksik.push("GOOGLE_ISTEMCI_ID");
  if (!istemciSirri) eksik.push("GOOGLE_ISTEMCI_SIRRI");
  if (!yenilemeJetonu) eksik.push("GOOGLE_YENILEME_JETONU");
  return { yontem: "YOK", eksik };
}

function driveIstemcisi() {
  const ayar = yedekAyariniOku();

  if (ayar.yontem === "OAUTH") {
    const istemci = new google.auth.OAuth2(
      ortam("GOOGLE_ISTEMCI_ID")!,
      ortam("GOOGLE_ISTEMCI_SIRRI")!,
    );
    istemci.setCredentials({ refresh_token: ortam("GOOGLE_YENILEME_JETONU")! });
    return google.drive({ version: "v3", auth: istemci });
  }

  if (ayar.yontem === "SERVIS_HESABI") {
    const ham = ortam("GOOGLE_SERVIS_HESABI_JSON")!;
    // Değer ya JSON'un kendisi ya da anahtar dosyasının yolu olabilir.
    const kimlik = ham.trimStart().startsWith("{")
      ? new google.auth.GoogleAuth({
          credentials: JSON.parse(ham),
          scopes: ["https://www.googleapis.com/auth/drive.file"],
        })
      : new google.auth.GoogleAuth({
          keyFile: ham,
          scopes: ["https://www.googleapis.com/auth/drive.file"],
        });
    return google.drive({ version: "v3", auth: kimlik });
  }

  throw new Error(
    `Google Drive yapılandırılmamış. Eksik ortam değişkenleri: ${ayar.eksik.join(", ")}`,
  );
}

/**
 * Veritabanının anlık görüntüsünü alır, gzip'ler ve Google Drive'a yükler.
 * Eski yedekler saklama sayısına göre silinir.
 */
export async function yedekAl(
  kayitYap = true,
  saklama = Number(process.env.YEDEK_SAKLAMA ?? VARSAYILAN_SAKLAMA),
): Promise<YedekSonucu> {
  const tarih = new Date();
  const dosyaAdi = yedekDosyaAdi(tarih);
  const gecici = path.join(tmpdir(), `stok-yedek-${Date.now()}`);
  const anlikYol = path.join(gecici, "anlik.db");
  const gzipYol = path.join(gecici, dosyaAdi);

  // Hata durumunda da kaydedilebilmesi için try bloğunun dışında tutulur.
  let boyut = 0;
  let butunluk: string | null = null;
  let sonuc: YedekSonucu = { basarili: false, dosyaAdi, boyutBayt: 0 };

  try {
    await mkdir(gecici, { recursive: true });
    anlikGoruntuAl(veritabaniYolu(), anlikYol);
    // Bütünlük SIKIŞTIRMADAN ÖNCE, anlık görüntü üzerinde sınanıyor: bozuk
    // bir dosyayı sıkıştırıp yüklemenin anlamı yok.
    butunluk = butunlukKontrolu(anlikYol);
    boyut = await gziple(anlikYol, gzipYol);

    const ayar = yedekAyariniOku();
    const drive = driveIstemcisi();
    const klasorId = ayar.yontem === "YOK" ? null : ayar.klasorId;

    const yukleme = await drive.files.create({
      requestBody: {
        name: dosyaAdi,
        ...(klasorId ? { parents: [klasorId] } : {}),
      },
      media: { mimeType: "application/gzip", body: createReadStream(gzipYol) },
      fields: "id,name,size",
      supportsAllDrives: true,
    });

    // Drive boyutu metin olarak döner; sayıya çevrilemiyorsa "bilinmiyor".
    const uzakHam = yukleme.data.size;
    const uzakBoyut =
      uzakHam === null || uzakHam === undefined || uzakHam === ""
        ? null
        : Number(uzakHam);
    const dogrulama = yedegiDogrula({
      butunluk,
      yerelBayt: boyut,
      uzakBayt: Number.isFinite(uzakBoyut) ? uzakBoyut : null,
    });

    // Doğrulamayı geçemeyen yedek Drive'da bırakılmıyor: rotasyon 14 slotla
    // sınırlı, bozuk dosya orada durursa sağlam bir eski yedeği düşürür ve
    // felaket günü elde bozuk yedek kalır.
    if (dogrulama.sorun) {
      if (yukleme.data.id) {
        try {
          await drive.files.delete({
            fileId: yukleme.data.id,
            supportsAllDrives: true,
          });
        } catch (silmeHatasi) {
          console.error(
            "Doğrulanamayan yedek Drive'dan silinemedi:",
            silmeHatasi,
          );
        }
      }
      throw new Error(dogrulama.sorun);
    }

    // Rotasyon ancak doğrulanmış yedekten sonra: eski yedekleri silmeden
    // önce yenisinin sağlam olduğundan emin olmak gerekiyor.
    const silinen = await eskiYedekleriSil(saklama);

    sonuc = {
      basarili: true,
      dosyaAdi,
      boyutBayt: boyut,
      driveDosyaId: yukleme.data.id ?? undefined,
      silinen,
      dogrulama,
      uzakBoyutBayt: Number.isFinite(uzakBoyut) ? uzakBoyut : null,
    };
  } catch (hata) {
    const mesaj = hata instanceof Error ? hata.message : String(hata);
    console.error("Yedekleme başarısız:", hata);
    sonuc = {
      basarili: false,
      dosyaAdi,
      boyutBayt: boyut,
      hata: mesaj,
      dogrulama: yuklenmeyenDogrulama(butunluk),
    };
  } finally {
    await rm(gecici, { recursive: true, force: true });
  }

  if (kayitYap) {
    try {
      await prisma.yedek.create({
        data: {
          dosyaAdi: sonuc.dosyaAdi,
          boyutBayt: sonuc.boyutBayt,
          driveDosyaId: sonuc.driveDosyaId ?? null,
          durum: sonuc.basarili ? "BASARILI" : "HATA",
          hata: sonuc.hata ?? null,
          dogrulandi: sonuc.dogrulama?.tamam ?? false,
          dogrulama: sonuc.dogrulama?.metin ?? null,
          uzakBoyutBayt: sonuc.uzakBoyutBayt ?? null,
        },
      });
    } catch (hata) {
      console.error("Yedek kaydı yazılamadı:", hata);
    }
  }

  return sonuc;
}

/** Drive'daki eski yedekleri saklama sayısına indirir. Silinen dosya sayısını döner. */
async function eskiYedekleriSil(saklama: number): Promise<number> {
  if (!Number.isFinite(saklama) || saklama <= 0) return 0;

  const ayar = yedekAyariniOku();
  if (ayar.yontem === "YOK") return 0;

  const drive = driveIstemcisi();
  const klasorId = ayar.klasorId;

  const liste = await drive.files.list({
    q: [
      "name contains 'stok-yedek-'",
      "trashed = false",
      ...(klasorId ? [`'${klasorId}' in parents`] : []),
    ].join(" and "),
    orderBy: "createdTime desc",
    fields: "files(id,name,createdTime)",
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const dosyalar = liste.data.files ?? [];
  const silinecekler = dosyalar.slice(saklama);

  let silinen = 0;
  for (const dosya of silinecekler) {
    if (!dosya.id) continue;
    try {
      await drive.files.delete({ fileId: dosya.id, supportsAllDrives: true });
      silinen += 1;
    } catch (hata) {
      console.error(`Eski yedek silinemedi (${dosya.name}):`, hata);
    }
  }
  return silinen;
}

/**
 * Drive'daki en yeni yedeği indirip açar: geri yükleme provası.
 *
 * Yedeğin ALINMASI ile GERİ YÜKLENEBİLMESİ ayrı şeyler. Bütünlük kontrolü
 * dosyayı alındığı anda sınıyor; prova Drive'dan geri indirip açıyor —
 * yüklemede bozulma, yanlış klasör ya da eksik yetki ancak böyle görünür.
 */
export async function geriYuklemeProvasi(): Promise<{
  basarili: boolean;
  metin: string;
}> {
  const ayar = yedekAyariniOku();
  if (ayar.yontem === "YOK") {
    return {
      basarili: false,
      metin: `Google Drive yapılandırılmamış. Eksik: ${ayar.eksik.join(", ")}`,
    };
  }

  const gecici = path.join(tmpdir(), `stok-prova-${Date.now()}`);
  try {
    await mkdir(gecici, { recursive: true });
    const drive = driveIstemcisi();

    const liste = await drive.files.list({
      q: [
        "name contains 'stok-yedek-'",
        "trashed = false",
        ...(ayar.klasorId ? [`'${ayar.klasorId}' in parents`] : []),
      ].join(" and "),
      orderBy: "createdTime desc",
      fields: "files(id,name,size)",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const dosya = liste.data.files?.[0];
    if (!dosya?.id) {
      return { basarili: false, metin: "Drive'da yedek dosyası bulunamadı." };
    }

    const gzipYol = path.join(gecici, dosya.name ?? "yedek.db.gz");
    const indirme = await drive.files.get(
      { fileId: dosya.id, alt: "media", supportsAllDrives: true },
      { responseType: "stream" },
    );
    await pipeline(
      indirme.data as NodeJS.ReadableStream,
      createWriteStream(gzipYol),
    );

    const dbYol = path.join(gecici, "prova.db");
    await gzipAc(gzipYol, dbYol);

    const butunluk = butunlukKontrolu(dbYol);
    const yedekSayilari = yedekTablolariniSay(dbYol);
    const [kullanici, cihaz, fatura] = await Promise.all([
      prisma.kullanici.count(),
      prisma.stokKalemi.count(),
      prisma.alisFaturasi.count(),
    ]);

    return provaSonucu({
      butunluk,
      yedek: yedekSayilari,
      canli: { kullanici, cihaz, fatura },
      dosyaAdi: dosya.name ?? "yedek",
    });
  } catch (hata) {
    const mesaj = hata instanceof Error ? hata.message : String(hata);
    console.error("Geri yükleme provası başarısız:", hata);
    return { basarili: false, metin: `Prova yapılamadı: ${mesaj}` };
  } finally {
    await rm(gecici, { recursive: true, force: true });
  }
}

/** Drive bağlantısını yedek almadan sınar. */
export async function baglantiyiSina(): Promise<{
  basarili: boolean;
  mesaj: string;
}> {
  try {
    const ayar = yedekAyariniOku();
    if (ayar.yontem === "YOK") {
      return {
        basarili: false,
        mesaj: `Yapılandırma eksik: ${ayar.eksik.join(", ")}`,
      };
    }

    const drive = driveIstemcisi();

    if (ayar.klasorId) {
      const klasor = await drive.files.get({
        fileId: ayar.klasorId,
        fields: "id,name,mimeType",
        supportsAllDrives: true,
      });
      return {
        basarili: true,
        mesaj: `Bağlantı tamam. Hedef klasör: ${klasor.data.name}`,
      };
    }

    await drive.files.list({
      pageSize: 1,
      fields: "files(id)",
      supportsAllDrives: true,
    });
    return {
      basarili: true,
      mesaj:
        "Bağlantı tamam. Hedef klasör belirtilmedi; yedekler Drive köküne yüklenir.",
    };
  } catch (hata) {
    const mesaj = hata instanceof Error ? hata.message : String(hata);
    return { basarili: false, mesaj };
  }
}
