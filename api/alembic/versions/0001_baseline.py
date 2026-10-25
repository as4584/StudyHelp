"""Baseline schema: marketplace, payments ledger, chat, AI, admin audit.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-25
"""

from alembic import op
from sqlalchemy.util import await_

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

TABLES = [
    "audit_logs",
    "ai_usage",
    "ai_messages",
    "ai_chats",
    "disputes",
    "reviews",
    "message_translations",
    "messages",
    "conversations",
    "subscriptions",
    "transfers",
    "payment_events",
    "provider_events",
    "tips",
    "payments",
    "bids",
    "task_files",
    "tasks",
    "tutor_documents",
    "tutor_profiles",
    "profiles",
]

SCHEMA = """
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student','tutor','admin')),
  display_name text not null check (length(display_name) between 1 and 80),
  preferred_language text not null default 'en' check (preferred_language ~ '^[a-z]{2}$'),
  is_active boolean not null default true,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

create table tutor_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  bio text not null default '' check (length(bio) <= 2000),
  subjects text[] not null default '{}',
  hourly_rate_cents integer not null check (hourly_rate_cents between 100 and 100000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  stripe_account_id text unique,
  payouts_enabled boolean not null default false,
  rating_avg numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  created_at timestamptz not null default now()
);

create table tutor_documents (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references profiles(id) on delete cascade,
  storage_path text not null unique,
  filename text not null,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id),
  subject text not null check (length(subject) between 1 and 60),
  title text not null check (length(title) between 3 and 140),
  description text not null check (length(description) between 1 and 5000),
  budget_cents integer not null check (budget_cents between 500 and 500000),
  status text not null default 'open' check (status in
    ('open','hired','paid','delivered','completed','disputed','refunded','cancelled')),
  hired_tutor_id uuid references profiles(id),
  accepted_bid_id uuid,
  honor_code_ack boolean not null check (honor_code_ack),
  delivery_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('open','cancelled')) or hired_tutor_id is not null)
);
create index tasks_status_idx on tasks(status);
create index tasks_student_idx on tasks(student_id);

create table task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  uploader_id uuid not null references profiles(id),
  kind text not null check (kind in ('rubric','deliverable')),
  storage_path text not null unique,
  filename text not null,
  created_at timestamptz not null default now()
);

create table bids (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  tutor_id uuid not null references profiles(id),
  amount_cents integer not null check (amount_cents between 500 and 500000),
  message text not null default '' check (length(message) <= 2000),
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  unique (task_id, tutor_id)
);
create unique index bids_one_accepted_per_task on bids(task_id) where status = 'accepted';
alter table tasks add constraint tasks_accepted_bid_fk
  foreign key (accepted_bid_id) references bids(id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id),
  student_id uuid not null references profiles(id),
  tutor_id uuid not null references profiles(id),
  amount_cents integer not null check (amount_cents > 0),
  platform_fee_bps integer not null check (platform_fee_bps between 2000 and 3000),
  platform_fee_cents integer not null check (platform_fee_cents >= 0),
  tutor_net_cents integer not null check (tutor_net_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending','held','released','refunded','failed','expired')),
  checkout_session_id text unique,
  payment_intent_id text,
  charge_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (platform_fee_cents + tutor_net_cents = amount_cents)
);
-- At most one live (non-failed) payment per task.
create unique index payments_one_live_per_task on payments(task_id)
  where status in ('pending','held','released');

create table tips (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id),
  student_id uuid not null references profiles(id),
  tutor_id uuid not null references profiles(id),
  amount_cents integer not null check (amount_cents in (200, 500, 1000)),
  status text not null default 'pending' check (status in ('pending','paid','transferred','failed','expired')),
  checkout_session_id text unique,
  charge_id text,
  created_at timestamptz not null default now()
);

create table provider_events (
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create table payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid references payments(id),
  tip_id uuid references tips(id),
  kind text not null,
  amount_cents integer,
  provider_event_id text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table transfers (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references payments(id),
  tip_id uuid references tips(id),
  tutor_id uuid not null references profiles(id),
  amount_cents integer not null check (amount_cents > 0),
  idempotency_key text not null unique,
  provider_transfer_id text unique,
  status text not null default 'pending' check (status in ('pending','created','failed','reversed')),
  created_at timestamptz not null default now(),
  check ((payment_id is null) <> (tip_id is null))
);
-- A payment or tip is released at most once.
create unique index transfers_one_per_payment on transfers(payment_id) where payment_id is not null;
create unique index transfers_one_per_tip on transfers(tip_id) where tip_id is not null;

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  provider_subscription_id text unique,
  status text not null check (status in
    ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references tasks(id) on delete cascade,
  student_id uuid not null references profiles(id),
  tutor_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  check (student_id <> tutor_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null check (length(body) between 1 and 4000),
  source_language text not null,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages(conversation_id, created_at);

create table message_translations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  target_language text not null,
  translated_body text,
  provider text not null,
  status text not null check (status in ('ok','failed')),
  error text,
  latency_ms integer,
  created_at timestamptz not null default now(),
  unique (message_id, target_language),
  check ((status = 'ok') = (translated_body is not null))
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references tasks(id),
  student_id uuid not null references profiles(id),
  tutor_id uuid not null references profiles(id),
  rating integer not null check (rating between 1 and 5),
  comment text not null default '' check (length(comment) <= 2000),
  created_at timestamptz not null default now()
);

create table disputes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id),
  opened_by uuid not null references profiles(id),
  reason text not null check (length(reason) between 3 and 2000),
  status text not null default 'open' check (status in ('open','resolved_release','resolved_refund')),
  prior_task_status text not null,
  resolution_note text,
  resolved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index disputes_one_open_per_task on disputes(task_id) where status = 'open';

create table ai_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  subject text not null default '',
  created_at timestamptz not null default now()
);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references ai_chats(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  chat_id uuid references ai_chats(id) on delete set null,
  provider text not null,
  model text not null,
  status text not null check (status in ('ok','error','denied')),
  latency_ms integer not null,
  input_tokens integer,
  output_tokens integer,
  premium boolean not null,
  request_id text,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}',
  request_id text,
  created_at timestamptz not null default now()
);

-- Append-only ledgers: block UPDATE/DELETE at the database level.
create function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;
create trigger payment_events_append_only before update or delete on payment_events
  for each row execute function forbid_mutation();
create trigger audit_logs_append_only before update or delete on audit_logs
  for each row execute function forbid_mutation();
"""

