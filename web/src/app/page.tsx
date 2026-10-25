import Link from "next/link";

const STEPS = [
  ["Ask the AI", "Instant 24/7 study help that guides you step by step."],
  ["Escalate in one tap", "Stuck? Turn the conversation into a request for a live expert."],
  ["Hire a vetted tutor", "Compare bids and ratings from qualified global experts."],
  ["Chat in your language", "Messages are translated automatically both ways."],
  ["Pay safely", "Your payment is held until you confirm the session was delivered."],
  ["Rate and tip", "Great tutors rise to the top. 100% of tips go to them."],
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-10 text-white sm:px-10 sm:py-14">
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-100">Global Study Help Tutor</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-5xl">
          AI answers in seconds.<br />Real experts when you need them.
        </h1>
        <p className="mt-4 max-w-xl text-indigo-100">
          Affordable 1-on-1 tutoring and concept walkthroughs from vetted global experts — with
          built-in translation and payments held until your session is delivered.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-xl bg-white px-5 py-3 font-semibold text-indigo-700">Get started</Link>
          <Link href="/login" className="rounded-xl border border-white/40 px-5 py-3 font-semibold">Sign in</Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-border bg-surface p-4">
              <span className="text-sm font-bold text-brand">{i + 1}</span>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Learning, not shortcuts.</strong> Tutors explain concepts, review your reasoning and
        create practice material. Never share school portal logins — upload a screenshot of your
        rubric instead.
      </section>
    </div>
  );
}
