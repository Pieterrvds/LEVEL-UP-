-- =========================================================
-- LEVEL-UP database for Supabase
-- Run this whole file once in Supabase: SQL Editor → New query → paste → Run.
-- It is safe to run again after an update (it only creates or replaces).
--
-- Security model
-- * Players read only their own rows; admins (emails in app_config) read everything.
-- * Nobody writes to the tables directly. All changes go through the functions
--   below, which check the rules and award XP on the server.
-- =========================================================

create extension if not exists pgcrypto;

-- Fetching the public Google Calendar needs the http extension
do $$
begin
  create extension if not exists http with schema extensions;
exception when others then
  raise notice 'http extension not available: the schedule will use the fallback hours';
end $$;

-- ---------------------------------------------------------
-- Settings
-- ---------------------------------------------------------
create table if not exists public.app_config (
  key text primary key,
  value text not null
);

insert into public.app_config (key, value) values
  ('admin_emails', 'pieterv-d-s@hotmail.com'),
  ('calendar_ics_url', 'https://calendar.google.com/calendar/ical/53bf8048ea28f4795aa89c52f00b8733569f2ee2e4ec97104dfed265a6559182%40group.calendar.google.com/public/basic.ics'),
  ('session_xp', '75'),
  ('booking_notice_hours', '12'),
  ('booking_weeks_ahead', '4')
on conflict (key) do nothing;

create or replace function public._config(p_key text)
returns text language sql stable security definer set search_path = public as $$
  select value from public.app_config where key = p_key;
$$;

-- ---------------------------------------------------------
-- Tables
-- ---------------------------------------------------------
create table if not exists public.trainers (
  id text primary key,
  name text not null,
  active boolean not null default true
);

insert into public.trainers (id, name) values
  ('pieter', 'Pieter'),
  ('filip', 'Filip De Meyst'),
  ('maxim', 'Maxim Buyl')
on conflict (id) do nothing;

create table if not exists public.shop_items (
  id text primary key,
  name text not null,
  price numeric(10, 2) not null
);

insert into public.shop_items (id, name, price) values
  ('tshirt', 'LEVEL-UP T-shirt', 25),
  ('hoodie', 'LEVEL-UP Hoodie', 45),
  ('parallettes', 'LEVEL-UP Parallettes', 40),
  ('bands', 'LEVEL-UP Resistance Bands', 25)
on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  xp integer not null default 0,
  sessions_booked integer not null default 0,
  inventory jsonb not null default '{}'::jsonb,
  achievements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_login timestamptz not null default now()
);

create table if not exists public.xp_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists xp_log_user_idx on public.xp_log (user_id, created_at desc);

create table if not exists public.workouts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  type text not null,
  minutes integer not null,
  xp integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_idx on public.workouts (user_id, day);

create table if not exists public.body_stats (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  weight numeric(5, 1) not null,
  height numeric(5, 1) not null,
  age integer not null,
  sex text not null,
  goal text not null,
  bmi numeric(4, 1) not null,
  bmr integer not null,
  maintenance integer not null,
  target integer not null,
  protein integer not null,
  created_at timestamptz not null default now()
);
create index if not exists body_stats_user_idx on public.body_stats (user_id, created_at desc);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  trainer_id text not null references public.trainers (id),
  day date not null,
  hour smallint not null check (hour between 0 and 23),
  note text not null default '',
  xp integer not null default 0,
  created_at timestamptz not null default now(),
  unique (trainer_id, day, hour),
  unique (user_id, day, hour)
);

create table if not exists public.orders (
  id text primary key,
  user_id uuid references public.profiles (id) on delete set null,
  items jsonb not null,
  total numeric(10, 2) not null,
  xp integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_cache (
  id integer primary key default 1 check (id = 1),
  ics text,
  fetched_at timestamptz
);

-- ---------------------------------------------------------
-- Row level security: read your own rows, admins read all
-- ---------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') = any (
      string_to_array(lower(replace(public._config('admin_emails'), ' ', '')), ',')
    ),
    false
  );
$$;

alter table public.app_config enable row level security;
alter table public.trainers enable row level security;
alter table public.shop_items enable row level security;
alter table public.profiles enable row level security;
alter table public.xp_log enable row level security;
alter table public.workouts enable row level security;
alter table public.body_stats enable row level security;
alter table public.bookings enable row level security;
alter table public.orders enable row level security;
alter table public.calendar_cache enable row level security;

