"use client";

import { CreditCard, FlaskConical } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { AuthFrame } from "@/components/auth-frame";
import { useRequireRole } from "@/components/auth";
import { Button, ErrorText, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * Demo-only stand-in for Stripe Checkout, used when the API runs the fake payment adapter.
 * Completing it sends a signed synthetic event through the same webhook processing as Stripe.
 */
export default function SimulatedCheckout() {
  const { session } = useParams<{ session: string }>();
  useRequireRole("student");
  const router = useRouter();
  const a = useAction();
  return (
    <AuthFrame title="Test checkout" lede="This is where Stripe's secure checkout appears.">
      <p className="mb-5 flex items-start gap-2 rounded-[6px] bg-attention-soft px-3 py-2.5 text-[13px] text-attention">
        <FlaskConical size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
        Demo mode — no real money moves. With Stripe test keys configured, this step is Stripe Checkout.
      </p>
      <div className="flex items-center gap-3 rounded-[6px] border border-rule-strong px-3.5 py-3">
        <CreditCard size={18} strokeWidth={1.75} className="text-muted" aria-hidden />
        <span className="tnum text-[15px] text-ink">4242 4242 4242 4242</span>
        <span className="tnum ml-auto text-[13px] text-muted">12/34 · 123</span>
      </div>
      <ErrorText error={a.error} />
      <Button
        className="mt-5 w-full"
        disabled={a.pending}
        onClick={() =>
          a.run(async () => {
            await api(`/simulated/checkout/${session}/complete`, { body: {} });
            router.replace("/payments/return?status=success");
          })
        }
      >
        Pay now
      </Button>
    </AuthFrame>
  );
}
