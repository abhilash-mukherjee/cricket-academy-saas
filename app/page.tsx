import { APP_DESCRIPTION, APP_NAME, FEATURE_LIST_HEADING, PRODUCT_HOMEPAGE_COPY } from "@/lib/constants";
import Link from "next/link";
import { MarketingShell } from "./marketing-shell";
import FeatureShell from "./feature-shell";


export default function Home() {
  return (
    <div className="h-dvh overflow-y-auto overscroll-y-contain snap-y snap-mandatory motion-reduce:snap-none">
      <MarketingShell className="h-dvh snap-start snap-always">
        <section className="flex flex-col items-center gap-8 text-center">
          <div className="max-w-xl space-y-4">
            <h1 className="text-4xl font-bold text-base-100">
              {APP_DESCRIPTION}
            </h1>
            <p className="text-lg text-base-100/85">
              {PRODUCT_HOMEPAGE_COPY}
            </p>
          </div>
          <Link href="/app" className="btn btn-lg">
            Start your Academy
          </Link>
        </section>
      </MarketingShell>
      <FeatureShell />
    </div>
  );
}

