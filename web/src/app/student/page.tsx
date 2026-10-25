"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { Badge, Button, Card, ErrorText, LinkButton, useAction } from "@/components/ui";
import { api, money, type Task } from "@/lib/api";

export default function StudentHome() {
  const { me } = useRequireRole("student");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const premium = useAction();

  useEffect(() => {
    if (me) api<Task[]>("/tasks?scope=mine").then(setTasks);
  }, [me]);

  if (!me) return <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Hi {me.profile.display_name}</h1>
        <LinkButton href="/student/tasks/new">+ Request a tutor</LinkButton>
      </div>

      <Card
        title={me.premium ? "Premium is active ✓" : "Go Premium — $9.99/month"}
        action={
          me.premium ? (
            <LinkButton href="/assistant" variant="ghost">
              Open AI assistant
            </LinkButton>
          ) : undefined
        }
      >
        {me.premium ? (
          <p className="text-sm text-muted">
            You have the AI study assistant, priority matching and session discounts.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              Unlock the 24/7 AI study assistant, priority task matching and session discounts.
            </p>
            <ErrorText error={premium.error} />
            <Button
              disabled={premium.pending}
              onClick={() =>
                premium.run(async () => {
                  const { url } = await api<{ url: string }>("/premium/checkout", { body: {} });
                  window.location.href = url;
                })
              }
            >
              Upgrade to Premium
            </Button>
          </div>
        )}
      </Card>

      <Card title="My tutoring requests">
        {tasks === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted">No requests yet. Post one and tutors will send you bids.</p>
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
    </div>
  );
}
