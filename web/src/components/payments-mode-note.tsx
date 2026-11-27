"use client";

import { useCapabilities } from "@/lib/capabilities";

/** Homepage line saying payments aren't real yet. Gone once live Stripe keys are configured. */
export function PaymentsModeNote({ className = "" }: { className?: string }) {
  const caps = useCapabilities();
  if (!caps || caps.paymentsMode === "live") return null;
  return (
    <p className={`text-[13px] text-muted ${className}`} data-testid="payments-mode-note">
      {caps.paymentsMode === "demo"
        ? "Demo build — payments run in test mode"
        : "Payments run in test mode — no real money moves"}
    </p>
  );
}
