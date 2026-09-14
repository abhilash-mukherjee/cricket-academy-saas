const E164_PATTERN = /^\+[1-9]\d{1,14}$/;

export function normalizeOptionalPhone(
  value: string | null | undefined,
): { ok: true; phone: string | null } | { ok: false } {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") {
    return { ok: true, phone: null };
  }

  if (!E164_PATTERN.test(trimmed)) {
    return { ok: false };
  }

  return { ok: true, phone: trimmed };
}
