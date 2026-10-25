"use client";

import { Check } from "lucide-react";

/*
 * The StudyHelp path motif (DESIGN.md §12), straight diagrammatic variant.
 * Use ONLY where progression is real: a session's lifecycle, a guided request, a payment's
 * journey. done = teal · current = indigo halo · attention = amber halo · upcoming = neutral.
 */
export type StageState = "done" | "current" | "attention" | "upcoming";
export type Stage = { label: string; state: StageState; note?: string };

export const SESSION_STAGES = ["Request", "Offers", "Hired", "Learning", "Complete"] as const;

/** Map a task status onto the five public session stages. */
export function sessionStages(status: string, waiting = false): Stage[] {
  const at = { open: 1, hired: 2, paid: 3, delivered: 3, disputed: 3, completed: 5 }[status] ?? 0;
  return SESSION_STAGES.map((label, i) => ({
    label,
    state: i < at ? "done" : i === at ? (waiting ? "attention" : "current") : "upcoming",
  }));
}

export function PathLine({
  stages,
  tone = "light",
  dense = false,
}: {
  stages: Stage[];
  tone?: "light" | "dark";
  dense?: boolean;
}) {
  const dark = tone === "dark";
  const lastDone = stages.reduce((n, s, i) => (s.state === "done" ? i : n), -1);
  const pct =
    stages.length > 1 ? (Math.max(0, lastDone + (stages[lastDone + 1] ? 1 : 0)) / (stages.length - 1)) * 100 : 0;
  return (
    <div className="relative" role="list" aria-label="Progress">
      <span
        aria-hidden
        className={`absolute top-[9px] right-[9px] left-[9px] h-px border-t-[1.5px] border-dashed ${dark ? "border-white/25" : "border-rule-strong"}`}
      />
      <span
        aria-hidden
        className="path-grow absolute top-[8px] left-[9px] h-[2.5px] rounded-full bg-mastery-mark"
        style={{ width: `calc((100% - 18px) * ${Math.min(pct, 100) / 100})` }}
      />
      <ol className="relative flex justify-between">
        {stages.map((s) => {
          const halo =
            s.state === "current"
              ? "0 0 0 2px var(--tutor), 0 0 0 7px rgb(67 56 202 / 0.16)"
              : s.state === "attention"
                ? "0 0 0 2px var(--attention-mark), 0 0 0 7px rgb(245 158 11 / 0.18)"
                : undefined;
          return (
            <li
              key={s.label}
              role="listitem"
              className="flex min-w-0 flex-col items-center first:items-start last:items-end"
              aria-current={s.state === "current" || s.state === "attention" ? "step" : undefined}
            >
              <span
                className={`flex size-[18px] items-center justify-center rounded-full ${
                  s.state === "done"
                    ? "bg-mastery text-white"
                    : s.state === "upcoming"
                      ? dark
                        ? "border-[1.5px] border-white/30 bg-tutor-deep"
                        : "border-[1.5px] border-rule-strong bg-paper"
                      : dark
                        ? "bg-tutor-deep"
                        : "bg-sheet"
                }`}
                style={{ boxShadow: halo }}
              >
                {s.state === "done" && <Check size={10} strokeWidth={3.5} aria-hidden />}
                {s.state === "current" && <span className="size-2 rounded-full bg-tutor" />}
                {s.state === "attention" && <span className="size-2 rounded-full bg-attention-mark" />}
              </span>
              <span
                className={`micro mt-2.5 whitespace-nowrap ${dense && s.state !== "current" && s.state !== "attention" ? "sr-only" : ""} ${
                  s.state === "done"
                    ? "text-mastery"
                    : s.state === "current"
                      ? dark
                        ? "text-white"
                        : "text-ink"
                      : s.state === "attention"
                        ? "text-attention"
                        : dark
                          ? "text-white/50"
                          : "text-muted"
                }`}
              >
                {s.label}
              </span>
              {s.note && (
                <span className={`mt-0.5 text-[12px] ${dark ? "text-lavender/80" : "text-muted"}`}>{s.note}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
