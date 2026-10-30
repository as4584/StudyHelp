"""Live video sessions: one opaque LiveKit room per paid tutoring task.

Internal table: FastAPI reads and writes it; browser roles get no grants (RLS forced).

Revision ID: 0004_video_sessions
Revises: 0003_profile_avatar
Create Date: 2026-10-30
"""

from alembic import op

revision = "0004_video_sessions"
down_revision = "0003_profile_avatar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
create table video_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references tasks(id) on delete cascade,
  room_name text not null unique check (room_name ~ '^room_[0-9a-f]{32}$'),
  status text not null default 'created' check (status in ('created','active','ended')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  check ((status = 'ended') = (ended_at is not null))
)"""
    )
    op.execute("alter table video_sessions enable row level security")
    op.execute("alter table video_sessions force row level security")
    op.execute("revoke all on video_sessions from anon, authenticated")


def downgrade() -> None:
    op.execute("drop table video_sessions")
