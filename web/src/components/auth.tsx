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
    } catch (e) {
      setMe(null);
      setNeedsOnboarding(e instanceof ApiError && e.status === 403 && e.message.includes("Onboarding"));
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
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
