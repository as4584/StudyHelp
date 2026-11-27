"use server";

import { cookies, headers } from "next/headers";
import { isWebsiteLocale, LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE } from "@/lib/locale";

/** UI preference only: no profile, authentication, or chat-language mutation. */
export async function saveWebsiteLanguage(value: string): Promise<void> {
  if (value !== "auto" && !isWebsiteLocale(value)) throw new Error("Unsupported website language");
  const jar = await cookies();
  // Secure whenever the page was served over HTTPS (every real deploy). Deciding by build mode
  // instead made Safari drop the cookie on a plain-http local build, so the choice never stuck.
  const proto = (await headers()).get("x-forwarded-proto") ?? "http";
  jar.set(LANGUAGE_COOKIE, value === "auto" ? "" : value, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto.split(",")[0].trim() === "https",
    path: "/",
    maxAge: value === "auto" ? 0 : LANGUAGE_COOKIE_MAX_AGE,
  });
}
