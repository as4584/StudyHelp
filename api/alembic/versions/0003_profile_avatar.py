"""Profile photos: a small client-resized image stored inline as a data URL.

Kept inline (<=200 KB, image types only) so photos work without object storage in the demo.

Revision ID: 0003_profile_avatar
Revises: 0002_task_language
Create Date: 2026-10-28
"""

from alembic import op

revision = "0003_profile_avatar"
down_revision = "0002_task_language"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "alter table profiles add column avatar_url text check (avatar_url is null or"
        " (length(avatar_url) <= 200000"
        " and avatar_url ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'))"
    )


def downgrade() -> None:
    op.execute("alter table profiles drop column avatar_url")
