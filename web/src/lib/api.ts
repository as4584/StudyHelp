"use client";

import type { components } from "./api-types";
import { supabase } from "./supabase";

export type Schemas = components["schemas"];
export type Me = Schemas["MeOut"];
export type Task = Schemas["TaskOut"];
export type Bid = Schemas["BidWithTutorOut"];
export type Message = Schemas["MessageOut"];
export type PaymentState = Schemas["TaskPaymentState"];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

/** FastAPI's 422 detail is a list of field errors; show the first as a readable sentence. */
function validationMessage(detail: unknown): string {
  const first = Array.isArray(detail) ? detail[0] : null;
  if (!first || typeof first.msg !== "string") return "Please check the form and try again.";
  const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]).replace(/_/g, " ") : "";
  const msg = first.msg.replace(/^Value error, /, "");
  return field && field !== "body" ? `${field[0].toUpperCase()}${field.slice(1)}: ${msg}` : msg;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * Calls FastAPI with the current Supabase access token. The server derives identity and
 * role from that token + the database; we never send user ids or roles for ourselves.
 */
const TIMEOUT_MS = 20_000;
const RETRYABLE = new Set([502, 503, 504]);

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  // A Blob (a photo or PDF) goes up as raw bytes; everything else is JSON.
  const raw = typeof Blob !== "undefined" && init.body instanceof Blob ? init.body : null;
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const send = () =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(raw
          ? { "Content-Type": raw.type || "application/octet-stream" }
          : init.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
      },
      body: init.body === undefined ? undefined : raw ? raw : JSON.stringify(init.body),
      // Never leave a page on "Loading…" forever.
      // AI answers can take up to two minutes; giving up early would bill the question twice.
      signal: AbortSignal.timeout(path.startsWith("/ai/") && method === "POST" ? 150_000 : TIMEOUT_MS),
    });
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    const canRetry = method === "GET" && attempt === 0;
    try {
      res = await send();
    } catch (e) {
      if (canRetry) continue;
      // Our own timeout vs. never reaching the server (offline, DNS, the API down).
      throw new ApiError(
        0,
        (e as { name?: string } | null)?.name === "TimeoutError"
          ? "The server took too long to respond. Please try again."
          : "We couldn't reach StudyHelp. Check your internet connection and try again.",
      );
    }
    // HTTP and transport failures share the same single retry. Writes never retry.
    if (canRetry && RETRYABLE.has(res.status)) continue;
    break;
  }
  if (!res.ok) {
    // A non-JSON error is a proxy or platform page (gateway timeout, outage): never show its
    // raw status text ("Internal Server Error") to a student.
    let detail =
      res.status >= 502 && res.status <= 504
        ? "StudyHelp is temporarily unavailable. Please try again in a minute."
        : res.status >= 500
          ? "Something went wrong on our side. Please try again."
          : res.statusText || "Something went wrong. Please try again.";
    let code: string | undefined;
    try {
      const j = await res.json();
      if (j.detail !== undefined) detail = typeof j.detail === "string" ? j.detail : validationMessage(j.detail);
      code = typeof j.code === "string" ? j.code : undefined;
    } catch {
      /* non-JSON error: keep the plain-language message above */
    }
    throw new ApiError(res.status, detail, code);
  }
  return (await res.json()) as T;
}

export const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const LEVELS: Record<string, string> = { high_school: "High school", college: "College" };

// Chat languages that passed the translation eval (api/app/providers/translation/languages.py).
export const LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  hi: "हिन्दी",
  ar: "العربية",
  zh: "中文",
  de: "Deutsch",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  ro: "Română",
  sv: "Svenska",
  cs: "Čeština",
  hu: "Magyar",
  el: "Ελληνικά",
  ru: "Русский",
  uk: "Українська",
  tr: "Türkçe",
  he: "עברית",
  fa: "فارسی",
  ur: "اردو",
  bn: "বাংলা",
  pa: "ਪੰਜਾਬੀ",
  gu: "ગુજરાતી",
  mr: "मराठी",
  ta: "தமிழ்",
  te: "తెలుగు",
  kn: "ಕನ್ನಡ",
  ml: "മലയാളം",
  ne: "नेपाली",
  ko: "한국어",
  vi: "Tiếng Việt",
  th: "ไทย",
  id: "Bahasa Indonesia",
  ms: "Bahasa Melayu",
  tl: "Filipino",
  sw: "Kiswahili",
  ht: "Kreyòl ayisyen",
  ka: "ქართული",
  hy: "Հայերեն",
  km: "ខ្មែរ",
  si: "සිංහල",
};
