/**
 * Sign-up policy texts, shown at /policies/<slug> and accepted during onboarding.
 * `version` must match VERSIONS in api/app/services/policies.py: bump both together whenever
 * the text changes, so everyone is asked to accept the new version.
 *
 * Body format: blank lines separate blocks; a block starting with "## " is a heading.
 */
export type PolicySlug = "tutor" | "student";

export type Policy = {
  slug: PolicySlug;
  title: string;
  shortTitle: string;
  version: string;
  updated: string;
  body: string;
};

export const POLICIES: Record<PolicySlug, Policy> = {
  tutor: {
    slug: "tutor",
    title: "Tutor Policy and Independent Contractor Agreement",
    shortTitle: "Tutor Policy and Contractor Agreement",
    version: "draft-2026-11-08",
    updated: "Draft of November 8, 2026",
    body: `TUTOR_POLICY_TEXT`,
  },
  student: {
    slug: "student",
    title: "Student and Parent Policy and Terms of Use",
    shortTitle: "Student and Parent Policy",
    version: "draft-2026-11-08",
    updated: "Draft of November 8, 2026",
    body: `STUDENT_POLICY_TEXT`,
  },
};

export function policyHref(slug: PolicySlug) {
  return `/policies/${slug}`;
}
