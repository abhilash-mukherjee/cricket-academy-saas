import Image from "next/image";
import Link from "next/link";
import { Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { requireStaffSession } from "@/lib/staff-session";
import { resolveStaffAccess } from "@/lib/staff-access";
import { getImpersonationState } from "@/lib/impersonation";
import { APP_NAME } from "@/lib/constants";
import { SignOutButton } from "./sign-out-button";
import { AcademyDeactivatedMessage } from "./academy-deactivated-message";
import { ImpersonationBanner } from "./impersonation-banner";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: LayoutProps<"/app">) {
  await connection();
  const session = await requireStaffSession();
  const impersonation = await getImpersonationState(session);
  const access = impersonation
    ? ({ kind: "owner" as const, academy: impersonation.academy })
    : await resolveStaffAccess({
        id: session.user.id,
        email: session.user.email,
        isSuperAdmin: Boolean(session.user.isSuperAdmin),
      });

  const homeHref =
    Boolean(session.user.isSuperAdmin) && !impersonation
      ? "/app/admin/academies"
      : "/app";

  return (
    <div
      className={`${geistMono.variable} bg-base-100 flex min-h-full flex-col`}
    >
      {impersonation ? (
        <ImpersonationBanner
          academyName={impersonation.academy.name}
          ownerEmail={impersonation.subjectEmail}
        />
      ) : null}
      <header className="navbar border-base-300 border-b px-4">
        <div className="flex-1">
          <Link href={homeHref} className="inline-flex items-center">
            <Image
              src="/logo-black.svg"
              alt={APP_NAME}
              width={897}
              height={145}
              className="h-6 w-auto"
              priority
            />
          </Link>
        </div>
        <div className="flex flex-none items-center gap-3">
          <p className="text-base-content/70 text-sm">
            {impersonation ? impersonation.subjectEmail : session.user.email}
          </p>
          <SignOutButton />
        </div>
      </header>
      {access.kind === "owner-deactivated" ? (
        <AcademyDeactivatedMessage />
      ) : (
        children
      )}
    </div>
  );
}
