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
  const curve = (upto: number) =>
    pts.slice(0, upto + 1).reduce((acc, [x, y], i, arr) => {
      if (i === 0) return `M${x},${y}`;
      const [px, py] = arr[i - 1];
      const cx = (px + x) / 2;
      return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`;
    }, "");
  const d = curve(pts.length - 1);
  // The travelled line is its own path ending exactly on the current stop.
  const travelled = current > 0 ? curve(Math.min(current, pts.length - 1)) : null;

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
        {travelled && (
          <path
            d={travelled}
            fill="none"
            stroke="var(--mastery-mark)"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            className="path-draw"
            style={{ ["--f" as string]: 1 }}
          />
        )}
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

/**
 * Every session as a stop on one continuous path (oldest → newest), coloured by subject; each
 * ring fills with how far that session got. The path ends in a dashed "next stop".
 */
export function PathHistory({
  stops,
  nextHref,
}: {
  stops: { id: string; title: string; subject: string; accent: string; progress: number; done: boolean }[];
  nextHref: string;
}) {
  if (!stops.length) return null;
  // Teal runs along the unbroken streak of finished sessions from the start of the path.
  const firstOpen = stops.findIndex((s) => !s.done);
  const lead = firstOpen === -1 ? stops.length : firstOpen;
  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute top-[18px] right-6 left-4 h-px border-t-[1.5px] border-dashed border-rule-strong"
      />
      {lead > 1 && (
        <span
          aria-hidden
          className="path-grow absolute top-[17px] left-4 h-[2.5px] rounded-full bg-mastery-mark"
          style={{ width: `calc(${(lead - 1) / (stops.length + 1)} * (100% + 0.75rem))` }}
        />
      )}
      <ol
        className="relative grid gap-3"
        style={{ gridTemplateColumns: `repeat(${stops.length + 1}, minmax(0, 1fr))` }}
        aria-label="Your sessions on the study path"
      >
        {stops.map((s, i) => (
          <li key={s.id} className="min-w-0">
            <a href={`/tasks/${s.id}`} className="group block">
              <span className="relative flex size-9 items-center justify-center">
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
              </span>
              <span className="micro mt-3 block truncate" style={{ color: s.accent }}>
                {s.subject}
              </span>
              <span className="mt-0.5 line-clamp-2 block font-serif text-[14px] leading-snug text-ink-2 transition-colors group-hover:text-tutor">
                {s.title}
              </span>
              <span className="sr-only">{s.done ? "completed" : `${Math.round(s.progress * 100)}% through`}</span>
            </a>
          </li>
        ))}
        <li className="min-w-0">
          <a href={nextHref} className="group block">
            <span className="flex size-9 items-center justify-center rounded-full border-[1.5px] border-dashed border-rule-strong bg-paper text-[18px] text-muted transition-colors group-hover:border-tutor group-hover:text-tutor">
              +
            </span>
            <span className="micro mt-3 block text-muted">Next stop</span>
            <span className="mt-0.5 block font-serif text-[14px] leading-snug text-ink-2 group-hover:text-tutor">
              Start a new session
            </span>
          </a>
        </li>
      </ol>
    </div>
  );
}
