"use client";

import { FileSignature } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/components/auth";
import { PolicyFields, policyBody, policyComplete, policyValuesFrom } from "@/components/policy-fields";
import { Button, ErrorText, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * Shown on a desk while the account's policy isn't fully on record: accounts created before the
 * policy existed, a new policy version, or a student under 18 waiting for a parent's consent.
 * The API enforces the same rules (no offers / no booking); this is how the user fixes it.
 */
export function PolicyGate() {
  const { me, refresh } = useAuth();
  const role = me?.profile.role;
  const status = me?.policy;
  const [value, setValue] = useState(() => policyValuesFrom(status));
  const a = useAction();
  if ((role !== "student" && role !== "tutor") || !status || status.ready) return null;

  const needsGuardian = status.accepted && status.minor && !status.guardian_consent;
  const title = needsGuardian
    ? "A parent or guardian needs to give consent"
    : role === "tutor"
      ? "Sign the Tutor Policy and Contractor Agreement"
      : "Accept the Student and Parent Policy";
  const lede = needsGuardian
    ? "Ask your parent or guardian to read the policy and tick the consent box. Sessions can't be booked until they do."
    : role === "tutor"
      ? "You can't send offers to students until your signed agreement is on record."
      : "You need to accept it before you can book a session.";

  return (
    <section
      data-testid="policy-gate"
      className="mb-10 rounded-[12px] border border-attention/40 bg-attention-soft/60 p-5 sm:p-6"
    >
      <h2 className="flex items-center gap-2 text-[17px] font-semibold text-ink">
        <FileSignature size={18} strokeWidth={1.75} className="text-attention" aria-hidden />
        {title}
      </h2>
      <p className="mt-1.5 max-w-[60ch] text-[14px] text-ink-2">{lede}</p>
      <form
        className="mt-5 max-w-[30rem] space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(async () => {
            await api("/me/policy", { body: policyBody(role, { ...value, agree: true }) });
            await refresh();
          });
        }}
      >
        <PolicyFields role={role} value={value} onChange={setValue} lockDob={!!status.date_of_birth} />
        <ErrorText error={a.error} />
        <Button
          type="submit"
          disabled={!policyComplete(role, value) || (needsGuardian && !value.guardianConsent)}
          loading={a.pending}
        >
          {needsGuardian ? "Record consent" : role === "tutor" ? "Sign agreement" : "Accept policy"}
        </Button>
      </form>
    </section>
  );
}
