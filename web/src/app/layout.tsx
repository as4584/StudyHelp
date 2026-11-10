import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import { cookies, headers } from "next/headers";
import { WebsiteLanguageProvider } from "@/components/website-language";
import { isWebsiteLocale, LANGUAGE_COOKIE, resolveWebsiteLocale, WEBSITE_LANGUAGES } from "@/lib/locale";

import { AppShell } from "@/components/shell";
import { AuthProvider } from "@/components/auth";
import { ToastProvider } from "@/components/toast";

import "./globals.css";

// Interface voice: warm, highly legible grotesk with tabular figures (see DESIGN.md §3).
const ui = Hanken_Grotesk({ variable: "--font-ui", subsets: ["latin"], display: "swap" });
// Reading + display voice: book-like serif with optical sizes, for titles and explanations.
const read = Newsreader({
  variable: "--font-read",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "StudyHelp — your study desk with a tutor built in",
  description:
    "AI study help with one-tap escalation to vetted tutors, translated chat and payments held until delivery.",
  applicationName: "StudyHelp",
};

export const viewport: Viewport = { themeColor: "#f7f6f2", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);
  const preference = jar.get(LANGUAGE_COOKIE)?.value;
  const saved = isWebsiteLocale(preference) ? preference : null;
  const locale = resolveWebsiteLocale({
    saved: saved ?? undefined,
    acceptLanguage: requestHeaders.get("accept-language"),
    // Vercel supplies this from its edge. Other hosts fall back without trusting a caller's geo header.
    country: process.env.VERCEL === "1" ? requestHeaders.get("x-vercel-ip-country") : null,
  });
  const direction = WEBSITE_LANGUAGES.find(({ code }) => code === locale)!.direction;
  return (
    <html lang={locale} dir={direction} className={`${ui.variable} ${read.variable}`}>
      <body>
        <WebsiteLanguageProvider locale={locale} saved={saved}>
          <AuthProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </AuthProvider>
        </WebsiteLanguageProvider>
      </body>
    </html>
  );
}
