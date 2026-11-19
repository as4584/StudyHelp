"use client";

import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, ApiError, type Me } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type AuthState = {
  ready: boolean;
  session: Session | null;
  me: Me | null;
  needsOnboarding: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setMe(null);
      setNeedsOnboarding(false);
      setReady(true);
      return;
    }
    try {
      setMe(await api<Me>("/me"));
      setNeedsOnboarding(false);
      setMeError(null);
    } catch (e) {
      setMe(null);
      const onboarding = e instanceof ApiError && e.status === 403 && e.message.includes("Onboarding");
      setNeedsOnboarding(onboarding);
      // Anything else (a suspended account, the API unreachable) must say so, not spin forever.
      setMeError(
        onboarding
          ? null
          : e instanceof ApiError && e.status === 403
            ? "This account is suspended. Contact support if you think this is a mistake."
            : "We couldn't load your account. Check your connection and try again.",
      );
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => load(data.session));
    const { data } = sb.auth.onAuthStateChange((_evt, s) => {
      void load(s);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const value: AuthState = {
    ready,
    session,
    me,
    needsOnboarding,
    refresh: async () => load((await supabase().auth.getSession()).data.session),
    signOut: async () => {
      await supabase().auth.signOut();
    },
  };
  return (
    <Ctx.Provider value={value}>
      {session && meError ? (
        <div role="alert" className="mx-auto max-w-md space-y-4 py-16 text-center">
          <p className="text-[16px] text-ink-2">{meError}</p>
          <div className="flex justify-center gap-3">
            <button
              className="font-semibold text-tutor underline-offset-4 hover:underline"
              onClick={() => void value.refresh()}
            >
              Try again
            </button>
            <button
              className="font-semibold text-muted underline-offset-4 hover:underline"
              onClick={() => void value.signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        children
      )}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** Client-side routing guard for UX only. Authorization is enforced by FastAPI. */
export function useRequireRole(role?: "student" | "tutor" | "admin") {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.session) router.replace("/login");
    else if (auth.needsOnboarding) router.replace("/onboard");
    else if (role && auth.me && auth.me.profile.role !== role) router.replace("/dashboard");
  }, [auth.ready, auth.session, auth.needsOnboarding, auth.me, role, router]);
  return auth;
}
