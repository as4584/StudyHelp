"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
type Caps = { uploads: boolean; demoPayments: boolean };
let cached: Promise<Caps> | null = null;

/** What the connected backend can do (from public /health). Uploads need real storage;
 *  demoPayments is true while the fake payment adapter runs (no real money moves). */
export function useCapabilities() {
  const [caps, setCaps] = useState<Caps | null>(null);
  useEffect(() => {
    cached ??= fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then((h) => ({ uploads: h?.providers?.storage !== "fake", demoPayments: h?.providers?.payments === "fake" }))
      .catch(() => ({ uploads: true, demoPayments: false }));
    void cached.then(setCaps);
  }, []);
  return caps;
}
