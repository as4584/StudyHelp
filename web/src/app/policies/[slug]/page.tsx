import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalArticle } from "@/components/legal-article";
import { POLICIES, policyNote, type PolicySlug } from "@/content/policies";

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
  return <LegalArticle title={policy.title} note={policyNote(policy)} body={policy.body} />;
}
