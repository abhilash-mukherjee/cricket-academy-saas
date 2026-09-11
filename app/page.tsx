import { deploymentTarget } from "@/lib/deployment-environment";
import { probeBootstrapMarker } from "@/db/bootstrap";

export const dynamic = "force-dynamic";

async function markerStatus(): Promise<string> {
  try {
    await probeBootstrapMarker();
    return "reachable";
  } catch {
    return "unavailable";
  }
}

export default async function Home() {
  const target = deploymentTarget(process.env);
  const marker = await markerStatus();

  return (
    <main className="flex min-h-full flex-col items-center justify-center p-6">
      <section className="card bg-base-200 w-full max-w-md shadow">
        <div className="card-body">
          <h1 className="card-title">Bootstrap</h1>
          <p>
            Deployment target: <span className="font-mono">{target}</span>
          </p>
          <p>
            Bootstrap marker: <span className="font-mono">{marker}</span>
          </p>
        </div>
      </section>
    </main>
  );
}
