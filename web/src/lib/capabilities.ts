"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
let cached: Promise<{ uploads: boolean }> | null = null;

/** What the connected backend can do (from public /health). Uploads need real storage. */
export function useCapabilities() {
  const [caps, setCaps] = useState<{ uploads: boolean } | null>(null);
  useEffect(() => {
    cached ??= fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then((h) => ({ uploads: h?.providers?.storage !== "fake" }))
      .catch(() => ({ uploads: true }));
    void cached.then(setCaps);
  }, []);
  return caps;
}
