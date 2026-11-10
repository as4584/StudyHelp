"use client";

import { FileSignature } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/auth";
import { PolicyFields, policyBody, policyComplete, policyValuesFrom } from "@/components/policy-fields";
import { Button, ErrorText, Field, inputCls, useAction } from "@/components/ui";
import { POLICIES, policyHref } from "@/content/policies";
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
    ? "Hand this to your parent or guardian. They read the policy and give consent here. Sessions can't be booked until they do."
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
      {needsGuardian ? (
        <GuardianConsent name={status.guardian_name ?? ""} email={status.guardian_email ?? ""} onDone={refresh} />
      ) : (
        <form
          className="mt-5 max-w-[30rem] space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(async () => {
              await api("/me/policy", { body: policyBody(role, value) });
              await refresh();
            });
          }}
        >
          <PolicyFields role={role} value={value} onChange={setValue} lockDob={!!status.date_of_birth} />
          <ErrorText error={a.error} />
          <Button type="submit" disabled={!policyComplete(role, value)} loading={a.pending}>
            {role === "tutor" ? "Sign agreement" : "Accept policy"}
          </Button>
        </form>
      )}
    </section>
  );
}

/** The parent/guardian's part only: the student has already accepted the policy themselves. */
function GuardianConsent({ name, email, onDone }: { name: string; email: string; onDone: () => Promise<void> }) {
  const [guardianName, setGuardianName] = useState(name);
  const [guardianEmail, setGuardianEmail] = useState(email);
  const [consent, setConsent] = useState(false);
  const a = useAction();
  return (
    <form
      className="mt-5 max-w-[30rem] space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void a.run(async () => {
          await api("/me/policy/guardian", {
            body: { consent: true, guardian_name: guardianName.trim(), guardian_email: guardianEmail.trim() },
          });
          await onDone();
        });
      }}
    >
      <Field label="Parent or guardian's full name">
        <input
          className={inputCls}
          required
          minLength={2}
          maxLength={120}
          value={guardianName}
          onChange={(e) => setGuardianName(e.target.value)}
        />
      </Field>
      <Field label="Parent or guardian's email">
        <input
          className={inputCls}
          type="email"
          required
          value={guardianEmail}
          onChange={(e) => setGuardianEmail(e.target.value)}
        />
      </Field>
      <label className="flex items-start gap-3 text-[14px] leading-snug text-ink-2">
        <input
          type="checkbox"
          required
          className="mt-0.5 size-[18px] shrink-0 accent-[#0f766e]"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          I am this student&apos;s parent or guardian. I have read the{" "}
          <Link
            href={policyHref("student")}
            target="_blank"
            className="font-semibold text-tutor underline underline-offset-4"
          >
            {POLICIES.student.shortTitle}
          </Link>
          , accept it on their behalf and accept responsibility for payments on the account.
        </span>
      </label>
      <ErrorText error={a.error} />
      <Button
        type="submit"
        disabled={!consent || guardianName.trim().length < 2 || !guardianEmail.trim()}
        loading={a.pending}
      >
        Record consent
      </Button>
    </form>
  );
}
