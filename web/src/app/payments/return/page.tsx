"use client";

import { ArrowRight, CircleX, Clock3, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PathLine } from "@/components/path-line";
import { Button, LinkButton } from "@/components/ui";
import { api, money, type Me, type PaymentState } from "@/lib/api";

type Confirmation =
  | { status: "checking" | "pending" | "error" | "premium" }
  | { status: "task"; payment: NonNullable<PaymentState["payment"]> };

const PAYMENT_TITLES: Record<string, string> = {
  held: "Your payment is held.",
  released: "Your payment was released.",
  refunded: "Your payment was refunded.",
  expired: "This checkout expired.",
};

/**
 * After the gateway. We never treat this redirect as proof of payment: the session updates from
 * the provider's signed webhook. With task context we show the held payment as it stands.
 */
function Result() {
  const q = useSearchParams();
  // A new return context must never display a previous task's confirmed payment.
  return <PaymentResult key={q.toString()} outcome={q.get("status")} kind={q.get("kind")} taskId={q.get("task_id")} />;
}

function PaymentResult({
  outcome,
  kind,
  taskId,
}: {
  outcome: string | null;
  kind: string | null;
  taskId: string | null;
}) {
  const ok = outcome === "success";
  const taskPayment = !!taskId && (kind === "task_payment" || !kind);
  const subscription = kind === "subscription";
  const canCheck = ok && (taskPayment || subscription);
  const [confirmation, setConfirmation] = useState<Confirmation>({ status: "checking" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!canCheck) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setConfirmation({ status: "checking" });
    async function check(attempt: number) {
      try {
        if (taskPayment && taskId) {
          const state = await api<PaymentState>(`/tasks/${encodeURIComponent(taskId)}/payment`);
          if (cancelled) return;
          if (state.payment && Object.hasOwn(PAYMENT_TITLES, state.payment.status)) {
            setConfirmation({ status: "task", payment: state.payment });
            return;
          }
        } else {
          const me = await api<Me>("/me");
          if (cancelled) return;
          if (me.premium) {
            setConfirmation({ status: "premium" });
            return;
          }
        }
        // Webhooks may arrive after the redirect. Keep reads bounded; never retry a charge.
        if (attempt < 4) timer = setTimeout(() => void check(attempt + 1), 2000);
        else setConfirmation({ status: "pending" });
      } catch {
        if (!cancelled) setConfirmation({ status: "error" });
      }
    }
    void check(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canCheck, taskPayment, taskId, retry]);

  const payment = confirmation.status === "task" ? confirmation.payment : null;
  const paid = !!payment && ["held", "released", "refunded"].includes(payment.status);
  const released = payment?.status === "released";
  const refunded = payment?.status === "refunded";
  const back = taskId ? `/tasks/${encodeURIComponent(taskId)}` : "/dashboard";

  if (outcome === "cancel") {
    return (
      <div className="mx-auto max-w-[32rem] pt-10 sm:pt-16">
        <CircleX size={28} strokeWidth={1.5} className="text-muted" aria-hidden />
        <h1 className="mt-4 font-serif text-[2.4rem] leading-[1.05] font-medium tracking-[-0.03em]">
          Checkout cancelled
        </h1>
        <p className="mt-3 text-[16px] text-ink-2">
          Check the latest payment status in your session or study desk before trying again.
        </p>
        <LinkButton href={back} className="mt-8">
          {taskId ? "Back to your session" : "Back to your desk"}
        </LinkButton>
      </div>
    );
  }

  const title = !ok
    ? "Check your payment status."
    : kind === "tip"
      ? "Check your tip in your session."
      : !canCheck
        ? "Check your payment status."
        : confirmation.status === "error"
          ? "We couldn't confirm your payment."
          : confirmation.status === "premium"
            ? "Premium is on."
            : payment
              ? PAYMENT_TITLES[payment.status]
              : confirmation.status === "pending"
                ? subscription
                  ? "Premium confirmation is pending."
                  : "Payment confirmation is pending."
                : subscription
                  ? "Confirming Premium."
                  : "Confirming your payment.";
  const Icon = paid || confirmation.status === "premium" ? ShieldCheck : Clock3;
  const description =
    payment?.status === "held"
      ? "StudyHelp holds your payment until the session is completed. Your session shows the latest details."
      : released
        ? "Your payment has been released. Open your session for payout details."
        : refunded
          ? "Your session records a refund. Open it for details."
          : payment?.status === "expired"
            ? "This checkout is no longer active. Check your session before starting another payment."
            : confirmation.status === "premium"
              ? "Your study desk now has Premium access."
              : kind === "tip"
                ? "Your session shows confirmed tips. Check there before sending another tip."
                : canCheck
                  ? "Your desk updates when the payment provider confirms the result. You can check the latest status there or check again here."
                  : "Your session or study desk shows the latest confirmed status.";
  return (
    <div className="mx-auto max-w-[36rem] pt-10 sm:pt-16">
      <Icon
        size={30}
        strokeWidth={1.5}
        className={paid || confirmation.status === "premium" ? "text-mastery" : "text-muted"}
        aria-hidden
      />
      <h1 className="mt-4 font-serif text-[2.6rem] leading-[1.04] font-medium tracking-[-0.03em] sm:text-[3.25rem]">
        {title}
      </h1>
      <p className="mt-4 max-w-[46ch] text-[16px] text-ink-2">{description}</p>
      {ok && taskPayment && (
        <div className="mt-10">
          <PathLine
            stages={[
              { label: "Paid", state: paid ? "done" : "attention" },
              {
                label: "Held",
                state: released || refunded ? "done" : payment?.status === "held" ? "current" : "upcoming",
                note: payment ? money(payment.amount_cents) : undefined,
              },
              { label: refunded ? "Refunded" : "Released", state: released || refunded ? "current" : "upcoming" },
            ]}
          />
        </div>
      )}
      {canCheck && (confirmation.status === "pending" || confirmation.status === "error") && (
        <Button className="mt-8" onClick={() => setRetry((n) => n + 1)}>
          Check again
        </Button>
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
