"use client";

import "@excalidraw/excalidraw/index.css";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Download, PenLine, X } from "lucide-react";
import type { RemoteParticipant, Room } from "livekit-client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import { api, ApiError, type Schemas } from "@/lib/api";

type Board = Schemas["WhiteboardOut"];
type Elements = readonly ExcalidrawElement[];
type Scene = { elements?: Elements; files?: BinaryFiles };

// Excalidraw touches window/canvas on import: browser only.
const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <p className="p-6 text-[14px] text-muted">Loading the whiteboard…</p>,
});

const TOPIC = "whiteboard";
const SAVE_DELAY_MS = 1200;
const POLL_MS = 5000;
const MAX_LIVE_BYTES = 60_000; // bigger changes reach the other side through the saved copy

/** Union by element id; the higher Excalidraw `version` wins (ties keep ours). */
function merge(ours: Elements, theirs: Elements): ExcalidrawElement[] {
  const byId = new Map(ours.map((e) => [e.id, e]));
  for (const e of theirs) {
    const mine = byId.get(e.id);
    if (!mine || e.version > mine.version) byId.set(e.id, e);
  }
  return [...byId.values()];
}

const signature = (els: Elements) => els.map((e) => `${e.id}:${e.version}`).join(",");

/**
 * The shared board itself, as a full-screen dialog. In a call, strokes go straight to the other
 * person over the LiveKit data channel; the scene is also saved to the API (optimistic version
 * check) so it survives reloads and works outside a call, where we poll for the other side's saves.
 */
