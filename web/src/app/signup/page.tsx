"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthFrame } from "@/components/auth-frame";
import { Button, ErrorText, Field, inputCls, useAction } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
          Already have an account?{" "}
          <Link className="font-semibold text-tutor underline-offset-4 hover:underline" href="/login">
            Sign in
          </Link>
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
            if (!data.session) throw new Error("Check your email to confirm your account.");
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
        <Button type="submit" disabled={pending} loading={pending} className="w-full">
          Continue
        </Button>
      </form>
    </AuthFrame>
  );
}
