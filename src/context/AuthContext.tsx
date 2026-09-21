"use client";

/**
 * Part 15 — authentication state.
 *
 * Exposes three explicit states — loading, authenticated, unauthenticated —
 * so no page renders (or waits) on a guess. The session is resolved from the
 * server via /api/auth/me; the cookie itself is httpOnly and never read here.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient, toUserMessage } from "@/services/apiClient";

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True only while the initial session check is in flight. */
  loading: boolean;
  /** Set when the session check itself fails (distinct from "not signed in"). */
  error: string | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  register: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<{ user: AuthUser | null; error?: string }>(
        "/api/auth/me",
      );
      setUser(data.user ?? null);
      if (!data.user && data.error) setError(data.error);
    } catch (err) {
      setUser(null);
      setError(toUserMessage(err, "Could not check your session."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const task = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(task);
  }, [refresh]);

  const login = useCallback<AuthContextValue["login"]>(async (email, password) => {
    try {
      const data = await apiClient.post<{ user: AuthUser }>("/api/auth/login", {
        email,
        password,
      });
      setUser(data.user);
      setError(null);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: toUserMessage(err, "Could not sign in.") };
    }
  }, []);

  const register = useCallback<AuthContextValue["register"]>(
    async (fullName, email, password) => {
      try {
        const data = await apiClient.post<{ user: AuthUser }>("/api/auth/register", {
          fullName,
          email,
          password,
        });
        setUser(data.user);
        setError(null);
        return { ok: true };
      } catch (err) {
        return { ok: false, message: toUserMessage(err, "Could not create your account.") };
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/api/auth/logout");
    } catch {
      // Clear locally even if the server call fails — the cookie is removed
      // by the response whenever it succeeds; here we just drop client state.
    }
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, refresh, login, register, logout }),
    [user, loading, error, refresh, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
