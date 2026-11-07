"""Cap upload size and type on the private storage buckets.

Uploads go straight from the browser to Storage with a server-signed URL, so the bucket is
where size and type are enforced. Task files: images, PDFs and short screen recordings.
Tutor documents: images and PDFs. No-op where the storage schema is absent.

Revision ID: 0006_storage_limits
Revises: 0005_api_role_grants
Create Date: 2026-11-07
"""

from alembic import op

revision = "0006_storage_limits"
down_revision = "0005_api_role_grants"
branch_labels = None
depends_on = None


def _set(task_files: str, tutor_documents: str) -> str:
    return f"""
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    update storage.buckets set {task_files} where id = 'task-files';
    update storage.buckets set {tutor_documents} where id = 'tutor-documents';
  end if;
end $$;
"""


def upgrade() -> None:
    op.execute(
        _set(
            "file_size_limit = 52428800, allowed_mime_types = "
            "array['image/*', 'application/pdf', 'video/*']",
            "file_size_limit = 10485760, allowed_mime_types = array['image/*', 'application/pdf']",
        )
    )


def downgrade() -> None:
    unset = "file_size_limit = null, allowed_mime_types = null"
    op.execute(_set(unset, unset))
