import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { POLICIES, type PolicySlug } from "@/content/policies";

export function generateStaticParams() {
  return Object.keys(POLICIES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const policy = POLICIES[(await params).slug as PolicySlug];
  return { title: policy ? `${policy.title} — StudyHelp` : "StudyHelp" };
}

/** The full text of a sign-up policy: public, printable, linked from sign-up and every footer. */
export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const policy = POLICIES[(await params).slug as PolicySlug];
  if (!policy) notFound();
  const blocks = policy.body.trim().split(/\n\s*\n/);
  return (
    <article className="mx-auto max-w-[68ch] pt-8 sm:pt-14">
      <div className="micro text-muted">{policy.updated}</div>
      <h1 className="mt-3 font-serif text-[2.1rem] leading-[1.1] font-medium tracking-[-0.025em] text-ink sm:text-[2.6rem]">
        {policy.title}
      </h1>
      <div className="mt-8 space-y-4 font-serif text-[18px] leading-[1.65] text-ink-2">
        {blocks.map((b, i) =>
          b.startsWith("## ") ? (
            <h2 key={i} className="pt-4 font-sans text-[17px] font-semibold tracking-normal text-ink">
              {b.slice(3).trim()}
            </h2>
          ) : (
            <p key={i} className="whitespace-pre-line">
              {b.trim()}
            </p>
          ),
        )}
      </div>
    </article>
  );
}