drop policy if exists "trainers are public" on public.trainers;
create policy "trainers are public" on public.trainers for select using (true);

drop policy if exists "shop items are public" on public.shop_items;
create policy "shop items are public" on public.shop_items for select using (true);

drop policy if exists "own profile or admin" on public.profiles;
create policy "own profile or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());

drop policy if exists "own rows or admin" on public.xp_log;
create policy "own rows or admin" on public.xp_log for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own rows or admin" on public.workouts;
create policy "own rows or admin" on public.workouts for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own rows or admin" on public.body_stats;
create policy "own rows or admin" on public.body_stats for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own rows or admin" on public.bookings;
create policy "own rows or admin" on public.bookings for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own rows or admin" on public.orders;
create policy "own rows or admin" on public.orders for select using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------
-- XP and achievements (internal helpers)
-- ---------------------------------------------------------
create or replace function public._grant_xp(p_user uuid, p_amount integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_amount = 0 then return; end if;
  update public.profiles set xp = greatest(0, xp + p_amount) where id = p_user;
  insert into public.xp_log (user_id, amount, reason) values (p_user, p_amount, p_reason);
end $$;

create or replace function public._unlock(p_user uuid, p_id text, p_xp integer, p_title text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
    set achievements = achievements || jsonb_build_object(p_id, now())
    where id = p_user and not (achievements ? p_id);
  if found then
    perform public._grant_xp(p_user, p_xp, 'Achievement: ' || p_title);
  end if;
end $$;

create or replace function public._check_achievements(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  n_workouts integer;
  owns_all boolean;
begin
  select * into p from public.profiles where id = p_user;
  if not found then return; end if;

  perform public._unlock(p_user, 'new_player', 50, 'New player');

  if exists (select 1 from public.body_stats where user_id = p_user) then
    perform public._unlock(p_user, 'stats_saved', 25, 'Know your numbers');
  end if;

  select count(*) into n_workouts from public.workouts where user_id = p_user;
  if n_workouts >= 1 then perform public._unlock(p_user, 'first_rep', 50, 'First rep'); end if;
  if n_workouts >= 10 then perform public._unlock(p_user, 'workouts_10', 150, 'Consistency'); end if;
  if n_workouts >= 50 then perform public._unlock(p_user, 'workouts_50', 500, 'Grinder'); end if;

  if p.sessions_booked >= 1 then perform public._unlock(p_user, 'first_session', 100, 'Party up'); end if;
  if p.sessions_booked >= 5 then perform public._unlock(p_user, 'sessions_5', 250, 'Regular'); end if;

  if exists (select 1 from public.orders where user_id = p_user) then
    perform public._unlock(p_user, 'first_loot', 100, 'First loot');
  end if;
  if coalesce((p.inventory ->> 'tshirt')::int, 0) > 0 and coalesce((p.inventory ->> 'hoodie')::int, 0) > 0 then
    perform public._unlock(p_user, 'full_drip', 150, 'Full drip');
  end if;
  if coalesce((p.inventory ->> 'parallettes')::int, 0) > 0 and coalesce((p.inventory ->> 'bands')::int, 0) > 0 then
    perform public._unlock(p_user, 'home_gym', 150, 'Home gym');
  end if;
  select bool_and(coalesce((p.inventory ->> s.id)::int, 0) > 0) into owns_all from public.shop_items s;
  if owns_all then perform public._unlock(p_user, 'collector', 300, 'Collector'); end if;
end $$;

-- New sign-ups get a profile automatically
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    lower(new.email),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 24)
  )
  on conflict (id) do nothing;
  perform public._check_achievements(new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- Player data in one call (shape used by the website)
-- ---------------------------------------------------------
create or replace function public._player_json(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'email', p.email,
    'xp', p.xp,
    'sessionsBooked', p.sessions_booked,
    'inventory', p.inventory,
    'achievements', p.achievements,
    'createdAt', p.created_at,
    'lastLogin', p.last_login,
    'admin', lower(p.email) = any (string_to_array(lower(replace(public._config('admin_emails'), ' ', '')), ',')),
    'xpLog', coalesce((select jsonb_agg(jsonb_build_object('date', x.created_at, 'amount', x.amount, 'reason', x.reason) order by x.id desc)
                       from (select * from public.xp_log where user_id = p.id order by id desc limit 50) x), '[]'::jsonb),
    'workouts', coalesce((select jsonb_agg(jsonb_build_object('date', w.day, 'type', w.type, 'minutes', w.minutes, 'xp', w.xp) order by w.id desc)
                          from public.workouts w where w.user_id = p.id), '[]'::jsonb),
    'bodyStats', coalesce((select jsonb_agg(jsonb_build_object('date', b.day, 'weight', b.weight, 'height', b.height, 'age', b.age,
                              'sex', b.sex, 'goal', b.goal, 'bmi', b.bmi, 'bmr', b.bmr, 'maintenance', b.maintenance,
                              'target', b.target, 'protein', b.protein) order by b.id desc)
                           from public.body_stats b where b.user_id = p.id), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'date', o.created_at, 'items', o.items, 'total', o.total) order by o.created_at desc)
                           from public.orders o where o.user_id = p.id), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'trainerId', k.trainer_id, 'date', k.day, 'hour', k.hour,
                              'note', k.note, 'xp', k.xp, 'name', p.name, 'email', p.email, 'createdAt', k.created_at) order by k.day, k.hour)
                          from public.bookings k where k.user_id = p.id), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = p_user;
