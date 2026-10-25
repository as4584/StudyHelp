"use client";

import { BookOpen, GraduationCap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthFrame } from "@/components/auth-frame";
import { useAuth } from "@/components/auth";
import { Button, ErrorText, Field, inputCls, useAction } from "@/components/ui";
import { api, LANGUAGES } from "@/lib/api";

const ROLES = [
  { id: "student", label: "I'm a student", body: "Get help understanding my courses", icon: BookOpen },
  { id: "tutor", label: "I'm a tutor", body: "Teach students around the world", icon: GraduationCap },
] as const;

export default function OnboardPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [role, setRole] = useState<"student" | "tutor">("student");
  const [name, setName] = useState("");
  const [lang, setLang] = useState("en");
  const { pending, error, run } = useAction();

  return (
    <AuthFrame title="Set up your desk" lede="Two quick details and you're in.">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api("/me/onboard", { body: { role, display_name: name, preferred_language: lang } });
            await refresh();
            router.push(role === "tutor" ? "/tutor" : "/student");
          });
        }}
      >
        <fieldset>
          <legend className="mb-2 text-[14px] font-semibold text-ink">How will you use StudyHelp?</legend>
          <div className="grid gap-2">
            {ROLES.map((r) => {
              const active = role === r.id;
              return (
                <button
                  type="button"
                  key={r.id}
                  aria-pressed={active}
                  onClick={() => setRole(r.id)}
                  className={`flex items-center gap-3 rounded-[6px] border px-3.5 py-3 text-left transition-colors ${
                    active ? "border-tutor bg-tutor-soft" : "border-rule-strong hover:border-ink-2/40"
                  }`}
                >
                  <r.icon size={20} strokeWidth={1.75} className={active ? "text-tutor" : "text-muted"} aria-hidden />
                  <span>
                    <span className="block text-[15px] font-semibold text-ink">{r.label}</span>
                    <span className="block text-[13px] text-muted">{r.body}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <Field label="Display name">
          <input className={inputCls} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Preferred language" hint="Messages from others are translated into this language for you.">
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
    </AuthFrame>
  );
}
