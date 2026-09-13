import Link from "next/link";
import { connection } from "next/server";
import { requireStaffSession } from "@/lib/staff-session";
import { APP_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: LayoutProps<"/app">) {
  await connection();
  const session = await requireStaffSession();

  return (
    <div className="bg-base-100 flex min-h-full flex-col">
      <header className="navbar border-base-300 border-b px-4">
        <div className="flex-1">
          <Link href="/app" className="text-lg font-semibold">
            {APP_NAME}
          </Link>
        </div>
        <p className="text-base-content/70 flex-none text-sm">
          {session.user.email}
        </p>
      </header>
      {children}
    </div>
  );
}
