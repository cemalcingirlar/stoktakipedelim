// Google Drive yenileme jetonu (refresh token) alma betiği.
//
// Kullanım (sunucuda bir kez çalıştırılır):
//   GOOGLE_ISTEMCI_ID=... GOOGLE_ISTEMCI_SIRRI=... node betikler/drive-jeton-al.mjs
//
// Betik bir izin bağlantısı yazar. Bağlantıyı tarayıcıda açıp Google hesabınızla
// izin verdikten sonra ekrana düşen kodu buraya yapıştırın; betik yenileme
// jetonunu basar. Jetonu .env dosyasındaki GOOGLE_YENILEME_JETONU değerine yazın.

import { createInterface } from "node:readline/promises";
import { google } from "googleapis";

const istemciId = process.env.GOOGLE_ISTEMCI_ID;
const istemciSirri = process.env.GOOGLE_ISTEMCI_SIRRI;

if (!istemciId || !istemciSirri) {
  console.error(
    "GOOGLE_ISTEMCI_ID ve GOOGLE_ISTEMCI_SIRRI ortam değişkenleri gerekli.\n" +
      "Google Cloud Console > Credentials > OAuth client ID (Desktop app) ile oluşturun.",
  );
  process.exit(1);
}

// Masaüstü istemcileri için Google'ın kod-kopyala akışı.
const YONLENDIRME = "urn:ietf:wg:oauth:2.0:oob";
const KAPSAM = ["https://www.googleapis.com/auth/drive.file"];

const istemci = new google.auth.OAuth2(istemciId, istemciSirri, YONLENDIRME);

const url = istemci.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // her seferinde refresh_token dönmesi için
  scope: KAPSAM,
});

console.log("\n1) Aşağıdaki bağlantıyı tarayıcıda açın ve izin verin:\n");
console.log(url);
console.log("\n2) Google'ın verdiği kodu buraya yapıştırın.\n");

const okuyucu = createInterface({ input: process.stdin, output: process.stdout });
const kod = (await okuyucu.question("Kod: ")).trim();
okuyucu.close();

if (!kod) {
  console.error("Kod girilmedi.");
  process.exit(1);
}

try {
  const { tokens } = await istemci.getToken(kod);
  if (!tokens.refresh_token) {
    console.error(
      "\nYenileme jetonu dönmedi. Google hesabınızdaki eski izni kaldırıp tekrar deneyin:\n" +
        "https://myaccount.google.com/permissions",
    );
    process.exit(1);
  }

  console.log("\n✓ Jeton alındı. .env dosyanıza ekleyin:\n");
  console.log(`GOOGLE_ISTEMCI_ID="${istemciId}"`);
  console.log(`GOOGLE_ISTEMCI_SIRRI="${istemciSirri}"`);
  console.log(`GOOGLE_YENILEME_JETONU="${tokens.refresh_token}"`);
  console.log('GOOGLE_DRIVE_KLASOR_ID="..."   # Drive klasör URL\'sindeki kimlik\n');
} catch (hata) {
  console.error("\nJeton alınamadı:", hata?.message ?? hata);
  process.exit(1);
}
