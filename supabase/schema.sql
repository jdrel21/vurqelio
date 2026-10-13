-- Vurqelio — schema completă (idempotentă). Rulează tot fișierul în Supabase → SQL Editor.
-- Punctele (VP) sunt demonstrative și nu au valoare monetară.

create extension if not exists pgcrypto;

-- ============ TABELE ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists current_streak integer not null default 0;
alter table public.profiles add column if not exists longest_streak integer not null default 0;
alter table public.profiles add column if not exists last_checkin date;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  points integer not null default 0 check (points >= 0),
  status text not null default 'draft' check (status in ('draft','active','paused')),
  provider text,
  created_at timestamptz not null default now()
);
alter table public.activities add column if not exists video_url text;
alter table public.activities add column if not exists duration_seconds integer not null default 0;

create table if not exists public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  amount integer not null,
  reason text not null,
  provider_event_id text unique,
  created_at timestamptz not null default now()
);
create index if not exists point_ledger_user_idx on public.point_ledger(user_id, created_at desc);

create table if not exists public.activity_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.badges (
  code text primary key,
  name text not null,
  description text not null,
  icon text not null default '✦',
  sort integer not null default 0
);

create table if not exists public.user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_code text not null references public.badges(code) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_code)
);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  cost integer not null check (cost > 0),
  stock integer check (stock is null or stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_id uuid references public.rewards(id) on delete set null,
  reward_title text not null,
  cost integer not null,
  status text not null default 'pending' check (status in ('pending','fulfilled','rejected')),
  created_at timestamptz not null default now()
);

-- ============ HELPER ADMIN ============
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.point_ledger enable row level security;
alter table public.activity_sessions enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.rewards enable row level security;
alter table public.redemptions enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id or public.is_admin());
create policy "Users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
-- Utilizatorii pot modifica DOAR display_name (nu is_admin, nu streak-ul).
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "Authenticated users read active activities" on public.activities;
drop policy if exists "Admins manage activities" on public.activities;
create policy "Authenticated users read active activities" on public.activities
  for select to authenticated using (status = 'active' or public.is_admin());
create policy "Admins manage activities" on public.activities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users read own point ledger" on public.point_ledger;
create policy "Users read own point ledger" on public.point_ledger
  for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.point_ledger from anon, authenticated;

drop policy if exists "Users read own sessions" on public.activity_sessions;
create policy "Users read own sessions" on public.activity_sessions
  for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.activity_sessions from anon, authenticated;

drop policy if exists "Everyone reads badges" on public.badges;
create policy "Everyone reads badges" on public.badges for select to authenticated using (true);

drop policy if exists "Users read own badges" on public.user_badges;
create policy "Users read own badges" on public.user_badges
  for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.user_badges from anon, authenticated;

drop policy if exists "Read active rewards" on public.rewards;
drop policy if exists "Admins manage rewards" on public.rewards;
create policy "Read active rewards" on public.rewards
  for select to authenticated using (active or public.is_admin());
create policy "Admins manage rewards" on public.rewards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Read own redemptions" on public.redemptions;
create policy "Read own redemptions" on public.redemptions
  for select to authenticated using (auth.uid() = user_id or public.is_admin());
revoke insert, update, delete on public.redemptions from anon, authenticated;

-- ============ PROFIL LA ÎNREGISTRARE ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Profil pentru utilizatorii existenți creați înainte de trigger
insert into public.profiles (id, display_name)
select u.id, u.raw_user_meta_data ->> 'display_name' from auth.users u
on conflict (id) do nothing;

-- ============ INSIGNE ============
insert into public.badges (code, name, description, icon, sort) values
  ('first_watch', 'Primul pas', 'Ai finalizat prima activitate.', '▶', 1),
  ('watch_5', 'Spectator', '5 activități finalizate.', '◉', 2),
  ('watch_25', 'Maratonist', '25 de activități finalizate.', '◎', 3),
  ('streak_3', 'În ritm', 'Streak de 3 zile.', '✦', 4),
  ('streak_7', 'O săptămână', 'Streak de 7 zile.', '✶', 5),
  ('streak_30', 'De neoprit', 'Streak de 30 de zile.', '✺', 6),
  ('vp_1000', 'Colecționar', '1.000 VP câștigați în total.', '◆', 7),
  ('vp_5000', 'Tezaur', '5.000 VP câștigați în total.', '❖', 8),
  ('first_redeem', 'Prima recompensă', 'Ai revendicat prima recompensă.', '★', 9)
on conflict (code) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, sort = excluded.sort;

