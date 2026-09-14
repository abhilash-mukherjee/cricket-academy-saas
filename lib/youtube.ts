const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export function parseYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (VIDEO_ID.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && VIDEO_ID.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery && VIDEO_ID.test(fromQuery)) {
        return fromQuery;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "embed" || parts[0] === "shorts") &&
        parts[1] &&
        VIDEO_ID.test(parts[1])
      ) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }

  return null;
}
