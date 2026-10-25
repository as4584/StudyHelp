"use client";

import { CreditCard, FlaskConical, LockKeyhole } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { Button, ErrorText, useAction } from "@/components/ui";
import { api, money, type Schemas } from "@/lib/api";

/**
 * Demo-only stand-in for Stripe Checkout, used when the API runs the fake payment adapter.
 * Completing it sends a signed synthetic event through the same webhook processing as Stripe.
 */
function SimulatedCheckout() {
  const { session } = useParams<{ session: string }>();
  const q = useSearchParams();
  const taskId = q.get("task_id");
  const kind = q.get("kind");
  useRequireRole("student");
  const router = useRouter();
  const a = useAction();
  const [quote, setQuote] = useState<Schemas["QuoteOut"] | null>(null);

  useEffect(() => {
    if (taskId && kind === "task_payment") api<Schemas["QuoteOut"]>(`/tasks/${taskId}/quote`).then(setQuote, () => {});
  }, [taskId, kind]);

  const what =
    kind === "subscription"
      ? "StudyHelp Premium · monthly"
      : kind === "tip"
        ? "Tip for your tutor"
        : "Tutoring session";

  return (
    <div className="mx-auto max-w-[27rem] pt-6 sm:pt-12">
      <p className="mb-5 flex items-start gap-2 rounded-[8px] bg-attention-soft px-3.5 py-3 text-[13px] leading-snug text-attention">
        <FlaskConical size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
        Demo mode — no real money moves. With Stripe test keys configured, Stripe&apos;s own checkout appears here.
      </p>
      <div className="rounded-[16px] border border-rule bg-sheet p-6 shadow-[0_1px_2px_rgb(20_22_27/0.05),0_30px_60px_-30px_rgb(30_27_75/0.3)] sm:p-7">
        <div className="micro flex items-center gap-1.5 text-mastery">
          <LockKeyhole size={13} strokeWidth={2.25} aria-hidden /> Test checkout
        </div>
        <div className="mt-3 text-[15px] text-ink-2">{what}</div>
        <div className="tnum mt-1 font-serif text-[2.75rem] leading-none font-medium tracking-[-0.02em] text-ink">
          {quote ? money(quote.amount_cents) : "—"}
        </div>
        {quote && <p className="mt-2 text-[13px] text-muted">Held by StudyHelp until you confirm delivery.</p>}
        <div className="mt-6 flex items-center gap-3 rounded-[8px] border border-rule-strong px-3.5 py-3">
          <CreditCard size={18} strokeWidth={1.75} className="text-muted" aria-hidden />
          <span className="tnum text-[15px] text-ink">4242 4242 4242 4242</span>
          <span className="tnum ml-auto text-[13px] text-muted">12/34 · 123</span>
        </div>
        <ErrorText error={a.error} />
        <Button
          className="mt-5 h-12 w-full text-[16px]"
          disabled={a.pending}
          onClick={() =>
            a.run(async () => {
              await api(`/simulated/checkout/${session}/complete`, { body: {} });
              const params = new URLSearchParams({
                status: "success",
                ...(kind ? { kind } : {}),
                ...(taskId ? { task_id: taskId } : {}),
              });
              router.replace(`/payments/return?${params.toString()}`);
            })
          }
        >
          Pay now
        </Button>
      </div>
    </div>
  );
}

export default function SimulatedCheckoutPage() {
  return (
    <Suspense>
      <SimulatedCheckout />
    </Suspense>
  );
}
