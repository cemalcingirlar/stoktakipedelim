import { Rozet, type RozetTonu } from "./Rozet";
import { TRANSFER_DURUM, TRANSFER_DURUM_ETIKET, type TransferDurum } from "@/lib/sabitler";

const TONLAR: Record<TransferDurum, RozetTonu> = {
  [TRANSFER_DURUM.BEKLIYOR]: "sari",
  [TRANSFER_DURUM.KABUL]: "yesil",
  [TRANSFER_DURUM.KISMI_KABUL]: "mavi",
  [TRANSFER_DURUM.RED]: "kirmizi",
  [TRANSFER_DURUM.IPTAL]: "nötr",
};

export function TransferRozeti({ durum }: { durum: string }) {
  const bilinen = durum as TransferDurum;
  return <Rozet ton={TONLAR[bilinen] ?? "nötr"}>{TRANSFER_DURUM_ETIKET[bilinen] ?? durum}</Rozet>;
}
