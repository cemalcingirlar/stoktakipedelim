import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EN_COK_CIHAZ,
  EN_COK_GRUP,
  aramaYeterliMi,
  kesintiUyarisi,
  sonucuKisalt,
  grupAciklamasi,
  grupEtiketi,
  grupFiyatMetni,
  gecmisUrunAciklamasi,
  gecmisUrunEtiketi,
  gruplaGecmisUrunler,
  gruplaUrunler,
  secimSorulmali,
  sonucYokMesaji,
  type AranabilirCihaz,
  type GecmisKayit,
} from "./urunArama";

function cihaz(
  ozel: Partial<AranabilirCihaz> & { id: number },
): AranabilirCihaz {
  return {
    marka: "Samsung",
    model: "Galaxy A55",
    barkod: "8690000000001",
    seriNo: null,
    kategori: "Cep Telefonu",
    magazaAdi: "KOZAN CADDESİ",
    alisFiyatiKurus: 1000000,
    ...ozel,
  };
}

test("arama en az iki karakter ister", () => {
  assert.equal(aramaYeterliMi(""), false);
  assert.equal(aramaYeterliMi(" a "), false);
  assert.equal(aramaYeterliMi("ab"), true);
  assert.equal(aramaYeterliMi(" airpods "), true);
});

test("aynı barkodtaki cihazlar tek satırda toplanır", () => {
  const gruplar = gruplaUrunler([
    cihaz({ id: 1 }),
    cihaz({ id: 2 }),
    cihaz({ id: 3 }),
  ]);
  assert.equal(gruplar.length, 1, "20 adet aksesuar 20 satır dökmemeli");
  assert.equal(gruplar[0].adet, 3);
  assert.deepEqual(gruplar[0].cihazIdleri, [1, 2, 3]);
});

test("farklı barkodlar ayrı gruplar", () => {
  const gruplar = gruplaUrunler([
    cihaz({ id: 1, barkod: "111", marka: "Anker", model: "Powerbank" }),
    cihaz({ id: 2, barkod: "222", marka: "Anker", model: "Powerbank" }),
  ]);
  // Aynı marka/model farklı barkodla iki ayrı üründür; birleştirmek yanlış olur.
  assert.equal(gruplar.length, 2);
});

test("barkodsuz ürünler marka ve modele göre gruplanır", () => {
  const gruplar = gruplaUrunler([
    cihaz({ id: 1, barkod: null, marka: "Ttec", model: "Kablo" }),
    cihaz({ id: 2, barkod: null, marka: "TTEC", model: "KABLO" }),
  ]);
  assert.equal(
    gruplar.length,
    1,
    "büyük/küçük harf farkı ayrı ürün sayılmamalı",
  );
  assert.equal(gruplar[0].adet, 2);
});

test("gruplar ada göre sıralanır", () => {
  const gruplar = gruplaUrunler([
    cihaz({ id: 1, barkod: "1", marka: "Zyxel", model: "Modem" }),
    cihaz({ id: 2, barkod: "2", marka: "Anker", model: "Kablo" }),
    cihaz({ id: 3, barkod: "3", marka: "Çınar", model: "Kılıf" }),
  ]);
  assert.deepEqual(gruplar.map(grupEtiketi), [
    "Anker Kablo",
    "Çınar Kılıf",
    "Zyxel Modem",
  ]);
});

test("seri numaralı cihazlar listede önce gelir", () => {
  // Sıra cihazSecimi.ts ile aynı olmalı: listede görünen fiyat, seçilince
  // gelen cihazın fiyatı olsun.
  const gruplar = gruplaUrunler([
    cihaz({ id: 5, seriNo: null }),
    cihaz({ id: 3, seriNo: "350000000000002" }),
    cihaz({ id: 4, seriNo: "350000000000001" }),
  ]);
  assert.deepEqual(gruplar[0].cihazIdleri, [4, 3, 5]);
});

test("mağazalar tekilleştirilip toplanır", () => {
  const gruplar = gruplaUrunler([
    cihaz({ id: 1, magazaAdi: "KOZAN CADDESİ" }),
    cihaz({ id: 2, magazaAdi: "OPTİMUM AVM" }),
    cihaz({ id: 3, magazaAdi: "KOZAN CADDESİ" }),
  ]);
  assert.deepEqual(gruplar[0].magazalar, ["KOZAN CADDESİ", "OPTİMUM AVM"]);
});

