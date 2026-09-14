import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getOwnedAcademy } from "@/lib/owner-onboarding";

export default async function AppHomePage() {
  const session = await requireStaffSession();
  if (session.user.isSuperAdmin) {
    return (
      <main className="flex min-h-full flex-col p-6">
        <section className="card bg-base-200 mx-auto w-full max-w-lg shadow">
          <div className="card-body gap-3">
            <h1 className="card-title">Staff home</h1>
            <p>
              Signed in as{" "}
              <span className="font-medium">{session.user.email}</span>
            </p>
            <p className="text-base-content/70 text-sm">Super-admin</p>
          </div>
        </section>
      </main>
    );
  }

  const academy = await getOwnedAcademy(session.user.id);
  if (!academy) {
    redirect("/app/onboarding");
  }

  redirect("/app/dashboard");
}
