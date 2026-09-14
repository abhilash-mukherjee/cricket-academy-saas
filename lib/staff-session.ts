import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const getStaffSession = cache(async () => {
  return auth.api.getSession({
    headers: await headers(),
  });
});

export async function requireStaffSession() {
  const session = await getStaffSession();
  if (!session) {
    redirect("/login");
  }

  return session;
}
