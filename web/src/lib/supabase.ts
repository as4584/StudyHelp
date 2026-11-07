"use client";

import { createBrowserClient } from "@supabase/ssr";
import { processLock, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser Supabase client. @supabase/ssr keeps the session in cookies, not localStorage. */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      // The default cross-tab navigator.locks lock can stall getSession() for a long time
      // when another tab (often a throttled background one) holds it; lock per tab instead.
      { auth: { lock: processLock } },
    );
  }
  return client;
}
