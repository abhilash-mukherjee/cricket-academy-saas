export function batchErrorCopy(error: string | null | undefined): string | null {
  switch (error) {
    case "invalid-input":
      return "Batch name is required.";
    case "name-taken":
      return "That Batch name is already used at this Academy.";
    case "not-found":
      return "That Batch was not found.";
    case "no-offered-package":
      return "Add an offered fee option before opening this Batch.";
    case "close-first":
      return "Close this Batch for Registration first.";
    default:
      return error ?? null;
  }
}

export function feeOptionErrorCopy(
  error: string | null | undefined,
): string | null {
  switch (error) {
    case "invalid-input":
      return "Days per week must be 1–7, term a whole number of days from 1 up, and price a positive amount in INR.";
    case "identity-taken":
      return "That days-per-week and term package already exists on this Batch.";
    case "not-found":
      return "That fee option was not found.";
    case "in-use":
      return "This fee option cannot be deleted because a Registration references it. Stop offering it instead.";
    case "close-first":
      return "Close this Batch for Registration first.";
    default:
      return error ?? null;
  }
}
