import type { Metadata } from "next";

import { LegalArticle } from "@/components/legal-article";
import { policyNote } from "@/content/policies";
import { PRIVACY } from "@/content/privacy";

export const metadata: Metadata = { title: "Privacy Policy — StudyHelp" };

export default function PrivacyPage() {
  return <LegalArticle title={PRIVACY.title} note={policyNote(PRIVACY)} body={PRIVACY.body} />;
}
