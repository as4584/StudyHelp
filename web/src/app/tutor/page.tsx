"use client";

import { ArrowRight, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { PathLine, sessionStages } from "@/components/path-line";
import {
  Badge,
  Button,
  EmptyState,
  ErrorText,
  Field,
  FileButton,
  Section,
  Sheet,
  Skeleton,
  Stars,
  inputCls,
  useAction,
} from "@/components/ui";
import { api, money, type PaymentState, type Task } from "@/lib/api";
import { accentFor } from "@/lib/subjects";
import { uploadToSignedUrl } from "@/lib/upload";

/*
 * Tutor desk — the professional counterpart of the student Study desk. One headline sentence about
 * what needs the tutor, editorial earnings computed from real payment records, then the two working
 * lists: requests to answer and sessions in progress (on the study path).
 */
export default function TutorDesk() {
  const { me, refresh } = useRequireRole("tutor");
  const [open, setOpen] = useState<Task[] | null>(null);
  const [mine, setMine] = useState<Task[] | null>(null);
  const [payState, setPayState] = useState<Record<string, PaymentState>>({});
  const tutor = me?.tutor ?? null;

  const load = useCallback(async () => {
    const [o, m] = await Promise.all([api<Task[]>("/tasks?scope=open"), api<Task[]>("/tasks?scope=mine")]);
    setOpen(o);
    setMine(m);
    const states = await Promise.all(
      m
        .filter((t) => t.status !== "hired")
        .map((t) => api<PaymentState>(`/tasks/${t.id}/payment`).then((p) => [t.id, p] as const)),
    );
    setPayState(Object.fromEntries(states));
  }, []);
  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  const earnings = useMemo(() => {
    const ps = Object.values(payState);
    const earned = ps.reduce(
      (n, p) => n + (p.transfer?.status === "created" ? p.transfer.amount_cents : 0) + p.tips_cents,
      0,
    );
    const held = ps.reduce((n, p) => n + (p.payment?.status === "held" ? p.payment.tutor_net_cents : 0), 0);
    return { earned, held, completed: (mine ?? []).filter((t) => t.status === "completed").length };
  }, [payState, mine]);

  if (!me) return <Skeleton lines={4} />;
  const approved = tutor?.status === "approved";
  const active = (mine ?? []).filter((t) => !["completed", "refunded", "cancelled"].includes(t.status));
  const today = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  const waiting = open?.length ?? 0;
  let headline = "You're all caught up.";
  if (!tutor) headline = "Teach students around the world.";
  else if (!approved) headline = "Your application is in.";
  else if (waiting > 0) headline = `${waiting} ${waiting === 1 ? "student is" : "students are"} waiting for an offer.`;
  else if (active.length > 0)
    headline = `${active.length} ${active.length === 1 ? "session" : "sessions"} in progress.`;

  let statusLabel = "Application not approved";
  if (tutor?.status === "pending") statusLabel = "Application under review";
  if (tutor?.status === "approved")
    statusLabel = tutor.payouts_enabled ? "Accepting sessions" : "Approved · payouts not set up";

  return (
    <div>
      <header className="mb-12">
        <div className="micro text-muted">Tutor desk · {today}</div>
        <h1 className="mt-3 max-w-[20ch] font-serif text-[2.4rem] leading-[1.04] font-medium tracking-[-0.03em] sm:text-[3.25rem]">
          {headline}
        </h1>
        {tutor && (
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
            <Badge status={tutor.status} label={statusLabel} />
            <Stars value={Number(tutor.rating_avg)} count={tutor.rating_count} />
            <span className="tnum text-ink-2">{money(tutor.hourly_rate_cents)}/hr</span>
            <span className="flex flex-wrap gap-x-3">
              {tutor.subjects.map((s) => (
                <span key={s} className="flex items-center gap-1.5 font-semibold" style={{ color: accentFor(s).ink }}>
                  <span className="size-1.5 rounded-full" style={{ background: accentFor(s).mark }} />
                  {s}
                </span>
              ))}
            </span>
          </div>
        )}
      </header>

      {tutor?.status === "pending" && (
        <p className="mb-10 max-w-[60ch] font-serif text-[18px] leading-relaxed text-ink-2">
          You&apos;ll be able to send offers as soon as an admin approves your application.
        </p>
      )}

      {approved && (
        <dl className="mb-14 grid grid-cols-3 gap-6 border-y border-rule py-7 sm:gap-10">
          <Metric label="Earned · released + tips" value={money(earnings.earned)} strong={earnings.earned > 0} />
          <Metric label="Held for you · in sessions" value={money(earnings.held)} />
          <Metric label="Sessions completed" value={String(earnings.completed)} />
        </dl>
      )}

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-14">
        <div className="min-w-0 space-y-12">
          {approved && (
            <>
              <Requests tasks={open} />
              <Sessions tasks={mine} />
            </>
          )}
          {!approved && <Application existing={tutor} onSaved={refresh} startOpen={!tutor} />}
        </div>
        <aside className="min-w-0 space-y-10">
          {approved && <Payouts enabled={tutor.payouts_enabled} />}
          {approved && <Application existing={tutor} onSaved={refresh} startOpen={false} />}
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dd
        className={`tnum font-serif text-[2rem] leading-none font-medium tracking-[-0.03em] sm:text-[3.25rem] ${
          strong ? "text-mastery" : "text-ink"
        }`}
      >
        {value}
      </dd>
      <dt className="micro mt-2 leading-snug text-muted">{label}</dt>
    </div>
  );
}

function Requests({ tasks }: { tasks: Task[] | null }) {
  return (
    <section aria-labelledby="req-h">
      <h2 id="req-h" className="font-serif text-[1.75rem] leading-tight font-medium tracking-[-0.02em]">
        Open requests
      </h2>
      {tasks === null ? (
        <div className="mt-4">
          <Skeleton />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState>No open requests in your subjects right now.</EmptyState>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {tasks.map((t) => {
            const a = accentFor(t.subject);
            return (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`} className="group grid grid-cols-[1fr_auto] items-center gap-x-6 py-5">
                  <span className="min-w-0">
                    <span className="micro flex items-center gap-1.5" style={{ color: a.ink }}>
                      <span className="size-1.5 rounded-full" style={{ background: a.mark }} />
                      {t.subject}
                    </span>
                    <span className="mt-1.5 block font-serif text-[1.25rem] leading-snug text-ink transition-colors group-hover:text-tutor">
                      {t.title}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="tnum block font-serif text-[1.5rem] leading-none font-medium text-ink">
                      {money(t.budget_cents)}
                    </span>
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-tutor">
                      Make an offer
                      <ArrowRight
                        size={14}
                        strokeWidth={2}
                        className="transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Sessions({ tasks }: { tasks: Task[] | null }) {
  return (
    <section aria-labelledby="ses-h">
      <h2 id="ses-h" className="font-serif text-[1.75rem] leading-tight font-medium tracking-[-0.02em]">
        Your sessions
      </h2>
      {tasks === null ? (
        <div className="mt-4">
          <Skeleton />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState>When a student hires you, the session lands here.</EmptyState>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link href={`/tasks/${t.id}`} className="group block py-5">
                <span className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 truncate font-serif text-[1.125rem] text-ink group-hover:text-tutor">
                    {t.title}
                  </span>
                  <Badge status={t.status} />
                </span>
                <span className="mt-4 block max-w-[28rem]">
                  <PathLine stages={sessionStages(t.status, t.status === "hired" || t.status === "delivered")} dense />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Application({
  existing,
  onSaved,
  startOpen,
}: {
  existing: { bio: string; subjects: string[]; hourly_rate_cents: number; status: string } | null;
  onSaved: () => Promise<void>;
  startOpen: boolean;
}) {
  const [bio, setBio] = useState(existing?.bio ?? "");
  const [subjects, setSubjects] = useState(existing?.subjects.join(", ") ?? "");
  const [rate, setRate] = useState(String((existing?.hourly_rate_cents ?? 2000) / 100));
  const [doc, setDoc] = useState<File | null>(null);
  const a = useAction();
  const [open, setOpen] = useState(startOpen);

  if (!open) {
    return (
      <Section title="Your profile">
        <p className="text-[15px] text-ink-2">{existing?.subjects.join(" · ")}</p>
        {existing?.bio && <p className="mt-2 font-serif text-[16px] leading-relaxed text-ink-2">{existing.bio}</p>}
        <Button variant="secondary" className="mt-4" onClick={() => setOpen(true)}>
          Edit application
        </Button>
      </Section>
    );
  }
  return (
    <Sheet className="p-5 sm:p-7">
      <h2 className="mb-1 font-serif text-[1.375rem] font-medium">
        {existing ? "Your application" : "Apply to tutor"}
      </h2>
      <p className="mb-5 text-[14px] text-muted">An admin reviews every application before you can send offers.</p>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(async () => {
            await api("/tutors/me/application", {
              method: "PUT",
              body: {
                bio,
                subjects: subjects
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                hourly_rate_cents: Math.round(Number(rate) * 100),
              },
            });
            if (doc) await uploadToSignedUrl("/tutors/me/documents", doc);
            await onSaved();
            setOpen(false);
          });
        }}
      >
        <Field label="Subjects" hint="Comma separated, e.g. Calculus, Physics">
          <input className={inputCls} required value={subjects} onChange={(e) => setSubjects(e.target.value)} />
        </Field>
        <Field label="Hourly rate (USD)">
          <input
            className={`${inputCls} tnum`}
            type="number"
            min={1}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
        <Field label="About you">
          <textarea
            className={`${inputCls} min-h-28`}
            value={bio}
            maxLength={2000}
            onChange={(e) => setBio(e.target.value)}
          />
        </Field>
        <FileButton
          label="Qualification document"
          accept="image/*,.pdf"
          onFile={setDoc}
          hint="Degree, transcript or certificate. Private — only admins can view it."
        />
        <ErrorText error={a.error} />
        <Button type="submit" disabled={a.pending} className="w-full">
          {existing ? "Save" : "Submit application"}
        </Button>
      </form>
    </Sheet>
  );
}

function Payouts({ enabled }: { enabled: boolean }) {
  const a = useAction();
  return (
    <Section title="Payouts">
      {enabled ? (
        <p className="flex items-start gap-2.5 text-[15px] text-ink-2">
          <Wallet size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mastery" aria-hidden />
          Your payout account is connected. Released payments and tips are transferred to it.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="flex items-start gap-2.5 text-[15px] text-ink-2">
            <Wallet size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-attention" aria-hidden />
            Connect a payout account (Stripe Express) so released payments can reach you.
          </p>
          <ErrorText error={a.error} />
          <Button
            variant="attention"
            disabled={a.pending}
            onClick={() =>
              a.run(async () => {
                const { url } = await api<{ url: string }>("/tutors/me/connect", { body: {} });
                window.location.href = url;
              })
            }
          >
            Set up payouts
          </Button>
        </div>
      )}
    </Section>
  );
}
