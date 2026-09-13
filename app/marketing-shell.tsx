import { APP_NAME } from "@/lib/constants";
import Image from "next/image";
import Link from "next/link";

type MarketingShellProps = {
  children: React.ReactNode;
};

export function MarketingShell({ children }: MarketingShellProps) {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col">
      <Image
        src="/landing-hero.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_40%]"
      />
      <div className="absolute inset-0 bg-neutral/60" />

      <div className="navbar relative z-10 bg-transparent px-4 text-base-100">
        <div className="flex-1">
          <Link href="/" className="text-xl font-semibold">
            {APP_NAME}
          </Link>
        </div>
        <div className="flex-none">
          <Link href="/login" className="btn btn-ghost btn-sm text-base-100">
            Sign in
          </Link>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-6">
        {children}
      </div>
    </main>
  );
}
