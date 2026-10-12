-- Vurqelio starter schema for Supabase.
-- Run in Supabase SQL Editor only after reviewing it.
-- Points are DEMO-only. Do not enable cash withdrawals until a compliant reward provider,
-- server-side verification, anti-fraud checks and legal terms are in place.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  points integer not null default 0 check (points >= 0),
  status text not null default 'draft' check (status in ('draft','active','paused')),
  provider text,
  created_at timestamptz not null default now()
);

create table if not exists public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  amount integer not null,
  reason text not null,
  provider_event_id text unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.point_ledger enable row level security;

-- Users can read/update only their own profile.
create policy "Users read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Only active activities are visible to signed-in users.
create policy "Authenticated users read active activities" on public.activities
  for select to authenticated using (status = 'active');

-- Users can read only their own ledger. No client insert/update/delete policy is intentional:
-- points must be granted by a trusted server-side function after provider verification.
create policy "Users read own point ledger" on public.point_ledger
  for select to authenticated using (auth.uid() = user_id);

-- Create profile row after new user registration.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Important: don't add a client-facing RPC that lets users award themselves points.
-- Admin writes should be performed with a server-only secret in a trusted backend/Edge Function.
