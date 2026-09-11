import { deploymentTarget } from "@/lib/deployment-environment";
import { probeDatabase } from "@/db/bootstrap";

export const dynamic = "force-dynamic";

async function databaseStatus(): Promise<string> {
  try {
    await probeDatabase();
    return "reachable";
  } catch {
    return "unavailable";
  }
}

export default async function Home() {
  const target = deploymentTarget(process.env);
  const database = await databaseStatus();

  return (
    <main className="flex min-h-full flex-col items-center justify-center p-6">
      <section className="card bg-base-200 w-full max-w-md shadow">
        <div className="card-body">
          <h1 className="card-title">Bootstrap</h1>
          <p>
            Deployment target: <span className="font-mono">{target}</span>
          </p>
          <p>
            Database: <span className="font-mono">{database}</span>
          </p>
        </div>
      </section>
    </main>
  );
}
