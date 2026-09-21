"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./sign-out-button";

const OWNER_LINKS = [
  { href: "/app/brochure", label: "Edit brochure" },
  { href: "/app/batches", label: "Batches" },
  { href: "/app/conversion", label: "Conversion page" },
] as const;

type StaffAppMenuProps = {
  displayName: string;
  email: string;
  showOwnerLinks: boolean;
};

export function StaffAppMenu({
  displayName,
  email,
  showOwnerLinks,
}: StaffAppMenuProps) {
  const identityName = displayName.trim() || null;
  const currentPath = usePathname();
  const menuRef = useRef<HTMLDetailsElement>(null);

  function closeMenu() {
    menuRef.current?.removeAttribute("open");
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
    <details ref={menuRef} className="dropdown dropdown-end">
      <summary className="btn btn-ghost btn-square" aria-label="Open menu">
        <HamburgerIcon />
      </summary>
      <nav
        aria-label="Account menu"
        className="dropdown-content bg-base-100 rounded-box z-10 mt-2 w-64 p-2 shadow"
      >
        <ul className="menu w-full p-0">
          {identityName ? (
            <li className="menu-title">
              <span>{identityName}</span>
            </li>
          ) : null}
          <li className="menu-title">
            <span className="font-normal">{email}</span>
          </li>
          {showOwnerLinks
            ? OWNER_LINKS.map((link) => {
                const current = currentPath === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={current ? "menu-active" : undefined}
                      aria-current={current ? "page" : undefined}
                      onClick={closeMenu}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })
            : null}
          <li>
            <SignOutButton />
          </li>
        </ul>
      </nav>
    </details>
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
