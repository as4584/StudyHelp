"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth";
import { Button, Card, ErrorText, Field, inputCls, useAction } from "@/components/ui";
import { api, LANGUAGES } from "@/lib/api";

export default function OnboardPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [role, setRole] = useState<"student" | "tutor">("student");
  const [name, setName] = useState("");
  const [lang, setLang] = useState("en");
  const { pending, error, run } = useAction();

  return (
    <div className="mx-auto max-w-md">
      <Card title="Tell us about you">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/me/onboard", { body: { role, display_name: name, preferred_language: lang } });
              await refresh();
              router.push(role === "tutor" ? "/tutor" : "/student");
            });
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {(["student", "tutor"] as const).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                className={`rounded-xl border p-3 text-left text-sm ${role === r ? "border-brand bg-indigo-50" : "border-border"}`}
              >
                <span className="block font-semibold capitalize">
                  {r === "student" ? "I'm a student" : "I'm a tutor"}
                </span>
                <span className="text-muted">{r === "student" ? "Get help with my studies" : "Teach and earn"}</span>
              </button>
            ))}
          </div>
          <Field label="Display name">
            <input
              className={inputCls}
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Preferred language" hint="Chat messages are translated into this language for you.">
            <select className={inputCls} value={lang} onChange={(e) => setLang(e.target.value)}>
              {Object.entries(LANGUAGES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <ErrorText error={error} />
          <Button type="submit" disabled={pending} className="w-full">
            Finish
          </Button>
        </form>
      </Card>
    </div>
  );
}
