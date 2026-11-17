import { WHATSAPP_CHAT_MESSAGE_TEMPLATE } from "@/lib/constants";

function WhatsAppIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  );
}

export type BrochureFloatingPlacement = "viewport" | "frame";

export function BrochureWhatsapp({
  whatsapp,
  academyName,
  floatingPlacement = "viewport",
}: {
  whatsapp: string;
  academyName: string;
  floatingPlacement?: BrochureFloatingPlacement;
}) {
  const digits = whatsapp.replace(/^\+/, "");
  const message = WHATSAPP_CHAT_MESSAGE_TEMPLATE.replace(
    "{academy_name}",
    academyName,
  );
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  const positionClass =
    floatingPlacement === "frame"
      ? "absolute right-6 bottom-6 z-30"
      : "fixed right-6 bottom-6 z-30";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${positionClass} btn rounded-full border-none bg-[#25D366] text-white shadow-lg hover:bg-[#20bd5a] gap-2`}
    >
      <WhatsAppIcon />
      <span>Chat with us</span>
    </a>
  );
}
