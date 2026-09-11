import type { Metadata } from "next";

type DeploymentEnv = {
  VERCEL_ENV?: string;
  VERCEL_TARGET_ENV?: string;
};

export function deploymentTarget(
  env: NodeJS.ProcessEnv | DeploymentEnv,
): string {
  return env.VERCEL_TARGET_ENV ?? "local";
}

export function robotsNoindex(
  env: NodeJS.ProcessEnv | DeploymentEnv,
): Metadata["robots"] {
  if (isProductionDeploy(env)) {
    return undefined;
  }

  return { index: false, follow: false };
}

function isProductionDeploy(env: NodeJS.ProcessEnv | DeploymentEnv): boolean {
  if (env.VERCEL_TARGET_ENV) {
    return env.VERCEL_TARGET_ENV === "production";
  }
  return env.VERCEL_ENV === "production";
}

export function noindexRobotsTag(
  env: NodeJS.ProcessEnv | DeploymentEnv,
): string | null {
  return robotsNoindex(env) ? "noindex" : null;
}
