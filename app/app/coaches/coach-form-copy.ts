export function coachNameErrorCopy(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Coach name is required.";
  }
  if (trimmed.length > 200) {
    return "Coach name must be at most 200 characters.";
  }
  return null;
}

export function coachWriteErrorCopy(
  error: string | null | undefined,
): string {
  switch (error) {
    case "name-taken":
      return "That name is already used.";
    default:
      return "The write failed.";
  }
}
