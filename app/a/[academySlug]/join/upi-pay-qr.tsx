import Image from "next/image";
import { formatInr } from "@/lib/package-copy";

type UpiPayQrProps = {
  feePaise: number;
  upiQrUrl: string;
};

export function UpiPayQr({ feePaise, upiQrUrl }: UpiPayQrProps) {
  return (
    <section className="flex flex-col gap-2" aria-label="UPI QR">
      <h2 className="text-lg font-semibold">Pay {formatInr(feePaise)} with UPI</h2>
      <Image
        src={upiQrUrl}
        alt="Academy UPI QR"
        width={256}
        height={256}
        sizes="16rem"
        className="h-64 w-64 rounded-box object-contain"
      />
    </section>
  );
}
