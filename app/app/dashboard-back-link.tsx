import Link from "next/link";
import { LinkPendingMark } from "./link-pending-mark";

export function DashboardBackLink({
  href = "/app/dashboard",
  label = "Dashboard",
  onClick,
}: {
  href?: string;
  label?: string;
  onClick?: (event: { preventDefault(): void }, href: string) => void;
} = {}) {
  return (
    <Link
      href={href}
      onClick={onClick ? (event) => onClick(event, href) : undefined}
      className="link link-hover inline-flex items-center gap-1 self-start text-sm"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="size-4"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
        />
      </svg>
      {label}
      <LinkPendingMark />
    </Link>
  );
}
