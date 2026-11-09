import assert from "node:assert/strict";
import { test } from "node:test";
import { gunOrtasi, saatYaz, tarihSaatYaz, tarihYaz,
  hareketAni,
} from "./tarih";

const AN = new Date("2026-10-23T22:30:00Z"); // UTC'de 23 Ekim, Türkiye'de 24 Ekim

/** Testi dilimden bağımsız kılmak için: dilimi geçici değiştirip geri koyar. */
function dilimde<T>(dilim: string, is: () => T): T {
  const onceki = process.env.TZ;
  process.env.TZ = dilim;
  try {
    return is();
  } finally {
    if (onceki === undefined) delete process.env.TZ;
    else process.env.TZ = onceki;
  }
}

test("boş tarih boş metin verir", () => {
  assert.equal(tarihYaz(null), "");
  assert.equal(tarihSaatYaz(undefined), "");
  assert.equal(saatYaz(""), "");
});

test("tarih seçili dilime göre yazılıyor", () => {
  assert.equal(
    dilimde("Europe/Istanbul", () => tarihYaz(AN)),
    "24.10.2026",
  );
  assert.equal(
    dilimde("UTC", () => tarihYaz(AN)),
    "23.10.2026",
  );
});

test("saat seçili dilime göre yazılıyor", () => {
  assert.equal(
    dilimde("Europe/Istanbul", () => saatYaz(AN)),
    "01:30",
  );
  assert.equal(
    dilimde("UTC", () => saatYaz(AN)),
    "22:30",
  );
});

/**
 * Asıl mesele bu: biçimlendiriciler modül seviyesinde bir kez
 * oluşturulduğunda, saat dilimi sonradan değiştiğinde (Ayarlar'dan
 * seçilince, istek başında uygulanır) eski dilimde kalıyorlardı. Aynı
 * biçimlendirmeyi iki dilimde sırayla çağırmak bunu yakalar.
 */
test("dilim değişince önceki çağrının biçimi yapışıp kalmıyor", () => {
  const istanbul = dilimde("Europe/Istanbul", () => tarihSaatYaz(AN));
  const utc = dilimde("UTC", () => tarihSaatYaz(AN));
  const istanbulTekrar = dilimde("Europe/Istanbul", () => tarihSaatYaz(AN));

  assert.equal(istanbul, "24.10.2026 01:30");
  assert.equal(utc, "23.10.2026 22:30");
  assert.equal(
    istanbulTekrar,
    istanbul,
    "dilim geri alınınca eski çıktı dönmeli",
  );
});

test("gün ortası yerel öğlene sabitler", () => {
  // Saat de yazım da aynı dilim içinde okunuyor: dışarıda okunursa
  // kapsayıcının dilimi (UTC) devreye girer.
  dilimde("Europe/Istanbul", () => {
    const t = gunOrtasi(2026, 11, 8);
    assert.equal(t.getHours(), 12);
    assert.equal(tarihYaz(t), "08.12.2026");
  });
});

test("gün ortası ±12 saat dilim farkında gün kaydırmıyor", () => {
  // Gerçek hata buydu: sunucu Türkiye'de, tarayıcı UTC'de kalmış olunca
  // gece yarısına sabitlenen e-fatura vade tarihi 08.12 yerine 07.12
  // görünüyordu. Aynı anı iki dilimde yazdırıp karşılaştırıyoruz.
  const an = dilimde("Europe/Istanbul", () => gunOrtasi(2026, 11, 8));
  assert.equal(
    dilimde("UTC", () => tarihYaz(an)),
    "08.12.2026",
  );
  assert.equal(
    dilimde("America/New_York", () => tarihYaz(an)),
    "08.12.2026",
  );
  assert.equal(
    dilimde("Asia/Tokyo", () => tarihYaz(an)),
    "08.12.2026",
  );
});

test("gece yarısına sabitlenen gün dilim farkında kayıyor", () => {
  // Karşılaştırma için: öğlen yerine gece yarısı seçilse ne olurdu.
  const geceYarisi = dilimde("Europe/Istanbul", () => new Date(2026, 11, 8));
  assert.equal(
    dilimde("UTC", () => tarihYaz(geceYarisi)),
    "07.12.2026",
  );
});

// ------------------------------------------------------- hareket zaman damgası

test("bugüne tarihlenen hareket gerçek saati taşıyor", () => {
  // Tarihçede her satır "03:00" yazıyordu: damga iş gününden alınıyor ve o
  // alan UTC gece yarısına düşüyordu.
  const simdi = new Date(2026, 10, 9, 14, 37, 12);
  const isGunu = new Date(2026, 10, 9); // <input type="date"> değeri
  assert.deepEqual(hareketAni(isGunu, simdi), simdi);
});

test("gün sonunda yapılan işlem yine o günün saatini taşıyor", () => {
  const simdi = new Date(2026, 10, 9, 23, 58);
  assert.deepEqual(hareketAni(new Date(2026, 10, 9), simdi), simdi);
});

test("geçmişe tarihlenen hareket o günün ortasına yazılıyor", () => {
  // Saat bilinmiyor; gece yarısı yazmak saat dilimi farkında günü kaydırır.
  const simdi = new Date(2026, 10, 9, 14, 0);
  const damga = hareketAni(new Date(2026, 10, 2), simdi);
  assert.equal(damga.getDate(), 2);
  assert.equal(damga.getHours(), 12);
});

test("tarih verilmemişse şu an kullanılıyor", () => {
  const simdi = new Date(2026, 10, 9, 9, 15);
  assert.deepEqual(hareketAni(null, simdi), simdi);
  assert.deepEqual(hareketAni(undefined, simdi), simdi);
  assert.deepEqual(hareketAni(new Date("gecersiz"), simdi), simdi);
});

test("ileri tarihli kayıt da o günün ortasına yazılıyor", () => {
  const simdi = new Date(2026, 10, 9, 14, 0);
  const damga = hareketAni(new Date(2026, 10, 12), simdi);
  assert.equal(damga.getDate(), 12);
  assert.equal(damga.getHours(), 12);
});
