"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useRequireRole } from "@/components/auth";
import { Button, Card, ErrorText, inputCls, LinkButton, useAction } from "@/components/ui";
import { api } from "@/lib/api";

type Msg = { id: string; role: string; content: string };

export default function AssistantPage() {
  const { me } = useRequireRole("student");
  const router = useRouter();
  const [chatId, setChatId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const a = useAction();

  if (!me) return <p className="text-muted">Loading…</p>;
  if (!me.premium) {
    return (
      <Card title="AI study assistant">
        <p className="mb-3 text-sm text-muted">The AI study assistant is part of Premium ($9.99/month).</p>
        <LinkButton href="/student">Upgrade on your dashboard</LinkButton>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">AI study assistant</h1>
      <Card>
        <div className="space-y-3" data-testid="ai-log">
          {msgs.length === 0 && (
            <p className="text-sm text-muted">
              Ask about any concept. The assistant guides you step by step — and you can bring in a live expert anytime.
            </p>
          )}
          {msgs.map((m) => (
            <div
              key={m.id}
              className={`rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-8 bg-brand text-brand-ink" : "mr-8 bg-background"}`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(async () => {
              let id = chatId;
              if (!id) {
                id = (await api<{ id: string }>("/ai/chats", { body: { subject } })).id;
                setChatId(id);
              }
              const q = question;
              setQuestion("");
              setMsgs((m) => [...m, { id: `local-${m.length}`, role: "user", content: q }]);
              const reply = await api<Msg>(`/ai/chats/${id}/messages`, { body: { question: q } });
              setMsgs((m) => [...m, reply]);
            });
          }}
        >
          {!chatId && (
            <input
              className={inputCls}
              placeholder="Subject (e.g. Calculus)"
              value={subject}
              maxLength={60}
              onChange={(e) => setSubject(e.target.value)}
            />
          )}
          <textarea
            aria-label="Question"
            className={inputCls}
            required
            value={question}
            placeholder="What are you stuck on?"
            onChange={(e) => setQuestion(e.target.value)}
          />
          <ErrorText error={a.error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={a.pending}>
              {a.pending ? "Thinking…" : "Ask"}
            </Button>
            {chatId && (
              <Button
                type="button"
                variant="ghost"
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
                Ask a live expert →
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
