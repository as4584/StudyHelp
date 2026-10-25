"use client";

import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/toast";

import { useRequireRole } from "@/components/auth";
import { Chat } from "@/components/chat";
import { SessionPath } from "@/components/study-path";
import { TaskFiles } from "@/components/task-files";
import {
  Avatar,
  Badge,
  Button,
  ErrorText,
  Field,
  Section,
  Sheet,
  Skeleton,
  Stars,
  inputCls,
  useAction,
} from "@/components/ui";
import { accentFor } from "@/lib/subjects";
import { api, ApiError, money, type Bid, type PaymentState, type Task } from "@/lib/api";

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useRequireRole();
  const [task, setTask] = useState<Task | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [pay, setPay] = useState<PaymentState | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      // Fetch everything, then render once — no content popping in after first paint.
      const t = await api<Task>(`/tasks/${id}`);
      const [b, p, conv] = await Promise.all([
        api<Bid[]>(`/tasks/${id}/bids`).catch(() => []),
        t.hired_tutor_id ? api<PaymentState>(`/tasks/${id}/payment`).catch(() => null) : Promise.resolve(null),
        t.hired_tutor_id ? api<{ id: string }>(`/tasks/${id}/conversation`).catch(() => null) : Promise.resolve(null),
      ]);
      setBids(b);
      setPay(p);
      setConversationId(conv?.id ?? null);
      setTask(t);
    } catch (e) {
      setLoadError(e instanceof ApiError && e.status === 404 ? "This session isn't available to you." : String(e));
    }
  }, [id]);

  useEffect(() => {
    if (me) void reload();
  }, [me, reload]);

  if (loadError) return <ErrorText error={loadError} />;
  if (!me || !task) return <Skeleton lines={5} />;

  const role = me.profile.role;
  const isStudent = role === "student" && task.student_id === me.profile.id;
  const isTutor = role === "tutor" && task.hired_tutor_id === me.profile.id;
  const hiredBid = bids.find((b) => b.status === "accepted");
  const back = role === "tutor" ? "/tutor" : role === "admin" ? "/admin" : "/student";
  const hasChat = !!conversationId && (isStudent || isTutor);

  return (
    <div>
      <Link
        href={back}
        className="mb-6 inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />{" "}
        {role === "tutor" ? "Tutor desk" : role === "admin" ? "Operations" : "Study desk"}
      </Link>

      <header className="mb-8">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          <span className="flex items-center gap-1.5 font-semibold" style={{ color: accentFor(task.subject).ink }}>
            <span className="size-1.5 rounded-full" style={{ background: accentFor(task.subject).mark }} />
            {task.subject}
          </span>
          <span className="tnum">Budget {money(task.budget_cents)}</span>
          <Badge status={task.status} />
        </div>
        <h1 className="max-w-[44rem] font-serif text-[2.1rem] leading-[1.05] font-medium tracking-[-0.025em] sm:text-[2.875rem]">
          {task.title}
        </h1>
        {hiredBid && !isTutor && (
          <div className="mt-3 flex items-center gap-2 text-[14px] text-ink-2">
            <Avatar name={hiredBid.tutor_name} tone="tutor" />
            <span>
              with <span className="font-semibold text-ink">{hiredBid.tutor_name}</span>
            </span>
            <Stars value={hiredBid.tutor_rating_avg} count={hiredBid.tutor_rating_count} />
          </div>
        )}
        <div className="mt-8 max-w-[40rem] pb-6">
          <SessionPath status={task.status} accent={accentFor(task.subject).mark} />
        </div>
      </header>

      {/* DOM order is the mobile order: next step, conversation, then details. */}
      <div
        className={
          hasChat ? "grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-10" : "grid max-w-[44rem] gap-10"
        }
      >
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {isStudent && <StudentActions task={task} bids={bids} pay={pay} reload={reload} />}
          {role === "tutor" && <TutorActions task={task} bids={bids} isHired={isTutor} reload={reload} />}
        </div>

        {hasChat && (
          <div className="min-w-0 lg:sticky lg:top-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <Chat conversationId={conversationId!} meId={me.profile.id} myLang={me.profile.preferred_language} />
          </div>
        )}

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
          <Section title="Request">
            <p className="max-w-[64ch] font-serif text-[17px] leading-[1.65] whitespace-pre-wrap text-ink">
              {task.description}
            </p>
            {task.delivery_note && (
              <div className="mt-5 border-t border-rule pt-4">
                <div className="micro mb-1.5 text-mastery">Tutor&apos;s delivery</div>
                <p className="font-serif text-[16px] leading-relaxed text-ink">{task.delivery_note}</p>
              </div>
            )}
          </Section>

          <TaskFiles
            taskId={task.id}
            canUploadRubric={isStudent}
            canUploadDeliverable={isTutor && task.status === "paid"}
          />

          {pay?.payment && <Receipt pay={pay} />}
        </div>
      </div>
    </div>
  );
}

