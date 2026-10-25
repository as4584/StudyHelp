"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { Chat } from "@/components/chat";
import { TaskFiles } from "@/components/task-files";
import { Badge, Button, Card, ErrorText, Field, inputCls, Stars, useAction } from "@/components/ui";
import { api, ApiError, money, type Bid, type PaymentState, type Task } from "@/lib/api";

const STEPS = ["open", "hired", "paid", "delivered", "completed"];
const STEP_LABEL: Record<string, string> = {
  open: "Bidding",
  hired: "Hired",
  paid: "Paid (held)",
  delivered: "Delivered",
  completed: "Released",
};

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
      const t = await api<Task>(`/tasks/${id}`);
      setTask(t);
      setBids(await api<Bid[]>(`/tasks/${id}/bids`).catch(() => []));
      if (t.hired_tutor_id) {
        setPay(await api<PaymentState>(`/tasks/${id}/payment`).catch(() => null));
        const conv = await api<{ id: string }>(`/tasks/${id}/conversation`).catch(() => null);
        setConversationId(conv?.id ?? null);
      }
    } catch (e) {
      setLoadError(e instanceof ApiError && e.status === 404 ? "This task isn't available." : String(e));
    }
  }, [id]);

  useEffect(() => {
    if (me) void reload();
  }, [me, reload]);

  if (loadError) return <ErrorText error={loadError} />;
  if (!me || !task) return <p className="text-muted">Loading…</p>;

  const role = me.profile.role;
  const isStudent = role === "student" && task.student_id === me.profile.id;
  const isTutor = role === "tutor" && task.hired_tutor_id === me.profile.id;
  const stepIdx = STEPS.indexOf(task.status);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold sm:text-2xl">{task.title}</h1>
          <Badge status={task.status} />
        </div>
        <p className="text-sm text-muted">
          {task.subject} · budget {money(task.budget_cents)}
        </p>
      </div>

      <ol className="grid grid-cols-5 gap-1 text-center text-[11px] sm:text-xs" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`rounded-lg px-1 py-2 ${stepIdx >= i ? "bg-brand text-brand-ink" : "bg-surface text-muted border border-border"}`}
          >
            {STEP_LABEL[s]}
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <Card title="Request">
            <p className="whitespace-pre-wrap text-sm">{task.description}</p>
            {task.delivery_note && (
              <div className="mt-3 rounded-xl bg-violet-50 p-3 text-sm">
                <strong>Tutor&apos;s delivery:</strong> {task.delivery_note}
              </div>
            )}
          </Card>
          <TaskFiles
            taskId={task.id}
            canUploadRubric={isStudent}
            canUploadDeliverable={isTutor && task.status === "paid"}
          />
          {isStudent && <StudentActions task={task} bids={bids} pay={pay} reload={reload} />}
          {role === "tutor" && <TutorActions task={task} bids={bids} isHired={isTutor} reload={reload} />}
          {pay?.payment && <PaymentCard pay={pay} />}
        </div>
        {conversationId && (isStudent || isTutor) && (
          <Chat conversationId={conversationId} meId={me.profile.id} myLang={me.profile.preferred_language} />
        )}
      </div>
    </div>
  );
}

