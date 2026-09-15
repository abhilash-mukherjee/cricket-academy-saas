import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { listAdminAcademies } from "@/lib/admin-academies";
import { brochureUrl } from "@/lib/public-origin";
import { CreateAcademyForm } from "./create-academy-form";
import { AcademyAdminRow } from "./academy-admin-row";

export default async function AdminAcademiesPage() {
  const session = await requireStaffSession();
  const impersonation = await getImpersonationState(session);

  if (!session.user.isSuperAdmin || impersonation) {
    redirect(impersonation ? "/app/dashboard" : "/app");
  }

  const academies = await listAdminAcademies();

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <section className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Academies</h1>
          <p className="text-base-content/70 text-sm">
            Create Academies, assign Owners, deactivate, and impersonate.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Create Academy</h2>
          <CreateAcademyForm />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">All Academies</h2>
          {academies.length === 0 ? (
            <p className="text-base-content/70 text-sm">No Academies yet.</p>
          ) : (
            <ul className="divide-base-300 divide-y border-base-300 border">
              {academies.map((academy) => (
                <AcademyAdminRow
                  key={academy.id}
                  academy={academy}
                  brochureHref={brochureUrl(academy.slug)}
                  conversionHref={`${brochureUrl(academy.slug)}/join`}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
