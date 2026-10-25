"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, type Message } from "@/lib/api";
import { supabase } from "@/lib/supabase";

import { Button, Card, ErrorText, inputCls, useAction } from "./ui";

/**
 * Translated task chat. Messages are always read from FastAPI; Supabase Realtime is only a
 * change signal (RLS limits who receives it). A slow poll is a fallback if the socket drops.
 */
export function Chat({ conversationId, meId, myLang }: { conversationId: string; meId: string; myLang: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const send = useAction();
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setMessages(await api<Message[]>(`/conversations/${conversationId}/messages`));
  }, [conversationId]);

  useEffect(() => {
    void load();
    const sb = supabase();
    const channel = sb
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_translations",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => void load(),
      )
      .subscribe();
    const poll = setInterval(() => void load(), 5000);
    return () => {
      clearInterval(poll);
      void sb.removeChannel(channel);
    };
  }, [conversationId, load]);

  useEffect(() => bottom.current?.scrollIntoView({ block: "nearest" }), [messages.length]);

  return (
    <Card title="Chat · auto-translated" className="flex h-[32rem] flex-col">
      <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1" data-testid="chat-log">
        {messages.length === 0 && (
          <p className="text-sm text-muted">Say hello — messages are translated automatically.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          const tr = m.translations.find((t) => t.target_language === myLang);
          const translated = !mine && tr?.status === "ok" && tr.translated_body;
          const failed = !mine && tr?.status === "failed";
          const text = translated && !showOriginal[m.id] ? tr!.translated_body! : m.body;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                data-testid="chat-message"
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-brand text-brand-ink" : "bg-background"}`}
              >
                <p className="whitespace-pre-wrap">{text}</p>
                {translated && (
                  <button
                    className="mt-1 text-[11px] underline opacity-70"
                    onClick={() => setShowOriginal((s) => ({ ...s, [m.id]: !s[m.id] }))}
                  >
                    {showOriginal[m.id]
                      ? "Show translation"
                      : `Translated from ${m.source_language.toUpperCase()} · show original`}
                  </button>
                )}
                {failed && <p className="mt-1 text-[11px] text-red-600">Translation unavailable — showing original</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          void send.run(async () => {
            await api(`/conversations/${conversationId}/messages`, { body: { body } });
            setBody("");
            await load();
          });
        }}
      >
        <input
          aria-label="Message"
          className={inputCls}
          value={body}
          maxLength={4000}
          placeholder="Type a message"
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" disabled={send.pending}>
          Send
        </Button>
      </form>
      <ErrorText error={send.error} />
    </Card>
  );
}
