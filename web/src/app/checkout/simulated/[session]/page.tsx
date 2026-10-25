"use client";

import { useParams, useRouter } from "next/navigation";

import { useRequireRole } from "@/components/auth";
import { Button, Card, ErrorText, useAction } from "@/components/ui";
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
    <div className="mx-auto max-w-sm">
      <Card title="Test checkout">
        <p className="mb-2 rounded-lg bg-yellow-50 p-2 text-xs text-yellow-900">
          DEMO MODE — no real money moves. With Stripe test keys configured this step is the real Stripe Checkout page.
        </p>
        <div className="mb-3 rounded-xl border border-border p-3 font-mono text-sm">
          4242 4242 4242 4242 · 12/34 · 123
        </div>
        <ErrorText error={a.error} />
        <Button
          className="w-full"
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
      </Card>
    </div>
  );
}
