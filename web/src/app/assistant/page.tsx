"use client";

import { ArrowUp, BookOpenText, CircleHelp, LifeBuoy, Lightbulb, PencilRuler, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { PathLine } from "@/components/path-line";
import { TutorAnswer } from "@/components/tutor-answer";
import { Button, ErrorText, LinkButton, Skeleton, inputCls, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { accentFor } from "@/lib/subjects";

type Msg = { id: string; role: string; content: string };

/*
 * Moment 2 — the AI tutor as a study environment: a reading column where answers arrive as
 * annotated sections, and a context rail (subject, what the annotations mean, escalation).
 */
function Workspace() {
  const { me } = useRequireRole("student");
  const router = useRouter();
  const params = useSearchParams();
  const [chatId, setChatId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const a = useAction();
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const ask = useCallback(
    (q: string) =>
      a.run(async () => {
        let id = chatId;
        if (!id) {
          id = (await api<{ id: string }>("/ai/chats", { body: { subject } })).id;
          setChatId(id);
        }
        setMsgs((m) => [...m, { id: `local-${m.length}`, role: "user", content: q }]);
        const reply = await api<Msg>(`/ai/chats/${id}/messages`, { body: { question: q } });
        setMsgs((m) => [...m, reply]);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId, subject],
  );

  useEffect(() => {
    const q = params.get("q");
    if (me?.premium && q && !started.current) {
      started.current = true;
      void ask(q);
    }
  }, [me, params, ask]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [msgs.length, a.pending]);

  const escalate = () =>
    a.run(async () => {
      const d = await api<{ subject: string; title: string; description: string }>(`/ai/chats/${chatId}/escalate`, {
        body: {},
      });
      router.push(`/student/tasks/new?${new URLSearchParams(d).toString()}`);
    });

  if (!me) return <Skeleton lines={4} />;
  if (!me.premium) {
    return (
      <div className="max-w-[40rem] pt-4">
        <div className="micro text-tutor">AI tutor · Premium</div>
        <h1 className="mt-3 font-serif text-[2.75rem] leading-[1.04] font-medium tracking-[-0.03em]">
          A patient study coach, any hour.
        </h1>
        <p className="mt-4 font-serif text-[19px] leading-relaxed text-ink-2">
          It explains, gives worked examples and hints, checks your understanding — and hands you to a live expert when
          you need one.
        </p>
        <div className="mt-8">
          <LinkButton href="/student">Upgrade from your study desk</LinkButton>
        </div>
      </div>
    );
  }

  const asked = msgs.filter((m) => m.role === "user").length;
  // Practice is real: the student sent their own attempt (via "Write my attempt").
  const attempted = msgs.some((m) => m.role === "user" && /^my attempt/i.test(m.content));
  const accent = accentFor(subject || "general");

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_16.5rem] lg:gap-14">
      <div className="min-w-0">
        <header className="relative isolate mb-12 overflow-hidden rounded-[16px] bg-tutor-deep px-6 pt-7 pb-8 text-white shadow-[0_30px_60px_-30px_rgb(30_27_75/0.6)] sm:px-9 sm:pt-9 sm:pb-10">
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(60% 70% at 100% 0%, rgb(129 140 248 / 0.45), transparent 70%), radial-gradient(50% 60% at 0% 100%, rgb(20 184 166 / 0.16), transparent 70%)",
            }}
          />
          <div className="flex items-center gap-2 text-lavender">
            <Sparkles size={15} strokeWidth={1.9} aria-hidden />
            <span className="micro">AI tutor{subject ? ` · ${subject}` : ""}</span>
          </div>
          <h1 className="mt-3 max-w-[22ch] font-serif text-[2.2rem] leading-[1.05] font-medium tracking-[-0.03em] sm:text-[3rem]">
            {asked === 0 ? "Think it through, out loud." : msgs.find((m) => m.role === "user")?.content}
          </h1>
          <div className="mt-7 max-w-[30rem]">
            <PathLine
              tone="dark"
              stages={[
                { label: "Question", state: asked ? "done" : "current" },
                {
                  label: "Understand",
                  state: attempted ? "done" : msgs.some((m) => m.role === "assistant") ? "current" : "upcoming",
                },
                {
                  label: "Practice",
                  state: attempted ? "done" : "upcoming",
                  note: attempted ? undefined : "send an attempt",
                },
              ]}
            />
          </div>
          {chatId && (
            <Button
              variant="attention"
              className="mt-7 bg-white text-attention hover:bg-attention-soft lg:hidden"
              disabled={a.pending}
              onClick={escalate}
            >
              <LifeBuoy size={16} strokeWidth={1.9} aria-hidden /> Ask a live expert
            </Button>
          )}
        </header>

        <div className="space-y-10" data-testid="ai-log" aria-live="polite">
          {msgs.length === 0 && !a.pending && (
            <p className="max-w-[56ch] font-serif text-[19px] leading-relaxed text-ink-2 italic">
              Ask about any concept. Answers come as explanations, worked examples, hints and a question to check
              yourself — and if it still doesn&apos;t click, a live expert can pick up the whole conversation.
            </p>
          )}
          {msgs.map((m, i) =>
            m.role === "user" ? (
              i === 0 ? null : (
                <div key={m.id} className="enter border-t border-rule pt-8">
                  <div className="micro mb-2 text-muted">You asked</div>
                  <p className="font-serif text-[1.5rem] leading-snug font-medium tracking-[-0.015em] text-ink">
                    {m.content}
                  </p>
                </div>
              )
            ) : (
              <article key={m.id} aria-label="AI tutor answer">
                <TutorAnswer
                  content={m.content}
                  onTry={(prefix) => {
                    setQuestion(prefix);
                    composer.current?.focus();
                  }}
                />
              </article>
            ),
          )}
          {a.pending && (
            <div className="grid gap-x-5 sm:grid-cols-[9.5rem_1fr]" role="status">
              <div className="flex items-center gap-1.5 text-tutor sm:justify-end">
                <Sparkles size={14} strokeWidth={2} className="animate-pulse" aria-hidden />
                <span className="micro">Thinking</span>
              </div>
              <div className="space-y-2.5 pt-1 pl-4">
                <div className="skeleton h-3.5 w-[86%]" />
                <div className="skeleton h-3.5 w-[72%]" />
                <div className="skeleton h-3.5 w-[54%]" />
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>

        <div className="sticky bottom-4 mt-12">
          <form
            className="rounded-[14px] border border-rule bg-sheet/95 p-2.5 shadow-[0_1px_2px_rgb(20_22_27/0.05),0_24px_48px_-24px_rgb(30_27_75/0.35)] backdrop-blur"
            onSubmit={(e) => {
              e.preventDefault();
              const q = question.trim();
              if (!q) return;
              setQuestion("");
              void ask(q);
            }}
          >
            {!chatId && (
              <input
                className={`${inputCls} mb-2 min-h-10 border-transparent bg-paper`}
                placeholder="Subject (e.g. Calculus)"
                value={subject}
                maxLength={60}
                onChange={(e) => setSubject(e.target.value)}
              />
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={composer}
                aria-label="Question"
                className="min-h-12 w-full resize-none bg-transparent px-2.5 py-2 font-serif text-[17px] text-ink outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-muted"
                rows={2}
                required
                value={question}
                placeholder={chatId ? "Ask a follow-up, or try the next step yourself…" : "What are you stuck on?"}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <Button type="submit" disabled={a.pending} aria-label="Ask" className="size-11 shrink-0 px-0">
                <ArrowUp size={18} strokeWidth={2.25} aria-hidden />
              </Button>
            </div>
            <ErrorText error={a.error} />
          </form>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-12 space-y-10">
          <div>
            <div className="micro text-muted">This session</div>
            <dl className="mt-3 space-y-3">
              <div className="flex items-baseline justify-between">
                <dt className="text-[14px] text-ink-2">Subject</dt>
                <dd className="flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: accent.ink }}>
                  <span className="size-1.5 rounded-full" style={{ background: accent.mark }} />
                  {subject || "Not set"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-[14px] text-ink-2">Questions asked</dt>
                <dd className="tnum font-serif text-[1.5rem] leading-none font-medium text-ink">{asked}</dd>
              </div>
            </dl>
          </div>

          <div>
            <div className="micro text-muted">How answers are marked</div>
            <ul className="mt-3 space-y-2.5 text-[14px]">
              <Legend icon={BookOpenText} className="text-tutor" label="Explanation" body="the core idea" />
              <Legend icon={PencilRuler} className="text-tutor" label="Worked example" body="a similar problem" />
              <Legend icon={Lightbulb} className="text-attention" label="Hint" body="your next move" />
              <Legend icon={CircleHelp} className="text-mastery" label="Check yourself" body="prove you've got it" />
            </ul>
          </div>

          <div className="rounded-[12px] bg-attention-soft p-5">
            <div className="flex items-center gap-2 text-attention">
              <LifeBuoy size={16} strokeWidth={1.9} aria-hidden />
              <span className="micro">Still stuck?</span>
            </div>
            <p className="mt-2 font-serif text-[16px] leading-snug text-ink">
              A vetted tutor picks up exactly where you are — with this conversation attached.
            </p>
            <Button
              variant="attention"
              className="mt-4 w-full bg-white hover:bg-white/80"
              disabled={a.pending || !chatId}
              onClick={escalate}
            >
              Ask a live expert
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Legend({
  icon: Icon,
  className,
  label,
  body,
}: {
  icon: typeof Sparkles;
  className: string;
  label: string;
  body: string;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <Icon size={15} strokeWidth={2} className={className} aria-hidden />
      <span className="font-semibold text-ink">{label}</span>
      <span className="text-muted">· {body}</span>
    </li>
  );
}

export default function AssistantPage() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  );
}