test("tek fiyatlı grupta tek rakam yazılır", () => {
  const gruplar = gruplaUrunler([cihaz({ id: 1 }), cihaz({ id: 2 })]);
  assert.equal(grupFiyatMetni(gruplar[0]), "10.000,00 TL");
});

test("fiyatları farklı grupta aralık yazılır", () => {
  // Satış fiyatı alış fiyatıyla dolu geldiği için tek rakam yazmak yanıltırdı.
  const gruplar = gruplaUrunler([
    cihaz({ id: 1, alisFiyatiKurus: 900000 }),
    cihaz({ id: 2, alisFiyatiKurus: 1200000 }),
  ]);
  assert.equal(grupFiyatMetni(gruplar[0]), "9.000,00 – 12.000,00 TL");
  assert.equal(gruplar[0].enDusukAlisKurus, 900000);
  assert.equal(gruplar[0].enYuksekAlisKurus, 1200000);
});

test("açıklamada adet, kategori, mağaza ve barkod var", () => {
  const gruplar = gruplaUrunler([
    cihaz({ id: 1 }),
    cihaz({ id: 2, magazaAdi: "OPTİMUM AVM" }),
  ]);
  const metin = grupAciklamasi(gruplar[0]);
  assert.match(metin, /2 adet/);
  assert.match(metin, /Cep Telefonu/);
  assert.match(metin, /KOZAN CADDESİ, OPTİMUM AVM/);
  assert.match(metin, /8690000000001/);
});

test("barkodsuz üründe açıklamada barkod yazmaz", () => {
  const gruplar = gruplaUrunler([cihaz({ id: 1, barkod: null })]);
  assert.doesNotMatch(grupAciklamasi(gruplar[0]), /·\s*$/);
  assert.equal(gruplar[0].barkod, null);
});

test("boş listeden grup çıkmaz", () => {
  assert.deepEqual(gruplaUrunler([]), []);
});

test("sonuç yok mesajı aranan metni söyler", () => {
  assert.equal(
    sonucYokMesaji("  airpods "),
    '"airpods" için stokta ürün bulunamadı.',
  );
});

test("seri numarasız özdeş ürünlerde seçim sorulmaz", () => {
  // 3 adet aynı powerbank birbirinin aynısı; hangisi diye sormak anlamsız
  // bir tıklama olurdu.
  assert.equal(
    secimSorulmali([{ seriNo: null }, { seriNo: null }, { seriNo: "" }]),
    false,
  );
});

test("seri numaralı cihaz varsa seçim sorulur", () => {
  // IMEI'si olan cihazlarda hangisinin satıldığı önemli: maliyetleri farklı
  // olabiliyor ve müşteriye giden cihazın numarası kayda geçmeli.
  assert.equal(
    secimSorulmali([{ seriNo: "350000000000001" }, { seriNo: null }]),
    true,
  );
  assert.equal(secimSorulmali([{ seriNo: "350000000000001" }]), true);
});

// ------------------------------------------------- Alış faturası ekranı

function gecmis(ozel: Partial<GecmisKayit> = {}): GecmisKayit {
  return {
    barkod: "8690000000001",
    marka: "Apple",
    model: "AirPods 4",
    kategoriAdi: "Aksesuar",
    altKategoriAdi: "Kulaklık",
    alisFiyatiKurus: 958833,
    girisTarihi: new Date("2026-10-01"),
    ...ozel,
  };
}

test("aynı barkodun geçmiş girişleri tek kartta toplanır", () => {
  const kartlar = gruplaGecmisUrunler([gecmis(), gecmis(), gecmis()]);
  assert.equal(kartlar.length, 1);
  assert.equal(kartlar[0].toplamAdet, 3);
});

test("kart bilgisi en son girişten alınır", () => {
  // Aynı barkod yıllar içinde farklı fiyatlarla girilebiliyor; kullanıcı en
  // güncel fiyatı bekler.
  const kartlar = gruplaGecmisUrunler([
    gecmis({
      alisFiyatiKurus: 100000,
      girisTarihi: new Date("2026-01-01"),
      model: "ESKİ",
    }),
    gecmis({
      alisFiyatiKurus: 958833,
      girisTarihi: new Date("2026-10-01"),
      model: "YENİ",
    }),
    gecmis({
      alisFiyatiKurus: 500000,
      girisTarihi: new Date("2026-05-01"),
      model: "ORTA",
    }),
  ]);
  assert.equal(kartlar[0].sonAlisKurus, 958833);
  assert.equal(kartlar[0].model, "YENİ");
  assert.equal(kartlar[0].toplamAdet, 3);
});

