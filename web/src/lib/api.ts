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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Calls FastAPI with the current Supabase access token. The server derives identity and
 * role from that token + the database; we never send user ids or roles for ourselves.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, detail);
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
