"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, ErrorText, Field, inputCls, useAction } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, run } = useAction();

  return (
    <div className="mx-auto max-w-sm">
      <Card title="Create your account">
        <form
          className="space-y-3"
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
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" hint="At least 8 characters">
            <input
              className={inputCls}
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <ErrorText error={error} />
          <Button type="submit" disabled={pending} className="w-full">
            Continue
          </Button>
        </form>
      </Card>
    </div>
  );
}
