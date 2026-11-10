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
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const send = () =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Never leave a page on "Loading…" forever.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  let res: Response;
  try {
    res = await send();
    // Reads are safe to repeat once (cold start or a dropped connection); writes are not.
    if (method === "GET" && RETRYABLE.has(res.status)) res = await send();
  } catch {
    const slow = new ApiError(0, "The server took too long to respond. Please try again.");
    if (method !== "GET") throw slow;
    try {
      res = await send();
    } catch {
      throw slow;
    }
  }
  if (!res.ok) {
    let detail = res.statusText;
    let code: string | undefined;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : validationMessage(j.detail);
      code = typeof j.code === "string" ? j.code : undefined;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, detail, code);
  }
  return (await res.json()) as T;
}

export const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const LEVELS: Record<string, string> = { high_school: "High school", college: "College" };

export const LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  hi: "हिन्दी",
  ar: "العربية",
  zh: "中文",
};
