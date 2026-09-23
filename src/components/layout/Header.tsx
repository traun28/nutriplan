"use client";

/**
 * Application header — sticky, compact, responsive.
 *
 * Structure (unchanged design language, tighter geometry):
 *   brand · six primary links · "More" overflow menu · auth action
 *
 * Why the nav is split at all: sixteen 14px labels in one non-shrinking row
 * measure ~1522px, which cannot fit a 72rem (1152px) container. That single
 * fact caused the header to push the whole page wider than the viewport at
 * 1280px and to wrap labels mid-word ("7-Day" / "Plan"). The fixes are
 * structural, not cosmetic:
 *
 *   • every label is `whitespace-nowrap`, so a label is never split;
 *   • six primary links + one "More" dropdown fit the narrowest desktop
 *     breakpoint with ~136px of headroom;
 *   • the brand — not the nav — is allowed to shrink (`min-w-0` + `truncate`),
 *     so tight space ellipsises the tagline instead of overflowing;
 *   • nothing is smaller than `text-sm`, so the nav stays readable.
 *
 * Active state is communicated three ways, never by colour alone: a filled
 * pill, `font-semibold` against the inactive `font-medium`, and
 * `aria-current="page"` (plus a "Now" tag in the mobile drawer).
 *
 * Below `xl` the links move into a right-hand drawer dialog: focus is moved
 * in on open and returned to the toggle on close, Tab is trapped inside it,
 * Escape and a backdrop click dismiss it, and body scroll is locked while it
 * is open. Its width is `min(20rem, 86vw)`, so it can never exceed a 320px
 * viewport.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Leaf, LogIn, LogOut, Menu, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  { href: "/diet-plan", label: "Diet Plan" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/planner", label: "Planner" },
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
  { href: "/profile", label: "Profile" },
  { href: "/attachments", label: "Attachments" },
  { href: "/datasets", label: "Datasets" },
  { href: "/health-screening", label: "Health Screening" },
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Shared link metrics. Weight is applied per state so the active page is
 * distinguishable without colour (and without shrinking any text).
 */
const linkBase =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-pill px-2.5 py-1.5 text-sm transition-colors duration-150";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const activeMore = MORE_NAV.find((item) => isActive(pathname, item.href)) ?? null;

  // Return focus to the toggle whenever the drawer closes.
  const closeDrawer = useCallback(() => {
    setMenuOpen(false);
    toggleRef.current?.focus();
  }, []);

  /* ---- "More" dropdown: outside click + Escape ---- */
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

  /* ---- Drawer: focus management, Tab trap, Escape, body scroll lock ---- */
  useEffect(() => {
    if (!menuOpen) return;

    const drawer = drawerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog so keyboard users land inside it.
    const first = drawer?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const items = [...drawer.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === firstItem || !drawer.contains(active))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen, closeDrawer]);

  const handleLogout = () => {
    setMenuOpen(false);
    setMoreOpen(false);
    void logout().then(() => router.push("/"));
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
      <div className="page-container flex h-14 items-center justify-between gap-3">
        {/* Brand — the element allowed to shrink, so the bar never overflows. */}
        <Link
          href="/"
          className="flex min-w-0 shrink items-center gap-2.5"
          aria-label="Personalised Diet Planner — home"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-brand-700 text-white shadow-[0_4px_12px_rgba(5,150,105,0.35)]">
            <Leaf className="h-4 w-4" aria-hidden="true" />
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
                    ? "bg-brand-700 font-semibold text-white shadow-[0_4px_12px_rgba(5,150,105,0.32)]"
                    : "font-medium text-muted hover:bg-line/60 hover:text-ink",
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
                  ? "bg-brand-700 font-semibold text-white shadow-[0_4px_12px_rgba(5,150,105,0.32)]"
                  : "font-medium text-muted hover:bg-line/60 hover:text-ink",
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
                        "flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-brand-700 font-semibold text-white"
                          : "font-medium text-muted hover:bg-line/60 hover:text-ink",
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                      {active && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider opacity-80">
                          Now
                        </span>
                      )}
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
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-pill border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-brand-400/50 hover:text-brand-400"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              Log out
            </button>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-pill bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(5,150,105,0.32)]"
            >
              <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
              Log in
            </Link>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          ref={toggleRef}
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

      {/* Mobile navigation drawer — a dialog, so it never pushes or covers
          page content unpredictably and cannot widen the viewport. */}
      {menuOpen && (
        <div className="fixed inset-0 z-[70] xl:hidden" role="presentation">
          <div
            className="dialog-overlay absolute inset-0 bg-canvas/70 backdrop-blur-sm"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <nav
            id="mobile-navigation"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
            className="np-drawer absolute inset-y-0 right-0 flex w-[min(20rem,86vw)] max-w-full flex-col border-l border-line bg-surface shadow-pop"
          >
            <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
              <span className="truncate text-sm font-bold text-ink">Menu</span>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close menu"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-line text-ink transition-colors hover:border-brand-400/50 hover:text-brand-400"
              >
                <X className="h-4.5 w-4.5" aria-hidden="true" />
              </button>
            </div>

            {/* Scrollable inside itself: the drawer owns its own overflow, so
                a short viewport never truncates the list. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
              <DrawerGroup heading="Planning" items={PRIMARY_NAV} pathname={pathname} onNavigate={closeDrawer} />
              <DrawerGroup heading="More" items={MORE_NAV} pathname={pathname} onNavigate={closeDrawer} />

              <div className="mt-3 border-t border-line pt-3">
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
                    onClick={closeDrawer}
                    className="flex items-center gap-2 rounded-[10px] bg-brand-700 px-3 py-2.5 text-sm font-semibold text-white"
                  >
                    <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Log in
                  </Link>
                )}
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

/** A labelled section of the drawer. One column keeps every label intact. */
function DrawerGroup({
  heading,
  items,
  pathname,
  onNavigate,
}: {
  heading: string;
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
        {heading}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-brand-700 font-semibold text-white"
                    : "font-medium text-ink hover:bg-brand-50",
                )}
              >
                <span className="truncate">{item.label}</span>
                {active && (
                  <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider opacity-80">
                    Now
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