function Receipt({ pay }: { pay: PaymentState }) {
  const p = pay.payment!;
  return (
    <Section title="Payment">
      <Sheet className="px-5 py-4">
        <dl className="tnum divide-y divide-rule text-[15px]" data-testid="payment-card">
          <Row label="Paid by student" value={money(p.amount_cents)} />
          <Row label={`Platform fee (${p.platform_fee_bps / 100}%)`} value={`− ${money(p.platform_fee_cents)}`} />
          <Row label="Tutor receives" value={money(p.tutor_net_cents)} strong />
          {pay.tips_cents > 0 && <Row label="Tips (100% to tutor)" value={money(pay.tips_cents)} />}
          <div className="flex items-center justify-between gap-3 pt-3">
            <dt className="text-muted">Status</dt>
            <dd>
              <Badge status={pay.transfer?.status === "created" ? "released" : p.status} />
            </dd>
          </div>
        </dl>
        {p.status === "held" && (
          <p className="mt-3 flex items-start gap-2 border-t border-rule pt-3 text-[13px] text-ink-2">
            <ShieldCheck size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mastery" aria-hidden />
            Held by the platform. It reaches the tutor only after the student confirms delivery.
          </p>
        )}
      </Sheet>
    </Section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className={strong ? "font-semibold text-ink" : "text-ink-2"}>{label}</dt>
      <dd className={strong ? "font-semibold text-ink" : "text-ink-2"}>{value}</dd>
    </div>
  );
}

/** The one thing to do now, as the most prominent block on the left. */
function ActionSheet({
  title,
  tone = "attention",
  children,
}: {
  title: string;
  tone?: "attention" | "tutor" | "mastery" | "muted";
  children: React.ReactNode;
}) {
  const color = { attention: "text-attention", tutor: "text-tutor", mastery: "text-mastery", muted: "text-muted" }[
    tone
  ];
  return (
    <Sheet className="enter p-6 shadow-[0_1px_2px_rgb(20_22_27/0.05),0_24px_48px_-28px_rgb(30_27_75/0.28)] sm:p-7">
      <div className={`micro mb-2 ${color}`}>Next step</div>
      <h2 className="mb-5 font-serif text-[1.75rem] leading-[1.1] font-medium tracking-[-0.02em] text-ink">{title}</h2>
      <div className="space-y-4">{children}</div>
    </Sheet>
  );
}

