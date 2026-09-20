export const E164_PATTERN = /^\+[1-9]\d{1,14}$/;
export const PHONE_INVALID_COPY =
  "Phone must be E.164, for example +919876543210.";

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

export function normalizeRequiredPhone(
  value: string | null | undefined,
): { ok: true; phone: string } | { ok: false } {
  const trimmed = value?.trim() ?? "";
  if (!E164_PATTERN.test(trimmed)) {
    return { ok: false };
  }

  return { ok: true, phone: trimmed };
}
