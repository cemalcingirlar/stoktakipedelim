/**
 * Tedarikçi e-Fatura PDF'inden alış faturasını okur.
 *
 * PDF genel olarak güvenilmez bir içe aktarma kaynağı: çoğu PDF'te tablo diye
 * bir şey yoktur, satırlar çizgi ve metin parçalarıdır. Bu okuyucu yalnız
 * e-Fatura düzenindeki metin tabanlı PDF'leri hedefliyor ve kendini üç ayrı
 * tutarlılıkla denetliyor:
 *
 *   1. Her kalem için verilen seri numarası sayısı adede eşit olmalı.
 *   2. Birim fiyat × adet, satır tutarını vermeli.
 *   3. Satır tutarlarının toplamı faturanın ara toplamını vermeli.
 *
 * Bu üçü tutmuyorsa okuma yanlış demektir ve fatura reddedilir — yanlış
 * fiyatla ya da eksik cihazla stok açmaktansa kullanıcıyı Excel'e yönlendirmek
 * daha doğru.
 *
 * Burada PDF ayrıştırması yok: metin çıkarma pdfMetni.ts içinde, bu dosya saf
 * ve test edilebilir kalıyor.
 */
import { aramaNormalize, kodNormalize } from "./metin";
import { tlyiKurusaCevir } from "./para";
import {
  markayiTuret,
  type TedarikciDosyaSonucu,
  type TedarikciFaturasi,
  type TedarikciUrunGrubu,
} from "./tedarikciDosyasi";

export type EFaturaKalemi = {
  siraNo: number;
  /** EAN / barkod. */
  barkod: string;
  /**
   * Satırdaki bütün ürün kodları: EAN, satıcı ürün kodu, alıcı ürün kodu.
   *
   * Alttaki seri notu bunlardan herhangi birini yazabiliyor — bir faturada
   * EAN, başkasında satıcı ürün kodu geliyor. Çapraz kontrol hepsine bakıyor.
   */
  urunKodlari: string[];
  urunAdi: string;
  adet: number;
  /** KDV hariç birim fiyat. */
  birimFiyatKurus: number;
  kdvOrani: number;
  /** KDV hariç satır tutarı. */
  tutarKurus: number;
  seriNolar: string[];
};

export type EFaturaOkumasi = {
  /** Düzen tanındı mı — tanınmadıysa dosya başka bir PDF'tir. */
  tanindi: boolean;
  faturaNo: string;
  siparisNo: string;
  faturaTarihi: Date | null;
  vadeTarihi: Date | null;
  tedarikciAdi: string;
  tedarikciVergiNo: string;
  kalemler: EFaturaKalemi[];
  araToplamKurus: number | null;
  genelToplamKurus: number | null;
  /** Okumayı geçersiz kılan sorunlar. */
  hatalar: string[];
  /** Okumayı engellemeyen ama kullanıcının görmesi gereken notlar. */
  uyarilar: string[];
};

/** "12 - 10 - 2026" / "12.10.2026" / "12/10/2026" -> yerel Date. */
export function efaturaTarihiCoz(ham: string): Date | null {
  const eslesme = ham
    .replace(/\s+/g, "")
    .match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (!eslesme) return null;
  const [, gun, ay, yil] = eslesme;
  const tarih = new Date(Number(yil), Number(ay) - 1, Number(gun));
  if (Number.isNaN(tarih.getTime())) return null;
  // 31.02.2026 gibi taşan tarihler sessizce kaymasın.
  if (tarih.getDate() !== Number(gun) || tarih.getMonth() !== Number(ay) - 1) return null;
  return tarih;
}

/**
 * Etiketten sonraki ilk anlamlı değeri alır: "Fatura No:" -> "DG0...".
 *
 * Karşılaştırma Türkçe karakterden bağımsız: bazı PDF'lerde font kodlaması
 * yüzünden "Sipariş" yerine "Siparis" çıkıyor, etiket bulunamazsa alan sessizce
 * boş kalırdı.
 */
