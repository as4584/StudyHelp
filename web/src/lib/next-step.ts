import type { Task } from "./api";

/**
 * Presentation-only mapping from a task's server state to the student's next move.
 * No business rules: the API still decides what is allowed when the action is taken.
 */
export type NextStep = { headline: string; cta: string; tone: "attention" | "tutor" | "muted"; rank: number };

export function studentNextStep(t: Task, bidCount = 0): NextStep {
  switch (t.status) {
    case "delivered":
      return {
        headline: "Your tutor delivered — review it and release payment",
        cta: "Review delivery",
        tone: "attention",
        rank: 0,
      };
    case "hired":
      return { headline: "Complete payment so your tutor can start", cta: "Pay securely", tone: "attention", rank: 1 };
    case "open":
      return bidCount > 0
        ? {
            headline: `${bidCount} ${bidCount === 1 ? "tutor has" : "tutors have"} offered to help`,
            cta: "Compare offers",
            tone: "attention",
            rank: 2,
          }
        : { headline: "Waiting for tutors to send offers", cta: "View request", tone: "muted", rank: 5 };
    case "paid":
      return { headline: "In session — keep the conversation going", cta: "Open session", tone: "tutor", rank: 3 };
    case "disputed":
      return { headline: "Under review by our team", cta: "View details", tone: "muted", rank: 4 };
    default:
      return { headline: "Session complete", cta: "View", tone: "muted", rank: 9 };
  }
}

export const isActive = (t: Task) => !["completed", "refunded", "cancelled"].includes(t.status);
