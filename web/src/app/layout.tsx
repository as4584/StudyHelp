import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";

import { AppShell } from "@/components/shell";
import { AuthProvider } from "@/components/auth";

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
  description: "AI study help with one-tap escalation to vetted tutors, translated chat and payments held until delivery.",
  applicationName: "StudyHelp",
};

export const viewport: Viewport = { themeColor: "#f7f6f2", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ui.variable} ${read.variable}`}>
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
