"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

/** demo: no payment provider (simulated checkout) · test: Stripe test keys · live: real money. */
export type PaymentsMode = "demo" | "test" | "live";
type Caps = { uploads: boolean; demoPayments: boolean; paymentsMode: PaymentsMode };
let cached: Promise<Caps> | null = null;

function paymentsMode(providers: Record<string, string> | undefined): PaymentsMode {
  const mode = providers?.payments_mode;
  if (mode === "demo" || mode === "test" || mode === "live") return mode;
  // An older backend without payments_mode: only the fake adapter is certainly a demo.
  return providers?.payments === "fake" ? "demo" : "test";
}

/** What the connected backend can do (from public /health). Uploads need real storage;
 *  demoPayments is true while the fake payment adapter runs (no real money moves). */
export function useCapabilities() {
  const [caps, setCaps] = useState<Caps | null>(null);
  useEffect(() => {
    cached ??= fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then((h) => {
        const mode = paymentsMode(h?.providers);
        return { uploads: h?.providers?.storage !== "fake", demoPayments: mode === "demo", paymentsMode: mode };
      })
      .catch(() => ({ uploads: true, demoPayments: false, paymentsMode: "live" as const }));
    void cached.then(setCaps);
  }, []);
  return caps;
}
