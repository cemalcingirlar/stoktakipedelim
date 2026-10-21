import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aramaYeterliMi,
  grupAciklamasi,
  grupEtiketi,
  grupFiyatMetni,
  gruplaUrunler,
  secimSorulmali,
  sonucYokMesaji,
  type AranabilirCihaz,
} from "./urunArama";

function cihaz(ozel: Partial<AranabilirCihaz> & { id: number }): AranabilirCihaz {
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
  const gruplar = gruplaUrunler([cihaz({ id: 1 }), cihaz({ id: 2 }), cihaz({ id: 3 })]);
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
  assert.equal(gruplar.length, 1, "büyük/küçük harf farkı ayrı ürün sayılmamalı");
  assert.equal(gruplar[0].adet, 2);
});

test("gruplar ada göre sıralanır", () => {
  const gruplar = gruplaUrunler([
    cihaz({ id: 1, barkod: "1", marka: "Zyxel", model: "Modem" }),
    cihaz({ id: 2, barkod: "2", marka: "Anker", model: "Kablo" }),
    cihaz({ id: 3, barkod: "3", marka: "Çınar", model: "Kılıf" }),
  ]);
  assert.deepEqual(gruplar.map(grupEtiketi), ["Anker Kablo", "Çınar Kılıf", "Zyxel Modem"]);
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
  const gruplar = gruplaUrunler([cihaz({ id: 1 }), cihaz({ id: 2, magazaAdi: "OPTİMUM AVM" })]);
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
  assert.equal(sonucYokMesaji("  airpods "), '"airpods" için stokta ürün bulunamadı.');
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
  assert.equal(secimSorulmali([{ seriNo: "350000000000001" }, { seriNo: null }]), true);
  assert.equal(secimSorulmali([{ seriNo: "350000000000001" }]), true);
});
