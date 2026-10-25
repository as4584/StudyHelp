"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "./auth";

const LINKS: Record<string, [string, string][]> = {
  student: [["/student", "My tasks"], ["/assistant", "AI assistant"]],
  tutor: [["/tutor", "Tutor hub"]],
  admin: [["/admin", "Admin"]],
};

export function Nav() {
  const { me, session, signOut } = useAuth();
  const router = useRouter();
  const role = me?.profile.role;
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link href="/" className="font-bold text-brand">StudyHelp<span className="text-foreground">Tutor</span></Link>
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto text-sm">
          {role && LINKS[role]?.map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-2 py-1.5 hover:bg-background">
              {label}
            </Link>
          ))}
          {me && (
            <span data-testid="whoami" className="hidden whitespace-nowrap px-2 text-muted sm:inline">
              {me.profile.display_name} · {role}
            </span>
          )}
          {session ? (
            <button
              className="whitespace-nowrap rounded-lg px-2 py-1.5 text-muted hover:bg-background"
              onClick={async () => {
                await signOut();
                router.push("/");
              }}
            >
              Sign out
            </button>
          ) : (
            <Link href="/login" className="rounded-lg bg-brand px-3 py-1.5 text-brand-ink">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
