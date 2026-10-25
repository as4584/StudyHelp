"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { Button, Card, ErrorText, Field, inputCls, useAction } from "@/components/ui";
import { api, type Task } from "@/lib/api";
import { uploadToSignedUrl } from "@/lib/upload";

function NewTaskForm() {
  useRequireRole("student");
  const router = useRouter();
  const q = useSearchParams();
  const [subject, setSubject] = useState(q.get("subject") ?? "");
  const [title, setTitle] = useState(q.get("title") ?? "");
  const [description, setDescription] = useState(q.get("description") ?? "");
  const [budget, setBudget] = useState("25");
  const [ack, setAck] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { pending, error, run } = useAction();

  return (
    <div className="mx-auto max-w-xl">
      <Card title="Request a tutor">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const task = await api<Task>("/tasks", {
                body: {
                  subject,
                  title,
                  description,
                  budget_cents: Math.round(Number(budget) * 100),
                  honor_code_ack: ack,
                },
              });
              if (file) await uploadToSignedUrl(`/tasks/${task.id}/files`, file, "rubric");
              router.push(`/tasks/${task.id}`);
            });
          }}
        >
          <Field label="Subject">
            <input
              className={inputCls}
              required
              maxLength={60}
              value={subject}
              placeholder="e.g. Calculus"
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
          <Field label="What do you need help understanding?">
            <input
              className={inputCls}
              required
              minLength={3}
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Details">
            <textarea
              className={`${inputCls} min-h-32`}
              required
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Budget (USD)">
            <input
              className={inputCls}
              type="number"
              min={5}
              max={5000}
              step={1}
              required
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </Field>
          <Field
            label="Rubric or screenshot (optional)"
            hint="Upload a screenshot — never share your school portal login."
          >
            <input
              type="file"
              accept="image/*,.pdf"
              className="text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>
              I&apos;m asking for tutoring and explanations to help me learn. I won&apos;t submit a tutor&apos;s work as
              my own or share school login credentials.
            </span>
          </label>
          <ErrorText error={error} />
          <Button type="submit" disabled={pending || !ack} className="w-full">
            Post request
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense>
      <NewTaskForm />
    </Suspense>
  );
}
