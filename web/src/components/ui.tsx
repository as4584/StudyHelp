"use client";

import { AlertCircle, Check, Paperclip } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

/* Primitives for the study-desk design system. Tokens and rules: /DESIGN.md. */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ------------------------------------------------------------------ layout

export function PageHeader({
  title,
  lede,
  action,
  meta,
}: {
  title: React.ReactNode;
  lede?: React.ReactNode;
  action?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-10">
      <div className="min-w-0 max-w-[46rem]">
        {meta && <div className="mb-2 text-[13px] font-medium text-muted">{meta}</div>}
        <h1 className="font-serif text-[1.75rem] leading-[1.15] font-medium tracking-[-0.015em] text-ink sm:text-[2.125rem]">
          {title}
        </h1>
        {lede && <p className="mt-2 max-w-[60ch] text-[15px] text-ink-2">{lede}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </header>
  );
}

/** A titled group on paper. No container: hierarchy comes from type and space. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("min-w-0", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-rule pb-2">
          {title && <h2 className="micro text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A working surface: forms, the conversation, the receipt, the next-up block. */
export function Sheet({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "rounded-[10px] border border-rule bg-sheet shadow-[0_1px_2px_rgb(20_22_27/0.04),0_1px_0_rgb(20_22_27/0.03)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Back-compat titled sheet. */
export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet className={cx("p-5 sm:p-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="font-serif text-xl font-medium">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </Sheet>
  );
}

// ------------------------------------------------------------------ controls

type Variant = "primary" | "secondary" | "quiet" | "attention" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "btn-tactile bg-tutor text-white hover:bg-tutor-hover",
  secondary: "border border-rule-strong bg-sheet text-ink hover:border-ink-2/40 hover:bg-paper",
  ghost: "border border-rule-strong bg-sheet text-ink hover:border-ink-2/40 hover:bg-paper",
  quiet: "text-ink-2 underline-offset-4 hover:text-ink hover:underline",
  attention: "bg-attention-soft text-attention hover:bg-[#fbe9c8]",
  danger: "border border-danger/30 bg-sheet text-danger hover:bg-danger-soft",
};
const BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] px-4 text-[15px] font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 sm:min-h-10";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

/**
 * A button that shows its own work. If onClick returns a promise (our `useAction().run`), only
 * this button shows a spinner until it settles; `loading` does the same for submit buttons.
 * The label stays in place (invisible) so the width never jumps.
 */
export function Button({
  variant = "primary",
  className,
  loading,
  onClick,
  children,
  disabled,
  ...props
}: BtnProps & { loading?: boolean }) {
  const [own, setOwn] = useState(false);
  const busy = !!loading || own;
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={(e) => {
        const r = onClick?.(e) as unknown;
        if (r && typeof (r as Promise<unknown>).then === "function") {
          setOwn(true);
          void (r as Promise<unknown>).finally(() => setOwn(false));
        }
      }}
      className={cx(
        BTN,
        VARIANTS[variant],
        variant === "quiet" && "px-1",
        "relative",
        busy && "disabled:opacity-100",
        className,
      )}
    >
      <span className={cx("inline-flex items-center gap-2", busy && "invisible")}>{children}</span>
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        </span>
      )}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link href={href} className={cx(BTN, VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[14px] font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="block text-[13px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-11 rounded-[6px] border border-rule-strong bg-sheet px-3 py-2 text-[16px] text-ink placeholder:text-muted/80 outline-none transition-[border-color,box-shadow] duration-150 focus:border-tutor focus:ring-2 focus:ring-tutor/20 sm:text-[15px]";

/** A designed file picker (never the browser default) that shows the chosen file. */
export function FileButton({
  label,
  accept,
  onFile,
  hint,
  busy,
}: {
  label: string;
  accept?: string;
  onFile: (f: File | null) => void;
  hint?: string;
  busy?: boolean;
}) {
  const id = useId();
  const [name, setName] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <span className="block text-[14px] font-semibold text-ink">{label}</span>
      <label
        htmlFor={id}
        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[6px] border border-dashed border-rule-strong bg-sheet px-3 text-[15px] text-ink-2 transition-colors hover:border-tutor hover:text-ink focus-within:border-tutor focus-within:ring-2 focus-within:ring-tutor/20"
      >
        <Paperclip size={16} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden />
        <span className="truncate">{busy ? `Uploading ${name ?? "file"}…` : (name ?? "Choose a file")}</span>
        <input
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setName(f?.name ?? null);
            onFile(f);
          }}
        />
      </label>
      {hint && <span className="block text-[13px] leading-snug text-muted">{hint}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ status

type Tone = "tutor" | "attention" | "mastery" | "muted" | "danger";
const TONE_TEXT: Record<Tone, string> = {
  tutor: "text-tutor",
  attention: "text-attention",
  mastery: "text-mastery",
  muted: "text-muted",
  danger: "text-danger",
};
const TONE_DOT: Record<Tone, string> = {
  tutor: "bg-tutor",
  attention: "bg-attention-mark",
  mastery: "bg-mastery-mark",
  muted: "bg-rule-strong",
  danger: "bg-danger",
};

/** Status → semantic tone. Amber = needs someone to act; indigo = in progress; teal = done. */
const STATUS_TONE: Record<string, Tone> = {
  open: "attention",
  pending: "attention",
  hired: "attention",
  paid: "tutor",
  held: "tutor",
  delivered: "attention",
  completed: "mastery",
  released: "mastery",
  approved: "mastery",
  accepted: "mastery",
  created: "mastery",
  disputed: "danger",
  rejected: "muted",
  refunded: "muted",
  cancelled: "muted",
  expired: "muted",
  failed: "danger",
};

export function Badge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[13px] font-semibold", TONE_TEXT[tone])}>
      <span aria-hidden className={cx("size-1.5 rounded-full", TONE_DOT[tone])} />
      <span data-testid="status" className={label ? undefined : "capitalize"}>
        {label ?? status}
      </span>
    </span>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 text-[14px] text-danger">
      <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
      <span>{error}</span>
    </p>
  );
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

export function Stars({ value, count }: { value: number; count?: number }) {
  if (count === 0) return <span className="text-[13px] text-muted">New tutor</span>;
  return (
    <span
      className="tnum inline-flex items-center gap-1 text-[13px] font-semibold text-ink"
      aria-label={`Rated ${value.toFixed(1)} of 5`}
    >
      <svg viewBox="0 0 20 20" className="size-3.5 fill-attention-mark" aria-hidden>
        <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.8z" />
      </svg>
      {value.toFixed(1)}
      {count !== undefined && <span className="font-medium text-muted">({count})</span>}
    </span>
  );
}

export function Avatar({ name, tone = "muted" }: { name: string; tone?: "tutor" | "muted" | "mastery" }) {
  // Initial of the given name, skipping honorifics ("Prof. Diego" -> "D").
  const word = name.replace(/^(prof|dr|mr|mrs|ms)\.?\s+/i, "").trim();
  const initial = (word[0] ?? "?").toUpperCase();
  const t = { tutor: "bg-tutor text-white", muted: "bg-sunken text-ink-2", mastery: "bg-mastery-soft text-mastery" }[
    tone
  ];
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
        t,
      )}
    >
      {initial}
    </span>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${88 - i * 17}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="py-6">
      <p className="font-serif text-[17px] leading-relaxed text-ink-2 italic">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ session timeline

