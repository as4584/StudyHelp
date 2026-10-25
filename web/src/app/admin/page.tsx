"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useRequireRole } from "@/components/auth";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorText,
  PageHeader,
  Section,
  Skeleton,
  inputCls,
  useAction,
} from "@/components/ui";
import { api, money, type Schemas } from "@/lib/api";

type Revenue = Schemas["RevenueOut"];
type Tutor = Schemas["PublicTutorOut"];
type Dispute = Schemas["DisputeOut"];
type Payment = Schemas["PaymentOut"];
type User = Schemas["AdminUserOut"];
type Audit = Schemas["AuditOut"];

export default function OperationsPage() {
  const { me } = useRequireRole("admin");
  const [rev, setRev] = useState<Revenue | null>(null);
  const [pending, setPending] = useState<Tutor[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const a = useAction();

  const load = useCallback(async () => {
    const [r, t, d, p, u, l] = await Promise.all([
      api<Revenue>("/admin/revenue"),
      api<Tutor[]>("/admin/tutors?status=pending"),
      api<Dispute[]>("/admin/disputes"),
      api<Payment[]>("/admin/payments"),
      api<User[]>("/admin/users"),
      api<Audit[]>("/admin/audit"),
    ]);
    setRev(r);
    setPending(t);
    setDisputes(d);
    setPayments(p);
    setUsers(u);
    setAudit(l);
  }, []);
  useEffect(() => {
    if (me) void load();
  }, [me, load]);
  const act = (fn: () => Promise<unknown>) =>
    a.run(async () => {
      await fn();
      await load();
    });

  if (!me || !rev) return <Skeleton lines={5} />;
  const openDisputes = disputes.filter((d) => d.status === "open");

  return (
    <div>
      <PageHeader
        title="Operations"
        lede={`Commission ${rev.fee_bps / 100}% · ${rev.payments_count} ${rev.payments_count === 1 ? "payment" : "payments"} · ${pending.length} ${pending.length === 1 ? "application" : "applications"} waiting`}
      />
      <ErrorText error={a.error} />

      {/* Revenue: one headline figure, the rest as a quiet ledger line. */}
      <section className="mb-12 grid gap-8 border-b border-rule pb-10 lg:grid-cols-[1fr_2fr]">
        <div>
          <div className="text-[13px] font-semibold text-muted">Platform fees earned</div>
          <div
            className={`tnum mt-1 font-serif text-[3rem] leading-none font-medium tracking-[-0.02em] ${rev.platform_fees_earned_cents ? "text-mastery" : "text-muted"}`}
            data-testid="stat-fees-earned"
          >
            {money(rev.platform_fees_earned_cents)}
          </div>
          <p className="mt-2 text-[13px] text-muted">From released sessions only.</p>
        </div>
        <dl className="tnum grid grid-cols-2 gap-x-8 gap-y-5 self-end sm:grid-cols-3">
          <Stat id="fees-pending" label="Fees on held payments" cents={rev.platform_fees_pending_cents} />
          <Stat id="held" label="Currently held" cents={rev.gross_held_cents} />
          <Stat id="payouts" label="Paid out to tutors" cents={rev.tutor_payouts_cents} />
          <Stat id="tips" label="Tips (to tutors)" cents={rev.tips_cents} />
          <Stat id="refunded" label="Refunded" cents={rev.refunded_cents} />
        </dl>
      </section>

      <div className="grid gap-12 lg:grid-cols-2 lg:gap-14">
        <Section title={`Tutor applications · ${pending.length}`}>
          {pending.length === 0 ? (
            <EmptyState>Every application has been reviewed.</EmptyState>
          ) : (
            <ul className="divide-y divide-rule" data-testid="tutor-applications">
              {pending.map((t) => (
                <li key={t.user_id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={t.display_name} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{t.display_name}</div>
                        <div className="tnum text-[13px] text-muted">
                          {t.subjects.join(", ")} · {money(t.hourly_rate_cents)}/hr
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        disabled={a.pending}
                        onClick={() => act(() => api(`/admin/tutors/${t.user_id}/approve`, { body: {} }))}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={a.pending}
                        onClick={() => act(() => api(`/admin/tutors/${t.user_id}/reject`, { body: {} }))}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                  {t.bio && <p className="mt-2 pl-[38px] font-serif text-[15px] leading-relaxed text-ink-2">{t.bio}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Disputes · ${openDisputes.length} open`}>
          {disputes.length === 0 ? (
            <EmptyState>No disputes. Sessions are going smoothly.</EmptyState>
          ) : (
            <ul className="divide-y divide-rule">
              {disputes.map((d) => (
                <DisputeRow key={d.id} d={d} act={act} busy={a.pending} />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Payments" className="lg:col-span-2">
          {payments.length === 0 ? (
            <EmptyState>Payments appear here once students pay for sessions.</EmptyState>
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="tnum w-full min-w-[34rem] text-left text-[14px]">
                <thead className="text-[13px] text-muted">
                  <tr>
                    <th className="px-1 py-2 font-semibold">Session</th>
                    <th className="px-1 py-2 text-right font-semibold">Paid</th>
                    <th className="px-1 py-2 text-right font-semibold">Fee</th>
                    <th className="px-1 py-2 text-right font-semibold">Tutor</th>
                    <th className="px-1 py-2 pl-6 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule border-t border-rule">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-1 py-2.5">
                        <Link
                          className="font-semibold text-tutor underline-offset-4 hover:underline"
                          href={`/tasks/${p.task_id}`}
                        >
                          {p.task_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-1 py-2.5 text-right">{money(p.amount_cents)}</td>
                      <td className="px-1 py-2.5 text-right text-ink-2">{money(p.platform_fee_cents)}</td>
                      <td className="px-1 py-2.5 text-right text-ink-2">{money(p.tutor_net_cents)}</td>
                      <td className="px-1 py-2.5 pl-6">
                        <Badge status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title={`People · ${users.length}`}>
          <ul className="divide-y divide-rule">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={u.display_name} tone={u.role === "tutor" ? "tutor" : "muted"} />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink">{u.display_name}</span>
                    <span className="text-[13px] text-muted capitalize">
                      {u.role}
                      {!u.is_active && <span className="text-danger"> · suspended</span>}
                    </span>
                  </span>
                </span>
                {u.id !== me.profile.id && (
                  <button
                    disabled={a.pending}
                    className={`shrink-0 rounded-[6px] px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
                      u.is_active
                        ? "text-muted hover:bg-danger-soft hover:text-danger"
                        : "text-tutor hover:bg-tutor-soft"
                    }`}
                    onClick={() =>
                      act(() => api(`/admin/users/${u.id}/${u.is_active ? "suspend" : "reactivate"}`, { body: {} }))
                    }
                  >
                    {u.is_active ? "Suspend" : "Reactivate"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Audit log">
          {audit.length === 0 ? (
            <EmptyState>Privileged actions are recorded here.</EmptyState>
          ) : (
            <ul className="divide-y divide-rule text-[14px]">
              {audit.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="text-ink">{l.action}</span>
                  <time className="tnum shrink-0 text-[13px] text-muted">
                    {new Date(l.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Stat({ id, label, cents }: { id: string; label: string; cents: number }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd
        className={`mt-0.5 text-[1.25rem] font-semibold ${cents === 0 ? "text-muted" : "text-ink"}`}
        data-testid={`stat-${id}`}
      >
        {money(cents)}
      </dd>
    </div>
  );
}

function DisputeRow({
  d,
  act,
  busy,
}: {
  d: Dispute;
  act: (fn: () => Promise<unknown>) => Promise<unknown>;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <li className="py-4 text-[14px]">
      <div className="flex items-center justify-between gap-3">
        <Link className="font-semibold text-tutor underline-offset-4 hover:underline" href={`/tasks/${d.task_id}`}>
          Session {d.task_id.slice(0, 8)}
        </Link>
        <Badge
          status={d.status === "open" ? "disputed" : "completed"}
          label={d.status === "open" ? "Open" : d.status.replace("resolved_", "Resolved · ")}
        />
      </div>
      <p className="mt-1.5 font-serif text-[16px] leading-relaxed text-ink">{d.reason}</p>
      {d.status === "open" ? (
        <div className="mt-3 space-y-2">
          <input
            className={inputCls}
            placeholder="Resolution note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !note}
              onClick={() => act(() => api(`/admin/disputes/${d.id}/resolve`, { body: { outcome: "release", note } }))}
            >
              Release to tutor
            </Button>
            <Button
              variant="danger"
              disabled={busy || !note}
              onClick={() => act(() => api(`/admin/disputes/${d.id}/resolve`, { body: { outcome: "refund", note } }))}
            >
              Refund student
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-muted">{d.resolution_note}</p>
      )}
    </li>
  );
}
