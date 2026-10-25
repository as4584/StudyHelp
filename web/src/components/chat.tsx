"use client";

import { ArrowUp, Languages } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, LANGUAGES, type Message } from "@/lib/api";
import { supabase } from "@/lib/supabase";

import { Button, DemoTagged, ErrorText, Sheet, inputCls, useAction } from "./ui";

/**
 * Translated session conversation. Messages are always read from FastAPI; Supabase Realtime
 * is only a change signal (RLS limits who receives it). A slow poll covers a dropped socket.
 * The other person's voice is set in the reading face; yours sits quietly on the right.
 */
export function Chat({ conversationId, meId, myLang }: { conversationId: string; meId: string; myLang: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const send = useAction();
  const log = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <Sheet className="flex max-h-[min(40rem,80dvh)] min-h-[22rem] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
        <h2 className="font-serif text-[17px] font-medium text-ink">Conversation</h2>
        <span className="flex items-center gap-1.5 text-[13px] text-muted">
          <Languages size={14} strokeWidth={1.75} aria-hidden /> Shown in {LANGUAGES[myLang] ?? myLang}
        </span>
      </div>
      <div ref={log} className="flex-1 space-y-5 overflow-y-auto px-5 py-5" data-testid="chat-log" aria-live="polite">
        {messages.length === 0 && (
          <p className="font-serif text-[16px] leading-relaxed text-ink-2 italic">
            Say hello. Write in your own language — your messages are translated for the other person automatically.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          const tr = m.translations.find((t) => t.target_language === myLang);
          const translated = !mine && tr?.status === "ok" && tr.translated_body;
          const failed = !mine && tr?.status === "failed";
          const text = translated && !showOriginal[m.id] ? tr!.translated_body! : m.body;
          const time = new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          if (mine) {
            return (
              <div key={m.id} className="enter flex flex-col items-end" data-testid="chat-message">
                <div className="max-w-[85%] rounded-[10px] bg-sunken px-3.5 py-2.5 text-[15px] whitespace-pre-wrap text-ink">
                  {text}
                </div>
                <span className="mt-1 text-[12px] text-muted">{time}</span>
              </div>
            );
          }
          return (
            <div key={m.id} className="enter max-w-[94%]" data-testid="chat-message">
              <p className="font-serif text-[16.5px] leading-[1.6] whitespace-pre-wrap text-ink">
                <DemoTagged text={text} />
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                <span>{time}</span>
                {translated && (
                  <>
                    <span aria-hidden>·</span>
                    <button
                      className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:text-ink hover:underline"
                      onClick={() => setShowOriginal((s) => ({ ...s, [m.id]: !s[m.id] }))}
                    >
                      <Languages size={12} strokeWidth={1.75} aria-hidden />
                      {showOriginal[m.id]
                        ? "Show translation"
                        : `Translated from ${LANGUAGES[m.source_language] ?? m.source_language.toUpperCase()} · show original`}
                    </button>
                  </>
                )}
                {failed && (
                  <span className="font-semibold text-danger">Translation unavailable — showing original</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="flex items-end gap-2 border-t border-rule p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const text = body.trim();
          if (!text) return;
          // Optimistic: show the message now; the server copy (with translation) replaces it.
          setBody("");
          setMessages((m) => [
            ...m,
            {
              id: `pending-${Date.now()}`,
              sender_id: meId,
              body: text,
              source_language: myLang,
              created_at: new Date().toISOString(),
              translations: [],
            },
          ]);
          void send.run(async () => {
            try {
              await api(`/conversations/${conversationId}/messages`, { body: { body: text } });
            } catch (err) {
              setBody(text); // give the words back if sending failed
              throw err;
            } finally {
              await load();
            }
          });
        }}
      >
        <input
          aria-label="Message"
          className={inputCls}
          value={body}
          maxLength={4000}
          placeholder="Write a message"
          onChange={(e) => setBody(e.target.value)}
        />
        <Button
          type="submit"
          disabled={send.pending || !body.trim()}
          aria-label="Send"
          className="size-11 shrink-0 px-0"
        >
          <ArrowUp size={18} strokeWidth={2.25} aria-hidden />
        </Button>
      </form>
      {send.error && (
        <div className="px-4 pb-3">
          <ErrorText error={send.error} />
        </div>
      )}
    </Sheet>
  );
}
