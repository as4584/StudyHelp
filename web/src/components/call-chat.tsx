"use client";

import { MessageSquare, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, type Me, type Message, type Schemas } from "@/lib/api";

import { Chat } from "./chat";
import { Button } from "./ui";

type Task = Schemas["TaskOut"];

/** Side panel only where there is room for it beside the video; phones (also landscape) get a sheet. */
const WIDE = "(min-width: 768px) and (min-height: 560px)";

function useWide() {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** The part of the layout viewport the on-screen keyboard covers (iOS Safari does not resize). */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState({ bottom: 0, height: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const on = () =>
      setInset({ bottom: Math.max(0, window.innerHeight - vv.height - vv.offsetTop), height: vv.height });
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    window.addEventListener("resize", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, [active]);
  return inset;
}

/**
 * The session chat on the call page: same conversation, translation and API as the session page.
 * Works in every call phase, since it never touches the video connection.
 */
export function useCallChat(taskId: string, me: Me | null) {
  const wide = useWide();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [open, setOpenRaw] = useState(false);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const seen = useRef(0);

  // Wide screens start with the panel open; phones start on the video.
  useEffect(() => {
    if (wide !== null) setOpenRaw(wide);
  }, [wide]);

  useEffect(() => {
    if (!me) return;
    let live = true;
    (async () => {
      try {
        const t = await api<Task>(`/tasks/${taskId}`);
        if (!t.hired_tutor_id) return;
        const c = await api<{ id: string }>(`/tasks/${taskId}/conversation`);
        if (live) setConversationId(encodeURIComponent(c.id));
      } catch {
        // No conversation for this person: the call page simply has no chat.
      }
    })();
    return () => {
      live = false;
    };
  }, [me, taskId]);

  // While closed: watch the unread count (#44's per-session count) and preview the newest message.
  useEffect(() => {
    if (!conversationId || open || !me) return;
    let live = true;
    const check = async () => {
      let n: number;
      try {
        n = (await api<Task>(`/tasks/${taskId}`)).unread_count;
      } catch {
        return;
      }
      if (!live) return;
      setUnread(n);
      if (n > seen.current) {
        try {
          const msgs = await api<Message[]>(`/conversations/${conversationId}/messages`);
          const last = [...msgs].reverse().find((m) => m.sender_id !== me.profile.id);
          if (live && last) {
            const tr = last.translations.find((t) => t.target_language === me.profile.preferred_language);
            setToast(tr?.status === "ok" && tr.translated_body ? tr.translated_body : last.body);
          }
        } catch {
          // The badge is enough.
        }
      }
      seen.current = n;
    };
    void check();
    const t = setInterval(check, 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [conversationId, open, me, taskId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const setOpen = useCallback((next: boolean) => {
    setOpenRaw(next);
    if (next) {
      // The open Chat marks the conversation read as it loads.
      setUnread(0);
      seen.current = 0;
      setToast(null);
    } else {
      setTimeout(() => button.current?.focus(), 0);
    }
  }, []);

  return { wide: !!wide, conversationId, open, setOpen, unread, toast, button };
}

type CallChat = ReturnType<typeof useCallChat>;

export function ChatButton({ chat }: { chat: CallChat }) {
  if (!chat.conversationId) return null;
  const label = chat.open ? "Hide chat" : "Chat";
  return (
    <Button
      ref={chat.button}
      variant="secondary"
      onClick={() => chat.setOpen(!chat.open)}
      aria-expanded={chat.open}
      aria-controls="call-chat"
      aria-label={chat.unread && !chat.open ? `Chat, ${chat.unread} unread` : label}
      data-testid="chat-button"
    >
      <MessageSquare size={17} aria-hidden />
      {label}
      {!chat.open && chat.unread > 0 && (
        <span
          data-testid="chat-unread"
          aria-hidden
          className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-tutor px-1.5 text-[12px] font-semibold text-white"
        >
          {chat.unread > 99 ? "99+" : chat.unread}
        </span>
      )}
    </Button>
  );
}

/** A short line over the video when a message arrives with the chat closed. Never takes focus. */
export function ChatToast({ chat }: { chat: CallChat }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-center">
      {chat.toast && !chat.open && (
        <p
          data-testid="chat-toast"
          className="max-w-full truncate rounded-[7px] bg-ink/85 px-3 py-2 text-[14px] text-white shadow"
          dir="auto"
        >
          <span className="font-semibold">New message: </span>
          {chat.toast}
        </p>
      )}
    </div>
  );
}

/** Beside the video on wide screens; a bottom sheet over the video on phones. */
export function ChatPanel({ chat, me }: { chat: CallChat; me: Me }) {
  const sheet = chat.open && !chat.wide;
  const kb = useKeyboardInset(sheet);
  const { setOpen } = chat;
  // The sheet covers the lower part of the screen: bring the video up above it.
  useEffect(() => {
    if (sheet) document.getElementById("call-stage")?.scrollIntoView({ block: "start" });
  }, [sheet]);
  // Escape closes the sheet even when focus is on the video controls behind it.
  useEffect(() => {
    if (!sheet) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-testid=whiteboard]")) setOpen(false);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [sheet, setOpen]);
  if (!chat.conversationId || !chat.open) return null;
  const close = (
    <button
      type="button"
      onClick={() => chat.setOpen(false)}
      aria-label="Close chat"
      className="tap -mr-2 ml-1 inline-flex size-9 items-center justify-center rounded-[6px] text-ink-2 hover:bg-sunken hover:text-ink"
    >
      <X size={18} aria-hidden />
    </button>
  );
  const body = (
    <Chat
      conversationId={chat.conversationId}
      meId={me.profile.id}
      myLang={me.profile.preferred_language}
      headerAction={close}
      autoFocus={sheet}
      className="flex h-full min-h-0 flex-col"
    />
  );
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      chat.setOpen(false);
    }
  };
  if (!sheet) {
    return (
      <aside
        id="call-chat"
        aria-label="Session chat"
        onKeyDown={onKeyDown}
        className="sticky top-4 h-[min(40rem,calc(100dvh-8rem))] min-w-0"
      >
        {body}
      </aside>
    );
  }
  // Fixed to the visible viewport so the iOS keyboard pushes it up instead of covering the box.
  // Never taller than the window, even if a rotation's viewport event is still in flight.
  const visible = Math.min(kb.height || Infinity, typeof window !== "undefined" ? window.innerHeight : 600);
  // Keyboard up: the sheet takes the visible area so the box and recent messages both fit.
  const height = kb.bottom > 80 ? visible - 8 : Math.min(visible * 0.62, 34 * 16);
  return (
    <>
      {/* Room to scroll the call controls up above the sheet while it is open. */}
      <div aria-hidden style={{ height: Math.round(height) }} />
      <div
        id="call-chat"
        role="dialog"
        aria-modal="false"
        aria-label="Session chat"
        onKeyDown={onKeyDown}
        data-testid="chat-sheet"
        className="fixed inset-x-0 z-40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        style={{ bottom: kb.bottom, height: Math.round(height) }}
      >
        <div className="h-full shadow-[0_-8px_30px_rgba(0,0,0,0.18)]">{body}</div>
      </div>
    </>
  );
}
