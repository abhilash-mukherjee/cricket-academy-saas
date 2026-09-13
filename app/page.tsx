import { APP_DESCRIPTION, LANDING_PAGE_COPY } from "@/lib/constants";
import Link from "next/link";
import { MarketingShell } from "./marketing-shell";

export default function Home() {
  return (
    <MarketingShell>
      <section className="flex flex-col items-center gap-8 text-center">
        <div className="max-w-xl space-y-4">
          <h1 className="text-4xl font-bold text-base-100">
            {APP_DESCRIPTION}
          </h1>
          <p className="text-lg text-base-100/85">
            {LANDING_PAGE_COPY}
          </p>
        </div>
        <Link href="/login" className="btn btn-lg">
          Start your Academy
        </Link>
      </section>
    </MarketingShell>
  );
}
