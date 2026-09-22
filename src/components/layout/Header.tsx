"use client";

/**
 * Application header — sticky, responsive, with active nav states and a
 * mobile menu. The mobile menu closes automatically on navigation.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Leaf, Menu, X } from "lucide-react";
import { useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/planner", label: "Diet Planner" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/diet-plan", label: "Diet Plan" },
  { href: "/meal-plan", label: "7-Day Plan" },
  { href: "/profile", label: "My Profile" },
  { href: "/attachments", label: "Attachments" },
  { href: "/datasets", label: "Datasets" },
  { href: "/health-screening", label: "Health Screening" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    setMenuOpen(false);
    void logout().then(() => router.push("/"));
  };

  const navigate = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
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

        {/* Desktop navigation */}
        <nav
          aria-label="Primary"
          className="hidden items-center gap-0.5 xl:flex"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-pill px-3 py-2 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-brand-700 text-white shadow-[0_4px_12px_rgba(5,150,105,0.32)]"
                    : "text-muted hover:bg-line/60 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop auth */}
        <div className="hidden items-center gap-2 xl:flex">
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-pill border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-brand-400/50 hover:text-brand-400"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log out
            </button>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-pill bg-brand-700 px-3 py-2 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(5,150,105,0.32)]"
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
          className="grid h-10 w-10 place-items-center rounded-[10px] border border-line bg-surface text-ink transition-colors hover:border-brand-400/50 hover:text-brand-400 xl:hidden"
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
          className="border-t border-line bg-surface px-5 py-4 shadow-pop xl:hidden"
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
                      "flex w-full items-center justify-between rounded-[10px] px-4 py-3 text-left text-sm font-semibold transition-colors",
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
