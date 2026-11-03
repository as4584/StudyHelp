"""Grant the hosted API's login role access to video_sessions, and to every future table.

The hosted demo connects as `studyhelp_api` (docs/specs/demo.md), a non-owner role that was
granted per table. 0004 created video_sessions without that grant, so the API got "permission
denied". Local and CI connect as the owner and have no such role, so this is a no-op there.

Revision ID: 0005_api_role_grants
Revises: 0004_video_sessions
Create Date: 2026-11-01
"""

from alembic import op

revision = "0005_api_role_grants"
down_revision = "0004_video_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'studyhelp_api') then
    grant select, insert, update, delete on video_sessions to studyhelp_api;
    -- Tables created later by this migration owner get the same grant automatically.
    alter default privileges in schema public
      grant select, insert, update, delete on tables to studyhelp_api;
  end if;
end $$"""
    )


def downgrade() -> None:
    op.execute(
        """
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'studyhelp_api') then
    alter default privileges in schema public
      revoke select, insert, update, delete on tables from studyhelp_api;
    revoke all on video_sessions from studyhelp_api;
  end if;
end $$"""
    )