export function WhiteboardDialog({
  taskId,
  room,
  onClose,
}: {
  taskId: string;
  room?: Room | null;
  onClose: () => void;
}) {
  const [initial, setInitial] = useState<Scene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "offline">("saved");
  const excal = useRef<ExcalidrawImperativeAPI | null>(null);
  const version = useRef(0);
  const lastSig = useRef("");
  const sent = useRef(new Map<string, number>()); // element id -> version already broadcast
  const dirty = useRef(false);
  const applying = useRef(false);
  const failed = useRef(false); // last save didn't reach the API (offline, server blip)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const apply = useCallback((theirs: Elements, files?: BinaryFiles) => {
    const ex = excal.current;
    if (!ex) return;
    if (files) ex.addFiles(Object.values(files));
    const next = merge(ex.getSceneElementsIncludingDeleted(), theirs);
    for (const e of theirs) sent.current.set(e.id, e.version);
    applying.current = true;
    ex.updateScene({ elements: next });
    lastSig.current = signature(next);
    applying.current = false;
  }, []);

  const save = useCallback(async (): Promise<void> => {
    const ex = excal.current;
    if (!ex) return;
    dirty.current = false;
    setStatus("saving");
    const scene = { elements: ex.getSceneElementsIncludingDeleted(), files: ex.getFiles() };
    try {
      const b = await api<Board>(`/tasks/${taskId}/whiteboard`, {
        method: "PUT",
        body: { scene, base_version: version.current },
      });
      version.current = b.version;
      failed.current = false;
      setError(null);
      setStatus(dirty.current ? "saving" : "saved");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // The other person saved first: take their changes in, then save the union.
        const b = await api<Board>(`/tasks/${taskId}/whiteboard`).catch(() => null);
        if (b) {
          const s = (b.scene ?? {}) as Scene;
          apply(s.elements ?? [], s.files);
          version.current = b.version;
          return save();
        }
      }
      dirty.current = true;
      setStatus("offline");
      if (e instanceof ApiError && e.status === 413) setError("The board is too big to save. Remove some images.");
      // Too big won't fix itself: wait for the next edit. Anything else is retried below.
      else failed.current = true;
    }
  }, [taskId, apply]);

  // Load the saved scene before mounting the canvas.
  useEffect(() => {
    let live = true;
    api<Board>(`/tasks/${taskId}/whiteboard`)
      .then((b) => {
        if (!live) return;
        version.current = b.version;
        const s = (b.scene ?? {}) as Scene;
        lastSig.current = signature(s.elements ?? []);
        for (const e of s.elements ?? []) sent.current.set(e.id, e.version);
        setInitial(s);
      })
      .catch(() => live && setError("This whiteboard isn't available to you."));
    return () => {
      live = false;
    };
  }, [taskId]);

  // Live strokes from the other person in the call.
  useEffect(() => {
    if (!room) return;
    const onData = (payload: Uint8Array, _p?: RemoteParticipant, _k?: unknown, topic?: string) => {
      if (topic !== TOPIC) return;
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as { elements?: Elements };
        if (Array.isArray(msg.elements)) apply(msg.elements);
      } catch {
        // Not ours or truncated: the saved copy will catch us up.
      }
    };
    room.on("dataReceived", onData);
    return () => {
      room.off("dataReceived", onData);
    };
  }, [room, apply]);

  // Pick up the other side's saves (outside a call this is the only way they arrive).
  useEffect(() => {
    if (!initial) return;
    const t = setInterval(async () => {
      if (dirty.current || document.hidden) return;
      const b = await api<Board>(`/tasks/${taskId}/whiteboard`).catch(() => null);
      if (b && b.version > version.current && !dirty.current) {
        const s = (b.scene ?? {}) as Scene;
        apply(s.elements ?? [], s.files);
        version.current = b.version;
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [initial, taskId, apply]);

  // A save that failed (offline, blip) is retried when the connection returns and on each poll,
  // so the board saves without the person having to draw again.
  useEffect(() => {
    const retry = () => {
      if (failed.current && dirty.current && navigator.onLine) void save();
    };
    window.addEventListener("online", retry);
    const t = setInterval(retry, POLL_MS);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(t);
    };
  }, [save]);

  // Flush a pending save on close; lock page scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) void save();
    };
  }, [save]);

  const onChange = (els: Elements) => {
    if (applying.current) return;
    const sig = signature(els);
    if (sig === lastSig.current) return; // selection, scroll, zoom: nothing to share
    lastSig.current = sig;
    const changed = els.filter((e) => sent.current.get(e.id) !== e.version);
    for (const e of changed) sent.current.set(e.id, e.version);
    if (room && changed.length) {
      const bytes = new TextEncoder().encode(JSON.stringify({ elements: changed }));
      if (bytes.length <= MAX_LIVE_BYTES) {
        room.localParticipant.publishData(bytes, { reliable: true, topic: TOPIC }).catch(() => undefined);
      }
    }
    dirty.current = true;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  };

  const exportPng = async () => {
    const ex = excal.current;
    if (!ex) return;
    const { exportToBlob } = await import("@excalidraw/excalidraw");
    const blob = await exportToBlob({
      elements: ex.getSceneElements(),
      appState: { ...ex.getAppState(), exportBackground: true },
      files: ex.getFiles(),
      mimeType: "image/png",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shared whiteboard"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white"
      data-testid="whiteboard"
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-sheet px-3 py-2"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-semibold text-ink">Whiteboard</span>
          <span className="text-[13px] text-muted" role="status" data-testid="whiteboard-status">
            {status === "saved" ? "Saved" : status === "saving" ? "Saving…" : "Not saved yet"}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportPng} disabled={!initial} aria-label="Save as image">
            <Download size={17} aria-hidden />
            <span className="hidden sm:inline">Save as image</span>
          </Button>
          <Button ref={closeRef} variant="secondary" onClick={onClose} aria-label="Close whiteboard">
            <X size={17} aria-hidden />
            <span className="hidden sm:inline">Close</span>
          </Button>
        </div>
      </div>
      {error && <p className="px-4 py-3 text-[14px] text-danger">{error}</p>}
      <div className="relative min-h-0 w-full flex-1">
        {initial && (
          <Excalidraw
            excalidrawAPI={(a) => {
              excal.current = a;
            }}
            initialData={{
              elements: initial.elements ?? [],
              files: initial.files,
              appState: { viewBackgroundColor: "#ffffff" },
            }}
            onChange={(els) => onChange(els)}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }}
          />
        )}
      </div>
    </div>
  );
}

/** A "Whiteboard" button that opens the shared board, and returns focus to itself on close. */
export function WhiteboardButton({
  taskId,
  room,
  variant = "secondary",
}: {
  taskId: string;
  room?: Room | null;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={btn} variant={variant} onClick={() => setOpen(true)}>
        <PenLine size={17} aria-hidden /> Whiteboard
      </Button>
      {open && (
        <WhiteboardDialog
          taskId={taskId}
          room={room}
          onClose={() => {
            setOpen(false);
            setTimeout(() => btn.current?.focus(), 0);
          }}
        />
      )}
    </>
  );
}

// Matches the API: the board opens once the session is paid and stays available afterwards.
const OPEN = new Set(["paid", "delivered", "completed", "disputed"]);

/** Task-page entry point for the hired student and tutor. */
export function WhiteboardCard({ taskId, status }: { taskId: string; status: string }) {
  if (!OPEN.has(status)) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-rule bg-sheet p-5">
      <div className="min-w-0">
        <div className="font-semibold text-ink">Shared whiteboard</div>
        <p className="mt-1 text-[14px] text-muted">Sketch and work problems out together, live.</p>
      </div>
      <WhiteboardButton taskId={taskId} />
    </div>
  );
}
