"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AuthFrame } from "@/components/auth-frame";
import { LinkButton } from "@/components/ui";

function Result() {
  const ok = useSearchParams().get("status") === "success";
  return (
    <AuthFrame title={ok ? "Payment received" : "Payment cancelled"}>
      <p className="flex items-start gap-2.5 text-[15px] text-ink-2">
        {ok ? (
          <CircleCheck size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mastery" aria-hidden />
        ) : (
          <CircleX size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted" aria-hidden />
        )}
        {ok
          ? "Thanks. We confirm every payment with the payment provider directly — your session updates within a few seconds."
          : "No charge was made."}
      </p>
      <LinkButton href="/dashboard" className="mt-5 w-full">
        Back to your desk
      </LinkButton>
    </AuthFrame>
  );
}

export default function PaymentReturn() {
  return (
    <Suspense>
      <Result />
    </Suspense>
  );
}
