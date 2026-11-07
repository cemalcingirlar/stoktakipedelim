// SQLite sorgu planlayıcısının istatistiklerini tazeler.
//
// Planlayıcı, istatistik yoksa hangi dizini kullanacağını tahminle seçiyor:
// "satılmış cihazlar" gibi tablonun çoğunu kapsayan bir koşulu dar sanıp
// yanlış dizine gidebiliyor. ANALYZE sqlite_stat1 tablosunu dolduruyor ve
// seçim gerçek dağılıma göre yapılıyor. Veri büyüdükçe dağılım değiştiği
// için her güncellemede tekrar çalıştırılıyor (saniyenin altında sürüyor).
import Database from "better-sqlite3";

const url = process.env.DATABASE_URL ?? "";
const yol = url.startsWith("file:") ? url.slice(5) : url;
if (!yol) {
  console.error("DATABASE_URL tanımlı değil; istatistik tazelenmedi.");
  process.exit(0); // Güncellemeyi düşürmeye değmez.
}

try {
  const db = new Database(yol);
  const bas = Date.now();
  db.exec("ANALYZE;");
  db.close();
  console.log(`veritabanı istatistikleri tazelendi (${Date.now() - bas} ms)`);
} catch (hata) {
  console.error(`istatistik tazelenemedi: ${hata.message}`);
}
