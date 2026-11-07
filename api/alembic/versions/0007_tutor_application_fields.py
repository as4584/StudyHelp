"""Tutor applications: years of experience, resume uploads, Word resumes in storage.

The main subject needs no column: it is stored first in `subjects`.

Revision ID: 0007_tutor_application_fields
Revises: 0006_storage_limits
Create Date: 2026-11-07
"""

from alembic import op

revision = "0007_tutor_application_fields"
down_revision = "0006_storage_limits"
branch_labels = None
depends_on = None

UPGRADE_STORAGE = """
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    update storage.buckets
       set allowed_mime_types = array[
         'image/*', 'application/pdf', 'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
     where id = 'tutor-documents';
  end if;
end $$;
"""

DOWNGRADE_STORAGE = """
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    update storage.buckets set allowed_mime_types = array['image/*', 'application/pdf']
     where id = 'tutor-documents';
  end if;
end $$;
"""


def upgrade() -> None:
    op.execute(
        "alter table tutor_profiles add column years_experience integer"
        " check (years_experience between 0 and 60)"
    )
    op.execute(
        "alter table tutor_documents add column kind text not null default 'qualification'"
        " check (kind in ('qualification', 'resume'))"
    )
    op.execute(UPGRADE_STORAGE)


def downgrade() -> None:
    op.execute(DOWNGRADE_STORAGE)
    op.execute("alter table tutor_documents drop column kind")
    op.execute("alter table tutor_profiles drop column years_experience")
