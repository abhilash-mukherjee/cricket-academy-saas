import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";
import { CopyLink } from "./copy-link";
import { APP_NAME } from "@/lib/constants";
import { publicOrigin } from "@/lib/public-origin";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await requireStaffSession();
  const impersonation = await getImpersonationState(session);

  if (session.user.isSuperAdmin && !impersonation) {
    redirect("/app/admin/academies");
  }

  const academy =
    impersonation?.academy ?? (await getOwnedAcademy(session.user.id));
  if (!academy) {
    redirect("/app/onboarding");
  }

  const academyBatches = await listBatches(academy.id);
  const hasBatches = academyBatches.length > 0;
  const displayName = impersonation
    ? impersonation.subjectEmail
    : session.user.name;
  const origin = publicOrigin();
  const brochureUrl = `${origin}/a/${academy.slug}`;

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <section className="card bg-base-200 shadow">
          <div className="card-body gap-2">
            <h1 className="card-title">Dashboard</h1>
            <p>
              Hello {displayName}. {academy.name} is live.
            </p>
          </div>
        </section>

        <section className="card bg-base-200 shadow">
          <div className="card-body gap-3">
            <h2 className="card-title text-lg">Setup next steps</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                {hasBatches ? (
                  <>
                    <Link className="link" href="/app/batches">
                      Batches
                    </Link>{" "}
                    add or rename Batches.
                  </>
                ) : (
                  <Link className="link" href="/app/batches">
                    Add your first Batch
                  </Link>
                )}
              </li>
              <li>
                <Link className="link" href="/app/brochure">
                  Edit your brochure
                </Link>{" "}
                photos, YouTube, Batch blurbs, and Coach profiles.
              </li>
              <li>
                Share your public {APP_NAME} links so visitors can find you.
              </li>
            </ul>
          </div>
        </section>

        <section className="card bg-base-200 shadow">
          <div className="card-body gap-4">
            <h2 className="card-title text-lg">Public links</h2>
            <CopyLink label="Brochure" href={brochureUrl} />
          </div>
        </section>
      </div>
    </main>
  );
}
