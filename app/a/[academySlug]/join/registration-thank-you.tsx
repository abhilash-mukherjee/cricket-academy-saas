import { packageFactsCopy } from "@/lib/package-copy";
import type { RegistrationSnapshot } from "@/lib/registrations";
import { UpiPayQr } from "./upi-pay-qr";

type RegistrationThankYouProps = {
  snapshot: RegistrationSnapshot;
  upiQrUrl: string | null;
  onRegisterAnother: () => void;
};

export function RegistrationThankYou({
  snapshot,
  upiQrUrl,
  onRegisterAnother,
}: RegistrationThankYouProps) {
  const contactSentence = snapshot.contactEmail
    ? `The Academy will contact you on ${snapshot.contactPhone} and ${snapshot.contactEmail}.`
    : `The Academy will contact you on ${snapshot.contactPhone}.`;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">Thank you.</h2>
      <p>{contactSentence}</p>
      <section className="card bg-base-200">
        <div className="card-body gap-1 py-3">
          <h3 className="font-semibold">{snapshot.batchName}</h3>
          {snapshot.label ? <p className="font-medium">{snapshot.label}</p> : null}
          <p>{packageFactsCopy(snapshot)}</p>
        </div>
      </section>
      {upiQrUrl ? (
        <UpiPayQr feePaise={snapshot.feePaise} upiQrUrl={upiQrUrl} />
      ) : null}
      <button
        type="button"
        className="btn btn-neutral"
        onClick={onRegisterAnother}
      >
        Register another Player
      </button>
    </div>
  );
}
