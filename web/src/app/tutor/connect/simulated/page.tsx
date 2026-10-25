"use client";

import { FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";

import { AuthFrame } from "@/components/auth-frame";
import { useAuth, useRequireRole } from "@/components/auth";
import { Button, ErrorText, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/** Demo-only stand-in for Stripe Connect Express onboarding (fake payment adapter). */
export default function SimulatedConnect() {
  useRequireRole("tutor");
  const { refresh } = useAuth();
  const router = useRouter();
  const a = useAction();
  return (
    <AuthFrame title="Payout onboarding" lede="Where Stripe Express verifies your identity and bank details.">
      <p className="mb-5 flex items-start gap-2 rounded-[6px] bg-attention-soft px-3 py-2.5 text-[13px] text-attention">
        <FlaskConical size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
        Demo mode — with Stripe test keys this is Stripe&apos;s hosted onboarding.
      </p>
      <ErrorText error={a.error} />
      <Button
        className="w-full"
        disabled={a.pending}
        onClick={() =>
          a.run(async () => {
            await api("/simulated/connect/complete", { body: {} });
            await refresh();
            router.replace("/tutor");
          })
        }
      >
        Complete onboarding
      </Button>
    </AuthFrame>
  );
}
