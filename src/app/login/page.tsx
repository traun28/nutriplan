"use client";

/**
 * Part 15 — Login / Create account.
 *
 * Real authentication against /api/auth/*. On success the user is taken to
 * wherever they were heading (or the planner). Errors are shown inline and
 * the form is never left in a stuck state.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Leaf,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/core";
import { cn } from "@/lib/cn";
import { validateGmailAddress } from "@/lib/email";

type Mode = "login" | "register";

function LoginForm() {
  const { login, register, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in → continue straight to the app.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    // Accounts are Gmail-only — catch other domains before the request.
    const emailError = validateGmailAddress(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (mode === "register") {
      if (fullName.trim().length < 2) {
        setError("Please enter your name.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("The passwords don't match.");
        return;
      }
    }

    setBusy(true);
    const result =
      mode === "login"
        ? await login(email.trim(), password)
        : await register(fullName.trim(), email.trim(), password);
    setBusy(false);

    if (result.ok) {
      router.replace(next);
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="page-container grid min-h-[calc(100dvh-7.5rem)] max-w-5xl items-center gap-8 py-10 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:block">
        <span className="inline-flex items-center gap-2.5">
          <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-brand-700 text-white">
            <Leaf className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold tracking-tight text-ink">
            Personalised Diet Planner
          </span>
        </span>

        <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-ink">
          Your nutrition journey,
          <br />
          personalised.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
          Build a plan around your body, your goals and your food preferences —
          with nutrition targets, a printable diet chart, document import and an
          AI assistant.
        </p>

        <ul className="mt-6 space-y-3">
          {[
            { icon: Sparkles, text: "Personalised plans from your own profile" },
            { icon: ShieldCheck, text: "Allergies and restrictions always respected" },
            { icon: Lock, text: "Your data stays in your account" },
          ].map((item) => (
            <li key={item.text} className="flex items-center gap-3 text-sm text-ink">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-400">
                <item.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              {item.text}
            </li>
          ))}
        </ul>
      </div>

      {/* Form panel */}
      <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
        <h2 className="text-xl font-bold text-ink">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {mode === "login"
            ? "Sign in to continue to your plan."
            : "Set up an account to save your profile and plans."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {mode === "register" && (
            <Field
              label="Full name"
              icon={<UserIcon className="h-4 w-4" aria-hidden="true" />}
              type="text"
              value={fullName}
              onChange={setFullName}
              autoComplete="name"
              placeholder="Your name"
            />
          )}

          <Field
            label="Email"
            icon={<Mail className="h-4 w-4" aria-hidden="true" />}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder="you@gmail.com"
            hint="Only @gmail.com addresses are accepted."
          />

          <Field
            label="Password"
            icon={<Lock className="h-4 w-4" aria-hidden="true" />}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
          />

          {mode === "register" && (
            <Field
              label="Confirm password"
              icon={<Lock className="h-4 w-4" aria-hidden="true" />}
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              placeholder="Re-enter your password"
            />
          )}

          {error && (
            <p
              role="alert"
              className="rounded-[10px] bg-danger-50 px-3.5 py-2.5 text-sm font-medium text-danger-700"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={busy}
            loading={busy}
            icon={busy ? undefined : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            {busy
              ? mode === "login"
                ? "Signing in…"
                : "Creating account…"
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </Button>
        </form>

        <div className="mt-6 border-t border-line pt-5 text-center text-sm">
          {mode === "login" ? (
            <>
              <span className="text-muted">New here? </span>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className="font-semibold text-brand-400 hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              <span className="text-muted">Already have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="font-semibold text-brand-400 hover:underline"
              >
                Log in
              </button>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-muted">
          Your password is hashed before it is stored and is never shown or
          logged.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
}: {
  label: string;
  icon: React.ReactNode;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
}) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-11 w-full rounded-[10px] border border-line bg-surface pl-10 pr-3.5 text-sm text-ink placeholder:text-muted/70",
            "transition-[border-color,box-shadow] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15",
          )}
        />
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[calc(100dvh-7.5rem)] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-400" aria-hidden="true" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
