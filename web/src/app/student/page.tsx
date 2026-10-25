"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useRequireRole } from "@/components/auth";
import {
  Badge,
  Button,
  EmptyState,
  ErrorText,
  LinkButton,
  PageHeader,
  Section,
  Sheet,
  Skeleton,
  Timeline,
  inputCls,
  useAction,
} from "@/components/ui";
import { api, money, type Bid, type Task } from "@/lib/api";
import { isActive, studentNextStep } from "@/lib/next-step";

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

  const { next, active, done } = useMemo(() => {
    const ts = tasks ?? [];
    const act = ts.filter(isActive);
    const ranked = [...act].sort(
      (a, b) => studentNextStep(a, bidCounts[a.id]).rank - studentNextStep(b, bidCounts[b.id]).rank,
    );
    return { next: ranked[0], active: act, done: ts.filter((t) => t.status === "completed") };
  }, [tasks, bidCounts]);

  if (!me) return <Skeleton lines={4} />;
  const subjects = [...new Set((tasks ?? []).map((t) => t.subject))];

  return (
    <div>
      <PageHeader
        title="Study desk"
        lede={
          tasks && tasks.length
            ? `${active.length} active ${active.length === 1 ? "session" : "sessions"} · ${done.length} completed`
            : "Ask the AI tutor anything, or bring in a live expert."
        }
        action={
          <LinkButton href="/student/tasks/new" variant="secondary">
            Request a tutor
          </LinkButton>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-12">
        <div className="min-w-0 space-y-10">
          {tasks === null ? (
            <Skeleton lines={3} />
          ) : next ? (
            <NextUp task={next} bids={bidCounts[next.id] ?? 0} />
          ) : (
            <Sheet className="p-6">
              <EmptyState action={<LinkButton href="/student/tasks/new">Request a tutor</LinkButton>}>
                Nothing waiting on you. When you post a request, tutors send offers here.
              </EmptyState>
            </Sheet>
          )}

          <Section title="Your sessions">
            {tasks === null ? (
              <Skeleton />
            ) : tasks.length === 0 ? (
              <EmptyState>Your tutoring sessions will appear here.</EmptyState>
            ) : (
              <ul className="divide-y divide-rule">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tasks/${t.id}`}
                      className="group grid gap-3 py-4 sm:grid-cols-[1fr_11rem] sm:items-center sm:gap-6"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-serif text-[17px] font-medium text-ink group-hover:text-tutor">
                          {t.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-3 text-[13px] text-muted">
                          <span>{t.subject}</span>
                          <Badge status={t.status} label={statusLabel(t.status)} />
                        </span>
                      </span>
                      <Timeline status={t.status} compact />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside className="min-w-0 space-y-10">
          <AskTutor premium={me.premium} />
          {done.length > 0 && (
            <Section title="Your progress">
              <dl className="grid grid-cols-2 gap-y-4">
                <div>
                  <dt className="text-[13px] text-muted">Sessions completed</dt>
                  <dd className="tnum font-serif text-[2rem] leading-tight font-medium text-mastery">{done.length}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted">Subjects studied</dt>
                  <dd className="tnum font-serif text-[2rem] leading-tight font-medium text-ink">{subjects.length}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[13px] text-muted">{subjects.join(" · ")}</p>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}

const statusLabel = (s: string) =>
  ({
    open: "Collecting offers",
    hired: "Awaiting payment",
    paid: "In session",
    delivered: "Delivered",
    completed: "Completed",
  })[s] ?? s;

function NextUp({ task, bids }: { task: Task; bids: number }) {
  const step = studentNextStep(task, bids);
  return (
    <Sheet className="enter overflow-hidden">
      <div className="p-6 sm:p-7">
        <div
          className={`text-[13px] font-semibold ${step.tone === "attention" ? "text-attention" : step.tone === "tutor" ? "text-tutor" : "text-muted"}`}
        >
          Next up
        </div>
        <h2 className="mt-2 font-serif text-[1.5rem] leading-snug font-medium tracking-[-0.01em] text-ink">
          {step.headline}
        </h2>
        <p className="mt-1 text-[15px] text-ink-2">
          {task.title} · <span className="text-muted">{task.subject}</span>
        </p>
        <div className="mt-6">
          <Timeline status={task.status} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-rule bg-paper/60 px-6 py-3.5 sm:px-7">
        <span className="tnum text-[13px] text-muted">Budget {money(task.budget_cents)}</span>
        <LinkButton href={`/tasks/${task.id}`}>
          {step.cta} <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </LinkButton>
      </div>
    </Sheet>
  );
}

function AskTutor({ premium }: { premium: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const upgrade = useAction();
  return (
    <Section title="AI tutor">
      {premium ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/assistant?${new URLSearchParams({ q }).toString()}`);
          }}
        >
          <p className="mb-3 font-serif text-[17px] leading-relaxed text-ink-2">
            What are you trying to understand right now?
          </p>
          <textarea
            aria-label="Ask the AI tutor"
            className={`${inputCls} min-h-24 resize-none`}
            placeholder="e.g. Why does the chain rule multiply by the inner derivative?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-tutor">
              <Sparkles size={15} strokeWidth={1.75} aria-hidden /> Premium is active
            </span>
            <Button type="submit">Ask</Button>
          </div>
        </form>
      ) : (
        <div>
          <p className="font-serif text-[17px] leading-relaxed text-ink-2">
            A patient study coach, any hour — it guides you step by step and hands you to a live expert when you&apos;re
            stuck.
          </p>
          <ul className="mt-3 space-y-1 text-[14px] text-ink-2">
            <li>AI study assistant, 24/7</li>
            <li>Priority matching with tutors</li>
            <li>Session discounts</li>
          </ul>
          <ErrorText error={upgrade.error} />
          <div className="mt-4 flex items-center gap-3">
            <Button
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
            <span className="tnum text-[14px] text-muted">$9.99 / month</span>
          </div>
        </div>
      )}
    </Section>
  );
}
