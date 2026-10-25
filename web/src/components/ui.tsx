"use client";

import Link from "next/link";
import { useState } from "react";

export function Card({ title, action, children, className = "" }: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" };

export function Button({ variant = "primary", className = "", ...props }: BtnProps) {
  const styles = {
    primary: "bg-brand text-brand-ink hover:opacity-90",
    ghost: "border border-border bg-surface hover:bg-background",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function LinkButton({ href, children, variant = "primary" }: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  const styles = variant === "primary" ? "bg-brand text-brand-ink" : "border border-border bg-surface";
  return (
    <Link href={href} className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium ${styles}`}>
      {children}
    </Link>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-11 rounded-xl border border-border bg-surface px-3 py-2 text-base outline-none focus:border-brand sm:text-sm";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-sky-100 text-sky-800",
  hired: "bg-amber-100 text-amber-800",
  paid: "bg-indigo-100 text-indigo-800",
  held: "bg-indigo-100 text-indigo-800",
  delivered: "bg-violet-100 text-violet-800",
  completed: "bg-emerald-100 text-emerald-800",
  released: "bg-emerald-100 text-emerald-800",
  approved: "bg-emerald-100 text-emerald-800",
  accepted: "bg-emerald-100 text-emerald-800",
  disputed: "bg-red-100 text-red-800",
  refunded: "bg-gray-200 text-gray-700",
  rejected: "bg-gray-200 text-gray-700",
  cancelled: "bg-gray-200 text-gray-700",
  pending: "bg-yellow-100 text-yellow-800",
};

export function Badge({ status }: { status: string }) {
  return (
    <span data-testid="status" className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[status] ?? "bg-gray-100"}`}>
      {status}
    </span>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
}

/** Wraps an async action with pending + error state. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setPending(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { pending, error, run, setError };
}

export function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span aria-label={`${value.toFixed(1)} stars`} className="text-amber-500">
      {"★".repeat(full)}
      <span className="text-gray-300">{"★".repeat(5 - full)}</span>
    </span>
  );
}