function etiketDegeri(satirlar: string[], etiket: string): string {
  const hedef = aramaNormalize(etiket);
  for (let i = 0; i < satirlar.length; i++) {
    const satir = satirlar[i].trim();
    const kucuk = aramaNormalize(satir);

    // Etiket ve değer aynı satırdaysa ("Vergi No:1234567890").
    if (kucuk.startsWith(hedef)) {
      const kalan = satir.slice(etiket.length).replace(/^[:\s]+/, "").trim();
      if (kalan) return kalan;
      // Değer sonraki satırlarda; boş parçaları atla.
      for (let j = i + 1; j < Math.min(satirlar.length, i + 5); j++) {
        const sonraki = satirlar[j].trim();
        if (sonraki) return sonraki;
      }
    }
  }
  return "";
}

/**
 * "3 Numaralı satırdaki; "KOD" kodlu ürün için seriler: ..." satırı.
 * Türkçe harfler kodlamaya göre ASCII karşılığına düşebildiği için her biri
 * iki seçenekli yazıldı.
 */
const NOT_KALIBI =
  /^(?:Not:\s*)?(\d+)\s*Numaral[ıi]\s*sat[ıi]rdaki;\s*"([^"]*)"\s*kodlu\s*[üu]r[üu]n\s*i[çc]in\s*seriler:\s*(.*)$/i;

const TUTAR_KALIBI = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;

/**
 * Tutar parçası. Aynı faturada iki biçim birden geliyor: kısa ürün adlarında
 * "8.270,83 TL" tek parça, uzun olanlarda "19.810,00" ve "TL" ayrı parçalar.
 */
function tutarParcasi(parca: string): number | null {
  const temiz = parca.replace(/\s*TL\s*$/i, "").trim();
  if (!TUTAR_KALIBI.test(temiz)) return null;
  return tlyiKurusaCevir(temiz);
}
const ADET_KALIBI = /^\d{1,6},\d{2}$/;
/** EAN / barkod: ilk kod sütunu her zaman bu biçimde. */
const KOD_KALIBI = /^\d{8,14}$/;

/**
 * Satıcı / alıcı ürün kodu sütunu — EAN'den sonra gelen 1-2 sütun.
 *
 * Bu sütunlar her faturada rakam olmuyor: Apple ürünlerinde "MYE73TU/A" gibi
 * model kodu geliyor. Ürün adını yutmamak için kalıp dar tutuldu: küçük harf
 * içeremez (açıklamalar "iPhone", "Galaxy" diye başlıyor), en az bir rakam ve
 * bir harf bulunmalı, ayrıca bir ayraç (/ - _) taşımalı. "128GB" gibi açıklama
 * parçaları ayraç taşımadığı için eleniyor.
 */
const URUN_KODU_KALIBI = /^(?=.*\d)(?=.*[A-ZÇĞİÖŞÜ])[A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜ0-9/\-_.]*[/\-_][A-ZÇĞİÖŞÜ0-9/\-_.]*$/;

/** EAN'den sonraki bir parça kod sütunu mu? */
function ekKodMu(parca: string): boolean {
  return KOD_KALIBI.test(parca) || URUN_KODU_KALIBI.test(parca);
}

/**
 * Not bölümündeki seri numaralarını sıra numarasına göre toplar.
 *
 * Biçim: `3 Numaralı satırdaki; "4894947084461/1433819" kodlu ürün için
 * seriler: 350000000000011; 350000000000029` — liste bir sonraki satıra
 * taşabiliyor, taşan satır yeni bir "N Numaralı" ile başlamıyor.
 */
export function seriNolariTopla(metin: string): Map<number, { kod: string; seriler: string[] }> {
  const sonuc = new Map<number, { kod: string; seriler: string[] }>();
  const satirlar = metin.split("\n");

  let aktif: { siraNo: number; kod: string; parcalar: string[] } | null = null;

  const bitir = () => {
    if (!aktif) return;
    const seriler = aktif.parcalar
      .join(";")
      .split(";")
      .map((s) => kodNormalize(s))
      .filter((s) => s.length >= 6);
    sonuc.set(aktif.siraNo, { kod: aktif.kod, seriler });
    aktif = null;
  };

  for (const ham of satirlar) {
    const satir = ham.trim();
    if (!satir) continue;

    const bas = satir.match(NOT_KALIBI);
    if (bas) {
      bitir();
      aktif = { siraNo: Number(bas[1]), kod: bas[2], parcalar: [bas[3]] };
      continue;
    }

    // Taşan seri listesi: yalnız numara ve ayraçtan oluşan satır.
    if (aktif && /^[\dA-Za-z;\s]+$/.test(satir) && /\d{6,}/.test(satir)) {
      aktif.parcalar.push(satir);
      continue;
    }

    bitir();
  }
  bitir();

  return sonuc;
}

