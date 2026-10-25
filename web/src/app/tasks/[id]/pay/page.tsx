"use client";

import { ArrowLeft, ArrowRight, BadgeCheck, LockKeyhole, ShieldCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { PathLine } from "@/components/path-line";
import { Avatar, Button, ErrorText, Skeleton, Stars, useAction } from "@/components/ui";
import { api, money, type Bid, type Schemas, type Task } from "@/lib/api";
import { accentFor } from "@/lib/subjects";

type Quote = Schemas["QuoteOut"];

/*
 * Pre-checkout review — StudyHelp's held-payment model as a trust feature. Figures come from the
 * server quote (never computed here). The button then hands off to Stripe Checkout (or the
 * labelled demo checkout when no Stripe keys are configured).
 */
export default function ReviewPayment() {
  const { id } = useParams<{ id: string }>();
  const { me } = useRequireRole("student");
  const [task, setTask] = useState<Task | null>(null);
  const [bid, setBid] = useState<Bid | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const a = useAction();

  useEffect(() => {
    if (!me) return;
    void a.run(async () => {
      const [t, bids, q] = await Promise.all([
        api<Task>(`/tasks/${id}`),
        api<Bid[]>(`/tasks/${id}/bids`),
        api<Quote>(`/tasks/${id}/quote`),
      ]);
      setTask(t);
      setBid(bids.find((b) => b.status === "accepted") ?? null);
      setQuote(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, id]);

  if (a.error && !quote) return <ErrorText error={a.error} />;
  if (!task || !quote) return <Skeleton lines={5} />;
  const accent = accentFor(task.subject);

  return (
    <div>
      <Link
        href={`/tasks/${task.id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={2} aria-hidden /> Back to session
      </Link>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
        <div className="min-w-0">
          <div className="micro flex items-center gap-1.5 text-mastery">
            <LockKeyhole size={13} strokeWidth={2.25} aria-hidden /> Secure checkout
          </div>
          <h1 className="mt-3 max-w-[16ch] font-serif text-[2.4rem] leading-[1.04] font-medium tracking-[-0.03em] sm:text-[3.25rem]">
            Your money is protected while you learn.
          </h1>
          <p className="mt-4 max-w-[48ch] text-[16px] text-ink-2">
            StudyHelp holds your payment and only releases it to your tutor once you confirm the session was delivered.
          </p>

          <div className="mt-10 max-w-[32rem]">
            <PathLine
              stages={[
                { label: "Pay", state: "current", note: "today" },
                { label: "Held", state: "upcoming", note: "by StudyHelp" },
                { label: "Delivered", state: "upcoming", note: "tutor finishes" },
                { label: "Released", state: "upcoming", note: "when you confirm" },
              ]}
            />
          </div>

          <ul className="mt-12 space-y-5 border-t border-rule pt-8">
            <Assurance icon={ShieldCheck} title="Held, not handed over">
              Your tutor sees the payment is secured, but receives it only after you release it.
            </Assurance>
            <Assurance icon={Undo2} title="Something wrong? Open a dispute">
              While funds are held, our team can review the session and refund you.
            </Assurance>
            <Assurance icon={BadgeCheck} title="Vetted tutors only">
              Every tutor is approved by StudyHelp before they can send an offer.
            </Assurance>
          </ul>
        </div>

        <aside className="min-w-0">
          <div className="rounded-[16px] border border-rule bg-sheet shadow-[0_1px_2px_rgb(20_22_27/0.05),0_30px_60px_-30px_rgb(30_27_75/0.3)] lg:sticky lg:top-12">
            <div className="border-b border-rule p-6 sm:p-7">
              <div className="micro flex items-center gap-1.5" style={{ color: accent.ink }}>
                <span className="size-1.5 rounded-full" style={{ background: accent.mark }} />
                {task.subject}
              </div>
              <p className="mt-2 font-serif text-[1.375rem] leading-snug font-medium text-ink">{task.title}</p>
              {bid && (
                <div className="mt-4 flex items-center gap-2.5 text-[14px]">
                  <Avatar name={bid.tutor_name} tone="tutor" />
                  <span>
                    <span className="block font-semibold text-ink">{bid.tutor_name}</span>
                    <Stars value={bid.tutor_rating_avg} count={bid.tutor_rating_count} />
                  </span>
                </div>
              )}
            </div>
            <dl className="tnum space-y-2.5 p-6 text-[15px] sm:p-7">
              <div className="flex justify-between">
                <dt className="text-ink-2">Session price</dt>
                <dd className="text-ink">{money(quote.amount_cents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">StudyHelp fee ({quote.platform_fee_bps / 100}%)</dt>
                <dd className="text-ink-2">{money(quote.platform_fee_cents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">Your tutor receives</dt>
                <dd className="text-ink-2">{money(quote.tutor_net_cents)}</dd>
              </div>
              <div className="flex items-end justify-between border-t border-rule pt-4">
                <dt className="font-semibold text-ink">Held today</dt>
                <dd className="font-serif text-[2.25rem] leading-none font-medium tracking-[-0.02em] text-ink">
                  {money(quote.amount_cents)}
                </dd>
              </div>
            </dl>
            <div className="px-6 pb-6 sm:px-7 sm:pb-7">
              <ErrorText error={a.error} />
              <Button
                className="h-12 w-full text-[16px]"
                disabled={a.pending}
                onClick={() =>
                  a.run(async () => {
                    const { url } = await api<{ url: string }>(`/tasks/${task.id}/checkout`, { body: {} });
                    window.location.href = url;
                  })
                }
              >
                Continue to secure payment <ArrowRight size={17} strokeWidth={2} aria-hidden />
              </Button>
              <p className="mt-3 text-center text-[12px] text-muted">Payments are processed by Stripe.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Assurance({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <Icon size={20} strokeWidth={1.6} className="mt-0.5 shrink-0 text-mastery" aria-hidden />
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="text-[15px] text-ink-2">{children}</span>
      </span>
    </li>
  );
}
