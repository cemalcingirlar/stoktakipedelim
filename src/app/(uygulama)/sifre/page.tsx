import { Kart } from "@/bilesenler/Kart";
import { oturumGerekli } from "@/lib/yetki";
import { SifreFormu } from "./SifreFormu";

export const metadata = { title: "Şifre Değiştir — Stok Takip" };

/**
 * Herkes kendi şifresini buradan değiştirebiliyor.
 *
 * Önceden yalnız yönetici şifre koyabiliyordu; bu, geçici şifrelerin kalıcı
 * olmasına ve şifrelerin sözlü dolaşmasına yol açıyordu.
 */
export default async function SifreSayfasi() {
  const oturum = await oturumGerekli();

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Şifre Değiştir</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {oturum.adSoyad} ({oturum.kullaniciAdi}) hesabının şifresi.
        </p>
      </div>

      <Kart baslik="Yeni şifre">
        <SifreFormu />
        <p className="mt-3 text-xs text-slate-500">
          Şifreniz değişince başka cihazlarda açık kalan oturumlarınız kapanır;
          bu ekrandaki oturumunuz devam eder.
        </p>
      </Kart>
    </div>
  );
}
