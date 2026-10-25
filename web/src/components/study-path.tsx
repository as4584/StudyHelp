"use client";

import { Check } from "lucide-react";

import { TIMELINE } from "./ui";

/*
 * The signature motif: a study path. A single drawn line with stops — the product's real session
 * lifecycle (and, in PathHistory, the student's real sessions). Done stops are teal, the current
 * stop is lit in the subject's accent, the road ahead is a dashed pencil line. The stroke draws
 * itself in on first render (reduced-motion: static).
 */

export function SessionPath({ status, accent }: { status: string; accent: string }) {
  const idx = TIMELINE.findIndex((s) => s.key === status);
  const current = status === "completed" ? TIMELINE.length : idx === -1 ? (status === "disputed" ? 3 : 0) : idx;
  const W = 600;
  const H = 96;
  const pts = TIMELINE.map((_, i) => {
    const x = 24 + (i * (W - 48)) / (TIMELINE.length - 1);
    const y = H / 2 + Math.sin((i / (TIMELINE.length - 1)) * Math.PI * 1.15 - 0.5) * 18;
    return [x, y] as const;
  });
  const d = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, "");
  const doneFrac = Math.min(current, TIMELINE.length - 1) / (TIMELINE.length - 1);

  return (
    <div
      className="relative"
      role="img"
      aria-label={`Session progress: ${status === "completed" ? "all steps done" : `step ${current + 1} of ${TIMELINE.length}, ${TIMELINE[current]?.label}`}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" aria-hidden>
        {/* road ahead: pencil dashes */}
        <path
          d={d}
          fill="none"
          stroke="var(--rule-strong)"
          strokeWidth="1.5"
          strokeDasharray="2 6"
          strokeLinecap="round"
        />
        {/* travelled: drawn ink */}
        <path
          d={d}
          fill="none"
          stroke="var(--mastery-mark)"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${doneFrac} 1`}
          className="path-draw"
          style={{ ["--f" as string]: doneFrac }}
        />
      </svg>
      <ol className="absolute inset-0">
        {TIMELINE.map((s, i) => {
          const [x, y] = pts[i];
          const done = i < current;
          const isCurrent = i === current;
          return (
            <li
              key={s.key}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span
                className={`relative flex items-center justify-center rounded-full transition-all duration-500 ${
                  isCurrent ? "size-6" : "size-4"
                } ${done ? "bg-mastery text-white" : isCurrent ? "bg-sheet" : "border border-rule-strong bg-paper"}`}
                style={
                  isCurrent
                    ? {
                        boxShadow: `0 0 0 2px ${accent}, 0 0 0 8px color-mix(in srgb, ${accent} 16%, transparent), 0 6px 22px ${accent}55`,
                      }
                    : undefined
                }
              >
                {done && <Check size={10} strokeWidth={3.5} aria-hidden />}
                {isCurrent && <span className="size-2.5 rounded-full" style={{ background: accent }} />}
              </span>
              <span
                className={`absolute top-full left-1/2 mt-2 -translate-x-1/2 text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase ${
                  isCurrent ? "text-ink" : done ? "text-mastery" : "text-muted"
                } ${!isCurrent ? "max-sm:hidden" : ""}`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Every session as a stop on one path, coloured by subject; fill shows how far it got. */
export function PathHistory({
  stops,
}: {
  stops: { id: string; title: string; subject: string; accent: string; progress: number; done: boolean }[];
}) {
  if (!stops.length) return null;
  return (
    <ol className="relative flex items-center gap-0" aria-label="Your sessions on the study path">
      {stops.map((s, i) => (
        <li key={s.id} className="flex min-w-0 flex-1 items-center last:flex-none" title={`${s.title} · ${s.subject}`}>
          <span className="relative flex size-9 shrink-0 items-center justify-center">
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r="15" fill="var(--sheet)" stroke="var(--rule)" strokeWidth="2.5" />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke={s.done ? "var(--mastery-mark)" : s.accent}
                strokeWidth="2.5"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${s.progress} 1`}
                className="path-draw"
                style={{ ["--f" as string]: s.progress, animationDelay: `${i * 90}ms` }}
              />
            </svg>
            {s.done ? (
              <Check size={13} strokeWidth={3} className="relative text-mastery" aria-hidden />
            ) : (
              <span className="relative size-2 rounded-full" style={{ background: s.accent }} />
            )}
            <span className="sr-only">
              {s.title}: {s.done ? "completed" : `${Math.round(s.progress * 100)}% through`}
            </span>
          </span>
          {i < stops.length - 1 && (
            <span className="mx-1 h-px flex-1 border-t border-dashed border-rule-strong" aria-hidden />
          )}
        </li>
      ))}
    </ol>
  );
}
