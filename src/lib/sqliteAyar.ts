/**
 * SQLite'ın eşzamanlılık ayarları.
 *
 * Varsayılan günlük kipi (`delete`) yazma sırasında tüm veritabanını kilitler:
 * sekiz mağaza aynı anda satış yaparken okuyanlar yazanı, yazanlar okuyanı
 * bekler. WAL kipinde okuyucular hiç bloklanmaz, yalnız yazanlar birbirini
 * bekler — çok kullanıcılı bir dükkân uygulamasının ihtiyacı tam olarak bu.
 *
 * Kip veritabanı dosyasının başlığında saklanır, yani bir kez ayarlanınca
 * kalıcıdır; yine de her istemci kurulumunda uygulanıyor çünkü geri yüklenen
 * bir yedek eski kiple gelebilir.
 *
 * `synchronous` bilerek varsayılanda (FULL) bırakıldı. WAL ile NORMAL yaygın
 * bir öneri ve daha hızlı, ama elektrik kesintisinde son işlemler kaybolabilir.
 * Burada o işlem bir satış kaydı; hız için veri riski alınmıyor.
 *
 * Yedeklerle uyumlu: uygulama içi yedek `VACUUM INTO` kullanıyor (WAL
 * içeriğini de kapsayan tutarlı anlık görüntü), sunucudaki kabuk yedeği ise
 * servisi durdurup kopyalıyor (temiz kapanışta WAL dosyaya işlenir).
 */

/** Kilit beklemesi; bu süre boyunca "database is locked" yerine beklenir. */
export const MESGUL_BEKLEME_MS = 10_000;

/** Kipi açan pragma; testler de bu sabiti kullanıyor. */
export const WAL_PRAGMASI = "PRAGMA journal_mode = WAL";

/** `walKipiniAc`'ın ihtiyaç duyduğu tek yetenek. */
export type PragmaCalistirabilen = {
  $executeRawUnsafe: (sorgu: string) => Promise<unknown>;
};

/**
 * WAL kipini verilen istemcinin KENDİ bağlantısında açar.
 *
 * Neden ayrı bağlantı değil: ilk sürüm dosyayı ayrı bir bağlantıyla açıp
 * pragmayı çalıştırıp kapatıyordu. Ölçüldü ki Next üretimde dört ayrı süreçte
 * çalışıyor ve her biri bu kodu çalıştırıyor; WAL kipinde bir bağlantının
 * kapanışı checkpoint tetiklediği için dört süreç aynı dosyada birbirini
 * eziyor ve okumalar SQLITE_CORRUPT / SHORT_READ ile düşüyordu
 * (magaza-gorunurluk süiti 40/40 yerine 36/40 veriyordu). Mevcut bağlantıda
 * pragma çalıştırmak kapanış yaratmadığı için bu yarış ortadan kalkıyor.
 *
 * Hata yutuluyor: kip açılamazsa uygulama eski kiple çalışmaya devam etmeli.
 * Açılışta çökmek, yavaş çalışmaktan kötüdür.
 */
export async function walKipiniAc(
  istemci: PragmaCalistirabilen,
): Promise<void> {
  try {
    await istemci.$executeRawUnsafe(WAL_PRAGMASI);
  } catch (hata) {
    const sebep = hata instanceof Error ? hata.message : String(hata);
    console.warn(
      `SQLite WAL kipi açılamadı (${sebep}); eski kiple devam ediliyor.`,
    );
  }
}