/**
 * Metinde e-Fatura kalem tablosu var mı?
 *
 * Başlık adları Türkçe karakterden bağımsız aranıyor; "Açıklama" bazı
 * PDF'lerde "Aciklama" olarak çıkıyor.
 */
export function efaturaMi(metin: string): boolean {
  const normal = aramaNormalize(metin.replace(/\n/g, " "));
  const basliklar = ["aciklama", "birim fiyat", "kdv", "fatura no"];
  return basliklar.every((b) => normal.includes(b));
}

/**
 * Seri notundaki kod, satırın kodlarından biriyle tutuyor mu?
 *
 * Not kodu genelde "<kod>/<parti no>" biçiminde geliyor, bu yüzden tam eşitlik
 * değil önek araması yapılıyor. Ters yön de kabul ediliyor: bazı faturalarda
 * notta kısaltılmış kod, satırda uzunu oluyor.
 */
export function kodTeyitEdildi(notKodu: string, satirKodlari: string[]): boolean {
  const not = kodNormalize(notKodu);
  if (!not) return true; // teyit edecek bir şey yok
  const kodlar = satirKodlari.map((k) => kodNormalize(k)).filter(Boolean);
  if (kodlar.length === 0) return true; // satırın kodu okunamamış; sıra no esas
  return kodlar.some((kod) => not.startsWith(kod) || kod.startsWith(not));
}

/**
 * Kalem tablosunu parça akışından okur.
 *
 * Dilbilgisi: <sıra> <ean> <kod> <kod> <açıklama...> <adet> <birim fiyat> TL
 * %<kdv> <kdv tutarı> TL <tutar> TL. Açıklama birden çok parçaya bölünebiliyor
 * (uzun ürün adları satır atlıyor), bu yüzden akış kelime kelime taranıyor ve
 * açıklama "n,nn" biçimli ilk parçaya (adet) kadar toplanıyor.
 */
function kalemleriOku(parcalar: string[]): { kalemler: Omit<EFaturaKalemi, "seriNolar">[]; hatalar: string[] } {
  const kalemler: Omit<EFaturaKalemi, "seriNolar">[] = [];
  const hatalar: string[] = [];

  let i = 0;
  let beklenenSira = 1;

  while (i < parcalar.length) {
    // Satır başlangıcı: beklenen sıra numarası + hemen ardından bir ürün kodu.
    if (parcalar[i] !== String(beklenenSira) || !KOD_KALIBI.test(parcalar[i + 1] ?? "")) {
      i += 1;
      continue;
    }

    const siraNo = beklenenSira;
    let j = i + 1;

    // Üç kod sütunu: EAN, satıcı ürün kodu, alıcı ürün kodu. Bazı faturalarda
    // alıcı kodu boş geliyor, bu yüzden kaç tane varsa okunuyor. İlki her zaman
    // EAN; sonraki en çok iki sütun model kodu da olabiliyor.
    const kodlar: string[] = [parcalar[j]];
    j += 1;
    while (j < parcalar.length && kodlar.length < 3 && ekKodMu(parcalar[j])) {
      kodlar.push(parcalar[j]);
      j += 1;
    }

    // Açıklama: adet parçasına kadar olan her şey.
    const aciklamaParcalari: string[] = [];
    while (j < parcalar.length && !ADET_KALIBI.test(parcalar[j])) {
      // Bir sonraki satıra taşmışız demektir; bozuk kalem.
      if (parcalar[j] === String(siraNo + 1)) break;
      aciklamaParcalari.push(parcalar[j]);
      j += 1;
    }

    if (j >= parcalar.length || !ADET_KALIBI.test(parcalar[j])) {
      hatalar.push(`${siraNo}. kalemde adet okunamadı.`);
      break;
    }

    const adet = Math.round(Number(parcalar[j].replace(".", "").replace(",", ".")));
    j += 1;

    // Kalan sayısal alanlar: birim fiyat, KDV tutarı, tutar. "TL" ve "%20"
    // ayrı parçalar olarak gelebiliyor, atlıyoruz.
    const tutarlar: number[] = [];
    let kdvOrani = 0;
    while (j < parcalar.length && tutarlar.length < 3) {
      const parca = parcalar[j];
      if (parca === String(siraNo + 1)) break;
      const yuzde = parca.match(/^%\s*(\d{1,2})$/);
      const tutar = tutarParcasi(parca);
      if (yuzde) {
        kdvOrani = Number(yuzde[1]);
      } else if (tutar !== null) {
        tutarlar.push(tutar);
      }
      j += 1;
    }

    if (tutarlar.length < 3) {
      hatalar.push(`${siraNo}. kalemde fiyat sütunları okunamadı.`);
      break;
    }

    const [birimFiyatKurus, , tutarKurus] = tutarlar;

    kalemler.push({
      siraNo,
      barkod: kodNormalize(kodlar[0] ?? ""),
      urunKodlari: kodlar.map((k) => kodNormalize(k)).filter(Boolean),
      urunAdi: aciklamaParcalari.join(" ").replace(/\s+/g, " ").trim(),
      adet,
      birimFiyatKurus,
      kdvOrani,
      tutarKurus,
    });

    beklenenSira += 1;
    i = j;
  }

  return { kalemler, hatalar };
}

