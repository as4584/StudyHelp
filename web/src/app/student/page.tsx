"use client";

import { ArrowRight, ArrowUp, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { PathHistory, SessionPath } from "@/components/study-path";
import { Badge, Button, EmptyState, ErrorText, LinkButton, Skeleton, TIMELINE, useAction } from "@/components/ui";
import { api, money, type Bid, type Task } from "@/lib/api";
import { isActive, studentNextStep } from "@/lib/next-step";
import { accentFor, subjectFamily } from "@/lib/subjects";

/** A typographic mark per subject family, used as a large graphic element (decorative). */
const GLYPH = { math: "∫", science: "Δ", writing: "¶", computing: "{ }", general: "§" } as const;

const stepIndex = (t: Task) =>
  t.status === "completed"
    ? TIMELINE.length
    : Math.max(
        0,
        TIMELINE.findIndex((s) => s.key === t.status),
      );

export default function StudyDesk() {
  const { me } = useRequireRole("student");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [bidCounts, setBidCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!me) return;
    api<Task[]>("/tasks?scope=mine").then(async (ts) => {
      setTasks(ts);
      const open = ts.filter((t) => t.status === "open");
      const counts = await Promise.all(
        open.map((t) => api<Bid[]>(`/tasks/${t.id}/bids`).then((b) => [t.id, b.length] as const)),
      );
      setBidCounts(Object.fromEntries(counts));
    });
  }, [me]);

  const view = useMemo(() => {
    const ts = (tasks ?? []).filter((t) => t.status !== "cancelled");
    const act = ts.filter(isActive);
    const ranked = [...act].sort(
      (a, b) => studentNextStep(a, bidCounts[a.id]).rank - studentNextStep(b, bidCounts[b.id]).rank,
    );
    const stepsDone = ts.reduce((n, t) => n + Math.min(stepIndex(t), TIMELINE.length), 0);
    return {
      next: ranked[0],
      active: act,
      done: ts.filter((t) => t.status === "completed"),
      all: ts,
      stepsDone,
      stepsTotal: ts.length * TIMELINE.length,
      subjects: [...new Set(ts.map((t) => t.subject))],
    };
  }, [tasks, bidCounts]);

  if (!me) return <Skeleton lines={4} />;
  const today = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div>
          <div className="micro text-muted">{today}</div>
          <h1 className="mt-1 font-serif text-[1.375rem] font-medium tracking-[-0.01em] text-ink-2">Study desk</h1>
        </div>
        <LinkButton href="/student/tasks/new" variant="secondary">
          Request a tutor
        </LinkButton>
      </header>

      {tasks === null ? (
        <div className="rounded-[16px] border border-rule bg-sheet p-8">
          <Skeleton lines={4} />
        </div>
      ) : view.next ? (
        <Focus task={view.next} bids={bidCounts[view.next.id] ?? 0} />
      ) : (
        <EmptyFocus hasHistory={view.all.length > 0} />
      )}

      <div className="mt-14 grid gap-12 lg:mt-16 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
        <Progress view={view} />
        <AskTutor premium={me.premium} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Moment 1: today's focus */

