"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";
import { LinkPendingMark } from "@/app/app/link-pending-mark";
import { resolveAboutLabel } from "@/lib/academy-theme";

type BrochureMenuProps = {
  slug: string;
  phone: string | null;
  isIntakeAvailable: boolean;
  hasAbout: boolean;
  aboutLabel: string;
  hasBatches: boolean;
  hasCoaches: boolean;
};

function findBrochureTarget(trigger: Element, selector: string): Element | null {
  const root = trigger.closest("[data-brochure-root]");
  return root?.querySelector(selector) ?? document.querySelector(selector);
}

function scrollIntoBrochureView(target: Element) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  target.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
  });
}

/** Interactive hamburger menu on the Brochure sticky top bar. */
export function BrochureMenu({
  slug,
  phone,
  isIntakeAvailable,
  hasAbout,
  aboutLabel,
  hasBatches,
  hasCoaches,
}: BrochureMenuProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  function closeMenu() {
    menuRef.current?.removeAttribute("open");
  }

  function scrollToSection(
    event: MouseEvent<HTMLAnchorElement>,
    sectionId: "about" | "batches" | "coaches",
  ) {
    closeMenu();
    const target = findBrochureTarget(event.currentTarget, `#${sectionId}`);
    if (target) {
      event.preventDefault();
      scrollIntoBrochureView(target);
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
            {hasAbout ? (
              <li>
                <a
                  href="#about"
                  onClick={(event) => scrollToSection(event, "about")}
                >
                  {resolveAboutLabel(aboutLabel)}
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

/** Minimal animated down-chevron button nudging visitors to scroll below the hero. */
export function HeroScrollNudge({ hasHeroImages }: { hasHeroImages: boolean }) {
  function scrollToContent(event: MouseEvent<HTMLButtonElement>) {
    const target = findBrochureTarget(
      event.currentTarget,
      "[data-brochure-content]",
    );
    if (target) {
      scrollIntoBrochureView(target);
    }
  }

  return (
    <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center">
      <button
        type="button"
        aria-label="Scroll to content"
        onClick={scrollToContent}
        className={`${
          hasHeroImages
            ? "text-neutral-content/70 hover:text-neutral-content"
            : "text-base-content/60 hover:text-base-content"
        } inline-flex cursor-pointer items-center justify-center rounded-full p-2 transition-colors animate-[hero-nudge_2.2s_ease-in-out_infinite] motion-reduce:animate-none`}
      >
        <ChevronDownIcon />
      </button>
    </div>
  );
}

function ChevronDownIcon() {
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
        d="m19.5 8.25-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}
