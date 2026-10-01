import { normalizeRequiredPhone } from "@/lib/phone";

/** Same match as Player directory search: full phone, digit suffix, or part of the name. */
export function matchesPlayerQuery(
  player: { fullName: string; phone: string },
  q: string,
): boolean {
  const trimmed = q.trim();
  if (!trimmed) {
    return true;
  }
  const phone = normalizeRequiredPhone(trimmed);
  if (phone.ok) {
    return player.phone === phone.phone;
  }
  if (/^\d+$/.test(trimmed)) {
    return player.phone.endsWith(trimmed);
  }
  return player.fullName.toLowerCase().includes(trimmed.toLowerCase());
}
