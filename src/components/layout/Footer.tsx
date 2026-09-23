/**
 * Application footer — brand statement, navigation, honest project note.
 */
import Link from "next/link";
import { Leaf } from "lucide-react";

const EXPLORE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/planner", label: "Diet Planner" },
  { href: "/history", label: "Food History" },
  { href: "/nutrition", label: "Nutrition Profile" },
  { href: "/diet-plan", label: "Diet Plan" },
  { href: "/meal-plan", label: "7-Day Plan" },
  { href: "/health-screening", label: "Health Screening" },
];

const PROJECT_LINKS = [
  { href: "/about", label: "About the Project" },
  { href: "/profile", label: "My Profile" },
  { href: "/datasets", label: "Student Datasets" },
  { href: "/attachments", label: "Documents & Attachments" },
  { href: "/assistant", label: "AI Assistant" },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="page-container grid gap-8 py-10 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand-700 text-white">
              <Leaf className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-base font-bold text-ink">
              Personalised Diet Planner
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
            Personalised nutrition planning through structured user information
            and data-driven recommendations.
          </p>
          <p className="mt-4 text-xs text-muted">
            Personalised meal planning with a rule-based engine, document
            import and a voice-enabled nutrition assistant.
          </p>
        </div>

        <nav aria-label="Footer — explore">
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            Explore
          </h3>
          <ul className="mt-4 space-y-2.5">
            {EXPLORE_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm font-medium text-ink transition-colors hover:text-brand-400"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Footer — project">
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            Project
          </h3>
          <ul className="mt-4 space-y-2.5">
            {PROJECT_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm font-medium text-ink transition-colors hover:text-brand-400"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Extra bottom room on phones so the floating Personal AI disc cannot
          cover the copyright line. */}
      <div className="border-t border-line pb-20 pt-5 sm:pb-5">
        <p className="px-5 text-center text-xs leading-relaxed text-muted">
          © {new Date().getFullYear()} Personalised Diet Planner · Built as a
          college project · For educational use only, not medical advice.
        </p>
      </div>
    </footer>
  );
}