export function efaturaCoz(metin: string): EFaturaOkumasi {
  const satirlar = metin.split("\n");
  const parcalar = satirlar.map((s) => s.trim()).filter((s) => s !== "");

  const bos: EFaturaOkumasi = {
    tanindi: false,
    faturaNo: "",
    siparisNo: "",
    faturaTarihi: null,
    vadeTarihi: null,
    tedarikciAdi: "",
    tedarikciVergiNo: "",
    kalemler: [],
    araToplamKurus: null,
    genelToplamKurus: null,
    hatalar: [],
    uyarilar: [],
  };

  if (!efaturaMi(metin)) {
    return {
      ...bos,
      hatalar: [
        "Bu PDF bir e-Fatura düzeninde görünmüyor. Tedarikçinizin e-Fatura " +
          "PDF'ini (ürün tablosu ve seri numarası notu olan) yükleyin.",
      ],
    };
  }

  const faturaNo = etiketDegeri(satirlar, "Fatura No");
  const siparisNo = etiketDegeri(satirlar, "Sipariş No");
  const faturaTarihi = efaturaTarihiCoz(etiketDegeri(satirlar, "Fatura Tarihi"));
  const vadeTarihi = efaturaTarihiCoz(etiketDegeri(satirlar, "Vade Tarihi"));

  const araToplamKurus = tlyiKurusaCevir(
    (etiketDegeri(satirlar, "Ara Toplam").match(/[\d.,]+/) ?? [""])[0],
  );
  const genelToplamKurus = tlyiKurusaCevir(
    (etiketDegeri(satirlar, "Genel Toplam").match(/[\d.,]+/) ?? [""])[0],
  );

  const { kalemler: hamKalemler, hatalar } = kalemleriOku(parcalar);
  const uyarilar: string[] = [];

  if (hamKalemler.length === 0) {
    hatalar.push("Faturada ürün satırı bulunamadı.");
  }
  if (!faturaNo) hatalar.push("Fatura numarası okunamadı.");
  if (!faturaTarihi) hatalar.push("Fatura tarihi okunamadı.");

  const seriHarita = seriNolariTopla(metin);
  const gorulenSeriler = new Map<string, number>();

  const kalemler: EFaturaKalemi[] = hamKalemler.map((k) => {
    const kayit = seriHarita.get(k.siraNo);
    const seriNolar = kayit?.seriler ?? [];

    // Seri notu kalemle SIRA NUMARASI üzerinden eşleşiyor: not zaten
    // "N Numaralı satırdaki" diyor ve bu her faturada var.
    //
    // Nottaki kod yalnız teyit için. Tedarikçi burada bazen EAN, bazen satıcı
    // ürün kodu yazıyor ("MYE73TU/A/1411633" gibi), sonuna da parti numarası
    // ekliyor. Bu yüzden satırın üç kodundan herhangi biriyle başlaması yeterli;
    // hiçbiriyle tutmuyorsa bu bir hata değil, uyarı — sıra numarası bağlayıcı,
    // kod yazımı tedarikçiden tedarikçiye değişiyor.
    if (kayit && !kodTeyitEdildi(kayit.kod, k.urunKodlari)) {
      uyarilar.push(
        `${k.siraNo}. kalemin seri notundaki kod (${kayit.kod}) satırın ` +
          `kodlarıyla eşleşmiyor (${k.urunKodlari.join(", ") || "kod okunamadı"}). ` +
          "Seriler sıra numarasına göre eşleştirildi; aşağıdan kontrol edin.",
      );
    }

    if (seriNolar.length > 0 && seriNolar.length !== k.adet) {
      hatalar.push(
        `${k.siraNo}. kalemde adet ${k.adet} ama ${seriNolar.length} seri numarası var. ` +
          "Fatura eksik okunmuş olabilir.",
      );
    }
    if (seriNolar.length === 0) {
      uyarilar.push(
        `${k.siraNo}. kalem (${k.urunAdi}) için seri numarası yok; ${k.adet} adet ` +
          "seri numarasız cihaz olarak açılacak.",
      );
    }

    for (const seri of seriNolar) {
      const onceki = gorulenSeriler.get(seri);
      if (onceki !== undefined) {
        hatalar.push(`${seri} seri numarası ${onceki}. ve ${k.siraNo}. kalemde birden fazla var.`);
      } else {
        gorulenSeriler.set(seri, k.siraNo);
      }
    }

    // Birim fiyat × adet = satır tutarı. Kuruş yuvarlaması için adet kadar
    // kuruş tolerans bırakılıyor.
    const beklenen = k.birimFiyatKurus * k.adet;
    if (Math.abs(beklenen - k.tutarKurus) > Math.max(k.adet, 1)) {
      hatalar.push(
        `${k.siraNo}. kalemde birim fiyat × adet satır tutarını vermiyor ` +
          `(${beklenen} ≠ ${k.tutarKurus}). Fatura yanlış okunmuş.`,
      );
    }

    if (k.adet <= 0) hatalar.push(`${k.siraNo}. kalemde adet geçersiz: ${k.adet}.`);
    if (!k.barkod) hatalar.push(`${k.siraNo}. kalemde ürün kodu (EAN) okunamadı.`);
    if (!k.urunAdi) hatalar.push(`${k.siraNo}. kalemde ürün adı okunamadı.`);

    return { ...k, seriNolar };
  });

  // Satır toplamları ara toplamı vermeli: bir kalem atlanmışsa burada yakalanır.
  if (araToplamKurus !== null && kalemler.length > 0) {
    const toplam = kalemler.reduce((t, k) => t + k.tutarKurus, 0);
    if (Math.abs(toplam - araToplamKurus) > kalemler.length) {
      hatalar.push(
        "Satır tutarlarının toplamı faturanın ara toplamını tutmuyor " +
          `(${toplam} ≠ ${araToplamKurus}). Bazı satırlar okunamamış olabilir.`,
      );
    }
  }

  return {
    tanindi: true,
    faturaNo,
    siparisNo,
    faturaTarihi,
    vadeTarihi,
    tedarikciAdi: tedarikciAdiBul(satirlar),
    tedarikciVergiNo: tedarikciVergiNoBul(satirlar),
    kalemler,
    araToplamKurus,
    genelToplamKurus,
    hatalar,
    uyarilar,
  };
}

