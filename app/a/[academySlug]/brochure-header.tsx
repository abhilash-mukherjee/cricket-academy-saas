"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";
import { LinkPendingMark } from "@/app/app/link-pending-mark";

type BrochureMenuProps = {
  slug: string;
  phone: string | null;
  isIntakeAvailable: boolean;
  hasBatches: boolean;
  hasCoaches: boolean;
};

/** Interactive hamburger menu on the Brochure sticky top bar. */
export function BrochureMenu({
  slug,
  phone,
  isIntakeAvailable,
  hasBatches,
  hasCoaches,
}: BrochureMenuProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  function closeMenu() {
    menuRef.current?.removeAttribute("open");
  }

  function scrollToSection(
    event: MouseEvent<HTMLAnchorElement>,
    sectionId: "batches" | "coaches",
  ) {
    closeMenu();
    const root = event.currentTarget.closest("[data-brochure-root]");
    const target =
      root?.querySelector(`#${sectionId}`) ?? document.getElementById(sectionId);
    if (target) {
      event.preventDefault();
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      target.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  }

  useEffect(() => {
    function closeIfClickedOutside(event: PointerEvent) {
      const menu = menuRef.current;
      if (!menu?.open) {
        return;
      }
      if (menu.contains(event.target as Node)) {
        return;
      }
      closeMenu();
    }

    document.addEventListener("pointerdown", closeIfClickedOutside);
    return () => {
      document.removeEventListener("pointerdown", closeIfClickedOutside);
    };
  }, []);

  return (
    <div className="flex-none">
      <details ref={menuRef} className="dropdown dropdown-end">
        <summary className="btn btn-ghost btn-square" aria-label="Menu">
          <HamburgerIcon />
        </summary>
        <nav
          aria-label="Brochure menu"
          className="dropdown-content bg-base-200 rounded-box z-30 mt-2 w-64 p-2 shadow"
        >
          <ul className="menu w-full p-0">
            {isIntakeAvailable ? (
              <li>
                <Link href={`/a/${slug}/join`} onClick={closeMenu}>
                  Register
                  <LinkPendingMark />
                </Link>
              </li>
            ) : null}
            {phone ? (
              <li>
                <a href={`tel:${phone}`} onClick={closeMenu}>
                  Contact: {phone}
                </a>
              </li>
            ) : null}
            {hasBatches ? (
              <li>
                <a
                  href="#batches"
                  onClick={(event) => scrollToSection(event, "batches")}
                >
                  Explore Batches
                </a>
              </li>
            ) : null}
            {hasCoaches ? (
              <li>
                <a
                  href="#coaches"
                  onClick={(event) => scrollToSection(event, "coaches")}
                >
                  Coaches
                </a>
              </li>
            ) : null}
          </ul>
        </nav>
      </details>
    </div>
  );
}

function HamburgerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="size-6"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
      />
    </svg>
  );
}
