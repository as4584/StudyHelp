"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { Badge, Button, Card, ErrorText, inputCls, useAction } from "@/components/ui";
import { api, money, type Schemas } from "@/lib/api";

type Revenue = Schemas["RevenueOut"];
type Tutor = Schemas["PublicTutorOut"];
type Dispute = Schemas["DisputeOut"];
type Payment = Schemas["PaymentOut"];
type User = Schemas["AdminUserOut"];
type Audit = Schemas["AuditOut"];

export default function AdminPage() {
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

  if (!me || !rev) return <p className="text-muted">Loading…</p>;
  const stats: [string, number, string][] = [
    ["Platform fees earned", rev.platform_fees_earned_cents, "fees-earned"],
    ["Fees pending (held)", rev.platform_fees_pending_cents, "fees-pending"],
    ["Paid out to tutors", rev.tutor_payouts_cents, "payouts"],
    ["Currently held", rev.gross_held_cents, "held"],
    ["Tips", rev.tips_cents, "tips"],
    ["Refunded", rev.refunded_cents, "refunded"],
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Admin</h1>
      <ErrorText error={a.error} />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([label, cents, id]) => (
          <div key={id} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-xl font-bold" data-testid={`stat-${id}`}>
              {money(cents)}
            </p>
          </div>
        ))}
      </section>
      <p className="text-xs text-muted">
        Commission rate: {rev.fee_bps / 100}% · {rev.payments_count} payments
      </p>

      <Card title={`Tutor applications (${pending.length})`}>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">No pending applications.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((t) => (
              <li key={t.user_id} className="rounded-xl border border-border p-3 text-sm">
                <div className="font-medium">{t.display_name}</div>
                <div className="text-muted">
                  {t.subjects.join(", ")} · {money(t.hourly_rate_cents)}/hr
                </div>
                {t.bio && <p className="mt-1">{t.bio}</p>}
                <div className="mt-2 flex gap-2">
                  <Button
                    disabled={a.pending}
                    onClick={() => act(() => api(`/admin/tutors/${t.user_id}/approve`, { body: {} }))}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={a.pending}
                    onClick={() => act(() => api(`/admin/tutors/${t.user_id}/reject`, { body: {} }))}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Disputes">
        {disputes.length === 0 ? (
          <p className="text-sm text-muted">No disputes.</p>
        ) : (
          <ul className="space-y-2">
            {disputes.map((d) => (
              <DisputeRow key={d.id} d={d} act={act} busy={a.pending} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Payments">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1">Task</th>
                <th>Amount</th>
                <th>Fee</th>
                <th>Tutor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2">
                    <Link className="text-brand" href={`/tasks/${p.task_id}`}>
                      {p.task_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td>{money(p.amount_cents)}</td>
                  <td>{money(p.platform_fee_cents)}</td>
                  <td>{money(p.tutor_net_cents)}</td>
                  <td>
                    <Badge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Users">
        <ul className="divide-y divide-border text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {u.display_name} <span className="text-muted">· {u.role}</span>
              </span>
              {u.id !== me.profile.id && (
                <Button
                  variant="ghost"
                  disabled={a.pending}
                  onClick={() =>
                    act(() => api(`/admin/users/${u.id}/${u.is_active ? "suspend" : "reactivate"}`, { body: {} }))
                  }
                >
                  {u.is_active ? "Suspend" : "Reactivate"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Audit log">
        <ul className="space-y-1 text-xs">
          {audit.map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <span className="font-mono">{l.action}</span>
              <span className="text-muted">{new Date(l.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </Card>
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
    <li className="rounded-xl border border-border p-3 text-sm">
      <div className="flex items-center justify-between">
        <Link className="text-brand" href={`/tasks/${d.task_id}`}>
          Task {d.task_id.slice(0, 8)}
        </Link>
        <Badge status={d.status === "open" ? "disputed" : d.status.replace("resolved_", "")} />
      </div>
      <p className="mt-1">{d.reason}</p>
      {d.status === "open" ? (
        <div className="mt-2 space-y-2">
          <input
            className={inputCls}
            placeholder="Resolution note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
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