function PaymentCard({ pay }: { pay: PaymentState }) {
  const p = pay.payment!;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Payment <Badge status={p.status} />
        </span>
      }
    >
      <dl className="grid grid-cols-2 gap-y-1 text-sm" data-testid="payment-card">
        <dt className="text-muted">Paid by student</dt>
        <dd className="text-right">{money(p.amount_cents)}</dd>
        <dt className="text-muted">Platform fee ({p.platform_fee_bps / 100}%)</dt>
        <dd className="text-right">{money(p.platform_fee_cents)}</dd>
        <dt className="text-muted">Tutor receives</dt>
        <dd className="text-right font-semibold">{money(p.tutor_net_cents)}</dd>
        {pay.tips_cents > 0 && (
          <>
            <dt className="text-muted">Tips (100% to tutor)</dt>
            <dd className="text-right">{money(pay.tips_cents)}</dd>
          </>
        )}
        {pay.transfer && (
          <>
            <dt className="text-muted">Payout</dt>
            <dd className="text-right">
              <Badge status={pay.transfer.status === "created" ? "released" : pay.transfer.status} />
            </dd>
          </>
        )}
      </dl>
      {p.status === "held" && (
        <p className="mt-2 text-xs text-muted">
          Funds are held by the platform until the student releases them after delivery.
        </p>
      )}
    </Card>
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
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const redirect = async (path: string, body: unknown = {}) => {
    const { url } = await api<{ url: string }>(path, { body });
    window.location.href = url;
  };
  const act = (fn: () => Promise<unknown>) =>
    a.run(async () => {
      await fn();
      await reload();
    });

  return (
    <Card title="Next step">
      <div className="space-y-3">
        <ErrorText error={a.error} />
        {task.status === "open" &&
          (bids.length === 0 ? (
            <p className="text-sm text-muted">Waiting for tutors to bid…</p>
          ) : (
            <ul className="space-y-2" aria-label="Bids">
              {bids.map((b) => (
                <li key={b.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{b.tutor_name}</span>
                    <span className="font-semibold">{money(b.amount_cents)}</span>
                  </div>
                  <div className="text-xs text-muted">
                    <Stars value={b.tutor_rating_avg} /> ({b.tutor_rating_count})
                  </div>
                  {b.message && <p className="mt-1 text-sm">{b.message}</p>}
                  <Button
                    className="mt-2 w-full"
                    disabled={a.pending}
                    onClick={() => act(() => api(`/tasks/${task.id}/hire`, { body: { bid_id: b.id } }))}
                  >
                    Hire {b.tutor_name}
                  </Button>
                </li>
              ))}
            </ul>
          ))}
        {task.status === "hired" && (
          <Button
            className="w-full"
            disabled={a.pending}
            onClick={() => a.run(() => redirect(`/tasks/${task.id}/checkout`))}
          >
            Pay {money(bids.find((b) => b.status === "accepted")?.amount_cents ?? task.budget_cents)} securely
          </Button>
        )}
        {task.status === "paid" && (
          <p className="text-sm text-muted">Payment held. Your tutor is working on your session.</p>
        )}
        {task.status === "delivered" && (
          <Button
            className="w-full"
            disabled={a.pending}
            onClick={() => act(() => api(`/tasks/${task.id}/release`, { body: {} }))}
          >
            Release payment to tutor
          </Button>
        )}
        {task.status === "completed" && (
          <>
            <div>
              <p className="mb-2 text-sm font-medium">Send a tip (100% goes to your tutor)</p>
              <div className="grid grid-cols-3 gap-2">
                {[200, 500, 1000].map((c) => (
                  <Button
                    key={c}
                    variant="ghost"
                    disabled={a.pending}
                    onClick={() => a.run(() => redirect(`/tasks/${task.id}/tips`, { amount_cents: c }))}
                  >
                    Tip {money(c)}
                  </Button>
                ))}
              </div>
            </div>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void act(() => api(`/tasks/${task.id}/review`, { body: { rating, comment } }));
              }}
            >
              <Field label="Rate your tutor">
                <select className={inputCls} value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)}
                    </option>
                  ))}
                </select>
              </Field>
              <textarea
                className={inputCls}
                placeholder="Optional comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button type="submit" variant="ghost" className="w-full" disabled={a.pending}>
                Submit review
              </Button>
            </form>
          </>
        )}
        {(task.status === "paid" || task.status === "delivered") && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Problem with this session?</summary>
            <div className="mt-2 space-y-2">
              <textarea
                className={inputCls}
                placeholder="Describe the issue"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                variant="danger"
                disabled={a.pending || reason.length < 3}
                onClick={() => act(() => api(`/tasks/${task.id}/disputes`, { body: { reason } }))}
              >
                Open dispute
              </Button>
            </div>
          </details>
        )}
        {task.status === "disputed" && (
          <p className="text-sm text-red-700">Under review by our team. Funds stay held until it&apos;s resolved.</p>
        )}
        {pay?.payment?.status === "pending" && task.status === "hired" && (
          <p className="text-xs text-muted">
            Checkout started — the payment is confirmed only after the payment provider notifies us.
          </p>
        )}
      </div>
    </Card>
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
  const act = (fn: () => Promise<unknown>) =>
    a.run(async () => {
      await fn();
      await reload();
    });

  return (
    <Card title={isHired ? "Your session" : "Your bid"}>
      <div className="space-y-3">
        <ErrorText error={a.error} />
        {!isHired && task.status === "open" && !myBid && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() =>
                api(`/tasks/${task.id}/bids`, { body: { amount_cents: Math.round(Number(amount) * 100), message } }),
              );
            }}
          >
            <Field label="Your price (USD)">
              <input
                className={inputCls}
                type="number"
                min={5}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <textarea
              className={inputCls}
              placeholder="How you'll help (approach, availability)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={a.pending}>
              Submit bid
            </Button>
          </form>
        )}
        {myBid && !isHired && (
          <p className="text-sm">
            You bid {money(myBid.amount_cents)} — <Badge status={myBid.status} />
          </p>
        )}
        {isHired && task.status === "hired" && (
          <p className="text-sm text-muted">Hired! Waiting for the student&apos;s payment before you start.</p>
        )}
        {isHired && task.status === "paid" && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => api(`/tasks/${task.id}/deliver`, { body: { note } }));
            }}
          >
            <Field
              label="Delivery note"
              hint="Summarize the walkthrough, practice problems or study guide you provided."
            >
              <textarea className={inputCls} required value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full" disabled={a.pending}>
              Mark as delivered
            </Button>
          </form>
        )}
        {isHired && task.status === "delivered" && (
          <p className="text-sm text-muted">Delivered. The student will release your payment.</p>
        )}
        {isHired && task.status === "completed" && (
          <p className="text-sm text-emerald-700">Payment released to your payout account 🎉</p>
        )}
      </div>
    </Card>
  );
}
