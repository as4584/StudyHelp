"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthFrame } from "@/components/auth-frame";
import { Button, ErrorText, Field, inputCls, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const { pending, error, run } = useAction();

  return (
    <AuthFrame
      title="Welcome back"
      lede="Pick up where you left off."
      path={{
        heading: "Every hard idea is a path, not a wall.",
        body: "Ask, understand, practise — and bring in a live expert whenever a step won't click.",
        stages: [
          { label: "Question", state: "done" },
          { label: "Understand", state: "current" },
          { label: "Practice", state: "upcoming" },
          { label: "Master", state: "upcoming" },
        ],
      }}
      footer={
        <>
          New here?{" "}
          <Link className="font-semibold text-tutor underline-offset-4 hover:underline" href="/signup">
            Create an account
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Read the boxes themselves: text typed before the page finished loading, or filled
          // in by a password manager, is in the form even if React never saw a keystroke.
          const form = new FormData(e.currentTarget);
          const email = String(form.get("email") ?? "").trim();
          const password = String(form.get("password") ?? "");
          void run(async () => {
            let { error } = await supabase().auth.signInWithPassword({ email, password });
            // Public demo accounts: if a visitor changed the password, put it back and retry once.
            if (error && email.trim().toLowerCase().endsWith("@demo.gsht")) {
              const restored = await api("/demo/restore-login", { body: { email } }).then(
                () => true,
                () => false,
              );
              if (restored) ({ error } = await supabase().auth.signInWithPassword({ email, password }));
            }
            if (error) throw error;
            router.push("/dashboard");
          });
        }}
      >
        <Field label="Email">
          <input className={inputCls} type="email" autoComplete="email" name="email" required />
        </Field>
        <Field label="Password">
          <input className={inputCls} type="password" autoComplete="current-password" name="password" required />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" disabled={pending} loading={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthFrame>
  );
}
