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
  ('booking_weeks_ahead', '4'),
  ('session_price', '60'),       -- what a player pays per 1-hour session (euro)
  ('trainer_fee', '40'),         -- the trainer's share per session; the rest goes to the venue
  ('owner_trainer_id', 'pieter'), -- the owner's own trainer card keeps the full price
  ('free_cancel_hours', '24'),    -- players cancel for free up to this many hours before; later = charged in full
  ('reward_window_days', '7'),    -- trainers can reward / mark a no-show up to this many days after the session
  ('confirm_hours', '48'),        -- a request nobody answers expires after this many hours...
  ('confirm_cutoff_hours', '12'), -- ...or this many hours before the session, whichever comes first
  ('intro_price', '30'),          -- a player's very first 1:1 session (the trainer still gets their full fee)
  ('duo_price', '80'),            -- one trainer, two people, one hour (total)
  ('duo_trainer_fee', '50'),      -- the trainer's share of a duo session
  ('packs', '[{"size":5,"price":280},{"size":10,"price":540}]'), -- session packs: credits for 1:1 sessions
  ('online_payments', 'off'),     -- 'on' once the payments Edge Function and the Mollie key are set up
  ('payment_hold_minutes', '20')  -- how long an unpaid online booking holds the hour
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

-- A trainer's account (by email): coaching XP goes to that account, so the
-- level on the team card and in the profile is the same
alter table public.trainers add column if not exists email text;
alter table public.trainers add column if not exists role text;
alter table public.trainers add column if not exists bio text;
alter table public.trainers add column if not exists specialties text;
alter table public.trainers add column if not exists color text;
alter table public.trainers add column if not exists chart_color text;
alter table public.trainers add column if not exists created_at timestamptz not null default now();

insert into public.trainers (id, name) values
  ('pieter', 'Pieter'),
  ('filip', 'Filip De Meyst'),
  ('maxim', 'Maxim Buyl')
on conflict (id) do nothing;
update public.trainers set email = 'pieterv-d-s@hotmail.com' where id = 'pieter' and email is null;

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
alter table public.profiles add column if not exists show_on_leaderboard boolean not null default true;

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
alter table public.body_stats add column if not exists activity numeric(4, 3) not null default 1.55;
create index if not exists body_stats_user_idx on public.body_stats (user_id, created_at desc);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  trainer_id text not null references public.trainers (id),
  day date not null,
  hour smallint not null check (hour between 0 and 23),
  note text not null default '',
  xp integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  user_id uuid references public.profiles (id) on delete set null,
  items jsonb not null,
  total numeric(10, 2) not null,
  xp integer not null default 0,
  created_at timestamptz not null default now()
);

