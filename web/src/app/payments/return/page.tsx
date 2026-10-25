"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Card, LinkButton } from "@/components/ui";

function Result() {
  const ok = useSearchParams().get("status") === "success";
  return (
    <div className="mx-auto max-w-sm">
      <Card title={ok ? "Payment received" : "Payment cancelled"}>
        <p className="mb-3 text-sm text-muted">
          {ok
            ? "Thanks! We confirm payments with the payment provider directly — your task updates within a few seconds."
            : "No charge was made."}
        </p>
        <LinkButton href="/dashboard">Back to dashboard</LinkButton>
      </Card>
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
