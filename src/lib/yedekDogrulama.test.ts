import assert from "node:assert/strict";
import { test } from "node:test";
import { boyutSorunu, butunlukSorunu, yedegiDogrula } from "./yedekDogrulama";

test("integrity_check 'ok' derse sorun yok", () => {
  assert.equal(butunlukSorunu("ok"), null);
  assert.equal(butunlukSorunu(" ok \n"), null);
  assert.equal(butunlukSorunu("OK"), null);
});

test("integrity_check hata sayarsa sorun bildirilir", () => {
  const sorun = butunlukSorunu(
    "*** in database main ***\nPage 42 is never used",
  );
  assert.ok(sorun);
  assert.match(sorun, /bütünlük kontrolünden geçmedi/i);
  // Çıktı onlarca satır olabiliyor; mesaj ilk satırla sınırlı kalmalı.
  assert.ok(!sorun.includes("Page 42"), "yalnız ilk satır alınmalı");
});

test("boş cevap da sorun sayılır", () => {
  assert.match(butunlukSorunu("")!, /cevap vermedi/);
});

test("boyutlar eşitse sorun yok", () => {
  assert.equal(boyutSorunu(1234, 1234), null);
});

test("yarım yükleme yakalanıyor", () => {
  const sorun = boyutSorunu(1234, 900);
  assert.ok(sorun);
  assert.match(sorun, /yarım kalmış/);
  assert.match(sorun, /900/);
  assert.match(sorun, /1234/);
});

test("boş yedek dosyası sorun", () => {
  assert.match(boyutSorunu(0, 0)!, /boş/);
});

test("uzak boyut bilinmiyorsa boyut sorunu yok", () => {
  assert.equal(boyutSorunu(1234, null), null);
});

test("her şey yolundaysa doğrulandı", () => {
  const sonuc = yedegiDogrula({
    butunluk: "ok",
    yerelBayt: 500,
    uzakBayt: 500,
  });
  assert.equal(sonuc.tamam, true);
  assert.equal(sonuc.sorun, null);
  assert.match(sonuc.metin, /doğrulandı/);
});

test("bozuk veritabanı doğrulamayı düşürür", () => {
  const sonuc = yedegiDogrula({
    butunluk: "*** in database main ***",
    yerelBayt: 500,
    uzakBayt: 500,
  });
  assert.equal(sonuc.tamam, false);
  assert.ok(sonuc.sorun);
});

test("yarım yükleme doğrulamayı düşürür", () => {
  const sonuc = yedegiDogrula({ butunluk: "ok", yerelBayt: 500, uzakBayt: 10 });
  assert.equal(sonuc.tamam, false);
  assert.match(sonuc.sorun!, /yarım/);
});

test("bütünlük kontrolü hiç yapılamadıysa doğrulanmış sayılmaz", () => {
  const sonuc = yedegiDogrula({
    butunluk: null,
    yerelBayt: 500,
    uzakBayt: 500,
  });
  assert.equal(sonuc.tamam, false);
  assert.match(sonuc.metin, /yapılamadı/);
});

test("boyut okunamadıysa doğrulanmış sayılmaz ama hata da değil", () => {
  // Drive bazı yapılandırmalarda boyut döndürmüyor: bunu başarı saymak
  // doğrulamayı anlamsız kılardı, hata saymak da yedeği boşa harcardı.
  const sonuc = yedegiDogrula({
    butunluk: "ok",
    yerelBayt: 500,
    uzakBayt: null,
  });
  assert.equal(sonuc.tamam, false);
  assert.equal(sonuc.sorun, null);
  assert.match(sonuc.metin, /okunamadı/);
});