-- Session packs: a player requests a pack, an admin marks it as paid, then each 1:1
-- booking uses one credit. A declined, expired or freely cancelled booking gives it back.
create table if not exists public.session_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  size integer not null check (size > 0),
  price numeric(8, 2) not null,
  status text not null default 'requested' check (status in ('requested', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists session_packs_user_idx on public.session_packs (user_id);

alter table public.session_packs add column if not exists pay_method text not null default 'in_person';
alter table public.session_packs add column if not exists mollie_id text;

-- Per-trainer price and fee (empty = the defaults in app_config). Not public.
create table if not exists public.trainer_pricing (
  trainer_id text primary key references public.trainers (id) on delete cascade,
  price numeric(8, 2),
  fee numeric(8, 2)
);

-- Booking flow: pending → confirmed / declined (by the trainer) → completed
-- (the trainer rewards the session on the day itself). XP is only awarded
-- when a session is completed.
alter table public.bookings add column if not exists status text not null default 'completed';
alter table public.bookings alter column status set default 'pending';
alter table public.bookings add column if not exists responded_at timestamptz;
alter table public.bookings add column if not exists rewarded_at timestamptz;
-- Money rules: late_cancel (player cancelled a confirmed session too late) and no_show are
-- charged in full and the trainer keeps their fee; expired = request nobody answered in time.
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('awaiting_payment', 'pending', 'confirmed', 'declined', 'completed', 'late_cancel', 'no_show',
                    'expired', 'cancelled'));
alter table public.bookings add column if not exists notice_sent_at timestamptz; -- expiry email sent
-- What kind of session and how the price was set: standard, intro (first session), pack (credit) or duo
alter table public.bookings add column if not exists kind text not null default 'solo';
alter table public.bookings add column if not exists partner text not null default '';
alter table public.bookings add column if not exists price_type text not null default 'standard';
alter table public.bookings add column if not exists pack_id uuid references public.session_packs (id) on delete set null;
alter table public.bookings drop constraint if exists bookings_kind_check;
alter table public.bookings add constraint bookings_kind_check check (kind in ('solo', 'duo'));
-- Payment: online (Mollie), in person at the headquarters, or a pack credit.
-- awaiting_payment = booked online, not paid yet (holds the hour for payment_hold_minutes);
-- the request only goes to the trainer once it's paid. cancelled = cancelled for free after paying.
alter table public.bookings add column if not exists pay_method text not null default 'in_person';
alter table public.bookings add column if not exists pay_status text not null default 'unpaid';
alter table public.bookings add column if not exists paid_at timestamptz;
alter table public.bookings add column if not exists mollie_id text;
alter table public.bookings add column if not exists refund_status text;  -- due / processing / done (online), manual (in person)
alter table public.bookings add column if not exists refund_id text;
alter table public.bookings add column if not exists request_at timestamptz; -- when the request reached the trainer
alter table public.bookings add column if not exists request_notice_sent boolean not null default true;
update public.bookings set request_at = created_at where request_at is null;
update public.bookings set pay_method = 'pack', pay_status = 'n/a' where price_type = 'pack' and pay_method <> 'pack';
alter table public.bookings drop constraint if exists bookings_pay_check;
alter table public.bookings add constraint bookings_pay_check
  check (pay_method in ('online', 'in_person', 'pack') and pay_status in ('unpaid', 'paid', 'refunded', 'n/a'));
create index if not exists bookings_mollie_idx on public.bookings (mollie_id);
-- A declined request frees the hour again, so uniqueness only counts active bookings
alter table public.bookings drop constraint if exists bookings_trainer_id_day_hour_key;
alter table public.bookings drop constraint if exists bookings_user_id_day_hour_key;
drop index if exists public.bookings_active_slot;
drop index if exists public.bookings_active_user;
create unique index if not exists bookings_active_slot2 on public.bookings (trainer_id, day, hour)
  where status in ('awaiting_payment', 'pending', 'confirmed', 'completed');
create unique index if not exists bookings_active_user2 on public.bookings (user_id, day, hour)
  where status in ('awaiting_payment', 'pending', 'confirmed', 'completed');

-- Money per booking, fixed at the moment of booking (so later price changes don't rewrite history)
alter table public.bookings add column if not exists price numeric(8, 2) not null default 60;
alter table public.bookings add column if not exists trainer_fee numeric(8, 2) not null default 40;
alter table public.bookings add column if not exists payout_at timestamptz; -- when the admin paid the trainer
update public.bookings set trainer_fee = price
  where trainer_id = public._config('owner_trainer_id') and trainer_fee <> price;

create or replace function public._booking_json(b public.bookings)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id, 'trainerId', b.trainer_id, 'date', b.day, 'hour', b.hour, 'note', b.note, 'xp', b.xp,
    'status', b.status, 'createdAt', b.created_at, 'respondedAt', b.responded_at, 'rewardedAt', b.rewarded_at,
    'price', b.price, 'trainerFee', b.trainer_fee, 'payoutAt', b.payout_at,
    'kind', b.kind, 'partner', b.partner, 'priceType', b.price_type, 'packId', b.pack_id,
    'payMethod', b.pay_method, 'payStatus', b.pay_status, 'paidAt', b.paid_at, 'refundStatus', b.refund_status,
    'freeCancelUntil', ((b.day + make_interval(hours => b.hour)) at time zone 'Europe/Brussels')
                       - make_interval(hours => public._config('free_cancel_hours')::int),
    'name', p.name, 'email', p.email,
    'trainerEmail', (select t.email from public.trainers t where t.id = b.trainer_id)
  )
  from public.profiles p where p.id = b.user_id;
$$;

-- Credits used by a pack: bookings that kept their credit (a declined or expired one gives it back;
-- a free cancellation deletes the booking)
create or replace function public._pack_used(p_pack uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.bookings where pack_id = p_pack and status not in ('declined', 'expired', 'cancelled');
$$;

create or replace function public._pack_json(sp public.session_packs)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', sp.id, 'size', sp.size, 'price', sp.price, 'status', sp.status, 'payMethod', sp.pay_method,
    'createdAt', sp.created_at, 'paidAt', sp.paid_at,
    'used', public._pack_used(sp.id), 'remaining', sp.size - public._pack_used(sp.id),
    'name', p.name, 'email', p.email)
  from public.profiles p where p.id = sp.user_id;
$$;

-- People who signed up (or applied later) as personal trainer; an admin approves them
create table if not exists public.trainer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  role_title text not null default '',
  specialties text not null default '',
  bio text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  trainer_id text references public.trainers (id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
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
alter table public.trainer_applications enable row level security;
alter table public.session_packs enable row level security;
alter table public.trainer_pricing enable row level security;

drop policy if exists "own packs or admin" on public.session_packs;
create policy "own packs or admin" on public.session_packs for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own application or admin" on public.trainer_applications;
create policy "own application or admin" on public.trainer_applications for select using (user_id = auth.uid() or public.is_admin());

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

  if (select count(distinct date_trunc('week', day)) from public.body_stats where user_id = p_user) >= 4 then
    perform public._unlock(p_user, 'checkins_4', 150, 'On track');
  end if;

  if p.sessions_booked >= 1 then perform public._unlock(p_user, 'first_session', 100, 'Party up'); end if;
  if (select count(distinct trainer_id) from public.bookings where user_id = p_user and status = 'completed') >= 3 then
    perform public._unlock(p_user, 'full_party', 200, 'Full party');
  end if;
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

-- Saves a set of character stats; the first save each week earns check-in XP
create or replace function public._insert_stats(p_user uuid, p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  w numeric := (p ->> 'weight')::numeric;
  h numeric := (p ->> 'height')::numeric;
  a integer := (p ->> 'age')::int;
  gained integer := 0;
begin
  if w is null or w < 30 or w > 300 then raise exception 'Enter a weight between 30 and 300 kg.'; end if;
  if h is null or h < 120 or h > 230 then raise exception 'Enter a height between 120 and 230 cm.'; end if;
  if a is null or a < 14 or a > 100 then raise exception 'Enter an age between 14 and 100.'; end if;

  if not exists (
    select 1 from public.xp_log
    where user_id = p_user and reason = 'Weekly check-in' and created_at > now() - interval '6 days 12 hours'
  ) then
    gained := 25;
  end if;

  insert into public.body_stats (user_id, day, weight, height, age, sex, goal, activity, bmi, bmr, maintenance, target, protein)
  values (p_user, (now() at time zone 'Europe/Brussels')::date,
    w, h, a, left(coalesce(p ->> 'sex', 'male'), 10), left(coalesce(p ->> 'goal', 'maintain'), 20),
    least(2.0, greatest(1.0, coalesce((p ->> 'activity')::numeric, 1.55))),
    (p ->> 'bmi')::numeric, (p ->> 'bmr')::int, (p ->> 'maintenance')::int, (p ->> 'target')::int, (p ->> 'protein')::int);

  perform public._grant_xp(p_user, gained, 'Weekly check-in');
  perform public._check_achievements(p_user);
  return gained;
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
  -- Sign-up as personal trainer: an application for the admin to review
  if new.raw_user_meta_data ? 'trainer_application' then
    insert into public.trainer_applications (user_id, role_title, specialties, bio)
    values (new.id,
      left(coalesce(new.raw_user_meta_data -> 'trainer_application' ->> 'role', ''), 60),
      left(coalesce(new.raw_user_meta_data -> 'trainer_application' ->> 'specialties', ''), 200),
      left(coalesce(new.raw_user_meta_data -> 'trainer_application' ->> 'bio', ''), 600))
    on conflict (user_id) do nothing;
  end if;
  -- Character stats filled in during sign-up
  if new.raw_user_meta_data ? 'stats' then
    begin
      perform public._insert_stats(new.id, new.raw_user_meta_data -> 'stats');
    exception when others then
      null; -- never block a sign-up because of the stats
    end;
  end if;
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
    'showOnLeaderboard', p.show_on_leaderboard,
    'application', (select jsonb_build_object('status', a.status, 'role', a.role_title, 'specialties', a.specialties,
                      'bio', a.bio, 'createdAt', a.created_at, 'reviewedAt', a.reviewed_at)
                    from public.trainer_applications a where a.user_id = p.id),
    'trainerId', (select t.id from public.trainers t where t.email is not null and lower(t.email) = lower(p.email)),
    'admin', lower(p.email) = any (string_to_array(lower(replace(public._config('admin_emails'), ' ', '')), ',')),
    'xpLog', coalesce((select jsonb_agg(jsonb_build_object('date', x.created_at, 'amount', x.amount, 'reason', x.reason) order by x.id desc)
                       from (select * from public.xp_log where user_id = p.id order by id desc limit 50) x), '[]'::jsonb),
    'workouts', coalesce((select jsonb_agg(jsonb_build_object('date', w.day, 'type', w.type, 'minutes', w.minutes, 'xp', w.xp) order by w.id desc)
                          from public.workouts w where w.user_id = p.id), '[]'::jsonb),
    'bodyStats', coalesce((select jsonb_agg(jsonb_build_object('date', b.day, 'weight', b.weight, 'height', b.height, 'age', b.age,
                              'sex', b.sex, 'goal', b.goal, 'bmi', b.bmi, 'bmr', b.bmr, 'maintenance', b.maintenance,
                              'target', b.target, 'protein', b.protein, 'activity', b.activity) order by b.day desc, b.id desc)
                           from public.body_stats b where b.user_id = p.id), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'date', o.created_at, 'items', o.items, 'total', o.total) order by o.created_at desc)
                           from public.orders o where o.user_id = p.id), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(public._booking_json(k) order by k.day, k.hour)
                          from public.bookings k where k.user_id = p.id), '[]'::jsonb),
    'packs', coalesce((select jsonb_agg(public._pack_json(sp) order by sp.created_at desc)
                       from public.session_packs sp where sp.user_id = p.id), '[]'::jsonb),
    'introEligible', not exists (select 1 from public.bookings k where k.user_id = p.id
                                 and k.status in ('awaiting_payment', 'pending', 'confirmed', 'completed', 'no_show', 'late_cancel'))
  )
  from public.profiles p
  where p.id = p_user;
