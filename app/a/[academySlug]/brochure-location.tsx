function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    return null;
  }

  return null;
}

function LocationIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 size-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function BrochureLocation({ location }: { location: string }) {
  const trimmed = location.trim();
  const href = httpUrl(trimmed);

  return (
    <p className="flex items-start gap-2">
      <LocationIcon />
      {href ? (
        <a className="link" href={href} rel="noopener noreferrer">
          {trimmed}
        </a>
      ) : (
        <span>{trimmed}</span>
      )}
    </p>
  );
}
