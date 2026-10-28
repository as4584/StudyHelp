"""Requests record the language and level (high school / college) the student wants help at;
tutors record which levels they teach.

Revision ID: 0002_task_language
Revises: 0001_baseline
Create Date: 2026-10-28
"""

from alembic import op

revision = "0002_task_language"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "alter table tasks add column language text not null default 'en'"
        " check (language ~ '^[a-z]{2}$')"
    )
    op.execute(
        "alter table tasks add column level text not null default 'college'"
        " check (level in ('high_school', 'college'))"
    )
    op.execute(
        "alter table tutor_profiles add column levels text[] not null"
        " default '{high_school,college}'"
        " check (levels <@ array['high_school', 'college'] and cardinality(levels) > 0)"
    )


def downgrade() -> None:
    op.execute("alter table tutor_profiles drop column levels")
    op.execute("alter table tasks drop column level")
    op.execute("alter table tasks drop column language")
