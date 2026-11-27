import type { Metadata } from "next";

import { LegalArticle } from "@/components/legal-article";
import { POLICIES, policyNote } from "@/content/policies";

export const metadata: Metadata = { title: "Terms of Use — StudyHelp" };

/** The site's Terms of Use are the Student and Parent Policy and Terms of Use (one source). */
export default function TermsPage() {
  const terms = POLICIES.student;
  return <LegalArticle title={terms.title} note={policyNote(terms)} body={terms.body} />;
}
