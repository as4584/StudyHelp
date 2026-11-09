"""Sign-up policies: a permanent record of every policy acceptance, and student age details.

Each row says who accepted which policy text (by version) and when: the user themselves, or a
parent/guardian consenting for a student under 18. Rows are append-only, like audit_logs.
Internal table: FastAPI reads and writes it; browser roles get no grants (RLS forced).

Revision ID: 0008_policy_acceptances
Revises: 0007_tutor_application_fields
Create Date: 2026-11-09
"""

from alembic import op

revision = "0008_policy_acceptances"
down_revision = "0007_tutor_application_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "alter table profiles add column date_of_birth date,"
        " add column guardian_name text, add column guardian_email text"
    )
    op.execute(
        """
create table policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  policy text not null check (policy in ('tutor_agreement', 'student_policy')),
  policy_version text not null,
  accepted_by text not null check (accepted_by in ('user', 'guardian')),
  full_name text not null check (length(full_name) between 2 and 120),
  email text not null default '',
  accepted_at timestamptz not null default now(),
  unique (user_id, policy, policy_version, accepted_by)
)"""
    )
    op.execute("create index policy_acceptances_accepted_at on policy_acceptances (accepted_at)")
    op.execute(
        "create trigger policy_acceptances_append_only before update or delete"
        " on policy_acceptances for each row execute function forbid_mutation()"
    )
    op.execute("alter table policy_acceptances enable row level security")
    op.execute("alter table policy_acceptances force row level security")
    op.execute("revoke all on policy_acceptances from anon, authenticated")


def downgrade() -> None:
    op.execute("drop table policy_acceptances")
    op.execute(
        "alter table profiles drop column date_of_birth,"
        " drop column guardian_name, drop column guardian_email"
    )
