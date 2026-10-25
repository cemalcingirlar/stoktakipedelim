/**
 * Excel aktarımındaki satır sınırı.
 *
 * Cihaz listesi tek dosyada 20.000 satırla sınırlı. Sınır kendisi sorun değil
 * — sorun, aşıldığında dosyanın sessizce eksik gelmesiydi: kullanıcı 20.000
 * satırı tam liste sanıp sayım/ciro hesabını eksik veriyle yapıyordu. Sınır
 * aşıldığında dosyanın başına uyarı yazılıyor.
 */
export const EXCEL_EN_COK_SATIR = 20000;

/** Sınır aşıldıysa dosyanın üst bilgisine yazılacak not; yoksa null. */
export function excelKesintiNotu(
  kesildi: boolean,
  limit: number = EXCEL_EN_COK_SATIR,
): string | null {
  if (!kesildi) return null;
  return `DİKKAT: Liste ${limit.toLocaleString("tr-TR")} satırla sınırlı, kayıtların tamamı bu dosyada değil. Filtreyi daraltıp parça parça indirin.`;
}