function StudentActions({
  task,
  bids,
  pay,
  reload,
}: {
  task: Task;
  bids: Bid[];
  pay: PaymentState | null;
  reload: () => Promise<void>;
}) {
  const a = useAction();
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [reviewed, setReviewed] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const redirect = async (path: string, body: unknown = {}) => {
    const { url } = await api<{ url: string }>(path, { body });
    window.location.href = url;
  };
  const toast = useToast();
  const act = (fn: () => Promise<unknown>, ok?: string) =>
    a.run(async () => {
      await fn();
      await reload();
      if (ok) toast(ok);
    });
  const accepted = bids.find((b) => b.status === "accepted");

  const dispute = (task.status === "paid" || task.status === "delivered") && (
    <details className="group border-t border-rule pt-4 text-[14px]">
      <summary className="cursor-pointer list-none font-semibold text-muted hover:text-ink">
        Problem with this session?
      </summary>
      <div className="mt-3 space-y-3">
        <textarea
          className={inputCls}
          placeholder="Describe what went wrong"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button
          variant="danger"
          disabled={a.pending || reason.length < 3}
          onClick={() =>
            act(
              () => api(`/tasks/${task.id}/disputes`, { body: { reason } }),
              "Dispute opened — our team will review it",
            )
          }
        >
          Open dispute
        </Button>
      </div>
    </details>
  );

  let body: React.ReactNode = null;
  if (task.status === "open") {
    body =
      bids.length === 0 ? (
        <ActionSheet title="Waiting for tutors to send offers" tone="muted">
          <p className="text-[15px] text-ink-2">
            Vetted tutors in {task.subject} can see your request. Offers appear here.
          </p>
        </ActionSheet>
      ) : (
        <ActionSheet title={`Choose a tutor — ${bids.length} ${bids.length === 1 ? "offer" : "offers"}`}>
          <ul className="divide-y divide-rule" aria-label="Bids">
            {bids.map((b) => (
              <li key={b.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={b.tutor_name} tone="tutor" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">{b.tutor_name}</div>
                      <Stars value={b.tutor_rating_avg} count={b.tutor_rating_count} />
                    </div>
                  </div>
                  <div className="tnum font-serif text-[1.25rem] font-medium text-ink">{money(b.amount_cents)}</div>
                </div>
                {b.message && <p className="mt-2 font-serif text-[16px] leading-relaxed text-ink-2">“{b.message}”</p>}
                <Button
                  className="mt-3 w-full sm:w-auto"
                  disabled={a.pending}
                  onClick={() =>
                    act(() => api(`/tasks/${task.id}/hire`, { body: { bid_id: b.id } }), `You hired ${b.tutor_name}`)
                  }
                >
                  Hire {b.tutor_name}
                </Button>
              </li>
            ))}
          </ul>
        </ActionSheet>
      );
  } else if (task.status === "hired") {
    body = (
      <ActionSheet title="Pay to start the session">
        <p className="text-[15px] text-ink-2">
          Your payment is held by the platform and released to {accepted?.tutor_name ?? "your tutor"} only when you
          confirm the session was delivered.
        </p>
        <Button className="w-full" disabled={a.pending} onClick={() => router.push(`/tasks/${task.id}/pay`)}>
          Pay {money(accepted?.amount_cents ?? task.budget_cents)} securely
        </Button>
        {pay?.payment?.status === "pending" && (
          <p className="text-[13px] text-muted">
            Checkout started — we confirm the payment directly with the payment provider.
          </p>
        )}
      </ActionSheet>
    );
  } else if (task.status === "paid") {
    body = (
      <ActionSheet title="In session" tone="tutor">
        <p className="text-[15px] text-ink-2">
          Payment is held safely. Work through it with your tutor in the conversation.
        </p>
        {dispute}
      </ActionSheet>
    );
  } else if (task.status === "delivered") {
    body = (
      <ActionSheet title="Your tutor delivered — happy with it?">
        <p className="text-[15px] text-ink-2">
          Releasing sends the tutor their share. You can open a dispute instead if something&apos;s wrong.
        </p>
        <Button
          className="w-full"
          disabled={a.pending}
          onClick={() => act(() => api(`/tasks/${task.id}/release`, { body: {} }), "Payment released to your tutor")}
        >
          Release payment to tutor
        </Button>
        {dispute}
      </ActionSheet>
    );
  } else if (task.status === "completed") {
    body = (
      <ActionSheet title="Session complete" tone="mastery">
        <div>
          <p className="mb-2 text-[14px] font-semibold text-ink">Say thanks with a tip — 100% goes to your tutor</p>
          <div className="grid grid-cols-3 gap-2 [&>button]:px-2 [&>button]:text-[14px]">
            {[200, 500, 1000].map((c) => (
              <Button
                key={c}
                variant="secondary"
                disabled={a.pending}
                onClick={() => a.run(() => redirect(`/tasks/${task.id}/tips`, { amount_cents: c }))}
              >
                Tip {money(c)}
              </Button>
            ))}
          </div>
        </div>
        {reviewed ? (
          <p className="enter flex items-center gap-2 border-t border-rule pt-4 text-[15px] text-ink-2">
            <Stars value={reviewed} /> You rated this session — thank you.
          </p>
        ) : (
          <form
            className="space-y-3 border-t border-rule pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void a.run(async () => {
                await api(`/tasks/${task.id}/review`, { body: { rating, comment } });
                setReviewed(rating);
                toast("Thanks — your review is saved");
              });
            }}
          >
            <Field label="Rate your tutor">
              <select className={inputCls} value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} — {["", "Poor", "Fair", "Good", "Great", "Excellent"][n]}
                  </option>
                ))}
              </select>
            </Field>
            <textarea
              className={inputCls}
              placeholder="What helped most? (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <Button type="submit" variant="secondary" className="w-full" disabled={a.pending} loading={a.pending}>
              Submit review
            </Button>
          </form>
        )}
      </ActionSheet>
    );
  } else if (task.status === "disputed") {
    body = (
      <ActionSheet title="Under review" tone="muted">
        <p className="flex items-start gap-2 text-[15px] text-ink-2">
          <CircleAlert size={16} strokeWidth={1.75} className="mt-1 shrink-0 text-danger" aria-hidden />
          Our team is reviewing this session. The payment stays held until it&apos;s resolved.
        </p>
      </ActionSheet>
    );
  }
  return (
    <div className="space-y-3">
      {body}
      <ErrorText error={a.error} />
    </div>
  );
}

