"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthFrame } from "@/components/auth-frame";
import { POLICIES, policyHref } from "@/content/policies";
import { Button, ErrorText, Field, inputCls, useAction } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { pending, error, run } = useAction();

  return (
    <AuthFrame
      title="Open your study desk"
      lede="One account for learning — or for teaching."
      path={{
        heading: "From stuck to sure, one step at a time.",
        body: "Post what you're stuck on, choose a vetted tutor, and pay only when the session is delivered.",
        stages: [
          { label: "Request", state: "current" },
          { label: "Offers", state: "upcoming" },
          { label: "Hired", state: "upcoming" },
          { label: "Learning", state: "upcoming" },
          { label: "Complete", state: "upcoming" },
        ],
      }}
      footer={
        <>
          <p>
            Next you&apos;ll choose student or tutor and accept the{" "}
            <Link className="font-semibold text-tutor underline-offset-4 hover:underline" href={policyHref("student")}>
              {POLICIES.student.shortTitle}
            </Link>{" "}
            or the{" "}
            <Link className="font-semibold text-tutor underline-offset-4 hover:underline" href={policyHref("tutor")}>
              {POLICIES.tutor.shortTitle}
            </Link>
            .
          </p>
          <p className="mt-3">
            Already have an account?{" "}
            <Link className="font-semibold text-tutor underline-offset-4 hover:underline" href="/login">
              Sign in
            </Link>
          </p>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const { data, error } = await supabase().auth.signUp({ email, password });
            if (error) throw error;
            if (!data.session) return setSentTo(email);
            router.push("/onboard");
          });
        }}
      >
        <Field label="Email">
          <input
            className={inputCls}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input
            className={inputCls}
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorText error={error} />
        {sentTo && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-[6px] bg-tutor-soft px-3 py-2.5 text-[14px] text-ink"
          >
            <MailCheck size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-tutor" aria-hidden />
            <span>
              Check your email. We sent a confirmation link to <strong className="font-semibold">{sentTo}</strong>. Open
              it to finish setting up your account.
            </span>
          </p>
        )}
        <Button type="submit" disabled={pending} loading={pending} className="w-full">
          Continue
        </Button>
      </form>
    </AuthFrame>
  );
}
