import { instagramProfileUrl } from "@/lib/instagram";

function InstagramIcon() {
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
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function BrochureInstagram({
  instagramHandle,
}: {
  instagramHandle: string;
}) {
  return (
    <p className="flex items-start gap-2">
      <InstagramIcon />
      <a
        className="link"
        href={instagramProfileUrl(instagramHandle)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Follow us on Instagram
      </a>
    </p>
  );
}
