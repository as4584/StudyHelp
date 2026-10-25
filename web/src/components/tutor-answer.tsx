"use client";

import { AlertTriangle, BookOpenText, CircleHelp, Lightbulb, PencilRuler } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/*
 * Structured tutor answers. The system prompt asks the model to label each part
 * (Explanation / Example / Hint / Check yourself / Common mistake); we render each label as a
 * margin annotation with its own role colour. Unlabelled text falls back to plain reading text,
 * so any provider output still renders well.
 */

type Kind = "explanation" | "example" | "hint" | "check" | "mistake" | "note";

const KINDS: Record<Exclude<Kind, "note">, { label: string; icon: LucideIcon; color: string; rule: string }> = {
  explanation: { label: "Explanation", icon: BookOpenText, color: "text-tutor", rule: "bg-tutor" },
  example: { label: "Worked example", icon: PencilRuler, color: "text-tutor", rule: "bg-lavender" },
  hint: { label: "Hint", icon: Lightbulb, color: "text-attention", rule: "bg-attention-mark" },
  check: { label: "Check yourself", icon: CircleHelp, color: "text-mastery", rule: "bg-mastery-mark" },
  mistake: { label: "Common mistake", icon: AlertTriangle, color: "text-attention", rule: "bg-attention-mark" },
};

const LABELS: [RegExp, Kind][] = [
  [/^explanation\s*:\s*/i, "explanation"],
  [/^(worked\s+)?example\s*:\s*/i, "example"],
  [/^hint\s*:\s*/i, "hint"],
  [/^check(\s+yourself)?\s*:\s*/i, "check"],
  [/^(common\s+)?mistake\s*:\s*/i, "mistake"],
];

export type Part = { kind: Kind; text: string };

export function parseAnswer(raw: string): { tag: string | null; parts: Part[] } {
  let text = raw.trim();
  let tag: string | null = null;
  const m = /^\[([^\]]{1,80})\]\s*/.exec(text);
  if (m) {
    tag = m[1];
    text = text.slice(m[0].length);
  }
  const parts: Part[] = [];
  for (const line of text.split(/\n+/)) {
    const l = line.trim();
    if (!l) continue;
    const hit = LABELS.find(([re]) => re.test(l));
    if (hit) parts.push({ kind: hit[1], text: l.replace(hit[0], "") });
    else if (parts.length && parts[parts.length - 1].kind === "note") parts[parts.length - 1].text += `\n${l}`;
    else parts.push({ kind: "note", text: l });
  }
  return { tag, parts };
}

/** Inline: **concept** → highlighted concept, `formula` → set in mono. */
function Inline({ text }: { text: string }) {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.startsWith("**") && t.endsWith("**"))
          return (
            <mark
              key={i}
              className="rounded-[2px] bg-transparent bg-[linear-gradient(transparent_60%,#d9d7f8_60%)] px-0.5 font-semibold text-ink"
            >
              {t.slice(2, -2)}
            </mark>
          );
        if (t.startsWith("`") && t.endsWith("`"))
          return (
            <code key={i} className="rounded-[4px] bg-sunken px-1.5 py-0.5 font-mono text-[0.86em] text-tutor-deep">
              {t.slice(1, -1)}
            </code>
          );
        return <span key={i}>{t}</span>;
      })}
    </>
  );
}

export function TutorAnswer({ content, animate = true }: { content: string; animate?: boolean }) {
  const { tag, parts } = parseAnswer(content);
  return (
    <div className="space-y-5">
      {tag && (
        <span className="inline-block rounded-[4px] bg-sunken px-1.5 py-px text-[11px] font-semibold tracking-[0.01em] text-muted">
          [{tag}]
        </span>
      )}
      {parts.map((p, i) => {
        const delay = animate ? { animationDelay: `${i * 110}ms` } : undefined;
        if (p.kind === "note")
          return (
            <p
              key={i}
              className={`${animate ? "reveal" : ""} max-w-[64ch] font-serif text-[17px] leading-[1.65] text-ink-2`}
              style={delay}
            >
              <Inline text={p.text} />
            </p>
          );
        const k = KINDS[p.kind];
        const boxed = p.kind === "example";
        return (
          <section
            key={i}
            className={`${animate ? "reveal" : ""} grid gap-x-5 gap-y-1.5 sm:grid-cols-[9.5rem_1fr]`}
            style={delay}
          >
            <div className={`flex items-center gap-1.5 sm:justify-end sm:pt-1 ${k.color}`}>
              <k.icon size={14} strokeWidth={2} aria-hidden />
              <span className="micro">{k.label}</span>
            </div>
            <div className={`relative ${boxed ? "rounded-[10px] bg-sunken/70 px-4 py-3" : "pl-4"}`}>
              {!boxed && (
                <span aria-hidden className={`absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full ${k.rule}`} />
              )}
              <p
                className={`max-w-[62ch] font-serif leading-[1.65] text-ink ${
                  p.kind === "explanation" ? "text-[18.5px]" : "text-[16.5px]"
                } ${p.kind === "check" ? "italic" : ""}`}
              >
                <Inline text={p.text} />
              </p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