export const TIMELINE = [
  { key: "open", label: "Bids" },
  { key: "hired", label: "Hired" },
  { key: "paid", label: "Paid" },
  { key: "delivered", label: "Delivered" },
  { key: "completed", label: "Released" },
] as const;

export function Timeline({ status, compact = false }: { status: string; compact?: boolean }) {
  const idx = TIMELINE.findIndex((s) => s.key === status);
  const current = idx === -1 ? (status === "disputed" ? 3 : -1) : idx;
  if (compact) {
    // Dense lists: five segments; teal = done, indigo = current, rule = ahead.
    const label = status === "completed" ? "All steps done" : `Step ${current + 1} of ${TIMELINE.length}`;
    return (
      <div className="flex w-full items-center gap-1" role="img" aria-label={label}>
        {TIMELINE.map((s, i) => (
          <span
            key={s.key}
            className={cx(
              "h-1 flex-1 rounded-full",
              status === "completed" || i < current ? "bg-mastery-mark" : i === current ? "bg-tutor" : "bg-rule",
            )}
          />
        ))}
      </div>
    );
  }
  const done = (i: number) => i < current || status === "completed";
  return (
    <ol className={cx("flex items-start", compact ? "gap-0" : "gap-0")} aria-label="Session progress">
      {TIMELINE.map((s, i) => {
        const isDone = done(i);
        const isCurrent = i === current && status !== "completed";
        return (
          <li
            key={s.key}
            className="relative flex min-w-0 flex-1 flex-col items-start"
            aria-current={isCurrent ? "step" : undefined}
          >
            <div className="flex w-full items-center">
              <span
                className={cx(
                  "relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
                  isDone && "border-mastery bg-mastery text-white",
                  isCurrent && "current-ring border-tutor bg-sheet",
                  !isDone && !isCurrent && "border-rule-strong bg-sheet",
                )}
              >
                {isDone && <Check size={12} strokeWidth={3} aria-hidden />}
                {isCurrent && <span className="size-2 rounded-full bg-tutor" />}
              </span>
              {i < TIMELINE.length - 1 && (
                <span
                  className={cx(
                    "h-px flex-1 transition-colors duration-300",
                    i < current || status === "completed" ? "bg-mastery" : "bg-rule-strong",
                  )}
                />
              )}
            </div>
            {!compact && (
              <span
                className={cx(
                  "mt-2 truncate pr-2 text-[12px] font-semibold sm:text-[13px]",
                  isCurrent ? "text-ink" : isDone ? "text-mastery" : "text-muted",
                  !isCurrent && "max-sm:sr-only",
                )}
              >
                {s.label}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Demo adapters prefix their output with a bracketed label ("[ES→EN] ", "[Demo AI — …] ").
 * Keep it visible (honesty) but set it as a quiet tag instead of inside the reading text.
 * The tag keeps its trailing space so the text content is unchanged.
 */
export function DemoTagged({ text }: { text: string }) {
  const m = /^(\[[^\]]{1,80}\])\s/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className="mr-1 inline-block translate-y-[-1px] rounded-[4px] bg-sunken px-1.5 py-px align-middle font-sans text-[11px] font-semibold tracking-[0.01em] text-muted">
        {m[1]}
      </span>{" "}
      {text.slice(m[0].length)}
    </>
  );
}