create or replace function public.award_badges(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_watch int; v_earned bigint; v_streak int; v_redeem int;
begin
  select count(*) into v_watch from public.point_ledger where user_id = p_user and provider_event_id like 'activity:%';
  select coalesce(sum(amount), 0) into v_earned from public.point_ledger where user_id = p_user and amount > 0;
  select coalesce(longest_streak, 0) into v_streak from public.profiles where id = p_user;
  select count(*) into v_redeem from public.redemptions where user_id = p_user and status <> 'rejected';

  insert into public.user_badges (user_id, badge_code)
  select p_user, v.code from (values
    ('first_watch', v_watch >= 1), ('watch_5', v_watch >= 5), ('watch_25', v_watch >= 25),
    ('streak_3', v_streak >= 3), ('streak_7', v_streak >= 7), ('streak_30', v_streak >= 30),
    ('vp_1000', v_earned >= 1000), ('vp_5000', v_earned >= 5000), ('first_redeem', v_redeem >= 1)
  ) as v(code, ok) where v.ok
  on conflict do nothing;
end;
$$;
revoke execute on function public.award_badges(uuid) from public, anon, authenticated;

-- ============ ACTIVITĂȚI (validare pe server) ============
drop function if exists public.complete_activity(uuid);

create or replace function public.start_activity(p_activity_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Trebuie să fii conectat.'; end if;
  if not exists (select 1 from public.activities where id = p_activity_id and status = 'active') then
    raise exception 'Activitatea nu este disponibilă.';
  end if;
  if exists (select 1 from public.point_ledger where provider_event_id = 'activity:' || p_activity_id || ':' || v_uid) then
    raise exception 'Ai finalizat deja această activitate.';
  end if;
  insert into public.activity_sessions (user_id, activity_id) values (v_uid, p_activity_id) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.complete_activity(p_session_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_s public.activity_sessions%rowtype;
  v_a public.activities%rowtype;
  v_rows int;
begin
  if v_uid is null then raise exception 'Trebuie să fii conectat.'; end if;
  select * into v_s from public.activity_sessions where id = p_session_id and user_id = v_uid for update;
  if not found then raise exception 'Sesiune invalidă.'; end if;
  if v_s.completed_at is not null then raise exception 'Sesiunea a fost deja folosită.'; end if;
  select * into v_a from public.activities where id = v_s.activity_id and status = 'active';
  if not found then raise exception 'Activitatea nu mai este disponibilă.'; end if;

  -- Timpul real scurs pe server trebuie să acopere durata videoclipului (toleranță 5s).
  if now() - v_s.started_at < make_interval(secs => greatest(v_a.duration_seconds - 5, 10)) then
    raise exception 'Videoclipul nu a fost urmărit complet.';
  end if;

  update public.activity_sessions set completed_at = now() where id = v_s.id;
  insert into public.point_ledger (user_id, activity_id, amount, reason, provider_event_id)
  values (v_uid, v_a.id, v_a.points, 'Activitate: ' || v_a.title, 'activity:' || v_a.id || ':' || v_uid)
  on conflict (provider_event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'Ai finalizat deja această activitate.'; end if;

  perform public.reward_referral(v_uid);
  perform public.award_badges(v_uid);
  return v_a.points;
end;
$$;

-- ============ STREAK ZILNIC ============
create or replace function public.claim_daily()
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_today date := (now() at time zone 'Europe/Bucharest')::date;
  v_streak int; v_bonus int;
begin
  if v_uid is null then raise exception 'Trebuie să fii conectat.'; end if;
  select * into v_p from public.profiles where id = v_uid for update;
  if not found then raise exception 'Profil inexistent.'; end if;
  if v_p.last_checkin = v_today then raise exception 'Ai revendicat deja bonusul de azi.'; end if;

  v_streak := case when v_p.last_checkin = v_today - 1 then v_p.current_streak + 1 else 1 end;
  v_bonus := 10 + least(v_streak - 1, 6) * 5;

  update public.profiles
     set current_streak = v_streak, longest_streak = greatest(longest_streak, v_streak), last_checkin = v_today
   where id = v_uid;
  insert into public.point_ledger (user_id, amount, reason, provider_event_id)
  values (v_uid, v_bonus, 'Bonus zilnic · ziua ' || v_streak, 'daily:' || v_uid || ':' || v_today);

  perform public.award_badges(v_uid);
  return json_build_object('points', v_bonus, 'streak', v_streak);
end;
$$;

-- ============ MAGAZIN ============
create or replace function public.redeem_reward(p_reward_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_r public.rewards%rowtype;
  v_balance bigint; v_id uuid;
begin
  if v_uid is null then raise exception 'Trebuie să fii conectat.'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  select * into v_r from public.rewards where id = p_reward_id and active for update;
  if not found then raise exception 'Recompensa nu este disponibilă.'; end if;
  if (v_r.stock is not null and v_r.stock <= 0) then raise exception 'Stoc epuizat.'; end if;
  if v_r.kind = 'frame' and exists (select 1 from public.redemptions where user_id = v_uid and reward_id = v_r.id and status <> 'rejected') then
    raise exception 'Deții deja această ramă.';
  end if;
  select coalesce(sum(amount), 0) into v_balance from public.point_ledger where user_id = v_uid;
  if v_balance < v_r.cost then raise exception 'Sold insuficient.'; end if;

  insert into public.redemptions (user_id, reward_id, reward_title, cost)
  values (v_uid, v_r.id, v_r.title, v_r.cost) returning id into v_id;
  insert into public.point_ledger (user_id, amount, reason, provider_event_id)
  values (v_uid, -v_r.cost, 'Recompensă: ' || v_r.title, 'redeem:' || v_id);
  if v_r.stock is not null then update public.rewards set stock = stock - 1 where id = v_r.id; end if;

  perform public.award_badges(v_uid);
  return v_id;
end;
$$;

create or replace function public.admin_update_redemption(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_red public.redemptions%rowtype;
begin
  if not public.is_admin() then raise exception 'Doar administratorii.'; end if;
  if p_status not in ('fulfilled','rejected') then raise exception 'Status invalid.'; end if;
  select * into v_red from public.redemptions where id = p_id for update;
  if not found or v_red.status <> 'pending' then raise exception 'Cererea nu mai este în așteptare.'; end if;
  update public.redemptions set status = p_status where id = p_id;
  if p_status = 'rejected' then
    insert into public.point_ledger (user_id, amount, reason, provider_event_id)
    values (v_red.user_id, v_red.cost, 'Rambursare: ' || v_red.reward_title, 'refund:' || p_id);
    if v_red.reward_id is not null then
      update public.rewards set stock = stock + 1 where id = v_red.reward_id and stock is not null;
    end if;
  end if;
end;
$$;

create or replace function public.admin_list_redemptions()
returns table (id uuid, display_name text, reward_title text, cost int, status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, coalesce(p.display_name, 'Utilizator'), r.reward_title, r.cost, r.status, r.created_at
  from public.redemptions r left join public.profiles p on p.id = r.user_id
  where public.is_admin()
  order by (r.status = 'pending') desc, r.created_at desc
  limit 100;
$$;

-- ============ CLASAMENT ============
alter table public.profiles add column if not exists avatar_frame text;
drop function if exists public.get_leaderboard(text);
create or replace function public.get_leaderboard(p_period text default 'all')
returns table (rank bigint, display_name text, points bigint, is_me boolean, avatar_frame text)
language sql stable security definer set search_path = '' as $$
  select row_number() over (order by sum(l.amount) desc),
         coalesce(p.display_name, 'Utilizator'),
         sum(l.amount)::bigint,
         l.user_id = auth.uid(),
         p.avatar_frame
  from public.point_ledger l join public.profiles p on p.id = l.user_id
  where l.amount > 0 and (p_period = 'all' or l.created_at >= date_trunc(case when p_period = 'month' then 'month' else 'week' end, now()))
    and coalesce(l.provider_event_id, '') not like 'season:%'
  group by l.user_id, p.display_name, p.avatar_frame
  order by 3 desc
  limit 20;
$$;

revoke execute on function public.start_activity(uuid), public.complete_activity(uuid), public.claim_daily(),
  public.redeem_reward(uuid), public.admin_update_redemption(uuid, text), public.admin_list_redemptions(),
  public.get_leaderboard(text) from public, anon;
grant execute on function public.start_activity(uuid), public.complete_activity(uuid), public.claim_daily(),
  public.redeem_reward(uuid), public.admin_update_redemption(uuid, text), public.admin_list_redemptions(),
  public.get_leaderboard(text) to authenticated;

-- ============ DATE DEMO (doar dacă tabelele sunt goale) ============
insert into public.rewards (title, description, cost, stock)
select * from (values
  ('Avatar exclusiv', 'Ramă specială pentru profilul tău.', 300, null::int),
  ('Titlu „Pionier”', 'Afișat lângă numele tău în clasament.', 750, null::int),
  ('Bilet de tombolă', 'O intrare în extragerea lunară demo.', 1500, 50)
) v where not exists (select 1 from public.rewards);

-- ============ RAME AVATAR (din magazin) ============
alter table public.rewards add column if not exists kind text not null default 'other';
alter table public.rewards add column if not exists meta text;
update public.rewards set kind = 'frame', meta = 'lime', title = 'Ramă Lime' where title = 'Avatar exclusiv' and kind = 'other';
insert into public.rewards (title, description, cost, kind, meta)
select * from (values
  ('Ramă Lime', 'Ramă verde-lime pentru avatarul tău.', 300, 'frame', 'lime'),
  ('Ramă Coral', 'Ramă coral pentru avatarul tău.', 600, 'frame', 'coral'),
  ('Ramă Aurie', 'Ramă aurie, pentru cei mai fideli.', 1200, 'frame', 'gold')
) v(title, description, cost, kind, meta)
where not exists (select 1 from public.rewards r where r.kind = 'frame' and r.meta = v.meta);

create or replace function public.set_avatar_frame(p_frame text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Trebuie să fii conectat.'; end if;
  if p_frame is not null and not exists (
    select 1 from public.redemptions d join public.rewards r on r.id = d.reward_id
    where d.user_id = v_uid and d.status <> 'rejected' and r.kind = 'frame' and r.meta = p_frame
  ) then raise exception 'Nu deții această ramă. Revendic-o din magazin.'; end if;
  update public.profiles set avatar_frame = p_frame where id = v_uid;
end;
$$;

-- ============ PROVOCĂRI SĂPTĂMÂNALE ============
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  metric text not null check (metric in ('activities','daily','earned')),
  target integer not null check (target > 0),
  reward integer not null check (reward > 0),
  active boolean not null default true,
  sort integer not null default 0
);
alter table public.challenges enable row level security;
drop policy if exists "Read challenges" on public.challenges;
drop policy if exists "Admins manage challenges" on public.challenges;
create policy "Read challenges" on public.challenges for select to authenticated using (active or public.is_admin());
create policy "Admins manage challenges" on public.challenges for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.challenges (title, description, metric, target, reward, sort)
select * from (values
  ('Maratonul săptămânii', 'Finalizează 5 activități săptămâna aceasta.', 'activities', 5, 150, 1),
  ('Prezent 5 zile', 'Revendică bonusul zilnic în 5 zile diferite.', 'daily', 5, 100, 2),
  ('Colecționarul', 'Câștigă 500 VP săptămâna aceasta.', 'earned', 500, 120, 3)
) v where not exists (select 1 from public.challenges);

create or replace function public.challenge_progress(p_uid uuid, p_metric text, p_since timestamptz)
returns bigint language sql stable security definer set search_path = '' as $$
  select case p_metric
    when 'activities' then (select count(*) from public.point_ledger where user_id = p_uid and created_at >= p_since and provider_event_id like 'activity:%')
    when 'daily' then (select count(*) from public.point_ledger where user_id = p_uid and created_at >= p_since and provider_event_id like 'daily:%')
    else (select coalesce(sum(amount), 0) from public.point_ledger where user_id = p_uid and created_at >= p_since and amount > 0 and coalesce(provider_event_id, '') not like 'challenge:%')
  end;
$$;
revoke execute on function public.challenge_progress(uuid, text, timestamptz) from public, anon, authenticated;

create or replace function public.get_challenges()
returns table (id uuid, title text, description text, target int, reward int, progress bigint, claimed boolean, week_end timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, c.description, c.target, c.reward,
         public.challenge_progress(auth.uid(), c.metric, date_trunc('week', now())),
         exists (select 1 from public.point_ledger l where l.provider_event_id =
           'challenge:' || c.id || ':' || auth.uid() || ':' || date_trunc('week', now())::date),
         date_trunc('week', now()) + interval '7 days'
  from public.challenges c where c.active and auth.uid() is not null order by c.sort;
$$;

create or replace function public.claim_challenge(p_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_week timestamptz := date_trunc('week', now());
  v_rows int;
begin
  if v_uid is null then raise exception 'Trebuie să fii conectat.'; end if;
  select * into v_c from public.challenges where id = p_id and active;
  if not found then raise exception 'Provocarea nu este disponibilă.'; end if;
  if public.challenge_progress(v_uid, v_c.metric, v_week) < v_c.target then raise exception 'Provocarea nu este încă finalizată.'; end if;
  insert into public.point_ledger (user_id, amount, reason, provider_event_id)
  values (v_uid, v_c.reward, 'Provocare: ' || v_c.title, 'challenge:' || v_c.id || ':' || v_uid || ':' || v_week::date)
  on conflict (provider_event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'Ai revendicat deja această provocare săptămâna asta.'; end if;
  perform public.award_badges(v_uid);
  return v_c.reward;
end;
$$;

revoke execute on function public.set_avatar_frame(text), public.get_challenges(), public.claim_challenge(uuid), public.get_leaderboard(text) from public, anon;
grant execute on function public.set_avatar_frame(text), public.get_challenges(), public.claim_challenge(uuid), public.get_leaderboard(text) to authenticated;

-- Ca să devii administrator, rulează (cu emailul tău):
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'emailul@tau.ro');

-- ============ v4: INSIGNE NOI ============
insert into public.badges (code, name, description, icon, sort) values
  ('recruiter', 'Recrutor', '3 prieteni invitați care au finalizat o activitate.', '✚', 10),
  ('season_gold', 'Campion de sezon', 'Locul 1 într-un sezon lunar.', '♛', 11),
  ('season_silver', 'Vicecampion', 'Locul 2 într-un sezon lunar.', '♜', 12),
  ('season_bronze', 'Podium', 'Locul 3 într-un sezon lunar.', '♞', 13)
on conflict (code) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, sort = excluded.sort;

create or replace function public.award_badges(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_watch int; v_earned bigint; v_streak int; v_redeem int; v_ref int;
begin
  select count(*) into v_watch from public.point_ledger where user_id = p_user and provider_event_id like 'activity:%';
  select coalesce(sum(amount), 0) into v_earned from public.point_ledger where user_id = p_user and amount > 0;
  select coalesce(longest_streak, 0) into v_streak from public.profiles where id = p_user;
  select count(*) into v_redeem from public.redemptions where user_id = p_user and status <> 'rejected';
  select count(*) into v_ref from public.point_ledger where user_id = p_user and provider_event_id like 'referral:%:ref';

  insert into public.user_badges (user_id, badge_code)
  select p_user, v.code from (values
    ('first_watch', v_watch >= 1), ('watch_5', v_watch >= 5), ('watch_25', v_watch >= 25),
    ('streak_3', v_streak >= 3), ('streak_7', v_streak >= 7), ('streak_30', v_streak >= 30),
    ('vp_1000', v_earned >= 1000), ('vp_5000', v_earned >= 5000), ('first_redeem', v_redeem >= 1),
    ('recruiter', v_ref >= 3)
  ) as v(code, ok) where v.ok
  on conflict do nothing;
end;
$$;
revoke execute on function public.award_badges(uuid) from public, anon, authenticated;

-- ============ v4: PROGRAM REFERRAL ============
alter table public.profiles add column if not exists referral_code text generated always as (upper(substr(md5(id::text), 1, 8))) stored;
alter table public.profiles add column if not exists referred_by uuid references auth.users(id) on delete set null;
create unique index if not exists profiles_referral_code_idx on public.profiles(referral_code);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ref uuid;
begin
  select p.id into v_ref from public.profiles p
  where p.referral_code = upper(nullif(trim(new.raw_user_meta_data ->> 'ref'), ''));
  insert into public.profiles (id, display_name, referred_by)
  values (new.id, new.raw_user_meta_data ->> 'display_name', v_ref)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Bonusul se acordă ambilor doar după PRIMA activitate a celui invitat (anti-conturi false).
create or replace function public.reward_referral(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ref uuid; v_rows int;
begin
  select referred_by into v_ref from public.profiles where id = p_uid;
  if v_ref is null or v_ref = p_uid then return; end if;
  insert into public.point_ledger (user_id, amount, reason, provider_event_id)
  values (p_uid, 100, 'Bonus invitație: bun venit!', 'referral:' || p_uid || ':new')
  on conflict (provider_event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return; end if;
  insert into public.point_ledger (user_id, amount, reason, provider_event_id)
  values (v_ref, 100, 'Bonus invitație: un prieten s-a alăturat', 'referral:' || p_uid || ':ref')
  on conflict (provider_event_id) do nothing;
  perform public.award_badges(v_ref);
end;
$$;
revoke execute on function public.reward_referral(uuid) from public, anon, authenticated;

create or replace function public.get_referral_stats()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'code', (select referral_code from public.profiles where id = auth.uid()),
    'invited', (select count(*) from public.profiles where referred_by = auth.uid()),
    'rewarded', (select count(*) from public.point_ledger where user_id = auth.uid() and provider_event_id like 'referral:%:ref')
  );
$$;

-- ============ v4: SEZOANE LUNARE ============
create table if not exists public.season_awards (
  season date not null,
  rank integer not null check (rank between 1 and 3),
  user_id uuid not null references auth.users(id) on delete cascade,
  points bigint not null,
  primary key (season, rank)
);
alter table public.season_awards enable row level security;
revoke all on public.season_awards from anon, authenticated;

-- Închide sezonul lunii trecute (idempotent; e apelată automat de dashboard).
create or replace function public.finalize_seasons()
returns void language plpgsql security definer set search_path = '' as $$
declare v_season timestamptz := date_trunc('month', now()) - interval '1 month';
begin
  if exists (select 1 from public.season_awards where season = v_season::date) then return; end if;
  perform pg_advisory_xact_lock(hashtext('vurqelio_season'));
  if exists (select 1 from public.season_awards where season = v_season::date) then return; end if;

  insert into public.season_awards (season, rank, user_id, points)
  select v_season::date, t.rk, t.user_id, t.pts from (
    select user_id, sum(amount) as pts, row_number() over (order by sum(amount) desc, min(created_at)) as rk
    from public.point_ledger
    where amount > 0 and created_at >= v_season and created_at < v_season + interval '1 month'
      and coalesce(provider_event_id, '') not like 'season:%'
    group by user_id
  ) t where t.rk <= 3;

  insert into public.point_ledger (user_id, amount, reason, provider_event_id)
  select user_id, case rank when 1 then 500 when 2 then 300 else 150 end,
         'Sezon ' || to_char(season, 'MM.YYYY') || ' · locul ' || rank, 'season:' || season || ':' || rank
  from public.season_awards where season = v_season::date
  on conflict (provider_event_id) do nothing;

  insert into public.user_badges (user_id, badge_code)
  select user_id, case rank when 1 then 'season_gold' when 2 then 'season_silver' else 'season_bronze' end
  from public.season_awards where season = v_season::date
  on conflict do nothing;
end;
$$;

create or replace function public.get_season_winners()
returns table (season date, rank int, display_name text, avatar_frame text, points bigint, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select s.season, s.rank, coalesce(p.display_name, 'Utilizator'), p.avatar_frame, s.points, s.user_id = auth.uid()
  from public.season_awards s left join public.profiles p on p.id = s.user_id
  where s.season >= (date_trunc('month', now()) - interval '6 months')::date
  order by s.season desc, s.rank;
$$;

revoke execute on function public.get_referral_stats(), public.finalize_seasons(), public.get_season_winners() from public, anon;
grant execute on function public.get_referral_stats(), public.finalize_seasons(), public.get_season_winners() to authenticated;

-- ============ v5: REELS, RECLAME, OFERTE, CAMPANII ============
alter table public.activities add column if not exists kind text not null default 'video';
alter table public.activities add column if not exists campaign_id uuid;
alter table public.activities drop constraint if exists activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in ('video','reel'));

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  email text not null,
  video_url text not null,
  kind text not null default 'reel' check (kind in ('video','reel')),
  package text not null,
  views_target integer not null,
  expected_cents integer not null,
  paid_cents integer,
  stripe_session text,
  status text not null default 'pending_payment' check (status in ('pending_payment','paid','approved','rejected','completed')),
  activity_id uuid references public.activities(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.campaigns enable row level security;
drop policy if exists "Admins manage campaigns" on public.campaigns;
create policy "Admins manage campaigns" on public.campaigns for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.campaigns from anon;

-- Pachetele sunt definite DOAR pe server (prețurile nu vin din browser).
create or replace function public.create_campaign(p_company text, p_email text, p_video_url text, p_kind text, p_package text, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_views int; v_cents int;
begin
  select v.views, v.cents into v_views, v_cents from (values
    ('starter', 1000, 4900), ('growth', 5000, 19900), ('pro', 20000, 59900)
  ) v(code, views, cents) where v.code = p_package;
  if v_views is null then raise exception 'Pachet invalid.'; end if;
  if char_length(coalesce(trim(p_company), '')) < 2 or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Date de contact invalide.'; end if;
  if p_video_url !~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be|tiktok\.com)/' then raise exception 'Link video invalid (YouTube sau TikTok).'; end if;
  if (select count(*) from public.campaigns where email = p_email and created_at > now() - interval '1 hour') >= 5 then raise exception 'Prea multe cereri. Încearcă mai târziu.'; end if;
  insert into public.campaigns (company, email, video_url, kind, package, views_target, expected_cents, notes)
  values (trim(p_company), lower(trim(p_email)), trim(p_video_url), coalesce(p_kind, 'reel'), p_package, v_views, v_cents, left(p_notes, 500))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_mark_campaign_paid(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Doar administratorii.'; end if;
  update public.campaigns set status = 'paid', paid_cents = expected_cents where id = p_id and status = 'pending_payment';
end;
$$;

create or replace function public.admin_approve_campaign(p_id uuid, p_points int, p_duration int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_c public.campaigns%rowtype; v_act uuid;
begin
  if not public.is_admin() then raise exception 'Doar administratorii.'; end if;
  select * into v_c from public.campaigns where id = p_id for update;
  if not found or v_c.status <> 'paid' then raise exception 'Campania trebuie să fie plătită înainte de aprobare.'; end if;
  insert into public.activities (title, description, points, status, provider, video_url, duration_seconds, kind, campaign_id)
  values ('Sponsorizat: ' || v_c.company, coalesce(v_c.notes, ''), greatest(p_points, 1), 'active', v_c.company || ' · sponsorizat',
          v_c.video_url, greatest(p_duration, 10), v_c.kind, v_c.id)
  returning id into v_act;
  update public.campaigns set status = 'approved', activity_id = v_act where id = p_id;
  return v_act;
end;
$$;

-- complete_activity: + referral + oprire automată campanie la atingerea țintei
create or replace function public.complete_activity(p_session_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_s public.activity_sessions%rowtype;
  v_a public.activities%rowtype;
  v_rows int;
begin
  if v_uid is null then raise exception 'Trebuie să fii conectat.'; end if;
  select * into v_s from public.activity_sessions where id = p_session_id and user_id = v_uid for update;
  if not found then raise exception 'Sesiune invalidă.'; end if;
  if v_s.completed_at is not null then raise exception 'Sesiunea a fost deja folosită.'; end if;
  select * into v_a from public.activities where id = v_s.activity_id and status = 'active';
  if not found then raise exception 'Activitatea nu mai este disponibilă.'; end if;
  if now() - v_s.started_at < make_interval(secs => greatest(v_a.duration_seconds - 3, 5)) then
    raise exception 'Videoclipul nu a fost urmărit complet.';
  end if;

  update public.activity_sessions set completed_at = now() where id = v_s.id;
  insert into public.point_ledger (user_id, activity_id, amount, reason, provider_event_id)
  values (v_uid, v_a.id, v_a.points, case v_a.kind when 'reel' then 'Reel: ' else 'Activitate: ' end || v_a.title, 'activity:' || v_a.id || ':' || v_uid)
  on conflict (provider_event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'Ai finalizat deja această activitate.'; end if;

  if v_a.campaign_id is not null and (select count(*) from public.point_ledger where activity_id = v_a.id and provider_event_id like 'activity:%')
     >= (select views_target from public.campaigns where id = v_a.campaign_id) then
    update public.activities set status = 'paused' where id = v_a.id;
    update public.campaigns set status = 'completed' where id = v_a.campaign_id;
  end if;

  perform public.reward_referral(v_uid);
  perform public.award_badges(v_uid);
  return v_a.points;
end;
$$;

-- Reclame cu recompensă (Google Ad Manager): max 10/zi, minim 60s între ele.
create or replace function public.claim_ad_reward()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_last timestamptz; v_today int;
begin
  if v_uid is null then raise exception 'Trebuie să fii conectat.'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  select max(created_at), count(*) filter (where created_at >= date_trunc('day', now()))
    into v_last, v_today from public.point_ledger where user_id = v_uid and provider_event_id like 'ad:%';
  if v_today >= 10 then raise exception 'Ai atins limita de 10 reclame pe zi.'; end if;
  if v_last > now() - interval '60 seconds' then raise exception 'Așteaptă un minut între reclame.'; end if;
  insert into public.point_ledger (user_id, amount, reason, provider_event_id)
  values (v_uid, 5, 'Reclamă cu recompensă', 'ad:' || v_uid || ':' || gen_random_uuid());
  return 5;
end;
$$;

-- Oferte (offerwall) — apelată DOAR de Edge Function cu service_role.
create or replace function public.grant_offer_points(p_user uuid, p_provider text, p_tx text, p_points int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'Utilizator inexistent.'; end if;
  insert into public.point_ledger (user_id, amount, reason, provider_event_id)
  values (p_user, p_points, left(case when p_points < 0 then 'Anulare ofertă: ' else 'Ofertă: ' end || coalesce(p_reason, p_provider), 200),
          'offer:' || p_provider || ':' || p_tx || case when p_points < 0 then ':rev' else '' end)
  on conflict (provider_event_id) do nothing;
  if p_points > 0 then perform public.award_badges(p_user); end if;
end;
$$;

revoke execute on function public.grant_offer_points(uuid, text, text, int, text) from public, anon, authenticated;
grant execute on function public.grant_offer_points(uuid, text, text, int, text) to service_role;
revoke execute on function public.create_campaign(text, text, text, text, text, text), public.admin_mark_campaign_paid(uuid),
  public.admin_approve_campaign(uuid, int, int), public.claim_ad_reward(), public.complete_activity(uuid) from public;
grant execute on function public.create_campaign(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_mark_campaign_paid(uuid), public.admin_approve_campaign(uuid, int, int),
  public.claim_ad_reward(), public.complete_activity(uuid) to authenticated;

-- ============ v6: LIKE-URI REELS ============
create table if not exists public.reel_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, activity_id)
);
alter table public.reel_likes enable row level security;
drop policy if exists "Own likes read" on public.reel_likes;
drop policy if exists "Own likes insert" on public.reel_likes;
drop policy if exists "Own likes delete" on public.reel_likes;
create policy "Own likes read" on public.reel_likes for select to authenticated using (auth.uid() = user_id);
create policy "Own likes insert" on public.reel_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "Own likes delete" on public.reel_likes for delete to authenticated using (auth.uid() = user_id);
revoke update on public.reel_likes from anon, authenticated;

create or replace function public.get_reel_likes()
returns table (activity_id uuid, likes bigint, liked boolean)
language sql stable security definer set search_path = '' as $$
  select a.id, count(l.user_id), coalesce(bool_or(l.user_id = auth.uid()), false)
  from public.activities a left join public.reel_likes l on l.activity_id = a.id
  where a.kind = 'reel' and a.status = 'active' and auth.uid() is not null
  group by a.id;
$$;

-- ============ v6: SETĂRI + RETRAGERI ============
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null
);
alter table public.app_settings enable row level security;
drop policy if exists "Read settings" on public.app_settings;
drop policy if exists "Admins manage settings" on public.app_settings;
create policy "Read settings" on public.app_settings for select to authenticated using (true);
create policy "Admins manage settings" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.app_settings (key, value) values
  ('withdrawals', '{"enabled": false, "min_points": 5000, "vp_per_eur": 1000, "min_account_days": 7}')
on conflict (key) do nothing;

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null check (points > 0),
  amount_eur numeric(10,2) not null,
  method text not null check (method in ('paypal','revolut','iban')),
  destination text not null,
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  admin_note text,
  created_at timestamptz not null default now()
);
alter table public.withdrawal_requests enable row level security;
drop policy if exists "Read own withdrawals" on public.withdrawal_requests;
create policy "Read own withdrawals" on public.withdrawal_requests for select to authenticated using (auth.uid() = user_id or public.is_admin());
revoke insert, update, delete on public.withdrawal_requests from anon, authenticated;

create or replace function public.request_withdrawal(p_points int, p_method text, p_destination text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cfg jsonb := (select value from public.app_settings where key = 'withdrawals');
  v_balance bigint; v_id uuid; v_created timestamptz;
begin
  if v_uid is null then raise exception 'Trebuie să fii conectat.'; end if;
  if not coalesce((v_cfg ->> 'enabled')::boolean, false) then raise exception 'Retragerile nu sunt încă active.'; end if;
  if p_method not in ('paypal','revolut','iban') then raise exception 'Metodă invalidă.'; end if;
  if char_length(coalesce(trim(p_destination), '')) < 5 then raise exception 'Completează corect datele de plată.'; end if;
  if p_points < (v_cfg ->> 'min_points')::int then raise exception 'Minimul pentru retragere este % VP.', v_cfg ->> 'min_points'; end if;
  select created_at into v_created from auth.users where id = v_uid;
  if v_created > now() - make_interval(days => (v_cfg ->> 'min_account_days')::int) then
    raise exception 'Contul trebuie să aibă cel puțin % zile.', v_cfg ->> 'min_account_days';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  if exists (select 1 from public.withdrawal_requests where user_id = v_uid and status = 'pending') then
    raise exception 'Ai deja o cerere în așteptare.';
  end if;
  select coalesce(sum(amount), 0) into v_balance from public.point_ledger where user_id = v_uid;
  if v_balance < p_points then raise exception 'Sold insuficient.'; end if;

  insert into public.withdrawal_requests (user_id, points, amount_eur, method, destination)
  values (v_uid, p_points, round(p_points::numeric / (v_cfg ->> 'vp_per_eur')::numeric, 2), p_method, left(trim(p_destination), 120))
  returning id into v_id;
  insert into public.point_ledger (user_id, amount, reason, provider_event_id)
  values (v_uid, -p_points, 'Cerere de retragere', 'withdraw:' || v_id);
  return v_id;
end;
$$;

create or replace function public.admin_update_withdrawal(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_w public.withdrawal_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Doar administratorii.'; end if;
  if p_status not in ('paid','rejected') then raise exception 'Status invalid.'; end if;
  select * into v_w from public.withdrawal_requests where id = p_id for update;
  if not found or v_w.status <> 'pending' then raise exception 'Cererea nu mai este în așteptare.'; end if;
  update public.withdrawal_requests set status = p_status, admin_note = p_note where id = p_id;
  if p_status = 'rejected' then
    insert into public.point_ledger (user_id, amount, reason, provider_event_id)
    values (v_w.user_id, v_w.points, 'Retragere respinsă (rambursare)', 'withdraw-refund:' || p_id);
  end if;
end;
$$;

create or replace function public.admin_list_withdrawals()
returns table (id uuid, display_name text, email text, points int, amount_eur numeric, method text, destination text, status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id, coalesce(p.display_name, 'Utilizator'), u.email::text, w.points, w.amount_eur, w.method, w.destination, w.status, w.created_at
  from public.withdrawal_requests w
  left join public.profiles p on p.id = w.user_id
  left join auth.users u on u.id = w.user_id
  where public.is_admin()
  order by (w.status = 'pending') desc, w.created_at desc limit 100;
$$;

-- ============ v6: STATISTICI CAMPANII (link privat) ============
alter table public.campaigns add column if not exists stats_token text not null
  default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

drop function if exists public.create_campaign(text, text, text, text, text, text);
create or replace function public.create_campaign(p_company text, p_email text, p_video_url text, p_kind text, p_package text, p_notes text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_token text; v_views int; v_cents int;
begin
  select v.views, v.cents into v_views, v_cents from (values
    ('starter', 1000, 4900), ('growth', 5000, 19900), ('pro', 20000, 59900)
  ) v(code, views, cents) where v.code = p_package;
  if v_views is null then raise exception 'Pachet invalid.'; end if;
  if char_length(coalesce(trim(p_company), '')) < 2 or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Date de contact invalide.'; end if;
  if p_video_url !~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be|tiktok\.com)/' then raise exception 'Link video invalid (YouTube sau TikTok).'; end if;
  if (select count(*) from public.campaigns where email = lower(trim(p_email)) and created_at > now() - interval '1 hour') >= 5 then raise exception 'Prea multe cereri. Încearcă mai târziu.'; end if;
  insert into public.campaigns (company, email, video_url, kind, package, views_target, expected_cents, notes)
  values (trim(p_company), lower(trim(p_email)), trim(p_video_url), coalesce(p_kind, 'reel'), p_package, v_views, v_cents, left(p_notes, 500))
  returning id, stats_token into v_id, v_token;
  return json_build_object('id', v_id, 'token', v_token);
end;
$$;

create or replace function public.get_campaign_stats(p_id uuid, p_token text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'company', c.company, 'package', c.package, 'status', c.status, 'kind', c.kind,
    'video_url', c.video_url, 'views_target', c.views_target, 'created_at', c.created_at,
    'views', (select count(*) from public.point_ledger l where l.activity_id = c.activity_id and l.provider_event_id like 'activity:%'),
    'likes', (select count(*) from public.reel_likes r where r.activity_id = c.activity_id),
    'daily', coalesce((select json_agg(json_build_object('day', d.day, 'views', d.n) order by d.day) from (
        select date_trunc('day', l.created_at)::date as day, count(*) as n from public.point_ledger l
        where l.activity_id = c.activity_id and l.provider_event_id like 'activity:%' and l.created_at > now() - interval '14 days'
        group by 1) d), '[]'::json)
  ) from public.campaigns c where c.id = p_id and c.stats_token = p_token;
$$;

revoke execute on function public.get_reel_likes(), public.request_withdrawal(int, text, text), public.admin_update_withdrawal(uuid, text, text),
  public.admin_list_withdrawals(), public.create_campaign(text, text, text, text, text, text), public.get_campaign_stats(uuid, text) from public;
grant execute on function public.get_reel_likes(), public.request_withdrawal(int, text, text), public.admin_update_withdrawal(uuid, text, text),
  public.admin_list_withdrawals() to authenticated;
grant execute on function public.create_campaign(text, text, text, text, text, text), public.get_campaign_stats(uuid, text) to anon, authenticated;

-- ============ v7: COMENTARII REELS ============
create table if not exists public.reel_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists reel_comments_act_idx on public.reel_comments(activity_id, created_at desc);
alter table public.reel_comments enable row level security;
revoke all on public.reel_comments from anon, authenticated;

drop function if exists public.get_reel_likes();
create or replace function public.get_reel_likes()
returns table (activity_id uuid, likes bigint, liked boolean, comments bigint)
language sql stable security definer set search_path = '' as $$
  select a.id,
         (select count(*) from public.reel_likes l where l.activity_id = a.id),
         exists (select 1 from public.reel_likes l where l.activity_id = a.id and l.user_id = auth.uid()),
         (select count(*) from public.reel_comments c where c.activity_id = a.id)
  from public.activities a
  where a.kind = 'reel' and a.status = 'active' and auth.uid() is not null;
$$;

create or replace function public.get_comments(p_activity_id uuid)
returns table (id uuid, display_name text, avatar_frame text, body text, created_at timestamptz, is_mine boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, coalesce(p.display_name, 'Utilizator'), p.avatar_frame, c.body, c.created_at,
         c.user_id = auth.uid() or public.is_admin()
  from public.reel_comments c left join public.profiles p on p.id = c.user_id
  where c.activity_id = p_activity_id and auth.uid() is not null
  order by c.created_at desc limit 50;
$$;

create or replace function public.add_comment(p_activity_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_body text := trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')); v_id uuid;
begin
  if v_uid is null then raise exception 'Trebuie să fii conectat.'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 200 then raise exception 'Comentariul trebuie să aibă 1–200 de caractere.'; end if;
  if v_body ~* '(https?://|www\.|\.com\b|\.ro\b)' then raise exception 'Linkurile nu sunt permise în comentarii.'; end if;
  if not exists (select 1 from public.activities where id = p_activity_id and status = 'active' and kind = 'reel') then raise exception 'Reel indisponibil.'; end if;
  if exists (select 1 from public.reel_comments where user_id = v_uid and created_at > now() - interval '10 seconds') then
    raise exception 'Așteaptă câteva secunde între comentarii.';
  end if;
  if (select count(*) from public.reel_comments where user_id = v_uid and created_at > now() - interval '1 day') >= 50 then
    raise exception 'Ai atins limita de comentarii pe azi.';
  end if;
  insert into public.reel_comments (user_id, activity_id, body) values (v_uid, p_activity_id, v_body) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_comment(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.reel_comments where id = p_id and (user_id = auth.uid() or public.is_admin());
  if not found then raise exception 'Nu poți șterge acest comentariu.'; end if;
end;
$$;

-- ============ v7: VERIFICARE TELEFON LA RETRAGERI ============
create or replace function public.phone_verified()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select phone_confirmed_at is not null and coalesce(phone, '') <> '' from auth.users where id = auth.uid()), false);
$$;

create or replace function public.guard_withdrawal_phone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id = new.user_id and phone_confirmed_at is not null and coalesce(phone, '') <> '') then
    raise exception 'Verifică-ți numărul de telefon înainte de retragere.';
  end if;
  return new;
end;
$$;
drop trigger if exists withdrawal_phone_guard on public.withdrawal_requests;
create trigger withdrawal_phone_guard before insert on public.withdrawal_requests
  for each row execute procedure public.guard_withdrawal_phone();

-- ============ v7: RAPORT LUNAR ============
create table if not exists public.revenue_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('ad_manager','adsense','offerwall','campaign','other')),
  amount_cents integer not null,
  currency text not null default 'eur',
  note text,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);
create unique index if not exists revenue_offer_unique on public.revenue_events(note) where source = 'offerwall';
alter table public.revenue_events enable row level security;
drop policy if exists "Admins manage revenue" on public.revenue_events;
create policy "Admins manage revenue" on public.revenue_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Venitul din offerwall (dacă furnizorul trimite payout) e înregistrat de Edge Function.
create or replace function public.record_offer_revenue(p_cents int, p_note text)
returns void language sql security definer set search_path = '' as $$
  insert into public.revenue_events (source, amount_cents, note) values ('offerwall', p_cents, left(p_note, 120)) on conflict do nothing;
$$;
revoke execute on function public.record_offer_revenue(int, text) from public, anon, authenticated;
grant execute on function public.record_offer_revenue(int, text) to service_role;

create or replace function public.admin_monthly_report(p_month date)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz := date_trunc('month', p_month::timestamptz);
  v_to timestamptz := date_trunc('month', p_month::timestamptz) + interval '1 month';
  v json;
begin
  if not public.is_admin() then raise exception 'Doar administratorii.'; end if;
  select json_build_object(
    'revenue', (select coalesce(json_object_agg(source, cents), '{}'::json) from (
        select source, sum(amount_cents) as cents from public.revenue_events
        where occurred_on >= v_from::date and occurred_on < v_to::date group by source) r),
    'campaigns_cents', (select coalesce(sum(paid_cents), 0) from public.campaigns
        where status in ('paid','approved','completed') and created_at >= v_from and created_at < v_to),
    'campaigns_count', (select count(*) from public.campaigns
        where status in ('paid','approved','completed') and created_at >= v_from and created_at < v_to),
    'campaigns_pending', (select count(*) from public.campaigns where status = 'pending_payment' and created_at >= v_from and created_at < v_to),
    'vp_issued', (select coalesce(json_object_agg(cat, pts), '{}'::json) from (
        select split_part(coalesce(provider_event_id, 'other'), ':', 1) as cat, sum(amount) as pts
        from public.point_ledger where amount > 0 and created_at >= v_from and created_at < v_to group by 1) x),
    'vp_redeemed', (select coalesce(-sum(amount), 0) from public.point_ledger
        where amount < 0 and provider_event_id like 'redeem:%' and created_at >= v_from and created_at < v_to),
    'withdrawals_paid_eur', (select coalesce(sum(amount_eur), 0) from public.withdrawal_requests where status = 'paid' and created_at >= v_from and created_at < v_to),
    'withdrawals_paid_count', (select count(*) from public.withdrawal_requests where status = 'paid' and created_at >= v_from and created_at < v_to),
    'withdrawals_pending_eur', (select coalesce(sum(amount_eur), 0) from public.withdrawal_requests where status = 'pending'),
    'new_users', (select count(*) from auth.users where created_at >= v_from and created_at < v_to),
    'active_users', (select count(distinct user_id) from public.point_ledger where created_at >= v_from and created_at < v_to),
    'completions', (select count(*) from public.point_ledger where provider_event_id like 'activity:%' and created_at >= v_from and created_at < v_to),
    'ads_watched', (select count(*) from public.point_ledger where provider_event_id like 'ad:%' and created_at >= v_from and created_at < v_to),
    'comments', (select count(*) from public.reel_comments where created_at >= v_from and created_at < v_to)
  ) into v;
  return v;
end;
$$;

revoke execute on function public.get_reel_likes(), public.get_comments(uuid), public.add_comment(uuid, text), public.delete_comment(uuid),
  public.phone_verified(), public.admin_monthly_report(date) from public, anon;
grant execute on function public.get_reel_likes(), public.get_comments(uuid), public.add_comment(uuid, text), public.delete_comment(uuid),
  public.phone_verified(), public.admin_monthly_report(date) to authenticated;
