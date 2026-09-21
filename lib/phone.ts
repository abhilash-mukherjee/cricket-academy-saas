import { parsePhoneNumberFromString } from "libphonenumber-js";

export const PHONE_INVALID_COPY = "Enter a valid phone number.";

const DEFAULT_REGION = "IN";

type PhoneParseResult =
  | { kind: "empty" }
  | { kind: "ok"; phone: string }
  | { kind: "invalid" };

function parseCanonicalPhone(
  value: string | null | undefined,
): PhoneParseResult {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") {
    return { kind: "empty" };
  }

  if (/[a-z]/i.test(trimmed)) {
    return { kind: "invalid" };
  }

  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_REGION);
  if (!parsed || parsed.ext || !parsed.isPossible()) {
    return { kind: "invalid" };
  }

  return { kind: "ok", phone: parsed.number };
}

export function normalizeOptionalPhone(
  value: string | null | undefined,
): { ok: true; phone: string | null } | { ok: false } {
  const parsed = parseCanonicalPhone(value);
  if (parsed.kind === "empty") {
    return { ok: true, phone: null };
  }
  if (parsed.kind === "invalid") {
    return { ok: false };
  }
  return { ok: true, phone: parsed.phone };
}

export function normalizeRequiredPhone(
  value: string | null | undefined,
): { ok: true; phone: string } | { ok: false } {
  const parsed = parseCanonicalPhone(value);
  if (parsed.kind === "ok") {
    return { ok: true, phone: parsed.phone };
  }
  return { ok: false };
}
