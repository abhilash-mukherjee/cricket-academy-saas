export function postgresConstraint(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("constraint" in error && typeof error.constraint === "string") {
    return error.constraint;
  }

  if (
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "constraint" in error.cause &&
    typeof error.cause.constraint === "string"
  ) {
    return error.cause.constraint;
  }

  if ("message" in error && typeof error.message === "string") {
    const match = error.message.match(/constraint "([^"]+)"/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}
