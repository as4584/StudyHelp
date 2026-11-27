"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Cloudflare Turnstile. The widget only produces a single-use token; the API (and Supabase
// Auth, once its captcha setting is on) verifies it. Without a configured site key this uses
// Cloudflare's published always-pass test key, so local runs and CI need no real keys.
const TEST_SITE_KEY = "1x00000000000000000000AA";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TEST_SITE_KEY;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("bot check failed to load")));
    s.onerror = () => {
      loading = null;
      reject(new Error("bot check failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * State for one bot check on a form. `take()` resolves with a token — waiting for the widget if
 * someone submits before it has finished — and then swaps in a fresh widget, since tokens are
 * single-use. Render `<BotCheck key={bot.key} onToken={bot.onToken} … />`.
 */
export function useBotCheck() {
  const [key, setKey] = useState(0);
  const token = useRef<string | null>(null);
  const waiters = useRef<((t: string) => void)[]>([]);
  const onToken = useCallback((t: string | null) => {
    token.current = t;
    if (t) for (const w of waiters.current.splice(0)) w(t);
  }, []);
  const take = useCallback(async () => {
    const t =
      token.current ??
      (await new Promise<string>((resolve, reject) => {
        waiters.current.push(resolve);
        setTimeout(() => reject(new Error("The bot check didn't finish. Please try again.")), 30_000);
      }));
    token.current = null;
    setKey((k) => k + 1);
    return t;
  }, []);
  return { key, onToken, take };
}

/** Renders the bot check and reports its token (null while there is no valid one). */
export function BotCheck({ onToken, action }: { onToken: (token: string | null) => void; action: string }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let id: string | null = null;
    let gone = false;
    cb.current(null);
    loadTurnstile().then(
      (t) => {
        if (gone || !box.current) return;
        id = t.render(box.current, {
          sitekey: SITE_KEY,
          action,
          theme: "auto",
          size: "flexible",
          callback: (token: string) => cb.current(token),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      },
      () => cb.current(null),
    );
    return () => {
      gone = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [action]);

  return <div ref={box} data-testid="bot-check" className="min-h-[65px]" />;
}
