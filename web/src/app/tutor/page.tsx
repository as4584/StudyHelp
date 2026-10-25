"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { Badge, Button, Card, ErrorText, Field, inputCls, Stars, useAction } from "@/components/ui";
import { api, money, type Task } from "@/lib/api";
import { uploadToSignedUrl } from "@/lib/upload";

export default function TutorHub() {
  const { me, refresh } = useRequireRole("tutor");
  const [open, setOpen] = useState<Task[]>([]);
  const [mine, setMine] = useState<Task[]>([]);
  const tutor = me?.tutor ?? null;

  const load = useCallback(async () => {
    setOpen(await api<Task[]>("/tasks?scope=open"));
    setMine(await api<Task[]>("/tasks?scope=mine"));
  }, []);
  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  if (!me) return <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Tutor hub</h1>
        {tutor && (
          <span className="text-sm">
            <Badge status={tutor.status} /> · <Stars value={tutor.rating_avg} /> ({tutor.rating_count})
          </span>
        )}
      </div>

      <Application existing={tutor} onSaved={refresh} />

      {tutor?.status === "approved" && <Payouts enabled={tutor.payouts_enabled} />}

      {tutor?.status === "approved" && (
        <>
          <TaskList title="My sessions" tasks={mine} empty="No hired sessions yet." />
          <TaskList title="Open requests" tasks={open} empty="No open requests right now." />
        </>
      )}
      {tutor?.status === "pending" && (
        <Card>
          <p className="text-sm text-muted">
            Your application is under review. You&apos;ll be able to bid once an admin approves it.
          </p>
        </Card>
      )}
    </div>
  );
}

function TaskList({ title, tasks, empty }: { title: string; tasks: Task[]; empty: string }) {
  return (
    <Card title={title}>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link href={`/tasks/${t.id}`} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.title}</span>
                  <span className="text-xs text-muted">
                    {t.subject} · budget {money(t.budget_cents)}
                  </span>
                </span>
                <Badge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Application({
  existing,
  onSaved,
}: {
  existing: { bio: string; subjects: string[]; hourly_rate_cents: number; status: string } | null;
  onSaved: () => Promise<void>;
}) {
  const [bio, setBio] = useState(existing?.bio ?? "");
  const [subjects, setSubjects] = useState(existing?.subjects.join(", ") ?? "");
  const [rate, setRate] = useState(String((existing?.hourly_rate_cents ?? 2000) / 100));
  const [doc, setDoc] = useState<File | null>(null);
  const a = useAction();
  const [open, setOpen] = useState(!existing);

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Edit application
      </Button>
    );
  }
  return (
    <Card title={existing ? "Your application" : "Apply to tutor"}>
      <form
        className="space-y-3"
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
          <input className={inputCls} type="number" min={1} value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="About you">
          <textarea className={inputCls} value={bio} maxLength={2000} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <Field
          label="Qualification document"
          hint="Degree, transcript or certificate (private — only admins can view)."
        >
          <input
            type="file"
            accept="image/*,.pdf"
            className="text-sm"
            onChange={(e) => setDoc(e.target.files?.[0] ?? null)}
          />
        </Field>
        <ErrorText error={a.error} />
        <Button type="submit" disabled={a.pending} className="w-full">
          {existing ? "Save" : "Submit application"}
        </Button>
      </form>
    </Card>
  );
}

function Payouts({ enabled }: { enabled: boolean }) {
  const a = useAction();
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Payouts <Badge status={enabled ? "approved" : "pending"} />
        </span>
      }
    >
      {enabled ? (
        <p className="text-sm text-muted">
          Your payout account is connected. Released payments and tips are transferred to it.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted">Connect a payout account (Stripe Express) to receive released payments.</p>
          <ErrorText error={a.error} />
          <Button
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
    </Card>
  );
}