/** Unvan satırı: tamamı büyük harf, rakam yok, en az bir harf var. */
function unvanSatiriMi(satir: string): boolean {
  if (!satir || /\d/.test(satir)) return false;
  if (!/\p{L}/u.test(satir)) return false;
  return satir === satir.toLocaleUpperCase("tr");
}

/**
 * Satıcı unvanı: "Vergi Dairesi" satırının yukarısındaki büyük harfli blok.
 *
 * Arada adres, telefon ve faks satırları var, bu yüzden ilk unvan satırına
 * kadar geriye doğru atlanıyor; sonra blok yukarı doğru toplanıyor. Alıcının
 * unvanı daha yukarıda kaldığı için karışmıyor.
 *
 * Bulunamazsa boş döner — bu yalnız doğru tedarikçiyi önermek için, tedarikçi
 * ekranda zaten seçiliyor.
 */
function tedarikciAdiBul(satirlar: string[]): string {
  const temiz = satirlar.map((s) => s.trim());
  const vergiYeri = temiz.findIndex((s) => /^Vergi Dairesi/i.test(s));
  if (vergiYeri < 0) return "";

  let son = -1;
  for (let i = vergiYeri - 1; i >= 0 && i >= vergiYeri - 25; i--) {
    if (unvanSatiriMi(temiz[i])) {
      son = i;
      break;
    }
  }
  if (son < 0) return "";

  const parcalar: string[] = [];
  for (let i = son; i >= 0 && parcalar.length < 5; i--) {
    if (!unvanSatiriMi(temiz[i])) break;
    parcalar.unshift(temiz[i]);
  }
  return parcalar.join(" ").replace(/\s+/g, " ").trim();
}

