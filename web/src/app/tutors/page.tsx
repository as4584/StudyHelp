"use client";

import { ArrowRight, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { Avatar, EmptyState, LinkButton, LoadError, PageHeader, Skeleton, Stars, inputCls } from "@/components/ui";
import { api, LEVELS, money } from "@/lib/api";
import type { components } from "@/lib/api-types";

type Tutor = components["schemas"]["PublicTutorOut"];

/** Students browse approved tutors: photo, subjects, levels, rate and rating. */
export default function TutorDirectory() {
  useRequireRole("student");
  const [subject, setSubject] = useState("");
  const [query, setQuery] = useState("");
  const [tutors, setTutors] = useState<Tutor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setError(null);
    setTutors(null);
    try {
      setTutors(await api<Tutor[]>(q ? `/tutors?subject=${encodeURIComponent(q)}` : "/tutors"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load tutors");
    }
  }, []);

  useEffect(() => {
    void load(query);
  }, [load, query]);

  const ask = (s: string | null) => (s ? `/student/tasks/new?subject=${encodeURIComponent(s)}` : "/student/tasks/new");

  return (
    <div>
      <PageHeader
        title="Tutors"
        lede="Browse the tutors on StudyHelp. Post a request and the tutors who teach that subject send you offers."
      />
      <form
        role="search"
        className="mb-8 flex max-w-[32rem] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(subject.trim());
        }}
      >
        <label htmlFor="tutor-subject" className="sr-only">
          Subject
        </label>
        <input
          id="tutor-subject"
          className={inputCls}
          placeholder="Filter by subject, e.g. Math"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-ink px-4 text-[14px] font-semibold text-white hover:bg-ink-2"
        >
          <Search size={15} strokeWidth={2} aria-hidden /> Search
        </button>
        {query && (
          <button
            type="button"
            className="shrink-0 px-2 text-[14px] font-medium text-muted hover:text-ink"
            onClick={() => {
              setSubject("");
              setQuery("");
            }}
          >
            Clear
          </button>
        )}
      </form>

      {error ? (
        <LoadError error={error} onRetry={() => void load(query)} />
      ) : tutors === null ? (
        <Skeleton lines={4} />
      ) : tutors.length === 0 ? (
        <EmptyState action={<LinkButton href={ask(query || null)}>Post a request anyway</LinkButton>}>
          {query ? `No tutors list “${query}” yet.` : "No tutors are listed yet."} Post a request and we&apos;ll match
          you as tutors join.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Tutors">
          {tutors.map((t) => (
            <li key={t.user_id} className="flex flex-col rounded-[12px] border border-rule bg-sheet p-5">
              <div className="flex items-center gap-3.5">
                <Avatar name={t.display_name} tone="tutor" src={t.avatar_url} large />
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-semibold text-ink">{t.display_name}</h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                    <Stars value={t.rating_avg} count={t.rating_count} />
                    {t.years_experience != null && (
                      <span>
                        {t.years_experience} {t.years_experience === 1 ? "year" : "years"} teaching
                      </span>
                    )}
                  </div>
                </div>
                <div className="tnum ml-auto shrink-0 text-right">
                  <div className="text-[16px] font-semibold text-ink">{money(t.hourly_rate_cents)}</div>
                  <div className="text-[12px] text-muted">per hour</div>
                </div>
              </div>
              <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Subjects">
                {t.subjects.map((s) => (
                  <li
                    key={s}
                    className={
                      s === t.main_subject
                        ? "rounded-full bg-tutor px-2.5 py-0.5 text-[12px] font-semibold text-white"
                        : "rounded-full bg-sunken px-2.5 py-0.5 text-[12px] font-medium text-ink-2"
                    }
                  >
                    {s}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[13px] text-muted">{t.levels.map((l) => LEVELS[l] ?? l).join(" · ")}</p>
              {t.bio && <p className="mt-3 line-clamp-3 text-[14px] text-ink-2">{t.bio}</p>}
              <div className="mt-auto pt-4">
                <LinkButton href={ask(t.main_subject)} variant="secondary">
                  Request help <ArrowRight size={15} strokeWidth={2} aria-hidden />
                </LinkButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
