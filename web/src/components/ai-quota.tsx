"use client";

import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, ErrorText, useAction } from "@/components/ui";
import { api, type Schemas } from "@/lib/api";

export type AiQuota = Schemas["AiQuotaOut"];

/** The server's view of this student's AI allowance; `reload` after each question. */
export function useAiQuota() {
  const [quota, setQuota] = useState<AiQuota | null>(null);
  const reload = useCallback(async () => {
    try {
      setQuota(await api<AiQuota>("/ai/quota"));
    } catch {
      /* the counter is a hint; the server still enforces the limit */
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { quota, reload };
}

const resetsIn = (iso: string) => {
  const h = Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000));
  return h >= 24 ? `in ${Math.ceil(h / 24)} days` : `in ${h} hour${h === 1 ? "" : "s"}`;
};

/** "3 of 5 free questions left today" — only shown to free students. */
export function QuotaNote({ quota, tone = "light" }: { quota: AiQuota | null; tone?: "light" | "dark" }) {
  if (!quota || quota.premium) return null;
  const cls = tone === "dark" ? "text-lavender/90" : "text-muted";
  return (
    <p className={`tnum text-[13px] ${cls}`} data-testid="ai-quota">
      {quota.remaining > 0
        ? `${quota.remaining} of ${quota.limit} free questions left today`
        : `Free questions reset ${resetsIn(quota.resets_at)}`}
    </p>
  );
}

export async function startPremiumCheckout() {
  const { url } = await api<{ url: string }>("/premium/checkout", { body: {} });
  window.location.href = url;
}

/** Shown when the server refuses a question: free daily limit (upgrade) or Premium fair use. */
export function LimitDialog({
  open,
  kind,
  quota,
  onClose,
}: {
  open: boolean;
  kind: "daily" | "fair_use";
  quota: AiQuota | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const upgrade = useAction();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="limit-h"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-[16px] border border-rule bg-sheet p-0 text-ink shadow-[0_40px_80px_-30px_rgb(30_27_75/0.55)] backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="relative p-6 sm:p-7">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 rounded-[6px] p-2 text-muted hover:bg-sunken hover:text-ink"
        >
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
        <div className="flex items-center gap-2 text-tutor">
          <Sparkles size={15} strokeWidth={1.9} aria-hidden />
          <span className="micro">AI tutor</span>
        </div>
        {kind === "daily" ? (
          <>
            <h2 id="limit-h" className="mt-3 font-serif text-[1.75rem] leading-[1.1] font-medium tracking-[-0.02em]">
              You&apos;ve used today&apos;s {quota?.limit ?? 5} free questions.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              Go Premium for unlimited AI help, any hour — or come back {quota ? resetsIn(quota.resets_at) : "tomorrow"}{" "}
              for more free questions. Live tutor sessions are always available, paid per session.
            </p>
            <ErrorText error={upgrade.error} />
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button
                disabled={upgrade.pending}
                loading={upgrade.pending}
                onClick={() => upgrade.run(startPremiumCheckout)}
              >
                Upgrade to Premium
              </Button>
              <span className="tnum text-[14px] text-muted">$9.99 / month</span>
            </div>
          </>
        ) : (
          <>
            <h2 id="limit-h" className="mt-3 font-serif text-[1.75rem] leading-[1.1] font-medium tracking-[-0.02em]">
              You&apos;ve hit this month&apos;s fair-use limit.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              Premium includes up to {quota?.limit ?? 150} AI questions a month to keep the service fast for everyone.
              It resets {quota ? resetsIn(quota.resets_at) : "next month"}. A live tutor can pick up from here.
            </p>
            <div className="mt-6">
              <Button variant="secondary" onClick={onClose}>
                Got it
              </Button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
