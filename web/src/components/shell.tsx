"use client";

import { BookOpen, Inbox, LayoutDashboard, LogOut, Scale, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "./auth";
import { Avatar } from "./ui";

type NavItem = { href: string; label: string; icon: LucideIcon; match?: RegExp };

const NAV: Record<string, NavItem[]> = {
  student: [
    { href: "/student", label: "Study desk", icon: LayoutDashboard, match: /^\/(student$|tasks\/)/ },
    { href: "/assistant", label: "AI tutor", icon: Sparkles },
    { href: "/student/tasks/new", label: "Ask a tutor", icon: BookOpen },
  ],
  tutor: [{ href: "/tutor", label: "Tutor desk", icon: Inbox, match: /^\/(tutor|tasks\/)/ }],
  admin: [{ href: "/admin", label: "Operations", icon: Scale, match: /^\/(admin|tasks\/)/ }],
};

export function Mark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2 ${className}`} aria-label="StudyHelp home">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect width="28" height="28" rx="7" className="fill-tutor" />
        {/* an open book whose spine is a rising line: study → understanding */}
        <path d="M7 9.5c2.6-.9 5-.6 7 1v9c-2-1.6-4.4-1.9-7-1z" fill="#fff" opacity=".95" />
        <path d="M21 9.5c-2.6-.9-5-.6-7 1v9c2-1.6 4.4-1.9 7-1z" fill="#fff" opacity=".7" />
      </svg>
      <span className="font-serif text-[19px] font-semibold tracking-[-0.01em] text-ink">StudyHelp</span>
    </Link>
  );
}

function useNav() {
  const { me } = useAuth();
  const path = usePathname();
  const items = (me && NAV[me.profile.role]) || [];
  const isActive = (i: NavItem) => (i.match ? i.match.test(path) : path === i.href);
  return { items, isActive };
}

/** Public pages (landing, auth) render without the workspace chrome. */
const BARE = /^\/($|login|signup|onboard)/;

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { session } = useAuth();
  if (BARE.test(path) || !session) return <PublicFrame signedIn={!!session}>{children}</PublicFrame>;
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[232px_1fr]">
      <Sidebar />
      <MobileBar />
      <main className="mx-auto w-full max-w-[1120px] px-5 pt-6 pb-20 sm:px-8 lg:px-10 lg:pt-12">{children}</main>
    </div>
  );
}

function PublicFrame({ children, signedIn }: { children: React.ReactNode; signedIn: boolean }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <Mark />
        <nav className="flex items-center gap-1 text-[15px]">
          {signedIn ? (
            <Link href="/dashboard" className="rounded-[6px] px-3 py-2 font-semibold text-ink hover:bg-sunken">
              Open your desk
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-[6px] px-3 py-2 font-semibold text-ink-2 hover:text-ink">
                Sign in
              </Link>
              <Link href="/signup" className="rounded-[6px] bg-ink px-3.5 py-2 font-semibold text-white hover:bg-ink-2">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1120px] px-5 pb-20 sm:px-8">{children}</main>
    </div>
  );
}

function Account() {
  const { me, signOut } = useAuth();
  const router = useRouter();
  if (!me) return null;
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={me.profile.display_name} tone={me.profile.role === "tutor" ? "tutor" : "muted"} />
      <div className="min-w-0 flex-1 leading-tight">
        <div data-testid="whoami" className="text-[14px] leading-snug font-semibold break-words text-ink">
          {me.profile.display_name}
        </div>
        <div className="text-[12px] text-muted capitalize">
          {me.profile.role}
          {me.premium ? " · Premium" : ""}
        </div>
      </div>
      <button
        aria-label="Sign out"
        title="Sign out"
        className="rounded-[6px] p-2 text-muted transition-colors hover:bg-sunken hover:text-ink"
        onClick={async () => {
          await signOut();
          router.push("/");
        }}
      >
        <LogOut size={16} strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Sign out</span>
      </button>
    </div>
  );
}

function Sidebar() {
  const { items, isActive } = useNav();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-rule bg-paper px-4 py-6 lg:flex">
      <Mark className="px-2" />
      <nav className="mt-10 space-y-0.5" aria-label="Main">
        {items.map((i) => {
          const active = isActive(i);
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-9 items-center gap-2.5 rounded-[6px] px-2.5 text-[14px] font-semibold transition-colors ${
                active ? "bg-tutor-soft text-tutor" : "text-ink-2 hover:bg-sunken hover:text-ink"
              }`}
            >
              <i.icon size={17} strokeWidth={1.75} aria-hidden />
              {i.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-rule pt-4">
        <Account />
      </div>
    </aside>
  );
}

function MobileBar() {
  const { items, isActive } = useNav();
  return (
    <div className="sticky top-0 z-20 border-b border-rule bg-paper/95 backdrop-blur-sm lg:hidden">
      <div className="flex h-14 items-center justify-between px-5 sm:px-8">
        <Mark />
        <MobileAccount />
      </div>
      {items.length > 1 && (
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 sm:px-7" aria-label="Main">
          {items.map((i) => {
            const active = isActive(i);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 shrink-0 items-center gap-2 rounded-[6px] px-3 text-[14px] font-semibold ${
                  active ? "bg-tutor-soft text-tutor" : "text-ink-2"
                }`}
              >
                <i.icon size={16} strokeWidth={1.75} aria-hidden />
                {i.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function MobileAccount() {
  const { me, signOut } = useAuth();
  const router = useRouter();
  if (!me) return null;
  return (
    <div className="flex items-center gap-1">
      <Avatar name={me.profile.display_name} tone={me.profile.role === "tutor" ? "tutor" : "muted"} />
      <button
        className="rounded-[6px] px-2 py-2 text-[14px] font-semibold text-muted hover:text-ink"
        onClick={async () => {
          await signOut();
          router.push("/");
        }}
      >
        Sign out
      </button>
    </div>
  );
}
