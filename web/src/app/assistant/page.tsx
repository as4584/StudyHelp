"use client";

import { ArrowUp, LifeBuoy, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { useRequireRole } from "@/components/auth";
import {
  Button,
  DemoTagged,
  ErrorText,
  LinkButton,
  PageHeader,
  Sheet,
  Skeleton,
  inputCls,
  useAction,
} from "@/components/ui";
import { api } from "@/lib/api";

type Msg = { id: string; role: string; content: string };

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

  // A question handed over from the study desk starts the conversation.
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

  if (!me) return <Skeleton lines={4} />;
  if (!me.premium) {
    return (
      <div className="max-w-[40rem]">
        <PageHeader title="AI tutor" lede="Part of Premium — $9.99 a month." />
        <p className="font-serif text-[18px] leading-relaxed text-ink-2">
          A patient study coach that explains, asks the right questions and hands you to a live expert when you need
          one.
        </p>
        <div className="mt-6">
          <LinkButton href="/student">Upgrade from your study desk</LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[46rem]">
      <PageHeader
        title="AI tutor"
        lede="It guides you to the answer rather than handing it over."
        action={
          chatId ? (
            <Button
              variant="attention"
              disabled={a.pending}
              onClick={() =>
                a.run(async () => {
                  const d = await api<{ subject: string; title: string; description: string }>(
                    `/ai/chats/${chatId}/escalate`,
                    { body: {} },
                  );
                  router.push(`/student/tasks/new?${new URLSearchParams(d).toString()}`);
                })
              }
            >
              <LifeBuoy size={16} strokeWidth={1.9} aria-hidden /> Ask a live expert
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-7" data-testid="ai-log" aria-live="polite">
        {msgs.length === 0 && !a.pending && (
          <p className="font-serif text-[18px] leading-relaxed text-ink-2 italic">
            Ask about any concept. If it still doesn&apos;t click, bring in a live expert with the whole conversation
            attached.
          </p>
        )}
        {msgs.map((m) =>
          m.role === "user" ? (
            <div
              key={m.id}
              className="enter ml-auto w-fit max-w-[85%] rounded-[10px] bg-sunken px-4 py-2.5 text-[15px] text-ink"
            >
              {m.content}
            </div>
          ) : (
            <article key={m.id} className="enter">
              <div className="mb-2 flex items-center gap-2 text-[13px]">
                <span className="flex size-6 items-center justify-center rounded-full bg-tutor text-white">
                  <Sparkles size={13} strokeWidth={2} aria-hidden />
                </span>
                <span className="font-semibold text-tutor">AI tutor</span>
              </div>
              <p className="max-w-[64ch] font-serif text-[17px] leading-[1.65] whitespace-pre-wrap text-ink">
                <DemoTagged text={m.content} />
              </p>
            </article>
          ),
        )}
        {a.pending && (
          <div className="flex items-center gap-2 text-[14px] text-tutor" role="status">
            <Sparkles size={15} strokeWidth={1.75} className="animate-pulse" aria-hidden /> Thinking it through…
          </div>
        )}
        <div ref={bottom} />
      </div>

      <Sheet className="sticky bottom-4 mt-8 p-3">
        <form
          className="space-y-2"
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
              className={`${inputCls} min-h-10`}
              placeholder="Subject (e.g. Calculus)"
              value={subject}
              maxLength={60}
              onChange={(e) => setSubject(e.target.value)}
            />
          )}
          <div className="flex items-end gap-2">
            <textarea
              aria-label="Question"
              className={`${inputCls} min-h-11 resize-none`}
              rows={2}
              required
              value={question}
              placeholder="What are you stuck on?"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button type="submit" disabled={a.pending} aria-label="Ask" className="size-11 shrink-0 px-0 sm:size-11">
              <ArrowUp size={18} strokeWidth={2.25} aria-hidden />
              <span className="sr-only">Ask</span>
            </Button>
          </div>
          <ErrorText error={a.error} />
        </form>
      </Sheet>
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  );
}
