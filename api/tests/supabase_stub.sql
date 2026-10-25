-- Minimal stand-in for the Supabase-managed `auth` schema inside the disposable test
-- database. Roles (anon, authenticated) are cluster-wide and already exist on the
-- Supabase Postgres image. auth.uid() mirrors Supabase's definition.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
