import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ayiriciBul,
  htmldenMatris,
  metindenMatris,
  xmlTablodanMatris,
} from "./tablo";

test("Türkçe Excel CSV'sinde ayırıcı noktalı virgül bulunur", () => {
  assert.equal(ayiriciBul("Marka;Model;Fiyat\nSamsung;A55;12.500,00"), ";");
});

test("sekmeli dosyada ayırıcı sekme bulunur", () => {
  assert.equal(ayiriciBul("Marka\tModel\nSamsung\tA55"), "\t");
});

test("virgüllü dosyada ayırıcı virgül bulunur", () => {
  assert.equal(ayiriciBul("Marka,Model\nSamsung,A55"), ",");
});

test("ayırıcı yoksa noktalı virgüle düşer", () => {
  assert.equal(ayiriciBul("Marka"), ";");
});

test("CSV satır ve hücrelere bölünür", () => {
  const m = metindenMatris("Marka;Model\nSamsung;Galaxy A55\nApple;iPhone 15");
  assert.deepEqual(m, [
    ["Marka", "Model"],
    ["Samsung", "Galaxy A55"],
    ["Apple", "iPhone 15"],
  ]);
});

test("tırnak içindeki ayırıcı hücreyi bölmez", () => {
  const m = metindenMatris('Ad;Not\n"Samsung";"Siyah; 256 GB"');
  assert.deepEqual(m[1], ["Samsung", "Siyah; 256 GB"]);
});

test("tırnak içindeki satır sonu korunur", () => {
  const m = metindenMatris('Ad;Not\n"A";"ilk\nikinci"');
  assert.equal(m.length, 2);
  assert.equal(m[1][1], "ilk\nikinci");
});

test("iki tırnak tek tırnağa iner", () => {
  const m = metindenMatris('Ad\n"13"" ekran"');
  assert.equal(m[1][0], '13" ekran');
});

test("Windows satır sonu fazladan satır üretmez", () => {
  const m = metindenMatris("Marka;Model\r\nSamsung;A55\r\n");
  assert.deepEqual(m, [
    ["Marka", "Model"],
    ["Samsung", "A55"],
  ]);
});

test("boş satırlar atılır", () => {
  const m = metindenMatris("Marka;Model\n\n;\nSamsung;A55\n");
  assert.deepEqual(m, [
    ["Marka", "Model"],
    ["Samsung", "A55"],
  ]);
});

test("boş hücreler yerini korur", () => {
  const m = metindenMatris("a;b;c\n1;;3");
  assert.deepEqual(m[1], ["1", "", "3"]);
});

test("HTML tablosu okunur ve etiketler atılır", () => {
  const html = `<html><body><table>
    <tr><th>Marka</th><th>Model</th></tr>
    <tr><td><b>Samsung</b></td><td>Galaxy&nbsp;A55</td></tr>
  </table></body></html>`;
  assert.deepEqual(htmldenMatris(html), [
    ["Marka", "Model"],
    ["Samsung", "Galaxy A55"],
  ]);
});

test("HTML varlıkları çözülür", () => {
  const html = "<table><tr><td>A&amp;B</td><td>5&lt;6</td><td>&#304;stanbul</td></tr></table>";
  assert.deepEqual(htmldenMatris(html), [["A&B", "5<6", "İstanbul"]]);
});

test("sayfadaki en büyük tablo veri tablosu kabul edilir", () => {
  const html = `
    <table><tr><td>Menü</td></tr></table>
    <table>
      <tr><td>Marka</td><td>Model</td></tr>
      <tr><td>Samsung</td><td>A55</td></tr>
      <tr><td>Apple</td><td>15</td></tr>
    </table>`;
  const m = htmldenMatris(html);
  assert.equal(m.length, 3);
  assert.deepEqual(m[0], ["Marka", "Model"]);
});

test("tablo yoksa boş matris döner", () => {
  assert.deepEqual(htmldenMatris("<html><body>merhaba</body></html>"), []);
});

test("br etiketi boşluğa dönüşür", () => {
  const html = "<table><tr><td>ilk<br>ikinci</td></tr></table>";
  assert.deepEqual(htmldenMatris(html), [["ilk ikinci"]]);
});

test("XML Spreadsheet çıktısı okunur", () => {
  const xml = `<?xml version="1.0"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
   <Worksheet ss:Name="Sayfa1"><Table>
    <Row><Cell><Data ss:Type="String">Marka</Data></Cell><Cell><Data ss:Type="String">Model</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">Samsung</Data></Cell><Cell><Data ss:Type="Number">55</Data></Cell></Row>
   </Table></Worksheet></Workbook>`;
  assert.deepEqual(xmlTablodanMatris(xml), [
    ["Marka", "Model"],
    ["Samsung", "55"],
  ]);
});

test("XML'de boş hücre yerini korur", () => {
  const xml =
    "<Row><Cell><Data>1</Data></Cell><Cell></Cell><Cell><Data>3</Data></Cell></Row>";
  assert.deepEqual(xmlTablodanMatris(xml), [["1", "", "3"]]);
});