function TutorActions({
  task,
  bids,
  isHired,
  reload,
}: {
  task: Task;
  bids: Bid[];
  isHired: boolean;
  reload: () => Promise<void>;
}) {
  const a = useAction();
  const [amount, setAmount] = useState(String(task.budget_cents / 100));
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const myBid = bids[0];
  const toast = useToast();
  const act = (fn: () => Promise<unknown>, ok?: string) =>
    a.run(async () => {
      await fn();
      await reload();
      if (ok) toast(ok);
    });

  let body: React.ReactNode = null;
  if (!isHired && task.status === "open" && !myBid) {
    body = (
      <ActionSheet title="Offer to help">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              () =>
                api(`/tasks/${task.id}/bids`, { body: { amount_cents: Math.round(Number(amount) * 100), message } }),
              "Offer sent to the student",
            );
          }}
        >
          <Field label="Your price (USD)" hint={`The student's budget is ${money(task.budget_cents)}.`}>
            <input
              className={`${inputCls} tnum`}
              type="number"
              min={5}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <textarea
            className={`${inputCls} min-h-24`}
            placeholder="How you'll help — your approach and availability"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={a.pending} loading={a.pending}>
            Submit bid
          </Button>
        </form>
      </ActionSheet>
    );
  } else if (myBid && !isHired) {
    body = (
      <ActionSheet title="Your offer is in" tone="muted">
        <p className="tnum text-[15px] text-ink-2">
          You bid {money(myBid.amount_cents)} — <Badge status={myBid.status} />
        </p>
      </ActionSheet>
    );
  } else if (isHired && task.status === "hired") {
    body = (
      <ActionSheet title="You're hired" tone="tutor">
        <p className="text-[15px] text-ink-2">
          Waiting for the student&apos;s payment before you start. Say hello in the meantime.
        </p>
      </ActionSheet>
    );
  } else if (isHired && task.status === "paid") {
    body = (
      <ActionSheet title="Deliver the session">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => api(`/tasks/${task.id}/deliver`, { body: { note } }), "Marked as delivered");
          }}
        >
          <Field label="Delivery note" hint="Summarise the walkthrough, practice problems or study guide you provided.">
            <textarea
              className={`${inputCls} min-h-24`}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={a.pending} loading={a.pending}>
            Mark as delivered
          </Button>
        </form>
      </ActionSheet>
    );
  } else if (isHired && task.status === "delivered") {
    body = (
      <ActionSheet title="Delivered" tone="mastery">
        <p className="text-[15px] text-ink-2">Delivered. The student will release your payment.</p>
      </ActionSheet>
    );
  } else if (isHired && task.status === "completed") {
    body = (
      <ActionSheet title="Paid out" tone="mastery">
        <p className="text-[15px] text-ink-2">The payment was released to your payout account.</p>
      </ActionSheet>
    );
  }
  return (
    <div className="space-y-3">
      {body}
      <ErrorText error={a.error} />
    </div>
  );
}
