"use client";

import { ArrowRight, CircleX, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PathLine } from "@/components/path-line";
import { LinkButton } from "@/components/ui";
import { api, money, type PaymentState } from "@/lib/api";

/**
 * After the gateway. We never treat this redirect as proof of payment: the session updates from
 * the provider's signed webhook. With task context we show the held payment as it stands.
 */
function Result() {
  const q = useSearchParams();
  const ok = q.get("status") === "success";
  const kind = q.get("kind");
  const taskId = q.get("task_id");
  const [pay, setPay] = useState<PaymentState | null>(null);

  useEffect(() => {
    if (ok && taskId && kind === "task_payment") api<PaymentState>(`/tasks/${taskId}/payment`).then(setPay, () => {});
  }, [ok, taskId, kind]);

  const held = pay?.payment?.status === "held";
  const back = taskId ? `/tasks/${taskId}` : "/dashboard";

  if (!ok) {
    return (
      <div className="mx-auto max-w-[32rem] pt-10 sm:pt-16">
        <CircleX size={28} strokeWidth={1.5} className="text-muted" aria-hidden />
        <h1 className="mt-4 font-serif text-[2.4rem] leading-[1.05] font-medium tracking-[-0.03em]">
          Payment cancelled
        </h1>
        <p className="mt-3 text-[16px] text-ink-2">
          No charge was made. You can come back to it whenever you&apos;re ready.
        </p>
        <LinkButton href={back} className="mt-8">
          Back to your session
        </LinkButton>
      </div>
    );
  }

  const title =
    kind === "subscription"
      ? "Premium is on."
      : kind === "tip"
        ? "Thank you — your tip is on its way."
        : "Your payment is held.";
  return (
    <div className="mx-auto max-w-[36rem] pt-10 sm:pt-16">
      <ShieldCheck size={30} strokeWidth={1.5} className="text-mastery" aria-hidden />
      <h1 className="mt-4 font-serif text-[2.6rem] leading-[1.04] font-medium tracking-[-0.03em] sm:text-[3.25rem]">
        {title}
      </h1>
      <p className="mt-4 max-w-[46ch] text-[16px] text-ink-2">
        {kind === "task_payment" || !kind
          ? "StudyHelp keeps it safe until you confirm the session was delivered. We confirm every payment with the provider directly."
          : "We confirm every payment with the payment provider directly — your desk updates within a few seconds."}
      </p>
      {kind === "task_payment" && (
        <div className="mt-10">
          <PathLine
            stages={[
              { label: "Paid", state: "done" },
              {
                label: "Held",
                state: held ? "current" : "attention",
                note: pay?.payment ? money(pay.payment.amount_cents) : "confirming…",
              },
              { label: "Delivered", state: "upcoming" },
              { label: "Released", state: "upcoming" },
            ]}
          />
        </div>
      )}
      <LinkButton href={back} className="mt-12 px-5">
        {taskId ? "Back to your session" : "Back to your desk"} <ArrowRight size={16} strokeWidth={2} aria-hidden />
      </LinkButton>
    </div>
  );
}

export default function PaymentReturn() {
  return (
    <Suspense>
      <Result />
    </Suspense>
  );
}
