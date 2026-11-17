export const INSTAGRAM_INVALID_COPY =
  "Enter a valid Instagram handle or profile URL.";

const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

const RESERVED_INSTAGRAM_SEGMENTS = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "tv",
  "accounts",
  "direct",
  "about",
  "legal",
  "developer",
  "press",
  "api",
  "static",
  "graphql",
  "web",
  "tags",
  "locations",
  "directory",
  "emails",
  "session",
  "challenge",
]);

const NON_PROFILE_SUBSEQUENT_SEGMENTS = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
]);

const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
]);

export function instagramProfileUrl(handle: string): string {
  return `https://www.instagram.com/${handle}`;
}

/**
 * Extracts a canonical Instagram handle (`1–30` letters, digits, `.`, `_`)
 * from a bare handle, `@`-prefixed handle, or Instagram profile URL.
 */
export function parseInstagramHandle(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (
    !trimmed.includes("/") &&
    !trimmed.includes("://") &&
    !/^(?:www\.|m\.)?instagram\.com\b/i.test(trimmed)
  ) {
    const candidate = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
    return INSTAGRAM_HANDLE_PATTERN.test(candidate) ? candidate : null;
  }

  const candidateUrl = /^(?:www\.|m\.)?instagram\.com\//i.test(trimmed)
    ? `https://${trimmed}`
    : trimmed;

  let url: URL;
  try {
    url = new URL(candidateUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 1) {
    return null;
  }

  const rawHandle = segments[0].startsWith("@")
    ? segments[0].slice(1)
    : segments[0];

  if (RESERVED_INSTAGRAM_SEGMENTS.has(rawHandle.toLowerCase())) {
    return null;
  }

  if (
    segments
      .slice(1)
      .some((segment) =>
        NON_PROFILE_SUBSEQUENT_SEGMENTS.has(segment.toLowerCase()),
      )
  ) {
    return null;
  }

  return INSTAGRAM_HANDLE_PATTERN.test(rawHandle) ? rawHandle : null;
}

export function normalizeOptionalInstagram(
  value: string | null | undefined,
): { ok: true; instagramHandle: string | null } | { ok: false } {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") {
    return { ok: true, instagramHandle: null };
  }

  const instagramHandle = parseInstagramHandle(trimmed);
  if (!instagramHandle) {
    return { ok: false };
  }

  return { ok: true, instagramHandle };
}
