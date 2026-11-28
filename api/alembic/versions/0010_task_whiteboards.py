"""Shared whiteboards: one Excalidraw scene per tutoring task, for its student and hired tutor.

Internal table: FastAPI reads and writes it; browser roles get no grants (RLS forced).
`version` is an optimistic-concurrency counter: a write must name the version it was based on.

Revision ID: 0010_task_whiteboards
Revises: 0009_rls_active_users
Create Date: 2026-11-28
"""

from alembic import op

revision = "0010_task_whiteboards"
down_revision = "0009_rls_active_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
create table task_whiteboards (
  task_id uuid primary key references tasks(id) on delete cascade,
  scene jsonb not null,
  version integer not null default 1 check (version >= 1),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
)"""
    )
    op.execute("alter table task_whiteboards enable row level security")
    op.execute("alter table task_whiteboards force row level security")
    op.execute("revoke all on task_whiteboards from anon, authenticated")


def downgrade() -> None:
    op.execute("drop table task_whiteboards")
