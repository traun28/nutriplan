import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-5 py-16">
      <div className="w-full max-w-md text-center">
        <p className="text-5xl font-extrabold tracking-tight text-brand-200">
          404
        </p>
        <h1 className="mt-2 text-2xl font-bold text-ink">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The page you are looking for doesn’t exist or may have been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-pill bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(61,106,79,0.25)] transition-colors hover:bg-brand-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Home
        </Link>
      </div>
    </div>
  );
}
