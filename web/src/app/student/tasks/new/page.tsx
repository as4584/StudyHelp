"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { Button, ErrorText, Field, FileButton, PageHeader, Sheet, inputCls, useAction } from "@/components/ui";
import { api, type Task } from "@/lib/api";
import { uploadToSignedUrl } from "@/lib/upload";

function NewTaskForm() {
  useRequireRole("student");
  const router = useRouter();
  const q = useSearchParams();
  const fromAi = !!q.get("description");
  const [subject, setSubject] = useState(q.get("subject") ?? "");
  const [title, setTitle] = useState(q.get("title") ?? "");
  const [description, setDescription] = useState(q.get("description") ?? "");
  const [budget, setBudget] = useState("25");
  const [ack, setAck] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { pending, error, run } = useAction();

  return (
    <div className="max-w-[42rem]">
      <PageHeader
        title="Request a tutor"
        lede={
          fromAi
            ? "We've carried over your AI conversation so the tutor sees exactly where you got stuck."
            : "Describe what you want to understand. Vetted tutors will send you offers."
        }
      />
      <Sheet className="p-5 sm:p-7">
        <form
          className="space-y-5"
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
          <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
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
            <Field label="Budget (USD)">
              <input
                className={`${inputCls} tnum`}
                type="number"
                min={5}
                max={5000}
                step={1}
                required
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </Field>
          </div>
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
          <Field label="Details" hint="Where you're stuck, what you've tried, and when you'd like to meet.">
            <textarea
              className={`${inputCls} min-h-36 font-serif text-[16px] leading-relaxed`}
              required
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <FileButton
            label="Rubric or screenshot (optional)"
            accept="image/*,.pdf"
            onFile={setFile}
            hint="Upload a screenshot — never share your school portal login."
          />
          <label className="flex cursor-pointer items-start gap-3 rounded-[6px] bg-paper px-4 py-3.5 text-[14px] leading-relaxed text-ink-2">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[#4338ca]"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span>
              <span className="flex items-center gap-1.5 font-semibold text-ink">
                <ShieldCheck size={15} strokeWidth={1.75} className="text-mastery" aria-hidden /> Learning, not
                shortcuts
              </span>
              I&apos;m asking for tutoring and explanations to help me learn. I won&apos;t submit a tutor&apos;s work as
              my own or share school login credentials.
            </span>
          </label>
          <ErrorText error={error} />
          <Button type="submit" disabled={pending || !ack} className="w-full">
            Post request
          </Button>
        </form>
      </Sheet>
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