function tedarikciVergiNoBul(satirlar: string[]): string {
  // Faturada iki vergi no var: alıcının ve satıcının. Satıcınınki "Vergi
  // Dairesi" / "Mersis" satırlarıyla aynı blokta.
  for (let i = 0; i < satirlar.length; i++) {
    if (!/^Mersis No/i.test(satirlar[i].trim())) continue;
    for (let j = i; j < Math.min(satirlar.length, i + 5); j++) {
      const eslesme = satirlar[j].match(/Vergi No\s*:?\s*(\d{10,11})/i);
      if (eslesme) return eslesme[1];
    }
  }
  return "";
}


/**
 * Okunan e-Faturayı, tedarikçi dosyası ekranının beklediği yapıya çevirir.
 *
 * Böylece PDF kendi ekranını açmıyor: kategori eşleme, seri no çakışma
 * denetimi, önizleme ve kayıt yolu Excel ile aynı kalıyor.
 */
export function efaturadanTedarikciFaturasi(okuma: EFaturaOkumasi): TedarikciDosyaSonucu {
  // Denetimlerden biri bile tutmuyorsa fatura üretilmiyor ve okuma başarısız
  // sayılıyor: ekran hatayı gösterip kullanıcıyı Excel'e yönlendirsin, yanlış
  // okunmuş bir faturadan stok açılmasın.
  if (!okuma.tanindi || okuma.hatalar.length > 0) {
    return { faturalar: [], hatalar: okuma.hatalar, basliklarTamam: false };
  }

  const gruplar: TedarikciUrunGrubu[] = okuma.kalemler.map((kalem) => {
    // Seri numarası verilmişse her seri bir cihaz; verilmemişse adet kadar
    // seri numarasız cihaz açılıyor (aksesuar kalemleri böyle geliyor).
    const cihazlar =
      kalem.seriNolar.length > 0
        ? kalem.seriNolar.map((seriNo) => ({
            excelSatiri: kalem.siraNo,
            seriNo,
            barkod: kalem.barkod,
            urunAdi: kalem.urunAdi,
            marka: markayiTuret(kalem.urunAdi),
            alisFiyatiKurus: kalem.birimFiyatKurus,
          }))
        : Array.from({ length: Math.max(1, Math.min(500, kalem.adet)) }, () => ({
            excelSatiri: kalem.siraNo,
            seriNo: null,
            barkod: kalem.barkod,
            urunAdi: kalem.urunAdi,
            marka: markayiTuret(kalem.urunAdi),
            alisFiyatiKurus: kalem.birimFiyatKurus,
          }));

    return {
      barkod: kalem.barkod,
      urunAdi: kalem.urunAdi,
      marka: markayiTuret(kalem.urunAdi),
      alisFiyatiKurus: kalem.birimFiyatKurus,
      fiyatFarkliMi: false,
      cihazlar,
    };
  });

  const fatura: TedarikciFaturasi = {
    faturaNo: okuma.faturaNo,
    siparisNo: okuma.siparisNo,
    tarih: okuma.faturaTarihi,
    vadeTarihi: okuma.vadeTarihi,
    tedarikciAdi: okuma.tedarikciAdi,
    gruplar,
    cihazSayisi: gruplar.reduce((t, g) => t + g.cihazlar.length, 0),
    toplamKurus: gruplar.reduce((t, g) => t + g.alisFiyatiKurus * g.cihazlar.length, 0),
  };

  return { faturalar: [fatura], hatalar: okuma.uyarilar, basliklarTamam: true };
}
