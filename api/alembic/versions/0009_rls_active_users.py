"""Browser-role reads: suspended users see nothing, and tutors' payout details stay private.

FastAPI already refuses suspended users; this closes the direct Supabase REST/Realtime path
too. Every table the `authenticated` role may read gets a RESTRICTIVE policy (ANDed with
the existing ones) that requires the caller's profile to be active. On tutor_profiles the
role keeps every column except the payout account id and payout status.

Revision ID: 0009_rls_active_users
Revises: 0008_policy_acceptances
Create Date: 2026-11-10
"""

from alembic import op

revision = "0009_rls_active_users"
down_revision = "0008_policy_acceptances"
branch_labels = None
depends_on = None

TABLES = (
    "profiles",
    "tutor_profiles",
    "tasks",
    "bids",
    "conversations",
    "messages",
    "message_translations",
    "payments",
    "reviews",
)


def upgrade() -> None:
    # Security definer: reads the caller's own profile without going through profiles' RLS.
    op.execute(
        """
create function public.current_user_active() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select coalesce(
    (select p.is_active from public.profiles p where p.id = (select auth.uid())), false) $$
"""
    )
    op.execute("revoke all on function public.current_user_active() from public, anon")
    op.execute("grant execute on function public.current_user_active() to authenticated")
    for t in TABLES:
        op.execute(
            f"create policy {t}_active_only on {t} as restrictive for select to authenticated"
            " using ((select public.current_user_active()))"
        )
    # Every column except the payout account id and payout status.
    op.execute("revoke select on tutor_profiles from authenticated")
    op.execute(
        """
do $$
declare c text;
begin
  for c in select column_name from information_schema.columns
           where table_schema = 'public' and table_name = 'tutor_profiles'
             and column_name not in ('stripe_account_id', 'payouts_enabled') loop
    execute format('grant select (%I) on tutor_profiles to authenticated', c);
  end loop;
end $$;
"""
    )


def downgrade() -> None:
    op.execute("revoke select on tutor_profiles from authenticated")
    op.execute("grant select on tutor_profiles to authenticated")
    for t in TABLES:
        op.execute(f"drop policy {t}_active_only on {t}")
    op.execute("drop function public.current_user_active()")
