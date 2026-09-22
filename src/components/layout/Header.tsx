"use client";

/**
 * Application header — sticky, responsive, with active nav states and a
 * mobile menu. The mobile menu closes automatically on navigation.
 *
 * The desktop bar shows the primary destinations plus a compact "More"
 * menu for less frequently used pages, so labels never wrap and the nav
 * never exceeds the viewport at any breakpoint. Labels stay full size.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Leaf, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";

type NavItem = { href: string; label: string };

/** Shown in the desktop bar at every desktop width. Sized to fit inside
 *  the max-w-6xl header (with brand + auth) without wrapping or overflow. */
const CORE_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/planner", label: "Diet Planner" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/meal-plan", label: "7-Day Plan" },
  { href: "/recipes", label: "Recipes" },
  { href: "/grocery", label: "Grocery" },
  { href: "/pantry", label: "Pantry" },
];

/** Less frequently used destinations — compact "More" menu on the bar. */
const MORE_NAV: NavItem[] = [
  { href: "/analytics", label: "Analytics" },
  { href: "/diet-plan", label: "Diet Plan" },
  { href: "/progress", label: "Progress" },
  { href: "/assistant", label: "Assistant" },
  { href: "/profile", label: "My Profile" },
  { href: "/attachments", label: "Attachments" },
  { href: "/datasets", label: "Datasets" },
  { href: "/health-screening", label: "Health Screening" },
];

/** Every destination, for the mobile menu. */
const NAV_ITEMS: NavItem[] = [...CORE_NAV, ...MORE_NAV];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function NavLink({
  item,
  active,
  className,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "whitespace-nowrap rounded-pill px-2.5 py-2 text-sm font-medium transition-colors duration-150 xl:px-3",
        active
          ? "bg-brand-700 text-white shadow-[0_4px_12px_rgba(5,150,105,0.32)]"
          : "text-muted hover:bg-line/60 hover:text-ink",
        className,
      )}
    >
      {item.label}
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close the "More" popover on outside click or Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const handleLogout = () => {
    setMenuOpen(false);
    void logout().then(() => router.push("/"));
  };

  const navigate = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  const moreItems = MORE_NAV;
  const moreActive = moreItems.some((i) => isActive(pathname, i.href));

  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-5">
        {/* Brand */}
        <Link
          href="/"
          onClick={() => setMenuOpen(false)}
          className="flex min-w-0 items-center gap-2.5"
          aria-label="Personalised Diet Planner — home"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-700 text-white shadow-[0_4px_12px_rgba(5,150,105,0.35)]">
            <Leaf className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight text-ink sm:text-base">
              Personalised Diet Planner
            </span>
            <span className="hidden text-[11px] leading-tight text-muted md:block">
              Smart nutrition planning based on your goals
            </span>
          </span>
        </Link>

        {/* Desktop navigation — single row, labels never wrap */}
        <nav
          aria-label="Primary"
          className="hidden min-w-0 items-center gap-0.5 xl:flex"
        >
          {CORE_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}

          {/* Compact "More" menu */}
          <div ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              className={cn(
                "inline-flex whitespace-nowrap items-center gap-1 rounded-pill px-2.5 py-2 text-sm font-medium transition-colors duration-150 xl:px-3",
                moreActive || moreOpen
                  ? "bg-brand-700 text-white shadow-[0_4px_12px_rgba(5,150,105,0.32)]"
                  : "text-muted hover:bg-line/60 hover:text-ink",
              )}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              More
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", moreOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-56 rounded-card border border-line bg-surface py-1.5 shadow-pop"
              >
                {moreItems.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex items-center justify-between gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-brand-700 text-white"
                          : "text-ink hover:bg-brand-50",
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
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log out
            </button>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-pill bg-brand-700 px-3 py-2 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(5,150,105,0.32)]"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
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

      {/* Mobile navigation panel */}
      {menuOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line bg-surface px-5 py-4 shadow-pop xl:hidden"
        >
          <ul className="grid gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={() => navigate(item.href)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center justify-between whitespace-nowrap rounded-[10px] px-4 py-3 text-left text-sm font-semibold transition-colors",
                      active
                        ? "bg-brand-700 text-white"
                        : "text-ink hover:bg-brand-50",
                    )}
                  >
                    {item.label}
                    {active && (
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                        Current
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            <li className="mt-2 border-t border-line pt-3">
              {user ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-[10px] px-4 py-3 text-left text-sm font-semibold text-ink transition-colors hover:bg-brand-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Log out{user.fullName ? ` (${user.fullName})` : ""}
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-[10px] bg-brand-700 px-4 py-3 text-sm font-semibold text-white"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
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