test("barkodsuz kayıtlar listeye girmez", () => {
  // Seçildiğinde okutulacak bir kod yok; listede göstermek işe yaramaz.
  assert.deepEqual(gruplaGecmisUrunler([gecmis({ barkod: null })]), []);
});

test("kartlar en son girilenden eskiye sıralanır", () => {
  const kartlar = gruplaGecmisUrunler([
    gecmis({ barkod: "1", model: "ESKİ", girisTarihi: new Date("2026-01-01") }),
    gecmis({ barkod: "2", model: "YENİ", girisTarihi: new Date("2026-10-01") }),
  ]);
  assert.deepEqual(
    kartlar.map((k) => k.model),
    ["YENİ", "ESKİ"],
  );
});

test("geçmiş ürün açıklamasında kategori, barkod ve adet var", () => {
  const kartlar = gruplaGecmisUrunler([gecmis(), gecmis()]);
  const metin = gecmisUrunAciklamasi(kartlar[0]);
  assert.match(metin, /Aksesuar \/ Kulaklık/);
  assert.match(metin, /8690000000001/);
  assert.match(metin, /2 adet girilmiş/);
  assert.equal(gecmisUrunEtiketi(kartlar[0]), "Apple AirPods 4");
});

test("alt kategorisi olmayan üründe yalnız kategori yazılır", () => {
  const kartlar = gruplaGecmisUrunler([gecmis({ altKategoriAdi: null })]);
  assert.match(gecmisUrunAciklamasi(kartlar[0]), /^Aksesuar ·/);
});

test("sınırın altındaki sonuç kesilmemiş sayılır", () => {
  const sonuc = sonucuKisalt([1, 2, 3], 5);
  assert.deepEqual(sonuc.gruplar, [1, 2, 3]);
  assert.equal(sonuc.kesildi, false);
});

test("sınıra tam oturan sonuç kesilmemiş sayılır", () => {
  // Tam sınır kadar sonuç varsa gerçekten hepsi gösteriliyor; uyarı yanlış
  // olurdu.
  const sonuc = sonucuKisalt([1, 2, 3], 3);
  assert.equal(sonuc.gruplar.length, 3);
  assert.equal(sonuc.kesildi, false);
});

test("sınırı aşan sonuç kısaltılır ve kesildi işaretlenir", () => {
  const sonuc = sonucuKisalt([1, 2, 3, 4], 3);
  assert.deepEqual(sonuc.gruplar, [1, 2, 3]);
  assert.equal(sonuc.kesildi, true);
});

test("sonucuKisalt varsayılan sınırı 30 ürün", () => {
  const tumu = Array.from({ length: 31 }, (_, i) => i);
  const sonuc = sonucuKisalt(tumu);
  assert.equal(EN_COK_GRUP, 30);
  assert.equal(sonuc.gruplar.length, 30);
  assert.equal(sonuc.kesildi, true);
});

test("kesilmeyen sonuçta uyarı yok", () => {
  assert.equal(kesintiUyarisi({ kesildi: false }), null);
});

test("kesilen sonuçta uyarı sınırı ve ne yapılacağını söyler", () => {
  const uyari = kesintiUyarisi({ kesildi: true });
  assert.ok(uyari);
  assert.match(uyari, /30/);
  assert.match(uyari, /daralt/i);
});

test("uyarı verilen sınırı kullanır", () => {
  assert.match(kesintiUyarisi({ kesildi: true }, 500)!, /500/);
});

test("cihaz sınırına dayanıldıysa grup sayısı azken de kesildi sayılır", () => {
  // 500 cihaz tek modele düşerse grup sayısı 1 olur; grup sınırına bakmak
  // sonucun eksik olduğunu gizlerdi.
  const sonuc = sonucuKisalt([1], EN_COK_GRUP, true);
  assert.equal(sonuc.gruplar.length, 1);
  assert.equal(sonuc.kesildi, true);
});

test("cihaz aramasında veritabanı sınırı 500 cihaz", () => {
  assert.equal(EN_COK_CIHAZ, 500);
});
