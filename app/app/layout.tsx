import { connection } from "next/server";
import { requireStaffSession } from "@/lib/staff-session";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: LayoutProps<"/app">) {
  await connection();
  await requireStaffSession();

  return children;
}