$$;

create or replace function public.my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  perform public._expire_requests();
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

-- The trainer (by linked account email) or an admin may handle a booking
create or replace function public._can_coach(p_trainer text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.trainers t
    where t.id = p_trainer and t.email is not null and lower(t.email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- Sessions the player pays for and the trainer earns their fee on
create or replace function public._billable(p_status text)
returns boolean language sql immutable as $$
  select p_status in ('completed', 'no_show', 'late_cancel');
$$;

-- A request must be answered within confirm_hours, and at the latest confirm_cutoff_hours
-- before the session (but trainers always get at least 2 hours)
create or replace function public._confirm_deadline(p_created timestamptz, p_day date, p_hour integer)
returns timestamptz language sql stable security definer set search_path = public as $$
  select least(p_created + make_interval(hours => public._config('confirm_hours')::int),
               greatest(public._slot_start(p_day, p_hour) - make_interval(hours => public._config('confirm_cutoff_hours')::int),
                        p_created + interval '2 hours'),
               public._slot_start(p_day, p_hour));
$$;

-- Expire unanswered requests (runs whenever someone loads or changes bookings)
-- A paid booking that is declined, expires or is cancelled for free gets its money back:
-- online payments are refunded through Mollie (refund_status due), cash at the desk by hand (manual)
create or replace function public._refund_state(b public.bookings)
returns text language sql immutable as $$
  select case when b.pay_status <> 'paid' then null
              when b.pay_method = 'online' then 'due'
              when b.pay_method = 'in_person' then 'manual' end;
$$;

create or replace function public._expire_requests()
returns void language sql security definer set search_path = public as $$
  update public.bookings b set status = 'expired', responded_at = now(), refund_status = public._refund_state(b)
  where b.status = 'pending' and public._confirm_deadline(coalesce(b.request_at, b.created_at), b.day, b.hour) <= now();
  -- unpaid online bookings free the hour again (no email: the player left the payment page)
  update public.bookings set status = 'expired', responded_at = now(), notice_sent_at = now()
  where status = 'awaiting_payment'
    and created_at + make_interval(mins => public._config('payment_hold_minutes')::int) <= now();
$$;

-- Trainers settle (reward / no-show) from the session day until reward_window_days after;
-- admins any time after the session day starts
create or replace function public._can_settle(b public.bookings)
returns boolean language sql stable security definer set search_path = public as $$
  select (now() at time zone 'Europe/Brussels')::date >= b.day
     and (public.is_admin()
          or (now() at time zone 'Europe/Brussels')::date <= b.day + public._config('reward_window_days')::int);
$$;

-- Coaching XP for a trainer with a linked account when a session is rewarded:
-- +100 per session and +50 the first time they coach a player
drop function if exists public._trainer_xp(public.trainers, uuid, integer);
create or replace function public._trainer_xp(t public.trainers, p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  coach uuid;
  client_name text;
begin
  select id into coach from public.profiles where t.email is not null and lower(email) = lower(t.email);
  if coach is null or coach = p_client then return; end if;
  select name into client_name from public.profiles where id = p_client;
  perform public._grant_xp(coach, 100, 'Coached ' || client_name);
  if (select count(*) from public.bookings where trainer_id = t.id and user_id = p_client and status = 'completed') = 1 then
    perform public._grant_xp(coach, 50, 'New player: ' || client_name);
  end if;
end $$;

-- Price of the next booking for a player: duo, a pack credit, the intro price for a first
-- session, or the trainer's standard price. The owner's own sessions keep the full price.
create or replace function public._quote(p_user uuid, p_trainer text, p_kind text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  owner boolean := p_trainer = public._config('owner_trainer_id');
  tp public.trainer_pricing;
  std numeric;
  fee numeric;
  pk public.session_packs;
begin
  select * into tp from public.trainer_pricing where trainer_id = p_trainer;
  std := coalesce(tp.price, public._config('session_price')::numeric);
  fee := coalesce(tp.fee, public._config('trainer_fee')::numeric);
  if p_kind = 'duo' then
    return jsonb_build_object('type', 'duo', 'price', public._config('duo_price')::numeric,
      'fee', case when owner then public._config('duo_price')::numeric else public._config('duo_trainer_fee')::numeric end);
  end if;
  select * into pk from public.session_packs sp
    where sp.user_id = p_user and sp.status = 'paid' and public._pack_used(sp.id) < sp.size
    order by sp.paid_at, sp.created_at limit 1;
  if found then
    return jsonb_build_object('type', 'pack', 'packId', pk.id, 'price', round(pk.price / pk.size, 2),
      'fee', case when owner then round(pk.price / pk.size, 2) else fee end);
  end if;
  if not exists (select 1 from public.bookings k where k.user_id = p_user
                 and k.status in ('awaiting_payment', 'pending', 'confirmed', 'completed', 'no_show', 'late_cancel')) then
    return jsonb_build_object('type', 'intro', 'price', public._config('intro_price')::numeric,
      'fee', case when owner then public._config('intro_price')::numeric else fee end);
  end if;
  return jsonb_build_object('type', 'standard', 'price', std, 'fee', case when owner then std else fee end);
end $$;

drop function if exists public.book_session(text, date, integer, text);
drop function if exists public.book_session(text, date, integer, text, text, text);
create or replace function public.book_session(p_trainer text, p_day date, p_hour integer, p_note text default '',
                                               p_kind text default 'solo', p_partner text default '',
                                               p_pay text default 'in_person')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q jsonb;
  t public.trainers;
  horizon date := (date_trunc('week', now() at time zone 'Europe/Brussels')::date
                   + 7 * public._config('booking_weeks_ahead')::int);
  b public.bookings;
begin
  if uid is null then raise exception 'Log in to book a session.'; end if;
  perform public._expire_requests();
  select * into t from public.trainers where id = p_trainer and active;
  if not found then raise exception 'This trainer is not available.'; end if;
  if p_hour < 0 or p_hour > 23 then raise exception 'Invalid time.'; end if;
  if p_kind not in ('solo', 'duo') then raise exception 'Invalid session type.'; end if;
  if p_kind = 'duo' and trim(coalesce(p_partner, '')) = '' then raise exception 'Enter the name of the person you train with.'; end if;
  if p_pay not in ('online', 'in_person') then raise exception 'Invalid payment method.'; end if;
  if p_pay = 'online' and public._config('online_payments') <> 'on' then raise exception 'Online payment is not available yet. Choose to pay at the headquarters.'; end if;
  if public._slot_start(p_day, p_hour) <= now() then raise exception 'This time slot has already passed.'; end if;
  if public._slot_start(p_day, p_hour) < now() + make_interval(hours => public._config('booking_notice_hours')::int) then
    raise exception 'Sessions must be booked at least % hours in advance.', public._config('booking_notice_hours');
  end if;
  if p_day >= horizon then
    raise exception 'You can book up to % weeks ahead.', public._config('booking_weeks_ahead');
  end if;
  if exists (select 1 from public.bookings where trainer_id = p_trainer and day = p_day and hour = p_hour
             and status in ('awaiting_payment', 'pending', 'confirmed', 'completed')) then
    raise exception 'Someone just booked this slot. Pick another hour.';
  end if;
  if exists (select 1 from public.bookings where user_id = uid and day = p_day and hour = p_hour
             and status in ('awaiting_payment', 'pending', 'confirmed', 'completed')) then
    raise exception 'You already have a session at this time.';
  end if;

  -- one booking at a time per player, so two tabs can't spend the same pack credit
  perform 1 from public.profiles where id = uid for update;
  q := public._quote(uid, p_trainer, p_kind);
  begin
    insert into public.bookings (user_id, trainer_id, day, hour, note, xp, status, price, trainer_fee,
                                 kind, partner, price_type, pack_id, pay_method, pay_status, request_at, request_notice_sent)
    values (uid, p_trainer, p_day, p_hour, left(coalesce(p_note, ''), 300), public._config('session_xp')::int,
            case when q ->> 'type' <> 'pack' and p_pay = 'online' then 'awaiting_payment' else 'pending' end,
            (q ->> 'price')::numeric, (q ->> 'fee')::numeric,
            p_kind, case when p_kind = 'duo' then left(trim(p_partner), 40) else '' end,
            q ->> 'type', (q ->> 'packId')::uuid,
            case when q ->> 'type' = 'pack' then 'pack' else p_pay end,
            case when q ->> 'type' = 'pack' then 'n/a' else 'unpaid' end,
            case when q ->> 'type' <> 'pack' and p_pay = 'online' then null else now() end,
            not (q ->> 'type' <> 'pack' and p_pay = 'online'))
    returning * into b;
  exception when unique_violation then
    raise exception 'Someone just booked this slot. Pick another hour.';
  end;

  return public._booking_json(b);
end $$;

-- The trainer (or an admin) confirms or declines a pending request
create or replace function public.respond_booking(p_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  perform public._expire_requests();
  select * into b from public.bookings where id = p_id;
  if not found or not public._can_coach(b.trainer_id) then raise exception 'Booking not found.'; end if;
  if b.status = 'expired' then raise exception 'This request expired because it wasn''t answered in time.'; end if;
  if b.status <> 'pending' then raise exception 'This request has already been handled.'; end if;
  if public._slot_start(b.day, b.hour) <= now() then raise exception 'This session time has already passed.'; end if;
  update public.bookings
    set status = case when p_accept then 'confirmed' else 'declined' end, responded_at = now(),
        refund_status = case when p_accept then refund_status else public._refund_state(b) end
    where id = p_id returning * into b;
  return public._booking_json(b);
end $$;

-- From the day of the session the trainer (or an admin) rewards it:
-- the player gets their XP, the trainer gets coaching XP
create or replace function public.reward_session(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  t public.trainers;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into b from public.bookings where id = p_id;
  if not found or not public._can_coach(b.trainer_id) then raise exception 'Booking not found.'; end if;
  if b.status = 'completed' then raise exception 'This session has already been rewarded.'; end if;
  if b.status = 'no_show' then raise exception 'This session was marked as a no-show.'; end if;
  if b.status <> 'confirmed' then raise exception 'Confirm the session before rewarding it.'; end if;
  if (now() at time zone 'Europe/Brussels')::date < b.day then
    raise exception 'You can reward a session from the day itself.';
  end if;
  if not public._can_settle(b) then
    raise exception 'The % day reward window has passed. Ask the admin to settle this session.', public._config('reward_window_days');
  end if;

  update public.bookings set status = 'completed', rewarded_at = now() where id = p_id returning * into b;
  select * into t from public.trainers where id = b.trainer_id;
  update public.profiles set sessions_booked = sessions_booked + 1 where id = b.user_id;
  perform public._grant_xp(b.user_id, b.xp, 'Session with ' || split_part(t.name, ' ', 1));
  perform public._trainer_xp(t, b.user_id);
  perform public._check_achievements(b.user_id);
  return public._booking_json(b);
end $$;

-- The player didn't show up: charged in full, the trainer keeps their fee, no XP
create or replace function public.mark_no_show(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into b from public.bookings where id = p_id;
  if not found or not public._can_coach(b.trainer_id) then raise exception 'Booking not found.'; end if;
  if b.status <> 'confirmed' then raise exception 'Only a confirmed session can be marked as a no-show.'; end if;
  if public._slot_start(b.day, b.hour) > now() then raise exception 'The session hasn''t started yet.'; end if;
  if not public._can_settle(b) then
    raise exception 'The % day window has passed. Ask the admin to settle this session.', public._config('reward_window_days');
  end if;
  update public.bookings set status = 'no_show', rewarded_at = now() where id = p_id returning * into b;
  return public._booking_json(b);
end $$;

-- Players cancel their own open request or confirmed session before it starts;
-- admins can cancel any (always free). A player cancelling a confirmed session
-- less than free_cancel_hours before is a late cancellation: charged in full,
-- the trainer keeps their fee, the hour opens up again. No XP was given yet.
create or replace function public.cancel_booking(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into b from public.bookings where id = p_id;
  if not found or (b.user_id <> auth.uid() and not public.is_admin()) then
    raise exception 'Booking not found.';
  end if;
  if b.status not in ('awaiting_payment', 'pending', 'confirmed') then raise exception 'This session can no longer be cancelled.'; end if;
  if public._slot_start(b.day, b.hour) <= now() then raise exception 'This session has already started.'; end if;
  if b.status = 'confirmed' and b.user_id = auth.uid() and not public.is_admin()
     and public._slot_start(b.day, b.hour) - make_interval(hours => public._config('free_cancel_hours')::int) < now() then
    update public.bookings set status = 'late_cancel', responded_at = now() where id = p_id returning * into b;
    return public._booking_json(b) || jsonb_build_object('late', true);
  end if;
  -- paid: keep the row as cancelled so the refund is tracked; unpaid: just remove it
  if b.pay_status = 'paid' then
    update public.bookings set status = 'cancelled', responded_at = now(), refund_status = public._refund_state(b)
      where id = p_id returning * into b;
    return public._booking_json(b) || jsonb_build_object('late', false);
  end if;
  result := public._booking_json(b) || jsonb_build_object('late', false);
  delete from public.bookings where id = p_id;
  return result;
end $$;

-- Bookings a trainer has to handle (their linked trainer card)
create or replace function public.coach_bookings()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._expire_requests();
  return (select coalesce(jsonb_agg(public._booking_json(b) order by b.day, b.hour), '[]'::jsonb)
          from public.bookings b
          join public.trainers t on t.id = b.trainer_id
          where t.email is not null and lower(t.email) = lower(auth.jwt() ->> 'email')
            and b.day >= (now() at time zone 'Europe/Brussels')::date - 30);
end $$;

-- Expired requests whose email hasn't gone out yet, for the client, their trainer or an
-- admin. The first browser that claims them sends the email, so it goes out once.
create or replace function public.claim_booking_notices()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  perform public._expire_requests();
  with claimed as (
    update public.bookings b set notice_sent_at = now()
    where b.status = 'expired' and b.notice_sent_at is null
      and (b.user_id = auth.uid() or public._can_coach(b.trainer_id))
    returning b.*
  ), requests as (
    -- paid online requests: the trainer's email goes out once the payment is in
    update public.bookings b set request_notice_sent = true
    where not b.request_notice_sent and b.status = 'pending'
      and (b.user_id = auth.uid() or public._can_coach(b.trainer_id))
    returning b.*
  )
  select coalesce((select jsonb_agg(public._booking_json(c) || jsonb_build_object('notice', 'expired')) from claimed c), '[]'::jsonb)
      || coalesce((select jsonb_agg(public._booking_json(r) || jsonb_build_object('notice', 'requested')) from requests r), '[]'::jsonb)
    into result;
  return result;
end $$;

-- Earnings of the logged-in trainer: earned = rewarded sessions + no-shows + late
-- cancellations, expected = confirmed ones
create or replace function public.coach_earnings()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trainerId', t.id,
    'isOwner', t.id = public._config('owner_trainer_id'),
    'price', coalesce((select tp.price from public.trainer_pricing tp where tp.trainer_id = t.id), public._config('session_price')::numeric),
    'fee', case when t.id = public._config('owner_trainer_id')
                then coalesce((select tp.price from public.trainer_pricing tp where tp.trainer_id = t.id), public._config('session_price')::numeric)
                else coalesce((select tp.fee from public.trainer_pricing tp where tp.trainer_id = t.id), public._config('trainer_fee')::numeric) end,
    'sessions', count(b.id) filter (where public._billable(b.status)),
    'charged', count(b.id) filter (where b.status in ('no_show', 'late_cancel')),
    'earned', coalesce(sum(b.trainer_fee) filter (where public._billable(b.status)), 0),
    'paid', coalesce(sum(b.trainer_fee) filter (where public._billable(b.status) and b.payout_at is not null), 0),
    'owed', coalesce(sum(b.trainer_fee) filter (where public._billable(b.status) and b.payout_at is null), 0),
    'expected', coalesce(sum(b.trainer_fee) filter (where b.status = 'confirmed'), 0),
    'lastPayout', max(b.payout_at)
  )
  from public.trainers t left join public.bookings b on b.trainer_id = t.id
  where t.email is not null and lower(t.email) = lower(auth.jwt() ->> 'email')
  group by t.id;
$$;

-- Admin: record that a trainer's open earnings have been paid out
create or replace function public.mark_payout(p_trainer text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n integer;
  total numeric;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  select count(*), coalesce(sum(trainer_fee), 0) into n, total
    from public.bookings where trainer_id = p_trainer and public._billable(status) and payout_at is null;
  if n = 0 then raise exception 'Nothing to pay out for this trainer.'; end if;
  update public.bookings set payout_at = now()
    where trainer_id = p_trainer and public._billable(status) and payout_at is null;
  return jsonb_build_object('trainerId', p_trainer, 'sessions', n, 'amount', total);
end $$;

-- Which hours are taken (no names), for the public schedule
drop function if exists public.slot_status(date, date);
create or replace function public.slot_status(p_from date, p_to date)
returns table (trainer_id text, day date, hour smallint, booking_id uuid, status text)
language sql stable security definer set search_path = public as $$
  select b.trainer_id, b.day, b.hour,
         case when b.user_id = auth.uid() then b.id end,
         case when b.user_id = auth.uid() then b.status end
  from public.bookings b
  where b.day between p_from and least(p_to, p_from + 70)
    and (b.status in ('confirmed', 'completed')
         or (b.status = 'pending' and public._confirm_deadline(coalesce(b.request_at, b.created_at), b.day, b.hour) > now())
         or (b.status = 'awaiting_payment'
             and b.created_at + make_interval(mins => public._config('payment_hold_minutes')::int) > now()));
$$;

-- Trainer levels count completed sessions only
drop function if exists public.trainer_stats();
create or replace function public.trainer_stats()
returns table (trainer_id text, sessions bigint, clients bigint, account_xp integer)
language sql stable security definer set search_path = public as $$
  select t.id, count(b.id), count(distinct b.user_id),
         (select p.xp from public.profiles p where t.email is not null and lower(p.email) = lower(t.email))
  from public.trainers t left join public.bookings b on b.trainer_id = t.id and b.status = 'completed'
  group by t.id, t.email;
$$;

-- High scores: top 10 players (trainers and hidden players left out), plus
-- your own position when you're not in the top 10
create or replace function public.leaderboard()
returns table (place bigint, name text, xp integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  with ranked as (
    select p.id, p.name, p.xp, rank() over (order by p.xp desc, p.created_at) as place
    from public.profiles p
    where p.show_on_leaderboard
      and not exists (select 1 from public.trainers t where t.email is not null and lower(t.email) = lower(p.email))
  )
  select r.place, r.name, r.xp, coalesce(r.id = auth.uid(), false)
  from ranked r
  where r.place <= 10 or r.id = auth.uid()
  order by r.place;
$$;

create or replace function public.set_leaderboard_visibility(p_show boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles set show_on_leaderboard = coalesce(p_show, true) where id = auth.uid();
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

drop function if exists public.save_body_stats(jsonb);
create or replace function public.save_body_stats(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first.'; end if;
  return jsonb_build_object('xp', public._insert_stats(uid, p));
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
-- Trainer applications and the public trainer list
-- ---------------------------------------------------------
create or replace function public.apply_as_trainer(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if exists (select 1 from public.trainers t join public.profiles pr on lower(pr.email) = lower(t.email) where pr.id = auth.uid()) then
    raise exception 'You already have a trainer account.';
  end if;
  insert into public.trainer_applications (user_id, role_title, specialties, bio)
  values (auth.uid(), left(coalesce(p ->> 'role', ''), 60), left(coalesce(p ->> 'specialties', ''), 200), left(coalesce(p ->> 'bio', ''), 600))
  on conflict (user_id) do update
    set role_title = excluded.role_title, specialties = excluded.specialties, bio = excluded.bio,
        status = 'pending', created_at = now(), reviewed_at = null
    where public.trainer_applications.status = 'rejected';
  if not found then raise exception 'Your application is already being reviewed.'; end if;
end $$;

-- Admin approves (linking to an existing trainer card or creating a new one) or rejects
create or replace function public.review_trainer_application(p_id uuid, p_approve boolean, p_trainer text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.trainer_applications;
  pr public.profiles;
  new_id text;
  n integer;
  palette text[] := array['#4dd4a3', '#b3a8ff'];
  chart_palette text[] := array['#199e70', '#9085e9'];
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  select * into a from public.trainer_applications where id = p_id;
  if not found then raise exception 'Application not found.'; end if;
  if a.status <> 'pending' then raise exception 'This application has already been reviewed.'; end if;
  select * into pr from public.profiles where id = a.user_id;

  if not p_approve then
    update public.trainer_applications set status = 'rejected', reviewed_at = now() where id = p_id;
    return jsonb_build_object('status', 'rejected', 'name', pr.name, 'email', pr.email);
  end if;

  if p_trainer is not null and p_trainer <> '' then
    -- link to an existing trainer card that has no account yet
    update public.trainers set email = pr.email where id = p_trainer and email is null;
    if not found then raise exception 'That trainer card is already linked to an account.'; end if;
    new_id := p_trainer;
  else
    new_id := regexp_replace(lower(split_part(pr.name, ' ', 1)), '[^a-z0-9]', '', 'g');
    if new_id = '' then new_id := 'coach'; end if;
    n := 1;
    while exists (select 1 from public.trainers where id = new_id) loop
      n := n + 1;
      new_id := regexp_replace(lower(split_part(pr.name, ' ', 1)), '[^a-z0-9]', '', 'g') || n;
    end loop;
    select count(*) - 3 into n from public.trainers; -- the first three have their own colours
    insert into public.trainers (id, name, email, role, bio, specialties, color, chart_color)
    values (new_id, pr.name, pr.email, nullif(a.role_title, ''), nullif(a.bio, ''), nullif(a.specialties, ''),
            coalesce(palette[n + 1], '#a6b3a9'), coalesce(chart_palette[n + 1], '#7f8f84'));
  end if;

  update public.trainer_applications set status = 'approved', reviewed_at = now(), trainer_id = new_id where id = p_id;
  return jsonb_build_object('status', 'approved', 'trainerId', new_id, 'name', pr.name, 'email', pr.email);
end $$;

-- Every active trainer for the website (never emails)
create or replace function public.trainer_list()
returns table (id text, name text, role text, bio text, specialties text, color text, chart_color text, linked boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.role, t.bio, t.specialties, t.color, t.chart_color, t.email is not null
  from public.trainers t where t.active order by t.created_at, t.id;
$$;

-- Pending applications, for the admin pop-up
create or replace function public.admin_inbox()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', p.name, 'role', a.role_title, 'createdAt', a.created_at) order by a.created_at)
                   from public.trainer_applications a join public.profiles p on p.id = a.user_id
                   where a.status = 'pending'), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------
-- Prices, packs and per-trainer pricing
-- ---------------------------------------------------------
-- Public price list for the website
create or replace function public.pricing_info()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'price', public._config('session_price')::numeric,
    'fee', public._config('trainer_fee')::numeric,
    'introPrice', public._config('intro_price')::numeric,
    'duoPrice', public._config('duo_price')::numeric,
    'packs', public._config('packs')::jsonb,
    'onlinePayments', public._config('online_payments') = 'on',
    'hq', 'Hoogstraat 40, 9308 Aalst',
    'trainers', coalesce((select jsonb_object_agg(tp.trainer_id, tp.price) from public.trainer_pricing tp where tp.price is not null), '{}'::jsonb)
  );
$$;

-- A player asks for a pack; it gives credits once an admin marks it as paid
drop function if exists public.request_pack(integer);
create or replace function public.request_pack(p_size integer, p_pay text default 'in_person')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  opt jsonb;
  sp public.session_packs;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select o into opt from jsonb_array_elements(public._config('packs')::jsonb) o where (o ->> 'size')::int = p_size;
  if opt is null then raise exception 'This pack is not available.'; end if;
  if p_pay not in ('online', 'in_person') then raise exception 'Invalid payment method.'; end if;
  if p_pay = 'online' and public._config('online_payments') <> 'on' then raise exception 'Online payment is not available yet.'; end if;
  if exists (select 1 from public.session_packs where user_id = auth.uid() and status = 'requested') then
    raise exception 'You already have a pack waiting for payment.';
  end if;
  insert into public.session_packs (user_id, size, price, pay_method) values (auth.uid(), p_size, (opt ->> 'price')::numeric, p_pay)
    returning * into sp;
  return public._pack_json(sp);
end $$;

-- The player withdraws a pack request that isn't paid yet
create or replace function public.cancel_pack_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sp public.session_packs;
begin
  select * into sp from public.session_packs where id = p_id;
  if not found or (sp.user_id <> auth.uid() and not public.is_admin()) then raise exception 'Pack not found.'; end if;
  if sp.status <> 'requested' then raise exception 'Only an unpaid pack request can be cancelled.'; end if;
  update public.session_packs set status = 'cancelled' where id = p_id returning * into sp;
  return public._pack_json(sp);
end $$;

-- Admin: the player paid, the credits become usable
create or replace function public.mark_pack_paid(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sp public.session_packs;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  select * into sp from public.session_packs where id = p_id;
  if not found then raise exception 'Pack not found.'; end if;
  if sp.status <> 'requested' then raise exception 'This pack has already been handled.'; end if;
  update public.session_packs set status = 'paid', paid_at = now() where id = p_id returning * into sp;
  return public._pack_json(sp);
end $$;

-- Admin: set a trainer's own price and fee (null = the default)
create or replace function public.set_trainer_pricing(p_trainer text, p_price numeric, p_fee numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  if not exists (select 1 from public.trainers where id = p_trainer) then raise exception 'Trainer not found.'; end if;
  if p_price is not null and (p_price < 0 or p_price > 500) then raise exception 'Enter a price between 0 and 500.'; end if;
  if p_fee is not null and (p_fee < 0 or p_fee > coalesce(p_price, public._config('session_price')::numeric)) then
    raise exception 'The trainer fee can''t be more than the price.';
  end if;
  insert into public.trainer_pricing (trainer_id, price, fee) values (p_trainer, p_price, p_fee)
  on conflict (trainer_id) do update set price = excluded.price, fee = excluded.fee;
end $$;

-- ---------------------------------------------------------
-- Payments (Mollie through the 'payments' Edge Function)
-- ---------------------------------------------------------
-- The logged-in player asks to pay a booking or pack online: checks it's theirs and still payable
create or replace function public.payment_request(p_type text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  sp public.session_packs;
  t public.trainers;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if public._config('online_payments') <> 'on' then raise exception 'Online payment is not available yet.'; end if;
  if p_type = 'booking' then
    select * into b from public.bookings where id = p_id and user_id = auth.uid();
    if not found then raise exception 'Booking not found.'; end if;
    if b.pay_method = 'pack' or b.pay_status <> 'unpaid' then raise exception 'This session doesn''t need a payment.'; end if;
    if b.status not in ('awaiting_payment', 'pending', 'confirmed', 'completed', 'no_show', 'late_cancel') then
      raise exception 'This booking can''t be paid anymore.';
    end if;
    select * into t from public.trainers where id = b.trainer_id;
    return jsonb_build_object('type', 'booking', 'id', b.id, 'amount', b.price,
      'description', 'LEVEL-UP ' || case when b.kind = 'duo' then 'duo ' else '' end || 'session with '
                     || split_part(t.name, ' ', 1) || ' ' || to_char(b.day, 'DD-MM-YYYY') || ' ' || lpad(b.hour::text, 2, '0') || ':00');
  elsif p_type = 'pack' then
    select * into sp from public.session_packs where id = p_id and user_id = auth.uid();
    if not found then raise exception 'Pack not found.'; end if;
    if sp.status <> 'requested' then raise exception 'This pack doesn''t need a payment.'; end if;
    return jsonb_build_object('type', 'pack', 'id', sp.id, 'amount', sp.price,
      'description', 'LEVEL-UP ' || sp.size || '-session pack');
  end if;
  raise exception 'Unknown payment type.';
end $$;

-- Edge Function only (service role): remember the Mollie payment for a booking or pack
create or replace function public.attach_payment(p_type text, p_id uuid, p_mollie text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'booking' then
    update public.bookings set mollie_id = p_mollie, pay_method = 'online' where id = p_id and pay_status = 'unpaid';
  else
    update public.session_packs set mollie_id = p_mollie, pay_method = 'online' where id = p_id and status = 'requested';
  end if;
end $$;

-- Edge Function only: Mollie reported a status. Returns {action: 'refund'} when the money
-- came in for something that no longer exists or was cancelled in the meantime.
create or replace function public.payment_update(p_mollie text, p_status text, p_type text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  sp public.session_packs;
begin
  if p_type = 'booking' then
    select * into b from public.bookings where id = p_id for update;
    if not found then
      return jsonb_build_object('action', case when p_status = 'paid' then 'refund' else 'none' end);
    end if;
    if b.mollie_id is distinct from p_mollie and b.pay_status = 'paid' then
      -- paid twice (two payment pages): give the second one back
      return jsonb_build_object('action', case when p_status = 'paid' then 'refund' else 'none' end);
    end if;
    if p_status = 'paid' then
      if b.pay_status = 'paid' then return jsonb_build_object('action', 'none'); end if;
      if b.status in ('expired', 'cancelled', 'declined') then
        update public.bookings set mollie_id = p_mollie, pay_method = 'online', pay_status = 'paid', paid_at = now(),
               refund_status = 'due' where id = p_id;
        return jsonb_build_object('action', 'none'); -- the refund runs from refund_status
      end if;
      update public.bookings set mollie_id = p_mollie, pay_method = 'online', pay_status = 'paid', paid_at = now(),
             status = case when status = 'awaiting_payment' then 'pending' else status end,
             request_at = case when status = 'awaiting_payment' then now() else request_at end,
             request_notice_sent = case when status = 'awaiting_payment' then false else request_notice_sent end
        where id = p_id;
    elsif p_status in ('failed', 'canceled', 'expired') and b.status = 'awaiting_payment' and b.mollie_id = p_mollie then
      update public.bookings set status = 'expired', responded_at = now(), notice_sent_at = now() where id = p_id;
    end if;
  elsif p_type = 'pack' then
    select * into sp from public.session_packs where id = p_id for update;
    if not found then
      return jsonb_build_object('action', case when p_status = 'paid' then 'refund' else 'none' end);
    end if;
    if p_status = 'paid' then
      if sp.status = 'requested' then
        update public.session_packs set status = 'paid', paid_at = now(), mollie_id = p_mollie, pay_method = 'online' where id = p_id;
      elsif sp.status = 'cancelled' or sp.mollie_id is distinct from p_mollie then
        return jsonb_build_object('action', 'refund');
      end if;
    end if;
  end if;
  return jsonb_build_object('action', 'none');
end $$;

-- Edge Function only: take the refunds that are due (so two calls never refund twice)
create or replace function public.claim_refunds()
returns jsonb language sql security definer set search_path = public as $$
  with claimed as (
    update public.bookings set refund_status = 'processing'
    where refund_status = 'due' and pay_method = 'online' and mollie_id is not null
    returning id, mollie_id, price
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'mollieId', mollie_id, 'amount', price)), '[]'::jsonb) from claimed;
$$;

-- Edge Function only: the result of a refund
create or replace function public.refund_done(p_id uuid, p_refund text, p_ok boolean)
returns void language sql security definer set search_path = public as $$
  update public.bookings
     set refund_status = case when p_ok then 'done' else 'due' end,
         refund_id = coalesce(p_refund, refund_id),
         pay_status = case when p_ok then 'refunded' else pay_status end
   where id = p_id;
$$;

-- Admin: the player paid at the headquarters
create or replace function public.mark_paid_in_person(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  select * into b from public.bookings where id = p_id;
  if not found then raise exception 'Booking not found.'; end if;
  if b.pay_method = 'pack' or b.pay_status <> 'unpaid' then raise exception 'This session doesn''t need a payment.'; end if;
  update public.bookings set pay_status = 'paid', pay_method = 'in_person', paid_at = now(),
         status = case when status = 'awaiting_payment' then 'pending' else status end,
         request_at = case when status = 'awaiting_payment' then now() else request_at end
    where id = p_id returning * into b;
  return public._booking_json(b);
end $$;

-- Admin: money paid at the desk was given back by hand
create or replace function public.mark_refunded(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  update public.bookings set refund_status = 'done', pay_status = 'refunded'
    where id = p_id and refund_status = 'manual' returning * into b;
  if not found then raise exception 'No manual refund open for this booking.'; end if;
  return public._booking_json(b);
end $$;

-- ---------------------------------------------------------
-- Admin dashboard data
-- ---------------------------------------------------------
create or replace function public.admin_data()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  perform public._expire_requests();
  return jsonb_build_object(
    'players', coalesce((select jsonb_agg(public._player_json(p.id)) from public.profiles p), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(public._booking_json(b) order by b.day, b.hour)
                         from public.bookings b), '[]'::jsonb),
    'applications', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', p.name, 'email', p.email,
                           'role', a.role_title, 'specialties', a.specialties, 'bio', a.bio, 'status', a.status,
                           'trainerId', a.trainer_id, 'createdAt', a.created_at, 'reviewedAt', a.reviewed_at) order by a.created_at desc)
                         from public.trainer_applications a join public.profiles p on p.id = a.user_id), '[]'::jsonb),
    'unlinkedTrainers', coalesce((select jsonb_agg(t.id) from public.trainers t where t.email is null and t.active), '[]'::jsonb),
    'pricing', jsonb_build_object('price', public._config('session_price')::numeric, 'fee', public._config('trainer_fee')::numeric,
                                  'ownerTrainerId', public._config('owner_trainer_id'),
                                  'introPrice', public._config('intro_price')::numeric,
                                  'duoPrice', public._config('duo_price')::numeric, 'duoFee', public._config('duo_trainer_fee')::numeric,
                                  'trainers', coalesce((select jsonb_object_agg(tp.trainer_id, jsonb_build_object('price', tp.price, 'fee', tp.fee))
                                                        from public.trainer_pricing tp), '{}'::jsonb)),
    'packs', coalesce((select jsonb_agg(public._pack_json(sp) order by sp.created_at desc) from public.session_packs sp), '[]'::jsonb)
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
revoke execute on function public._insert_stats(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._trainer_xp(public.trainers, uuid) from public, anon, authenticated;
revoke execute on function public._booking_json(public.bookings) from public, anon, authenticated;
revoke execute on function public._can_coach(text) from public, anon, authenticated;
revoke execute on function public._confirm_deadline(timestamptz, date, integer) from public, anon, authenticated;
revoke execute on function public._expire_requests() from public, anon, authenticated;
revoke execute on function public._can_settle(public.bookings) from public, anon, authenticated;
revoke execute on function public.mark_no_show(uuid) from public, anon;
revoke execute on function public.claim_booking_notices() from public, anon;
grant execute on function public.mark_no_show(uuid) to authenticated;
grant execute on function public.claim_booking_notices() to authenticated;
revoke execute on function public.respond_booking(uuid, boolean) from public, anon;
revoke execute on function public.reward_session(uuid) from public, anon;
revoke execute on function public.coach_bookings() from public, anon;
grant execute on function public.respond_booking(uuid, boolean) to authenticated;
grant execute on function public.reward_session(uuid) to authenticated;
grant execute on function public.coach_bookings() to authenticated;
revoke execute on function public.coach_earnings() from public, anon;
revoke execute on function public.mark_payout(text) from public, anon;
grant execute on function public.coach_earnings() to authenticated;
grant execute on function public.mark_payout(text) to authenticated;
revoke execute on function public.apply_as_trainer(jsonb) from public, anon;
revoke execute on function public.review_trainer_application(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_inbox() from public, anon;
grant execute on function public.apply_as_trainer(jsonb) to authenticated;
grant execute on function public.review_trainer_application(uuid, boolean, text) to authenticated;
grant execute on function public.admin_inbox() to authenticated;
grant execute on function public.trainer_list() to anon, authenticated;
revoke execute on function public.set_leaderboard_visibility(boolean) from public, anon;
grant execute on function public.set_leaderboard_visibility(boolean) to authenticated;
grant execute on function public.leaderboard() to anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.my_data() from public, anon;
revoke execute on function public.touch_login() from public, anon;
revoke execute on function public.book_session(text, date, integer, text, text, text, text) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.log_workout(text, integer) from public, anon;
revoke execute on function public.save_body_stats(jsonb) from public, anon;
revoke execute on function public.claim_orders(text[]) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.admin_data() from public, anon;

grant execute on function public.my_data() to authenticated;
grant execute on function public.touch_login() to authenticated;
grant execute on function public.book_session(text, date, integer, text, text, text, text) to authenticated;
revoke execute on function public._quote(uuid, text, text) from public, anon, authenticated;
revoke execute on function public._pack_used(uuid) from public, anon, authenticated;
revoke execute on function public._pack_json(public.session_packs) from public, anon, authenticated;
revoke execute on function public.request_pack(integer, text) from public, anon;
revoke execute on function public._refund_state(public.bookings) from public, anon, authenticated;
revoke execute on function public.payment_request(text, uuid) from public, anon;
revoke execute on function public.attach_payment(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.payment_update(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.claim_refunds() from public, anon, authenticated;
revoke execute on function public.refund_done(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.mark_paid_in_person(uuid) from public, anon;
revoke execute on function public.mark_refunded(uuid) from public, anon;
grant execute on function public.payment_request(text, uuid) to authenticated;
grant execute on function public.mark_paid_in_person(uuid) to authenticated;
grant execute on function public.mark_refunded(uuid) to authenticated;
do $$ begin
  -- the payments Edge Function uses the service role
  execute 'grant execute on function public.attach_payment(text, uuid, text) to service_role';
  execute 'grant execute on function public.payment_update(text, text, text, uuid) to service_role';
  execute 'grant execute on function public.claim_refunds() to service_role';
  execute 'grant execute on function public.refund_done(uuid, text, boolean) to service_role';
exception when undefined_object then null;
end $$;
revoke execute on function public.cancel_pack_request(uuid) from public, anon;
revoke execute on function public.mark_pack_paid(uuid) from public, anon;
revoke execute on function public.set_trainer_pricing(text, numeric, numeric) from public, anon;
grant execute on function public.request_pack(integer, text) to authenticated;
grant execute on function public.cancel_pack_request(uuid) to authenticated;
grant execute on function public.mark_pack_paid(uuid) to authenticated;
grant execute on function public.set_trainer_pricing(text, numeric, numeric) to authenticated;
grant execute on function public.pricing_info() to anon, authenticated;
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
