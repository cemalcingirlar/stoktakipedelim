import assert from "node:assert/strict";
import { test } from "node:test";
import { yerelIstekMi } from "./yerelIstek";

const b = (girdi: Record<string, string>) => new Headers(girdi);

test("zamanlanmış görevin isteği yerel sayılıyor", () => {
  assert.equal(yerelIstekMi(b({ host: "127.0.0.1:3000" })), true);
  assert.equal(yerelIstekMi(b({ host: "localhost:3000" })), true);
  assert.equal(yerelIstekMi(b({ host: "localhost" })), true);
  assert.equal(yerelIstekMi(b({ host: "[::1]:3000" })), true);
});

test("tünelden gelen istek dışarıdan sayılıyor", () => {
  assert.equal(
    yerelIstekMi(b({ host: "stok.example.com", "cf-connecting-ip": "203.0.113.7", "cf-ray": "abc" })),
    false,
  );
});

test("Host yerel görünse bile Cloudflare başlığı varsa dışarıdan", () => {
  // Host istemcinin elinde; Cloudflare'in yazdığı başlık değil.
  assert.equal(yerelIstekMi(b({ host: "127.0.0.1:3000", "cf-connecting-ip": "203.0.113.7" })), false);
  assert.equal(yerelIstekMi(b({ host: "127.0.0.1:3000", "cf-ray": "abc" })), false);
  assert.equal(yerelIstekMi(b({ host: "localhost", "cdn-loop": "cloudflare" })), false);
});

test("alan adıyla gelen istek başlıksız da olsa dışarıdan", () => {
  assert.equal(yerelIstekMi(b({ host: "stok.example.com" })), false);
  assert.equal(yerelIstekMi(b({ host: "127.0.0.1.example.com" })), false);
  assert.equal(yerelIstekMi(b({ host: "localhost.example.com:3000" })), false);
});

test("Host yoksa yerel sayılmıyor", () => {
  assert.equal(yerelIstekMi(b({})), false);
  assert.equal(yerelIstekMi(b({ host: "" })), false);
});

test("Next'in kendi eklediği iletme başlıkları yerel isteği dışarıdan saydırmıyor", () => {
  // Next her isteğe x-forwarded-* ekliyor; bunlara bakılsaydı zamanlanmış
  // yedeğin kendisi reddedilirdi.
  assert.equal(
    yerelIstekMi(
      b({
        host: "127.0.0.1:3000",
        "x-forwarded-for": "127.0.0.1",
        "x-forwarded-host": "127.0.0.1:3000",
        "x-forwarded-proto": "http",
        "x-forwarded-port": "3000",
      }),
    ),
    true,
  );
});
