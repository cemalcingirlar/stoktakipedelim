/**
 * "Seri/Lot Envanter Raporu" biçimindeki stok dökümünü okur.
 *
 * Bu dosya elimizdeki şablondan iki yönden ayrılıyor:
 *   1. Mağaza her satırda yazıyor (Ambar sütunu) — şablonda ise formdan tek
 *      depo seçiliyordu. Bu yüzden ayrı bir okuyucu var: tek depo varsayımı
 *      dökümdeki satırları yanlış mağazaya yazardı.
 *   2. Kategori sütunu yok; marka/model tek bir açıklama alanında geliyor.
 *      Kategori ekrandan bir kez seçiliyor, marka/model açıklamadan tahmin
 *      ediliyor ve önizlemede gösteriliyor.
 *
 * Buradaki her şey saf fonksiyon: veritabanına dokunmaz, test edilebilir.
 * Yazma işi ekranın eylemler.ts dosyasında.
 */
import { aramaNormalize, kodNormalize } from "./metin";
import { hucreTutari } from "./para";
import { hucreYaz, type Hucre, type Matris } from "./tablo";

/** Başlık adları — rapor çıktıları aynı sütunu farklı yazabiliyor. */
const SUTUNLAR = {
  malzemeKodu: ["Malzeme Kodu", "Malzeme No", "Stok Kodu"],
  aciklama: ["Malzeme Açıklaması", "Malzeme Adı", "Stok Adı"],
  maliyetGrubu: ["Ambar Maliyet Grubu", "Maliyet Grubu"],
  ambar: ["Ambar No.", "Ambar No", "Ambar", "Depo"],
  seriNo: ["Seri/Lot No.", "Seri/Lot No", "Seri No", "Seri Lot No"],
  seriAciklama: ["Seri/Lot Açıklaması", "Seri Açıklaması"],
  miktar: ["Envanter Miktarı", "Miktar"],
  birim: ["Birim"],
  ortalamaDeger: ["Ortalama Değer", "Ortalama Maliyet", "Birim Fiyat"],
  tutar: ["Envanter Tutarı", "Tutar"],
} as const;

type SutunAdi = keyof typeof SUTUNLAR;

/** Kullanıcıya gösterilen sütun listesi — ekrandaki açıklama metni için. */
export const ENVANTER_BEKLENEN_SUTUNLAR = [
  "Malzeme Kodu",
  "Malzeme Açıklaması",
  "Ambar Maliyet Grubu",
  "Ambar No.",
  "Seri/Lot No.",
  "Envanter Miktarı",
  "Ortalama Değer",
] as const;

export type EnvanterMagazasi = { id: number; ad: string; kod: string };

export type EnvanterKategorisi = {
  id: number;
  ad: string;
  seriNoZorunlu: boolean;
};

export type EnvanterSatiri = {
  /** Dosyadaki satır numarası — önizlemede ve hata mesajlarında görünür. */
  satirNo: number;
  magazaId: number;
  magazaAdi: string;
  ambarMetni: string;
  marka: string;
  model: string;
  seriNo: string | null;
  barkod: string | null;
  alisFiyatiKurus: number;
  not: string | null;
};

export type EnvanterHatasi = { satirNo: number; mesaj: string };

export type EnvanterSonucu = {
  satirlar: EnvanterSatiri[];
  hatalar: EnvanterHatasi[];
  /** Başlık satırı bulunamadıysa dosya bu rapor biçiminde değildir. */
  basliklarTamam: boolean;
  /** Hiçbir mağazaya denk gelmeyen ambar adları — tekrarsız. */
  eslesmeyenAmbarlar: string[];
  /** Dosyada okunmaya çalışılan toplam veri satırı (boşlar hariç). */
  okunanSatir: number;
};

type Basliklar = { satirNo: number; yerler: Partial<Record<SutunAdi, number>> };

function basliklariBul(matris: Matris): Basliklar | null {
  const enFazla = Math.min(matris.length, 40);
  for (let i = 1; i <= enFazla; i++) {
    const normalize = matris[i - 1].map((h) => aramaNormalize(hucreYaz(h)));
    const yerler: Partial<Record<SutunAdi, number>> = {};

    for (const [ad, secenekler] of Object.entries(SUTUNLAR) as [SutunAdi, readonly string[]][]) {
      for (const secenek of secenekler) {
        const yer = normalize.indexOf(aramaNormalize(secenek));
        if (yer >= 0) {
          yerler[ad] = yer + 1;
          break;
        }
      }
    }

    // Seri/Lot ve bir ambar sütunu varsa bu satır başlık satırıdır. Rapor
    // başlığı (firma adı, tarih aralığı) üstte duruyor, bu yüzden sabit bir
    // satır numarası varsayamıyoruz.
    const ambarVar = yerler.ambar !== undefined || yerler.maliyetGrubu !== undefined;
    if (yerler.seriNo !== undefined && ambarVar) {
      return { satirNo: i, yerler };
    }
  }
  return null;
}

/**
 * Dosya bu rapor biçiminde mi? Toplu yükleme ekranı bunu kullanıp kullanıcıyı
 * "dosya şablona uymuyor" demek yerine doğru ekrana yönlendiriyor.
 */
