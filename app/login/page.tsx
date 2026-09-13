import Link from "next/link";
import { MarketingShell } from "../marketing-shell";
import { LoginForm } from "./login-form";
import { LOGIN_PAGE_COPY } from "@/lib/constants";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackUrl = params.next?.startsWith("/app")
    ? params.next
    : "/app";
  const linkError = params.error === "link";

  return (
    <MarketingShell>
      <section className="card bg-base-100 w-full max-w-md shadow-lg">
        <div className="card-body gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="card-title">Sign in</h1>
            <p className="text-base-content/70 text-sm">
            {LOGIN_PAGE_COPY}
            </p>
          </div>

          {linkError ? (
            <p className="alert alert-error text-sm">
              That sign-in link is invalid or expired. Request a new one below.
            </p>
          ) : null}

          <LoginForm callbackUrl={callbackUrl} />

          <Link href="/" className="link link-hover text-sm">
            Back to homepage
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