$$;

create or replace function public.my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  -- profile can be missing if the account was made before this schema existed
  insert into public.profiles (id, email, name)
  select u.id, lower(u.email), left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'name'), ''), split_part(u.email, '@', 1)), 24)
  from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
  perform public._check_achievements(auth.uid());
  return public._player_json(auth.uid());
end $$;

create or replace function public.touch_login()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_login = now() where id = auth.uid();
$$;

-- ---------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------
create or replace function public._slot_start(p_day date, p_hour integer)
returns timestamptz language sql stable as $$
  select (p_day + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
$$;

create or replace function public.book_session(p_trainer text, p_day date, p_hour integer, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t public.trainers;
  v_xp integer := public._config('session_xp')::int;
  horizon date := (date_trunc('week', now() at time zone 'Europe/Brussels')::date
                   + 7 * public._config('booking_weeks_ahead')::int);
  b public.bookings;
begin
  if uid is null then raise exception 'Log in to book a session.'; end if;
  select * into t from public.trainers where id = p_trainer and active;
  if not found then raise exception 'This trainer is not available.'; end if;
  if p_hour < 0 or p_hour > 23 then raise exception 'Invalid time.'; end if;
  if public._slot_start(p_day, p_hour) <= now() then raise exception 'This time slot has already passed.'; end if;
  if public._slot_start(p_day, p_hour) < now() + make_interval(hours => public._config('booking_notice_hours')::int) then
    raise exception 'Sessions must be booked at least % hours in advance.', public._config('booking_notice_hours');
  end if;
  if p_day >= horizon then
    raise exception 'You can book up to % weeks ahead.', public._config('booking_weeks_ahead');
  end if;
  if exists (select 1 from public.bookings where trainer_id = p_trainer and day = p_day and hour = p_hour) then
    raise exception 'Someone just booked this slot. Pick another hour.';
  end if;
  if exists (select 1 from public.bookings where user_id = uid and day = p_day and hour = p_hour) then
    raise exception 'You already have a session at this time.';
  end if;

  begin
    insert into public.bookings (user_id, trainer_id, day, hour, note, xp)
    values (uid, p_trainer, p_day, p_hour, left(coalesce(p_note, ''), 300), v_xp)
    returning * into b;
  exception when unique_violation then
    raise exception 'Someone just booked this slot. Pick another hour.';
  end;

  update public.profiles set sessions_booked = sessions_booked + 1 where id = uid;
  perform public._grant_xp(uid, v_xp, 'Session with ' || split_part(t.name, ' ', 1));
  perform public._check_achievements(uid);

  return jsonb_build_object('id', b.id, 'trainerId', b.trainer_id, 'date', b.day, 'hour', b.hour, 'note', b.note, 'xp', b.xp);
end $$;

-- Players cancel their own upcoming sessions; admins can cancel any upcoming session
create or replace function public.cancel_booking(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  t public.trainers;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into b from public.bookings where id = p_id;
  if not found or (b.user_id <> auth.uid() and not public.is_admin()) then
    raise exception 'Booking not found.';
  end if;
  if public._slot_start(b.day, b.hour) <= now() then raise exception 'This session has already started.'; end if;

  select * into t from public.trainers where id = b.trainer_id;
  delete from public.bookings where id = p_id;
  update public.profiles set sessions_booked = greatest(0, sessions_booked - 1) where id = b.user_id;
  perform public._grant_xp(b.user_id, -b.xp, 'Cancelled session with ' || split_part(t.name, ' ', 1));

  return jsonb_build_object('id', b.id, 'trainerId', b.trainer_id, 'date', b.day, 'hour', b.hour, 'note', b.note,
    'name', (select name from public.profiles where id = b.user_id),
    'email', (select email from public.profiles where id = b.user_id));
end $$;

-- Which hours are taken (no names), for the public schedule
create or replace function public.slot_status(p_from date, p_to date)
returns table (trainer_id text, day date, hour smallint, booking_id uuid)
language sql stable security definer set search_path = public as $$
  select b.trainer_id, b.day, b.hour, case when b.user_id = auth.uid() then b.id end
  from public.bookings b
  where b.day between p_from and least(p_to, p_from + 70);
$$;

create or replace function public.trainer_stats()
returns table (trainer_id text, sessions bigint, clients bigint)
language sql stable security definer set search_path = public as $$
  select t.id, count(b.id), count(distinct b.user_id)
  from public.trainers t left join public.bookings b on b.trainer_id = t.id
  group by t.id;
$$;

-- ---------------------------------------------------------
-- Workouts, body stats and orders
-- ---------------------------------------------------------
create or replace function public.log_workout(p_type text, p_minutes integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Europe/Brussels')::date;
  mins integer := least(300, greatest(5, coalesce(p_minutes, 0)));
  rewarded integer;
  v_xp integer;
begin
  if uid is null then raise exception 'Log in first.'; end if;
  select count(*) into rewarded from public.workouts w where w.user_id = uid and w.day = today and w.xp > 0;
  v_xp := case when rewarded < 3 then 30 + least(30, (mins / 10) * 5) else 0 end;
  insert into public.workouts (user_id, day, type, minutes, xp) values (uid, today, left(coalesce(p_type, 'Other'), 40), mins, v_xp);
  perform public._grant_xp(uid, v_xp, 'Workout: ' || left(coalesce(p_type, 'Other'), 40));
  perform public._check_achievements(uid);
  return jsonb_build_object('xp', v_xp, 'limitReached', v_xp = 0);
end $$;

create or replace function public.save_body_stats(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first.'; end if;
  insert into public.body_stats (user_id, day, weight, height, age, sex, goal, bmi, bmr, maintenance, target, protein)
  values (uid, (now() at time zone 'Europe/Brussels')::date,
    (p ->> 'weight')::numeric, (p ->> 'height')::numeric, (p ->> 'age')::int, left(p ->> 'sex', 10), left(p ->> 'goal', 20),
    (p ->> 'bmi')::numeric, (p ->> 'bmr')::int, (p ->> 'maintenance')::int, (p ->> 'target')::int, (p ->> 'protein')::int);
  perform public._check_achievements(uid);
end $$;

-- Adds an order's items and XP to a player
create or replace function public._credit_order(p_order text, p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  item jsonb;
begin
  select * into o from public.orders where id = p_order;
  update public.orders set user_id = p_user where id = p_order;
  for item in select * from jsonb_array_elements(o.items) loop
    update public.profiles
      set inventory = jsonb_set(inventory, array[item ->> 'id'],
                                to_jsonb(coalesce((inventory ->> (item ->> 'id'))::int, 0) + (item ->> 'qty')::int))
      where id = p_user;
  end loop;
  perform public._grant_xp(p_user, o.xp, 'Order ' || right(o.id, 6));
  perform public._check_achievements(p_user);
  return o.xp;
end $$;

-- Records a paid PayPal order. The total and XP are recalculated from the
-- shop prices, so a changed price in the browser can't inflate the XP.
create or replace function public.record_order(p_id text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  clean jsonb := '[]'::jsonb;
  item jsonb;
  s public.shop_items;
  qty integer;
  v_total numeric := 0;
  v_xp integer;
begin
  if p_id is null or length(p_id) < 6 then raise exception 'Invalid order.'; end if;
  if exists (select 1 from public.orders where id = p_id) then
    return jsonb_build_object('duplicate', true);
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    select * into s from public.shop_items where id = item ->> 'id';
    if not found then continue; end if;
    qty := least(10, greatest(1, coalesce((item ->> 'qty')::int, 1)));
    v_total := v_total + s.price * qty;
    clean := clean || jsonb_build_array(jsonb_build_object('id', s.id, 'name', s.name, 'size', item ->> 'size', 'qty', qty, 'price', s.price));
  end loop;
  if jsonb_array_length(clean) = 0 then raise exception 'Invalid order.'; end if;

  v_xp := round(v_total * 10);
  insert into public.orders (id, user_id, items, total, xp) values (p_id, null, clean, v_total, v_xp);
  if auth.uid() is not null then
    perform public._credit_order(p_id, auth.uid());
  end if;
  return jsonb_build_object('xp', v_xp, 'total', v_total, 'guest', auth.uid() is null);
end $$;

-- Guests who log in afterwards claim the XP for their orders
create or replace function public.claim_orders(p_ids text[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  gained integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  for v_id in select o.id from public.orders o where o.id = any (p_ids) and o.user_id is null loop
    gained := gained + public._credit_order(v_id, auth.uid());
  end loop;
  return gained;
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------
-- Google Calendar feed (cached 10 minutes)
-- ---------------------------------------------------------
create or replace function public.calendar_feed()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  cache public.calendar_cache;
  resp record;
begin
  select * into cache from public.calendar_cache where id = 1;
  if found and cache.fetched_at > now() - interval '10 minutes' then
    return cache.ics;
  end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '8');
    select * into resp from extensions.http_get(public._config('calendar_ics_url'));
    if resp.status = 200 and resp.content like 'BEGIN:VCALENDAR%' then
      insert into public.calendar_cache (id, ics, fetched_at) values (1, resp.content, now())
      on conflict (id) do update set ics = excluded.ics, fetched_at = excluded.fetched_at;
      return resp.content;
    end if;
  exception when others then
    null; -- fall back to the cached copy
  end;
  return cache.ics;
end $$;

-- ---------------------------------------------------------
-- Admin dashboard data
-- ---------------------------------------------------------
create or replace function public.admin_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  return jsonb_build_object(
    'players', coalesce((select jsonb_agg(public._player_json(p.id)) from public.profiles p), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'trainerId', b.trainer_id, 'date', b.day, 'hour', b.hour,
                           'note', b.note, 'xp', b.xp, 'name', p.name, 'email', p.email, 'createdAt', b.created_at) order by b.day, b.hour)
                         from public.bookings b join public.profiles p on p.id = b.user_id), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------
-- Permissions: helpers are private, the website calls only these
-- ---------------------------------------------------------
revoke execute on function public._config(text) from public, anon, authenticated;
revoke execute on function public._grant_xp(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public._unlock(uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public._check_achievements(uuid) from public, anon, authenticated;
revoke execute on function public._player_json(uuid) from public, anon, authenticated;
revoke execute on function public._credit_order(text, uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.my_data() from public, anon;
revoke execute on function public.touch_login() from public, anon;
revoke execute on function public.book_session(text, date, integer, text) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.log_workout(text, integer) from public, anon;
revoke execute on function public.save_body_stats(jsonb) from public, anon;
revoke execute on function public.claim_orders(text[]) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.admin_data() from public, anon;

grant execute on function public.my_data() to authenticated;
grant execute on function public.touch_login() to authenticated;
grant execute on function public.book_session(text, date, integer, text) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.log_workout(text, integer) to authenticated;
grant execute on function public.save_body_stats(jsonb) to authenticated;
grant execute on function public.claim_orders(text[]) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_data() to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.slot_status(date, date) to anon, authenticated;
grant execute on function public.trainer_stats() to anon, authenticated;
grant execute on function public.record_order(text, jsonb) to anon, authenticated;
grant execute on function public.calendar_feed() to anon, authenticated;
