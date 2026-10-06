import * as Sentry from "@sentry/nextjs";

const ATTRIBUTE_LIMIT = 200;

export type TraceAttributes = Record<
  string,
  string | number | boolean | null | undefined
>;

function attributesForSentry(
  attributes: TraceAttributes | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!attributes) {
    return undefined;
  }

  const next: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) {
      continue;
    }
    next[key] =
      typeof value === "string" ? value.slice(0, ATTRIBUTE_LIMIT) : value;
  }

  return Object.keys(next).length === 0 ? undefined : next;
}

function writeLine(
  level: "info" | "warn",
  message: string,
  attributes?: TraceAttributes,
): void {
  try {
    const attrs = attributesForSentry(attributes);
    if (level === "info") {
      Sentry.logger.info(message, attrs);
      return;
    }
    Sentry.logger.warn(message, attrs);
  } catch {
    // A logging failure never changes the response.
  }
}

export function logInfo(
  message: string,
  attributes?: TraceAttributes,
): void {
  writeLine("info", message, attributes);
}

export function logWarning(
  message: string,
  error: string,
  attributes?: TraceAttributes,
): void {
  writeLine("warn", message, { ...attributes, error });
}

export function logActor(userId: string): void {
  writeLine("info", "actor", { userId });
}

export function logException(error: unknown): void {
  try {
    Sentry.captureException(error);
  } catch {
    // A logging failure never changes the response.
  }
}