export function envanterDosyasiMi(matris: Matris): boolean {
  return basliklariBul(matris) !== null;
}

/**
 * Açıklamayı marka ve modele böler: ilk kelime marka, kalanı model.
 *
 * Tahmin olduğu için önizlemede ikisi de ayrı sütunda gösteriliyor; yanlışsa
 * kullanıcı kaydetmeden görüyor. Tek kelimelik açıklamada model zorunlu
 * olduğu için aynı kelime ikisine de yazılır.
 */
export function markaModelAyir(aciklama: string): { marka: string; model: string } {
  const temiz = aciklama.replace(/\s+/g, " ").trim();
  if (temiz === "") return { marka: "", model: "" };
  const bosluk = temiz.indexOf(" ");
  if (bosluk < 0) return { marka: temiz, model: temiz };
  return { marka: temiz.slice(0, bosluk), model: temiz.slice(bosluk + 1) };
}

/**
 * Ambar adını mağazaya eşler.
 *
 * Önce kod ve ad birebir aranır; tutmazsa ambar metninin içinde mağaza adı
 * geçiyor mu diye bakılır — ama yalnız TEK mağaza eşleşirse. İki mağaza aynı
 * metne uyuyorsa tahmin etmek yerine hata veriyoruz: yanlış mağazaya yazılan
 * stok, okunamayan satırdan daha pahalıya geliyor.
 */
export function ambariEsle(
  ambarMetni: string,
  magazalar: EnvanterMagazasi[],
): EnvanterMagazasi | null {
  const hedef = aramaNormalize(ambarMetni);
  if (hedef === "") return null;

  const birebir = magazalar.filter(
    (m) => aramaNormalize(m.ad) === hedef || aramaNormalize(m.kod) === hedef,
  );
  if (birebir.length === 1) return birebir[0];
  if (birebir.length > 1) return null;

  const iceren = magazalar.filter((m) => {
    const ad = aramaNormalize(m.ad);
    return ad !== "" && (hedef.includes(ad) || ad.includes(hedef));
  });
  return iceren.length === 1 ? iceren[0] : null;
}

/** Miktar hücresini sayıya çevirir: para okuyucusunu kullanıp kuruşu geri alır. */
function miktarOku(ham: Hucre | undefined): number | null {
  const kurus = hucreTutari(ham ?? null);
  if (kurus === null) return null;
  return kurus / 100;
}

