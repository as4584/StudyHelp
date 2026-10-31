"use client";

import { Video } from "lucide-react";
import { useEffect, useState } from "react";

import { LinkButton, Sheet } from "@/components/ui";
import { api, type Schemas } from "@/lib/api";

type Status = Schemas["VideoStatusOut"];

/**
 * Entry point to the live session for the two parties. Renders nothing when video is
 * switched off on the server, for anyone who isn't on the session, or once it has ended.
 */
export function VideoSessionCard({ taskId }: { taskId: string }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let live = true;
    api<Status>(`/tasks/${taskId}/video`)
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus(null));
    return () => {
      live = false;
    };
  }, [taskId]);

  if (!status?.joinable) return null;
  return (
    <Sheet className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-semibold text-ink">
          <Video size={17} strokeWidth={2} aria-hidden /> Live session
        </div>
        <p className="mt-1 text-[14px] text-muted">
          {status.status === "active" ? "Your session is open." : "Meet face to face and share your screen."}
        </p>
      </div>
      <LinkButton href={`/tasks/${taskId}/call`}>Start video session</LinkButton>
    </Sheet>
  );
}
