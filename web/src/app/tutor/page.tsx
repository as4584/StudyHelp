"use client";

import { ArrowRight, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useRequireRole } from "@/components/auth";
import {
  Badge,
  Button,
  EmptyState,
  ErrorText,
  Field,
  FileButton,
  PageHeader,
  Section,
  Sheet,
  Skeleton,
  Stars,
  Timeline,
  inputCls,
  useAction,
} from "@/components/ui";
import { api, money, type Task } from "@/lib/api";
import { uploadToSignedUrl } from "@/lib/upload";

export default function TutorDesk() {
  const { me, refresh } = useRequireRole("tutor");
  const [open, setOpen] = useState<Task[] | null>(null);
  const [mine, setMine] = useState<Task[] | null>(null);
  const tutor = me?.tutor ?? null;

  const load = useCallback(async () => {
    setOpen(await api<Task[]>("/tasks?scope=open"));
    setMine(await api<Task[]>("/tasks?scope=mine"));
  }, []);
  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  if (!me) return <Skeleton lines={4} />;
  const approved = tutor?.status === "approved";

  return (
    <div>
      <PageHeader
        title="Tutor desk"
        lede={
          tutor ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge
                status={tutor.status}
                label={
                  tutor.status === "approved"
                    ? "Approved tutor"
                    : tutor.status === "pending"
                      ? "Application under review"
                      : "Application not approved"
                }
              />
              <Stars value={Number(tutor.rating_avg)} count={tutor.rating_count} />
              <span className="tnum text-muted">{money(tutor.hourly_rate_cents)}/hr</span>
            </span>
          ) : (
            "Apply once, then pick up requests from students around the world."
          )
        }
      />

      {tutor?.status === "pending" && (
        <p className="mb-10 max-w-[60ch] font-serif text-[18px] leading-relaxed text-ink-2">
          You&apos;ll be able to send offers as soon as an admin approves your application.
        </p>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
        <div className="min-w-0 space-y-10">
          {approved && (
            <>
              <TaskList
                title="Your sessions"
                tasks={mine}
                empty="When a student hires you, the session lands here."
                showTimeline
              />
              <TaskList title="Open requests" tasks={open} empty="No open requests in your subjects right now." />
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

function TaskList({
  title,
  tasks,
  empty,
  showTimeline,
}: {
  title: string;
  tasks: Task[] | null;
  empty: string;
  showTimeline?: boolean;
}) {
  return (
    <Section title={title}>
      {tasks === null ? (
        <Skeleton />
      ) : tasks.length === 0 ? (
        <EmptyState>{empty}</EmptyState>
      ) : (
        <ul className="divide-y divide-rule">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tasks/${t.id}`}
                className="group grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
              >
                <span className="min-w-0">
                  <span className="block truncate font-serif text-[17px] font-medium text-ink group-hover:text-tutor">
                    {t.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-3 text-[13px] text-muted">
                    <span>{t.subject}</span>
                    <span className="tnum">Budget {money(t.budget_cents)}</span>
                    {showTimeline && <Badge status={t.status} />}
                  </span>
                </span>
                {showTimeline ? (
                  <span className="w-44">
                    <Timeline status={t.status} compact />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-tutor">
                    View &amp; bid <ArrowRight size={15} strokeWidth={2} aria-hidden />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
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
