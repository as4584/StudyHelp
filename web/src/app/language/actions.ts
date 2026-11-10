"use server";

import { cookies } from "next/headers";
import { isWebsiteLocale, LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE } from "@/lib/locale";

/** UI preference only: no profile, authentication, or chat-language mutation. */
export async function saveWebsiteLanguage(value: string): Promise<void> {
  if (value !== "auto" && !isWebsiteLocale(value)) throw new Error("Unsupported website language");
  const jar = await cookies();
  jar.set(LANGUAGE_COOKIE, value === "auto" ? "" : value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: value === "auto" ? 0 : LANGUAGE_COOKIE_MAX_AGE,
  });
}
