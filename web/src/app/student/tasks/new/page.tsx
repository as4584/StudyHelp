"use client";

import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { PathLine, sessionStages } from "@/components/path-line";
import { Button, ErrorText, FileButton, inputCls, useAction } from "@/components/ui";
import { api, LANGUAGES, LEVELS, money, type Task } from "@/lib/api";
import { accentFor } from "@/lib/subjects";
import { uploadToSignedUrl } from "@/lib/upload";

const QUICK_SUBJECTS = ["Calculus", "Physics", "Chemistry", "Writing", "Computer science"];
const QUICK_BUDGETS = [10, 15, 25, 40];

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 rounded-full border px-3.5 text-[14px] font-semibold transition-colors ${
        on ? "border-tutor bg-tutor-soft text-tutor" : "border-rule-strong text-ink-2 hover:border-ink-2/40"
      }`}
    >
      {children}
    </button>
  );
}

/** One numbered step of the guided request: number + question, then the control. No container. */
function Step({ n, title, hint, children }: { n: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-6 gap-y-3 border-t border-rule pt-7 sm:grid-cols-[3.5rem_1fr]">
      <div className="tnum font-serif text-[1.75rem] leading-none font-medium text-rule-strong sm:text-right">{n}</div>
      <div className="min-w-0">
        <h2 className="font-serif text-[1.375rem] leading-snug font-medium tracking-[-0.01em] text-ink">{title}</h2>
        {hint && <p className="mt-1 text-[14px] text-muted">{hint}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

function NewTaskForm() {
  useRequireRole("student");
  const router = useRouter();
  const q = useSearchParams();
  const fromAi = !!q.get("description");
  const [subject, setSubject] = useState(q.get("subject") ?? "");
  const [title, setTitle] = useState(q.get("title") ?? "");
  const [description, setDescription] = useState(q.get("description") ?? "");
  const [level, setLevel] = useState("");
  const [language, setLanguage] = useState("en");
  const [budget, setBudget] = useState("15");
  const [ack, setAck] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { pending, error, run } = useAction();
  const accent = accentFor(subject || "general");
  const budgetCents = Math.round(Number(budget) * 100) || 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const task = await api<Task>("/tasks", {
            body: {
              subject,
              title,
              description,
              level: level as "high_school" | "college",
              language,
              budget_cents: budgetCents,
              honor_code_ack: ack,
            },
          });
          if (file) await uploadToSignedUrl(`/tasks/${task.id}/files`, file, "rubric");
          router.push(`/tasks/${task.id}`);
        });
      }}
      className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_19rem] xl:gap-14"
    >
      <div className="min-w-0">
        <header className="mb-10">
          <div className="micro text-tutor">New request</div>
          <h1 className="mt-3 max-w-[16ch] font-serif text-[2.4rem] leading-[1.04] font-medium tracking-[-0.03em] sm:text-[3.25rem]">
            Describe what you&apos;re stuck on.
          </h1>
          {fromAi ? (
            <p className="mt-4 flex max-w-[52ch] items-start gap-2 text-[16px] text-ink-2">
              <Sparkles size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-tutor" aria-hidden />
              We carried over your AI tutor conversation, so your tutor sees exactly where you got stuck.
            </p>
          ) : (
            <p className="mt-4 max-w-[52ch] text-[16px] text-ink-2">
              A few short steps. Vetted tutors read it and send you offers — you choose who to work with.
            </p>
          )}
        </header>

        <div className="space-y-9">
          <Step n="01" title="Subject">
            <input
              aria-label="Subject"
              className={inputCls}
              required
              maxLength={60}
              value={subject}
              placeholder="e.g. Calculus"
              onChange={(e) => setSubject(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick picks">
              {QUICK_SUBJECTS.map((s) => {
                const on = subject.toLowerCase() === s.toLowerCase();
                const a = accentFor(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSubject(s)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors ${
                      on ? "border-transparent text-white" : "border-rule-strong text-ink-2 hover:border-ink-2/40"
                    }`}
                    style={on ? { background: a.mark } : undefined}
                  >
                    {!on && <span className="size-1.5 rounded-full" style={{ background: a.mark }} />}
                    {s}
                  </button>
                );
              })}
            </div>
          </Step>

          <Step n="02" title="Level" hint="So we match you with a tutor who teaches at your level.">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Level">
              {Object.entries(LEVELS).map(([k, v]) => (
                <Chip key={k} on={level === k} onClick={() => setLevel(k)}>
                  {v}
                </Chip>
              ))}
            </div>
          </Step>

          <Step n="03" title="What are you trying to understand?" hint="One line — this becomes the title tutors see.">
            <input
              aria-label="What do you need help understanding?"
              className={`${inputCls} font-serif text-[18px]`}
              required
              minLength={3}
              maxLength={140}
              value={title}
              placeholder="e.g. Why the chain rule multiplies by the inner derivative"
              onChange={(e) => setTitle(e.target.value)}
            />
          </Step>

          <Step
            n="04"
            title="Tell the tutor where you're stuck"
            hint="What you've tried, where it stops making sense, and when you'd like to meet."
          >
            <textarea
              aria-label="Details"
              className={`${inputCls} min-h-40 font-serif text-[17px] leading-relaxed`}
              required
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Step>

          <Step
            n="05"
            title="Language"
            hint="The language you'd like your session in. Chat messages are translated automatically."
          >
            <div className="flex flex-wrap gap-2" role="group" aria-label="Language">
              {Object.entries(LANGUAGES).map(([k, v]) => (
                <Chip key={k} on={language === k} onClick={() => setLanguage(k)}>
                  {v}
                </Chip>
              ))}
            </div>
          </Step>

          <Step n="06" title="Add context" hint="Optional. A screenshot of the rubric or the problem helps the most.">
            <FileButton
              label="Rubric or screenshot (optional)"
              accept="image/*,.pdf"
              onFile={setFile}
              hint="Upload a screenshot — never share your school portal login."
            />
          </Step>

          <Step n="07" title="Budget" hint="You'll see tutors' offers before paying anything.">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-36">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[16px] text-muted">
                  $
                </span>
                <input
                  aria-label="Budget (USD)"
                  className={`${inputCls} tnum pl-7 font-serif text-[18px]`}
                  type="number"
                  min={5}
                  max={5000}
                  step={1}
                  required
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
              {QUICK_BUDGETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBudget(String(b))}
                  className={`tnum h-9 rounded-full border px-3.5 text-[14px] font-semibold transition-colors ${
                    Number(budget) === b
                      ? "border-tutor bg-tutor-soft text-tutor"
                      : "border-rule-strong text-ink-2 hover:border-ink-2/40"
                  }`}
                >
                  ${b}
                </button>
              ))}
            </div>
          </Step>

          {/* The trust moment: a pledge the student signs, not a checkbox in a box. */}
          <section className="border-t border-rule pt-9">
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-[3.5rem_1fr]">
              <ShieldCheck size={30} strokeWidth={1.5} className="text-mastery sm:justify-self-end" aria-hidden />
              <div>
                <h2 className="font-serif text-[1.75rem] leading-tight font-medium tracking-[-0.02em]">
                  Learning, not shortcuts.
                </h2>
                <p className="mt-3 max-w-[56ch] font-serif text-[17px] leading-relaxed text-ink-2">
                  I&apos;m asking for tutoring and explanations to help me learn. I won&apos;t submit a tutor&apos;s
                  work as my own, and I won&apos;t share school login credentials.
                </p>
                <label
                  className={`mt-5 inline-flex cursor-pointer items-center gap-3 rounded-full border py-2 pr-4 pl-2.5 text-[15px] font-semibold transition-colors ${
                    ack
                      ? "border-mastery bg-mastery-soft text-mastery"
                      : "border-rule-strong text-ink hover:border-ink-2/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="size-[18px] accent-[#0f766e]"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                  />
                  {ack ? "Signed — thank you" : "I agree"}
                </label>
              </div>
            </div>
          </section>

          <div className="space-y-3 sm:pl-[5rem]">
            <ErrorText error={error} />
            {!level && <p className="text-[14px] text-muted">Choose a level (step 02) to post your request.</p>}
            <Button
              type="submit"
              disabled={pending || !ack || !level}
              loading={pending}
              className="h-12 w-full px-6 text-[16px] sm:w-auto"
            >
              Post request <ArrowRight size={17} strokeWidth={2} aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {/* Live preview: what tutors will see, on the study path. */}
      <aside className="hidden xl:block">
        <div className="sticky top-12">
          <div className="micro text-muted">Your request</div>
          <div className="mt-4 rounded-[14px] border border-rule bg-sheet p-5 shadow-[0_1px_2px_rgb(20_22_27/0.04),0_24px_48px_-30px_rgb(30_27_75/0.3)]">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: accent.mark }} />
              <span className="micro" style={{ color: accent.ink }}>
                {subject || "Subject"}
              </span>
            </div>
            <p
              className={`mt-2 font-serif text-[1.25rem] leading-snug font-medium ${title ? "text-ink" : "text-muted/70 italic"}`}
            >
              {title || "What you're trying to understand"}
            </p>
            <p className="tnum mt-3 text-[14px] text-muted">
              {[level && LEVELS[level], LANGUAGES[language], `Budget ${money(budgetCents)}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-6">
              <PathLine stages={sessionStages("draft")} dense />
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            You pay only after you choose a tutor, and your payment is held until you confirm the session was delivered.
          </p>
        </div>
      </aside>
    </form>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense>
      <NewTaskForm />
    </Suspense>
  );
}
