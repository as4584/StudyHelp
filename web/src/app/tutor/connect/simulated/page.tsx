"use client";

import { useRouter } from "next/navigation";

import { useAuth, useRequireRole } from "@/components/auth";
import { Button, Card, ErrorText, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/** Demo-only stand-in for Stripe Connect Express onboarding (fake payment adapter). */
export default function SimulatedConnect() {
  useRequireRole("tutor");
  const { refresh } = useAuth();
  const router = useRouter();
  const a = useAction();
  return (
    <div className="mx-auto max-w-sm">
      <Card title="Payout onboarding">
        <p className="mb-3 rounded-lg bg-yellow-50 p-2 text-xs text-yellow-900">
          DEMO MODE — with Stripe test keys this is Stripe&apos;s hosted Express onboarding (identity + bank details).
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
      </Card>
    </div>
  );
}