export function envanteriOku(
  matris: Matris,
  secenekler: {
    magazalar: EnvanterMagazasi[];
    kategori: EnvanterKategorisi;
    /** Sistemde kayıtlı seri numaraları — tekrar yüklemeyi önizlemede yakalar. */
    kayitliSeriNolar?: Set<string>;
  },
): EnvanterSonucu {
  const bos: EnvanterSonucu = {
    satirlar: [],
    hatalar: [],
    basliklarTamam: false,
    eslesmeyenAmbarlar: [],
    okunanSatir: 0,
  };

  if (matris.length === 0) {
    return { ...bos, hatalar: [{ satirNo: 0, mesaj: "Dosyada satır bulunamadı." }] };
  }

  const basliklar = basliklariBul(matris);
  if (!basliklar) {
    return {
      ...bos,
      hatalar: [
        {
          satirNo: 0,
          mesaj:
            "Bu dosya envanter raporu biçiminde değil. En az 'Seri/Lot No.' ve " +
            "'Ambar No.' (ya da 'Ambar Maliyet Grubu') sütunları olmalı.",
        },
      ],
    };
  }

  const { satirNo: baslikSatiri, yerler } = basliklar;
  const al = (satir: Hucre[], ad: SutunAdi): Hucre | undefined => {
    const sutun = yerler[ad];
    return sutun ? satir[sutun - 1] : undefined;
  };
  const metin = (satir: Hucre[], ad: SutunAdi): string => hucreYaz(al(satir, ad));

  const satirlar: EnvanterSatiri[] = [];
  const hatalar: EnvanterHatasi[] = [];
  const eslesmeyen = new Set<string>();
  const gorulenSeriNolar = new Map<string, number>();
  let okunanSatir = 0;

  for (let i = baslikSatiri + 1; i <= matris.length; i++) {
    const satir = matris[i - 1];

    const malzemeKodu = metin(satir, "malzemeKodu");
    const aciklama = metin(satir, "aciklama");
    const ambarNo = metin(satir, "ambar");
    const maliyetGrubu = metin(satir, "maliyetGrubu");
    const seriNoHam = metin(satir, "seriNo");
    const seriAciklama = metin(satir, "seriAciklama");
    const miktarHam = metin(satir, "miktar");

    const doluAlanlar = [malzemeKodu, aciklama, ambarNo, maliyetGrubu, seriNoHam, miktarHam];
    if (!doluAlanlar.some((d) => d !== "")) continue;

    // Rapor çıktıları araya ara toplam / "Toplam" satırı koyabiliyor: bunlarda
    // ambar ve seri no boş olur, atlanmaları gerekir.
    if (seriNoHam === "" && aciklama === "" && malzemeKodu === "") continue;

    okunanSatir += 1;
    const satirHatalari: string[] = [];

    // Mağaza: iki ambar sütunundan hangisi mağazaya denk gelirse o kullanılır.
    // Rapor çıktısında mağaza adı bazen maliyet grubunda, bazen ambar no'da.
    const adaylar = [maliyetGrubu, ambarNo].filter((a) => a !== "");
    let magaza: EnvanterMagazasi | null = null;
    let ambarMetni = adaylar[0] ?? "";
    for (const aday of adaylar) {
      const bulunan = ambariEsle(aday, secenekler.magazalar);
      if (bulunan) {
        magaza = bulunan;
        ambarMetni = aday;
        break;
      }
    }
    if (!magaza) {
      if (adaylar.length === 0) {
        satirHatalari.push("Ambar (mağaza) boş.");
      } else {
        const yazi = adaylar.join(" / ");
        eslesmeyen.add(yazi);
        satirHatalari.push(
          `"${yazi}" hangi mağaza olduğu anlaşılamadı. Mağaza adını ya da kodunu ` +
            "Ayarlar → Mağazalar'daki yazımla aynı yapın.",
        );
      }
    }

    const { marka, model } = markaModelAyir(aciklama);
    if (!marka) satirHatalari.push("Malzeme açıklaması boş; marka/model okunamadı.");

    const seriNo = kodNormalize(seriNoHam);
    if (secenekler.kategori.seriNoZorunlu && !seriNo) {
      satirHatalari.push(`${secenekler.kategori.ad} için seri no (IMEI) zorunlu.`);
    }
    if (seriNo) {
      const onceki = gorulenSeriNolar.get(seriNo);
      if (onceki) {
        satirHatalari.push(`Seri no ${seriNo} ${onceki}. satırda da var.`);
      } else {
        gorulenSeriNolar.set(seriNo, i);
      }
      if (secenekler.kayitliSeriNolar?.has(seriNo)) {
        satirHatalari.push(`${seriNo} sistemde zaten kayıtlı.`);
      }
    }

    // Her satır tek fiziksel cihaz: adet kavramı yok. Miktar 1'den büyükse
    // satırın kaç cihazı temsil ettiği belirsiz, seri no da tek — sessizce bir
    // cihaz yazmak stoğu eksik gösterir.
    if (yerler.miktar !== undefined) {
      const miktar = miktarOku(al(satir, "miktar"));
      if (miktar === null) {
        if (miktarHam !== "") satirHatalari.push(`Envanter miktarı okunamadı: "${miktarHam}".`);
      } else if (miktar <= 0) {
        satirHatalari.push(`Envanter miktarı ${miktarHam}; sıfır veya negatif satır alınmaz.`);
      } else if (miktar !== 1) {
        satirHatalari.push(
          `Envanter miktarı ${miktarHam}. Program her satırda tek cihaz tutuyor; ` +
            "bu satırı seri numarası başına birer satıra bölün.",
        );
      }
    }

    const ortalama = hucreTutari(al(satir, "ortalamaDeger") ?? null);
    const tutar = hucreTutari(al(satir, "tutar") ?? null);
    const fiyatKurus = ortalama ?? tutar ?? 0;
    if (fiyatKurus < 0) satirHatalari.push("Alış fiyatı negatif olamaz.");

    if (satirHatalari.length > 0) {
      hatalar.push({ satirNo: i, mesaj: satirHatalari.join(" ") });
      continue;
    }

    satirlar.push({
      satirNo: i,
      magazaId: magaza!.id,
      magazaAdi: magaza!.ad,
      ambarMetni,
      marka,
      model,
      seriNo: seriNo || null,
      barkod: kodNormalize(malzemeKodu) || null,
      alisFiyatiKurus: fiyatKurus,
      not: seriAciklama || null,
    });
  }

  if (satirlar.length === 0 && hatalar.length === 0) {
    hatalar.push({ satirNo: 0, mesaj: "Dosyada cihaz satırı bulunamadı." });
  }

  return {
    satirlar,
    hatalar,
    basliklarTamam: true,
    eslesmeyenAmbarlar: [...eslesmeyen],
    okunanSatir,
  };
}

/** Önizlemedeki satırları mağazaya göre toplar — ekrandaki özet tablosu için. */
export function magazayaGoreToplam(
  satirlar: EnvanterSatiri[],
): { magazaId: number; magazaAdi: string; adet: number; tutarKurus: number }[] {
  const harita = new Map<number, { magazaId: number; magazaAdi: string; adet: number; tutarKurus: number }>();
  for (const satir of satirlar) {
    const mevcut = harita.get(satir.magazaId);
    if (mevcut) {
      mevcut.adet += 1;
      mevcut.tutarKurus += satir.alisFiyatiKurus;
    } else {
      harita.set(satir.magazaId, {
        magazaId: satir.magazaId,
        magazaAdi: satir.magazaAdi,
        adet: 1,
        tutarKurus: satir.alisFiyatiKurus,
      });
    }
  }
  return [...harita.values()].sort((a, b) => a.magazaAdi.localeCompare(b.magazaAdi, "tr"));
}
