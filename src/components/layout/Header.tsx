"use client";

/**
 * Application header — sticky, responsive, with active nav states, a compact
 * "More" menu, and a mobile panel that closes automatically on navigation.
 *
 * This bar used to be the element that pushed the whole page wider than the
 * viewport: sixteen 14px labels in one non-shrinking row cannot fit inside a
 * 72rem container, so they overflowed at 1280px and wrapped mid-label
 * ("7-Day" / "Plan", "My" / "Profile"). The fixes are structural, not cosmetic:
 *
 *   • every label is `whitespace-nowrap`, so a label is never split;
 *   • the row is split into six primary links + one "More" dropdown, which fits
 *     the narrowest desktop breakpoint with room to spare;
 *   • the brand — not the nav — is the part allowed to shrink (`min-w-0` +
 *     `truncate`), so tight space ellipsises the tagline instead of overflowing;
 *   • nothing is made smaller than `text-sm`, so the nav stays readable.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Leaf, LogIn, LogOut, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
}

/** The core planning flow — always visible on desktop. */
const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/planner", label: "Diet Planner" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/diet-plan", label: "Diet Plan" },
  { href: "/meal-plan", label: "7-Day Plan" },
];

/** Less frequently used screens — reachable from the compact "More" menu. */
const MORE_NAV: NavItem[] = [
  { href: "/recipes", label: "Recipes" },
  { href: "/grocery", label: "Grocery" },
  { href: "/pantry", label: "Pantry" },
  { href: "/analytics", label: "Analytics" },
  { href: "/progress", label: "Progress" },
  { href: "/assistant", label: "Assistant" },
  { href: "/profile", label: "My Profile" },
  { href: "/attachments", label: "Attachments" },
  { href: "/datasets", label: "Datasets" },
  { href: "/health-screening", label: "Health Screening" },
];

/** The mobile panel shows every screen; ordering matches the desktop split. */
const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...MORE_NAV];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const linkBase =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-pill px-2.5 py-2 text-sm font-medium transition-colors duration-150";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const activeMore = MORE_NAV.find((item) => isActive(pathname, item.href)) ?? null;

  // Close the dropdown on an outside click or Escape. (Route changes are
  // handled by the links' own click handlers — setting state from an effect
  // keyed on the pathname would only trigger a second render pass.)
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  const handleLogout = () => {
    setMenuOpen(false);
    setMoreOpen(false);
    void logout().then(() => router.push("/"));
  };

  const navigate = (href: string) => {
    setMenuOpen(false);
    setMoreOpen(false);
    router.push(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
      <div className="page-container flex h-16 items-center justify-between gap-3">
        {/* Brand — the element allowed to shrink, so the bar never overflows. */}
        <Link
          href="/"
          onClick={() => setMenuOpen(false)}
          className="flex min-w-0 shrink items-center gap-2.5"
          aria-label="Personalised Diet Planner — home"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-700 text-white shadow-[0_4px_12px_rgba(5,150,105,0.35)]">
            <Leaf className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight text-ink sm:text-base">
              Personalised Diet Planner
            </span>
            <span className="hidden truncate text-[11px] leading-tight text-muted md:block">
              Smart nutrition planning based on your goals
            </span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav
          aria-label="Primary"
          className="hidden min-w-0 shrink-0 items-center gap-0.5 xl:flex"
        >
          {PRIMARY_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  linkBase,
                  active
                    ? "bg-brand-700 text-white shadow-[0_4px_12px_rgba(5,150,105,0.32)]"
                    : "text-muted hover:bg-line/60 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}

          {/* Compact overflow menu for the remaining screens. */}
          <div ref={moreRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              aria-controls="more-navigation"
              className={cn(
                linkBase,
                "gap-1",
                activeMore || moreOpen
                  ? "bg-brand-700 text-white shadow-[0_4px_12px_rgba(5,150,105,0.32)]"
                  : "text-muted hover:bg-line/60 hover:text-ink",
              )}
            >
              {/* Naming the active screen keeps orientation after navigating. */}
              <span className="max-w-[9rem] truncate">
                {activeMore ? activeMore.label : "More"}
              </span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 transition-transform", moreOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>

            {moreOpen && (
              <div
                id="more-navigation"
                role="menu"
                aria-label="More pages"
                className="dialog-panel absolute right-0 top-[calc(100%+0.5rem)] z-50 w-52 overflow-hidden rounded-card border border-line bg-surface p-1.5 shadow-pop"
              >
                {MORE_NAV.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block truncate rounded-[8px] px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-brand-700 text-white"
                          : "text-muted hover:bg-line/60 hover:text-ink",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Desktop auth */}
        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-pill border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-brand-400/50 hover:text-brand-400"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              Log out
            </button>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-pill bg-brand-700 px-3 py-2 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(5,150,105,0.32)]"
            >
              <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
              Log in
            </Link>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-line bg-surface text-ink transition-colors hover:border-brand-400/50 hover:text-brand-400 xl:hidden"
        >
          {menuOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Mobile navigation panel — scrolls inside itself, never grows the page. */}
      {menuOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-line bg-surface shadow-pop xl:hidden"
        >
          <ul className="page-container grid grid-cols-2 gap-1 py-3 sm:grid-cols-3">
            {ALL_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate(item.href)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                      active
                        ? "bg-brand-700 text-white"
                        : "text-ink hover:bg-brand-50",
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                    {active && (
                      <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider opacity-80">
                        Now
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            <li className="col-span-2 mt-1 border-t border-line pt-2 sm:col-span-3">
              {user ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-left text-sm font-semibold text-ink transition-colors hover:bg-brand-50"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    Log out{user.fullName ? ` (${user.fullName})` : ""}
                  </span>
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-[10px] bg-brand-700 px-3 py-2.5 text-sm font-semibold text-white"
                >
                  <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Log in
                </Link>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
