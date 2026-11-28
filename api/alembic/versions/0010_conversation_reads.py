"""Per-participant read markers for task chats (unread counts on the dashboards).

Internal table: FastAPI reads and writes it; browser roles get no grants (RLS forced), so
one participant cannot see when the other last read the conversation.

Revision ID: 0010_conversation_reads
Revises: 0009_rls_active_users
Create Date: 2026-11-28
"""

from alembic import op

revision = "0010_conversation_reads"
down_revision = "0009_rls_active_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
create table conversation_reads (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
)"""
    )
    op.execute("alter table conversation_reads enable row level security")
    op.execute("alter table conversation_reads force row level security")
    op.execute("revoke all on conversation_reads from anon, authenticated")


def downgrade() -> None:
    op.execute("drop table conversation_reads")
