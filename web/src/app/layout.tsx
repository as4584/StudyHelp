import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import { AuthProvider } from "@/components/auth";
import { Nav } from "@/components/nav";

import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Global Study Help Tutor",
  description: "AI study help with 1-click escalation to vetted global tutors.",
  applicationName: "Study Help Tutor",
};

export const viewport: Viewport = { themeColor: "#4f46e5", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} antialiased`}>
        <AuthProvider>
          <Nav />
          <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4 sm:pt-6">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
