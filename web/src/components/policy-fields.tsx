"use client";

import Link from "next/link";

import { Field, inputCls } from "@/components/ui";
import { POLICIES, policyHref } from "@/content/policies";
import type { Schemas } from "@/lib/api";

export type PolicyValues = {
  agree: boolean;
  fullName: string;
  dob: string;
  guardianName: string;
  guardianEmail: string;
  guardianConsent: boolean;
};

export const EMPTY_POLICY: PolicyValues = {
  agree: false,
  fullName: "",
  dob: "",
  guardianName: "",
  guardianEmail: "",
  guardianConsent: false,
};

/** Prefill from what is already on record (later acceptance, or a parent completing consent). */
export function policyValuesFrom(s: Schemas["PolicyStatusOut"] | undefined): PolicyValues {
  return {
    ...EMPTY_POLICY,
    fullName: s?.accepted_name ?? "",
    dob: s?.date_of_birth ?? "",
    guardianName: s?.guardian_name ?? "",
    guardianEmail: s?.guardian_email ?? "",
  };
}

export function ageOn(dob: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const before = today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d);
  return today.getFullYear() - y - (before ? 1 : 0);
}

export function isMinor(v: PolicyValues) {
  const age = ageOn(v.dob);
  return age !== null && age < 18;
}

/** Request body for /me/onboard `policy` and /me/policy. */
export function policyBody(role: "student" | "tutor", v: PolicyValues): Schemas["PolicyAcceptIn"] {
  const minor = role === "student" && isMinor(v);
  return {
    agree: true,
    full_name: v.fullName.trim(),
    date_of_birth: role === "student" ? v.dob : null,
    guardian_name: minor ? v.guardianName.trim() : null,
    guardian_email: minor ? v.guardianEmail.trim() : null,
    guardian_consent: minor && v.guardianConsent,
  };
}

/**
 * The policy part of sign-up: name (a tutor's e-signature), a student's date of birth with
 * parent/guardian details under 18, and the required agreement checkbox (unchecked by default).
 */
export function PolicyFields({
  role,
  value,
  onChange,
  lockDob = false,
}: {
  role: "student" | "tutor";
  value: PolicyValues;
  onChange: (v: PolicyValues) => void;
  lockDob?: boolean;
}) {
  const set = (patch: Partial<PolicyValues>) => onChange({ ...value, ...patch });
  const policy = POLICIES[role];
  const minor = role === "student" && isMinor(value);
  const link = (
    <Link href={policyHref(role)} target="_blank" className="font-semibold text-tutor underline underline-offset-4">
      {policy.shortTitle}
    </Link>
  );
  return (
    <div className="space-y-5">
      <Field
        label={role === "tutor" ? "Full legal name" : "Full name"}
        hint={role === "tutor" ? "Typing your full legal name is your electronic signature." : undefined}
      >
        <input
          className={inputCls}
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          value={value.fullName}
          onChange={(e) => set({ fullName: e.target.value })}
        />
      </Field>
      {role === "student" && (
        <Field label="Date of birth">
          <input
            className={inputCls}
            type="date"
            required
            disabled={lockDob}
            max={new Date().toISOString().slice(0, 10)}
            value={value.dob}
            onChange={(e) => set({ dob: e.target.value })}
          />
        </Field>
      )}
      {minor && (
        <fieldset className="space-y-4 rounded-[8px] border border-rule bg-sunken/40 p-4">
          <legend className="px-1 text-[14px] font-semibold text-ink">Parent or guardian</legend>
          <p className="text-[13px] leading-snug text-muted">
            Students under 18 need a parent or guardian&apos;s consent before booking a session.
          </p>
          <Field label="Parent or guardian's full name">
            <input
              className={inputCls}
              required
              minLength={2}
              maxLength={120}
              value={value.guardianName}
              onChange={(e) => set({ guardianName: e.target.value })}
            />
          </Field>
          <Field label="Parent or guardian's email">
            <input
              className={inputCls}
              type="email"
              required
              value={value.guardianEmail}
              onChange={(e) => set({ guardianEmail: e.target.value })}
            />
          </Field>
          <label className="flex items-start gap-3 text-[14px] leading-snug text-ink-2">
            <input
              type="checkbox"
              className="mt-0.5 size-[18px] shrink-0 accent-[#0f766e]"
              checked={value.guardianConsent}
              onChange={(e) => set({ guardianConsent: e.target.checked })}
            />
            <span>
              I am this student&apos;s parent or guardian. I have read the {link} and I consent to them using StudyHelp.{" "}
              <span className="text-muted">(Can be done later, but sessions can&apos;t be booked until it is.)</span>
            </span>
          </label>
        </fieldset>
      )}
      <label className="flex items-start gap-3 text-[14px] leading-snug text-ink-2">
        <input
          type="checkbox"
          required
          className="mt-0.5 size-[18px] shrink-0 accent-[#0f766e]"
          checked={value.agree}
          onChange={(e) => set({ agree: e.target.checked })}
        />
        <span>I have read and agree to the {link}.</span>
      </label>
    </div>
  );
}
