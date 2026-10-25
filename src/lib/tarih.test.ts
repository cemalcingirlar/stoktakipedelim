import assert from "node:assert/strict";
import { test } from "node:test";
import { gunOrtasi, saatYaz, tarihSaatYaz, tarihYaz } from "./tarih";

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
