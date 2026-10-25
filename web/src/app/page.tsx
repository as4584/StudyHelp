import { Check, Languages, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

/*
 * Landing. The idea: the page is set like a study desk — a reading-voice headline beside the
 * actual working surface of the product (a translated tutoring exchange and a held-payment
 * receipt), built from the same components the app uses. No gradient, no feature-card grid.
 */

const SESSION = [
  ["Ask", "Start with the AI tutor, any hour. It guides you instead of handing over answers."],
  ["Escalate", "Stuck? One tap turns the conversation into a request for a live expert."],
  ["Choose", "Compare bids from vetted tutors by price, approach and rating."],
  ["Learn", "Work together in your own language. Every message is translated both ways."],
  ["Release", "Your payment is held until you confirm the session was delivered."],
];

export default function Home() {
  return (
    <div className="pt-6 sm:pt-14">
      <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <h1 className="font-serif text-[2.6rem] leading-[1.04] font-medium tracking-[-0.025em] text-ink sm:text-[3.6rem]">
            A study desk with a <em className="font-normal text-tutor">tutor</em> built in.
          </h1>
          <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-ink-2">
            Work through hard ideas with an AI study coach, and bring in a vetted human expert the moment you need one —
            in your language, with payment held until the session is done.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex min-h-12 items-center rounded-[6px] bg-tutor px-5 text-[16px] font-semibold text-white transition-colors hover:bg-tutor-hover"
            >
              Open your study desk
            </Link>
            <Link
              href="/login"
              className="px-2 text-[16px] font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline"
            >
              I already have an account
            </Link>
          </div>
          <ul className="mt-10 grid max-w-[34rem] gap-3 text-[14px] text-ink-2 sm:grid-cols-3">
            <li className="flex items-center gap-2">
              <Sparkles size={16} strokeWidth={1.75} className="text-tutor" aria-hidden /> AI coach, 24/7
            </li>
            <li className="flex items-center gap-2">
              <Languages size={16} strokeWidth={1.75} className="text-tutor" aria-hidden /> Translated chat
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck size={16} strokeWidth={1.75} className="text-mastery" aria-hidden /> Payment held
            </li>
          </ul>
        </div>
        <DeskPreview />
      </section>

      <section className="mt-24 border-t border-rule pt-10 sm:mt-32">
        <h2 className="max-w-[28rem] font-serif text-[1.75rem] leading-tight font-medium tracking-[-0.015em]">
          How a session works
        </h2>
        <ol className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-5">
          {SESSION.map(([title, body], i) => (
            <li key={title} className="relative">
              <div className="flex items-center">
                <span className="flex size-5 items-center justify-center rounded-full border border-tutor bg-sheet">
                  <span className="size-2 rounded-full bg-tutor" />
                </span>
                {i < SESSION.length - 1 && <span className="ml-0 hidden h-px flex-1 bg-rule-strong lg:block" />}
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-24 grid gap-8 border-t border-rule pt-10 sm:mt-28 lg:grid-cols-[1fr_1.4fr]">
        <h2 className="font-serif text-[1.75rem] leading-tight font-medium tracking-[-0.015em]">
          Learning, not shortcuts.
        </h2>
        <p className="max-w-[60ch] font-serif text-[19px] leading-[1.6] text-ink-2">
          Tutors explain concepts, review your reasoning and build practice material with you. You never share a school
          portal login — upload a screenshot of the rubric instead, and keep the learning yours.
        </p>
      </section>

      <footer className="mt-24 flex flex-wrap justify-between gap-4 border-t border-rule pt-6 text-[13px] text-muted">
        <span>StudyHelp · Global Study Help Tutor</span>
        <span>Demo build — payments run in test mode</span>
      </footer>
    </div>
  );
}

/** The product's own working surface, rendered with app styling (illustrative content). */
function DeskPreview() {
  return (
    <div className="relative" aria-label="Preview of a tutoring session">
      <div className="rounded-[10px] border border-rule bg-sheet shadow-[0_1px_2px_rgb(20_22_27/0.04),0_24px_48px_-24px_rgb(20_22_27/0.18)]">
        <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
          <div>
            <div className="font-serif text-[17px] font-medium text-ink">The chain rule, slowly</div>
            <div className="text-[12px] text-muted">Calculus · with Prof. Diego</div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-tutor">
            <span className="size-1.5 rounded-full bg-tutor" /> In session
          </span>
        </div>
        <div className="space-y-5 px-5 py-5">
          <div className="ml-auto max-w-[80%] rounded-[10px] bg-sunken px-3.5 py-2.5 text-[14px] text-ink">
            Why do we multiply by the derivative of the inside?
          </div>
          <div className="max-w-[92%]">
            <div className="mb-1.5 flex items-center gap-2 text-[12px]">
              <span className="flex size-6 items-center justify-center rounded-full bg-tutor text-[11px] font-semibold text-white">
                D
              </span>
              <span className="font-semibold text-ink">Prof. Diego</span>
              <span className="text-muted">Tutor</span>
            </div>
            <p className="font-serif text-[16px] leading-[1.6] text-ink">
              Think of the inside function as a gear. When it turns, the outside turns with it — so the total rate is
              the outer rate <em>times</em> how fast the inner gear moves.
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
              <Languages size={13} strokeWidth={1.75} aria-hidden /> Translated from Spanish
            </div>
          </div>
        </div>
      </div>
      <div className="relative -mt-6 ml-auto w-[78%] rounded-[10px] border border-rule bg-sheet px-5 py-4 shadow-[0_1px_2px_rgb(20_22_27/0.04),0_16px_32px_-20px_rgb(20_22_27/0.2)] sm:w-[62%]">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-semibold text-ink">Payment</span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-tutor">
            <span className="size-1.5 rounded-full bg-tutor" /> Held
          </span>
        </div>
        <dl className="tnum mt-2 space-y-1 text-[13px]">
          <div className="flex justify-between text-ink-2">
            <dt>Session</dt>
            <dd>$40.00</dd>
          </div>
          <div className="flex justify-between text-ink-2">
            <dt>Tutor receives</dt>
            <dd className="font-semibold text-ink">$30.00</dd>
          </div>
        </dl>
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-mastery">
          <Check size={13} strokeWidth={2.25} aria-hidden /> Released only when you confirm delivery
        </div>
      </div>
    </div>
  );
}
