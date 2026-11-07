// Veritabanı bakımı: WAL toparlama, istatistik tazeleme, gerekirse VACUUM.
//
// Sunucu güncelleme betiği servisi durdurduktan sonra çağırıyor; yani bu üç
// işlem çalışırken veritabanına yazan başka kimse olmuyor.
//
//   ANALYZE  — Planlayıcı istatistik yoksa hangi dizini kullanacağını
//              tahminle seçiyor; "satılmış cihazlar" gibi tablonun çoğunu
//              kapsayan bir koşulu dar sanıp yanlış dizine gidebiliyor.
//   WAL      — Yazma günlüğü büyüyüp öyle kalabiliyor; TRUNCATE ile ana
//              dosyaya işlenip sıfırlanıyor.
//   VACUUM   — Silinen kayıtların boşluğu dosyada kalıyor. Her seferinde
//              çalıştırmak israf (dosyayı baştan yazıyor), bu yüzden yalnız
//              boşluk %20'yi geçince.
import Database from "better-sqlite3";

const url = process.env.DATABASE_URL ?? "";
const yol = url.startsWith("file:") ? url.slice(5) : url;
if (!yol) {
  console.error("DATABASE_URL tanımlı değil; bakım atlandı.");
  process.exit(0); // Güncellemeyi düşürmeye değmez.
}

/** Boşluk oranı: serbest sayfa / toplam sayfa. */
function bosOran(db) {
  const toplam = db.pragma("page_count", { simple: true });
  const serbest = db.pragma("freelist_count", { simple: true });
  return toplam > 0 ? serbest / toplam : 0;
}

try {
  const db = new Database(yol);
  const bas = Date.now();

  db.pragma("wal_checkpoint(TRUNCATE)");
  db.exec("ANALYZE;");

  const oran = bosOran(db);
  if (oran > 0.2) {
    const oncekiMB = db.pragma("page_count", { simple: true }) *
      db.pragma("page_size", { simple: true }) / 1048576;
    db.exec("VACUUM;");
    const sonrakiMB = db.pragma("page_count", { simple: true }) *
      db.pragma("page_size", { simple: true }) / 1048576;
    console.log(
      `bakım tamam: WAL toparlandı, istatistik tazelendi, VACUUM ` +
        `(${oncekiMB.toFixed(1)} MB → ${sonrakiMB.toFixed(1)} MB) · ${Date.now() - bas} ms`,
    );
  } else {
    console.log(
      `bakım tamam: WAL toparlandı, istatistik tazelendi ` +
        `(boşluk %${Math.round(oran * 100)}, VACUUM gerekmedi) · ${Date.now() - bas} ms`,
    );
  }
  db.close();
} catch (hata) {
  console.error(`veritabanı bakımı yapılamadı: ${hata.message}`);
}