function Focus({ task, bids }: { task: Task; bids: number }) {
  const step = studentNextStep(task, bids);
  const accent = accentFor(task.subject);
  const family = subjectFamily(task.subject);
  return (
    <section
      aria-label="Today's focus"
      className="lit-field relative isolate overflow-hidden rounded-[16px] border border-rule shadow-[0_1px_0_rgb(255_255_255/0.8)_inset,0_1px_2px_rgb(20_22_27/0.05),0_30px_60px_-30px_rgb(30_27_75/0.25)]"
      style={{ ["--glow" as string]: accent.glow }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 -z-10 -translate-y-[46%] font-serif text-[13rem] leading-none italic select-none sm:right-14 sm:text-[19rem]"
        style={{ color: accent.mark, opacity: 0.11 }}
      >
        {GLYPH[family]}
      </span>
      <div className="px-6 pt-7 pb-6 sm:px-10 sm:pt-10">
        <div className="reveal flex items-center gap-2" style={{ animationDelay: "40ms" }}>
          <span className="size-2 rounded-full" style={{ background: accent.mark }} />
          <span className="micro" style={{ color: accent.ink }}>
            Today&apos;s focus · {task.subject}
          </span>
        </div>
        <h2
          className="reveal mt-4 max-w-[18ch] font-serif text-[2.4rem] leading-[1.02] font-medium tracking-[-0.03em] text-ink sm:text-[3.5rem]"
          style={{ animationDelay: "90ms" }}
        >
          {step.headline}
        </h2>
        <p className="reveal mt-4 max-w-[52ch] text-[17px] text-ink-2" style={{ animationDelay: "150ms" }}>
          {task.title}
        </p>
        <div className="reveal mt-9 max-w-[44rem] pb-6 sm:pb-4" style={{ animationDelay: "210ms" }}>
          <SessionPath status={task.status} accent={accent.mark} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-rule/80 bg-sheet/60 px-6 py-4 backdrop-blur-sm sm:px-10">
        <span className="flex items-center gap-4 text-[14px] text-muted">
          <Badge status={task.status} />
          <span className="tnum">Budget {money(task.budget_cents)}</span>
        </span>
        <LinkButton href={`/tasks/${task.id}`} className="px-5">
          {step.cta} <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </LinkButton>
      </div>
    </section>
  );
}

function EmptyFocus({ hasHistory }: { hasHistory: boolean }) {
  return (
    <section className="lit-field relative isolate overflow-hidden rounded-[16px] border border-rule px-6 py-10 sm:px-10 sm:py-14">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 right-8 -z-10 font-serif text-[22rem] leading-none text-tutor italic opacity-[0.07] select-none"
      >
        §
      </span>
      <div className="micro text-tutor">Today&apos;s focus</div>
      <h2 className="mt-4 max-w-[18ch] font-serif text-[2.4rem] leading-[1.02] font-medium tracking-[-0.03em] sm:text-[3.5rem]">
        {hasHistory ? "Nothing waiting on you." : "What do you want to understand?"}
      </h2>
      <p className="mt-4 max-w-[48ch] text-[17px] text-ink-2">
        Start with the AI tutor, or post a request and vetted tutors will send you offers.
      </p>
      <div className="mt-8">
        <LinkButton href="/student/tasks/new">
          Request a tutor <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </LinkButton>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Moment 3: study path */

type View = {
  all: Task[];
  done: Task[];
  active: Task[];
  stepsDone: number;
  stepsTotal: number;
  subjects: string[];
};

const STATUS_LABEL: Record<string, string> = {
  open: "Collecting offers",
  hired: "Awaiting payment",
  paid: "In session",
  delivered: "Delivered",
  completed: "Completed",
  disputed: "Under review",
  refunded: "Refunded",
};

function Progress({ view }: { view: View }) {
  const stops = [...view.all].reverse().map((t) => ({
    id: t.id,
    title: t.title,
    subject: t.subject,
    accent: accentFor(t.subject).mark,
    progress: Math.min(stepIndex(t), TIMELINE.length) / TIMELINE.length,
    done: t.status === "completed",
  }));
  return (
    <section aria-labelledby="path-h" className="min-w-0">
      <h2 id="path-h" className="font-serif text-[1.75rem] leading-tight font-medium tracking-[-0.02em]">
        Your study path
      </h2>
      {view.all.length === 0 ? (
        <EmptyState>Each session you take becomes a stop on your path.</EmptyState>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-3 gap-4 sm:gap-6">
            <div>
              <dd className="tnum font-serif text-[2.5rem] leading-none sm:text-[3.25rem] font-medium tracking-[-0.03em] text-mastery">
                {view.stepsDone}
                <span className="text-[1.5rem] text-muted">/{view.stepsTotal}</span>
              </dd>
              <dt className="micro mt-2 leading-snug text-muted">Steps complete</dt>
            </div>
            <div>
              <dd className="tnum font-serif text-[2.5rem] leading-none sm:text-[3.25rem] font-medium tracking-[-0.03em] text-ink">
                {view.done.length}
              </dd>
              <dt className="micro mt-2 leading-snug text-muted">Sessions finished</dt>
            </div>
            <div>
              <dd className="tnum font-serif text-[2.5rem] leading-none sm:text-[3.25rem] font-medium tracking-[-0.03em] text-ink">
                {view.subjects.length}
              </dd>
              <dt className="micro mt-2 leading-snug text-muted">
                {view.subjects.length === 1 ? "Subject" : "Subjects"}
              </dt>
            </div>
          </dl>

          <div className="mt-8">
            <PathHistory stops={stops} nextHref="/student/tasks/new" />
          </div>

          <ul className="mt-8 divide-y divide-rule border-t border-rule">
            {view.all.map((t) => {
              const a = accentFor(t.subject);
              return (
                <li key={t.id}>
                  <Link href={`/tasks/${t.id}`} className="group flex items-center gap-4 py-3.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: a.mark }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-[17px] text-ink transition-colors group-hover:text-tutor">
                        {t.title}
                      </span>
                      <span className="text-[13px]" style={{ color: a.ink }}>
                        {t.subject}
                      </span>
                    </span>
                    <span className="hidden sm:block">
                      <Badge status={t.status} label={STATUS_LABEL[t.status]} />
                    </span>
                    <ArrowRight
                      size={16}
                      strokeWidth={1.75}
                      className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-tutor"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- AI tutor entry */

function AskTutor({ premium }: { premium: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const upgrade = useAction();
  return (
    <section
      aria-labelledby="ai-h"
      className="relative isolate min-w-0 self-start overflow-hidden rounded-[16px] bg-tutor-deep px-6 py-7 text-white shadow-[0_30px_60px_-30px_rgb(30_27_75/0.6)] sm:px-8"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(70% 60% at 100% 0%, rgb(129 140 248 / 0.45), transparent 70%), radial-gradient(60% 50% at 0% 100%, rgb(20 184 166 / 0.18), transparent 70%)",
        }}
      />
      <div className="flex items-center gap-2 text-lavender">
        <Sparkles size={15} strokeWidth={1.9} aria-hidden />
        <span className="micro">AI tutor{premium ? " · Premium" : ""}</span>
      </div>
      <h2 id="ai-h" className="mt-3 font-serif text-[1.75rem] leading-[1.15] font-medium tracking-[-0.02em]">
        {premium ? "What are you trying to understand right now?" : "A patient study coach, any hour."}
      </h2>
      {premium ? (
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/assistant?${new URLSearchParams({ q }).toString()}`);
          }}
        >
          <div className="flex items-end gap-2 rounded-[10px] bg-white/10 p-2 ring-1 ring-white/15 transition focus-within:bg-white/[0.14] focus-within:ring-lavender">
            <textarea
              aria-label="Ask the AI tutor"
              className="min-h-20 w-full resize-none bg-transparent px-2 py-1.5 text-[16px] text-white outline-none placeholder:text-lavender/70"
              placeholder="e.g. Why does the chain rule multiply by the inner derivative?"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              type="submit"
              aria-label="Ask"
              className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-white text-tutor-deep transition-transform hover:-translate-y-px active:scale-95"
            >
              <ArrowUp size={18} strokeWidth={2.25} aria-hidden />
            </button>
          </div>
          <p className="mt-3 text-[13px] text-lavender/90">
            It guides you to the answer — and hands you to a live expert, conversation attached, when you&apos;re stuck.
          </p>
        </form>
      ) : (
        <div className="mt-4">
          <ul className="space-y-1.5 text-[15px] text-lavender">
            <li>Explanations, worked examples and hints, 24/7</li>
            <li>One tap to a live expert with the conversation attached</li>
            <li>Priority matching and session discounts</li>
          </ul>
          <ErrorText error={upgrade.error} />
          <div className="mt-6 flex items-center gap-4">
            <Button
              className="border-0 bg-white text-tutor-deep hover:bg-lavender"
              variant="secondary"
              disabled={upgrade.pending}
              onClick={() =>
                upgrade.run(async () => {
                  const { url } = await api<{ url: string }>("/premium/checkout", { body: {} });
                  window.location.href = url;
                })
              }
            >
              Upgrade to Premium
            </Button>
            <span className="tnum text-[14px] text-lavender">$9.99 / month</span>
          </div>
        </div>
      )}
    </section>
  );
}
