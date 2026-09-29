import { excelBasliklari, excelUret } from "@/lib/excel";
import { ICE_AKTAR_SUTUNLARI } from "@/lib/iceAktar";
import { oturumuOku } from "@/lib/oturum";
import { prisma } from "@/lib/prisma";
import { adminMi } from "@/lib/yetkiKurallari";

/**
 * Toplu stok yükleme şablonu. İlk sayfa doldurulacak tablo, ikinci sayfa
 * kategori/alt kategori listesi — kullanıcı adları elle yazarken şaşırmasın.
 */
export async function GET() {
  const oturum = await oturumuOku();
  if (!oturum) return new Response("Oturum gerekli.", { status: 401 });
  if (!adminMi(oturum)) return new Response("Bu işlem için yetkiniz yok.", { status: 403 });

  const kategoriler = await prisma.kategori.findMany({
    where: { aktif: true },
    orderBy: { sira: "asc" },
    include: { altKategoriler: { where: { aktif: true }, orderBy: { sira: "asc" } } },
  });

  const ornekKategori = kategoriler[0];
  const ornekAlt = ornekKategori?.altKategoriler[0];

  const kitap = await excelUret([
    {
      ad: "Cihazlar",
      sutunlar: ICE_AKTAR_SUTUNLARI.map((baslik) => ({
        baslik,
        genislik: baslik === "Seri No (IMEI)" ? 22 : undefined,
        sayisal: baslik === "Alış Fiyatı (TL)",
      })),
      satirlar: [
        [
          ornekKategori?.ad ?? "Cep Telefonu",
          ornekAlt?.ad ?? "Sıfır",
          "Samsung",
          "Galaxy A55",
          "Siyah",
          "128 GB",
          "350123456789012",
          "",
          12500,
          "örnek satır — silin",
        ],
      ],
    },
    {
      ad: "Kategori Listesi",
      ustBilgiler: [
        "Kategori ve Alt Kategori sütunlarına aşağıdaki adları birebir yazın.",
        "Seri no zorunlu olan kategorilerde IMEI boş bırakılamaz.",
      ],
      sutunlar: [
        { baslik: "Kategori", genislik: 26 },
        { baslik: "Alt Kategori", genislik: 26 },
        { baslik: "Seri No Zorunlu mu?", genislik: 20 },
      ],
      satirlar: kategoriler.flatMap((k) =>
        k.altKategoriler.length > 0
          ? k.altKategoriler.map((a) => [k.ad, a.ad, k.seriNoZorunlu ? "Evet" : "Hayır"])
          : [[k.ad, "", k.seriNoZorunlu ? "Evet" : "Hayır"]],
      ),
    },
  ]);

  return new Response(new Uint8Array(kitap), {
    headers: excelBasliklari("stok-yukleme-sablonu.xlsx"),
  });
}
