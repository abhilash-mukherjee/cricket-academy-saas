import { requireStaffSession } from "@/lib/staff-session";

export default async function AppHomePage() {
  const session = await requireStaffSession();
  const roleLabel = session.user.isSuperAdmin ? "Super-admin" : "Staff";

  return (
    <main className="flex min-h-full flex-col p-6">
      <section className="card bg-base-200 mx-auto w-full max-w-lg shadow">
        <div className="card-body gap-3">
          <h1 className="card-title">Staff home</h1>
          <p>
            Signed in as{" "}
            <span className="font-medium">{session.user.email}</span>
          </p>
          <p className="text-base-content/70 text-sm">{roleLabel}</p>
        </div>
      </section>
    </main>
  );
}