# Defense in depth. FastAPI connects as the table owner and performs every write; the
# browser-facing `anon`/`authenticated` roles may only SELECT rows they participate in
# (needed so Supabase Realtime can deliver change signals to authorized subscribers).
RLS = """
do $$
declare t text;
begin
  foreach t in array array[%(tables)s] loop
    execute format('alter table %%I enable row level security', t);
    execute format('alter table %%I force row level security', t);
    execute format('revoke all on %%I from anon, authenticated', t);
  end loop;
end $$;

grant select on profiles, tutor_profiles, tasks, bids, conversations, messages,
  message_translations, payments, reviews to authenticated;

create policy profiles_self on profiles for select to authenticated
  using (id = (select auth.uid()));

create policy tutor_profiles_public on tutor_profiles for select to authenticated
  using (status = 'approved' or user_id = (select auth.uid()));

create policy tasks_visible on tasks for select to authenticated using (
  student_id = (select auth.uid())
  or hired_tutor_id = (select auth.uid())
  or (status = 'open' and exists (
        select 1 from tutor_profiles tp
        where tp.user_id = (select auth.uid()) and tp.status = 'approved'))
);

create policy bids_visible on bids for select to authenticated using (
  tutor_id = (select auth.uid())
  or exists (select 1 from tasks t where t.id = task_id and t.student_id = (select auth.uid()))
);

create policy conversations_participant on conversations for select to authenticated using (
  student_id = (select auth.uid()) or tutor_id = (select auth.uid())
);

create policy messages_participant on messages for select to authenticated using (
  exists (select 1 from conversations c where c.id = conversation_id
          and (select auth.uid()) in (c.student_id, c.tutor_id))
);

create policy translations_participant on message_translations for select to authenticated using (
  exists (select 1 from conversations c where c.id = conversation_id
          and (select auth.uid()) in (c.student_id, c.tutor_id))
);

create policy payments_party on payments for select to authenticated using (
  student_id = (select auth.uid()) or tutor_id = (select auth.uid())
);

create policy reviews_public on reviews for select to authenticated using (true);
"""

STORAGE = """
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('task-files', 'task-files', false), ('tutor-documents', 'tutor-documents', false)
    on conflict (id) do update set public = false;
  end if;
end $$;
"""

REALTIME = """
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table messages, message_translations;
  end if;
end $$;
"""


def _script(sql: str) -> None:
    """Run a multi-statement SQL script (asyncpg prepared statements allow only one)."""
    adapted = op.get_bind().connection.dbapi_connection
    await_(adapted.driver_connection.execute(sql))


def upgrade() -> None:
    _script(SCHEMA)
    _script(RLS % {"tables": ", ".join(f"'{t}'" for t in TABLES)})
    _script(STORAGE)
    _script(REALTIME)


def downgrade() -> None:
    _script(
        """
        do $$
        begin
          if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and tablename = 'messages') then
            alter publication supabase_realtime drop table messages, message_translations;
          end if;
        end $$;
        """
    )
    for t in TABLES:
        op.execute(f"drop table if exists {t} cascade")
    op.execute("drop function if exists forbid_mutation()")
    # Storage buckets are intentionally retained: deleting them could destroy user files.
