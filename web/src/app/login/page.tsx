"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, ErrorText, Field, inputCls, useAction } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, run } = useAction();

  return (
    <div className="mx-auto max-w-sm">
      <Card title="Sign in">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const { error } = await supabase().auth.signInWithPassword({ email, password });
              if (error) throw error;
              router.push("/dashboard");
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
          <Field label="Password">
            <input
              className={inputCls}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <ErrorText error={error} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          New here?{" "}
          <Link className="text-brand" href="/signup">
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  );
}
