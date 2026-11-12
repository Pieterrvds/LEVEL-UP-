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
  ('health_form_months', '12'),   -- the health questionnaire is confirmed again after this many months
  ('loyalty_sessions', '20'),     -- every this many completed (paid) sessions earn a free 1:1 session
  ('reward_valid_months', '3'),   -- a free session voucher must be booked within this many months
  ('storage_host', 'zdwlihbsmqiggpyensxc.supabase.co'), -- profile photos must come from this project's Storage
  ('payment_hold_minutes', '20'), -- how long an unpaid online booking holds the hour
  ('class_price', '12'),          -- group class: what a player pays per class (euro)
  ('class_trainer_fee', '35'),    -- group class: the trainer's fixed fee per class held
  ('class_xp', '50'),             -- group class: XP for being ticked off as present
  ('class_capacity', '12'),       -- group class: default number of places
  ('class_cancel_hours', '4'),    -- group class: free sign-out up to this many hours before; later = charged
  ('class_reminder_minutes', '90'), -- group class: the "starts soon" push goes out this long before
  ('class_chat_hours', '24'),     -- (no longer used: group chats are per kind of class now, see class_chat_days)
  ('class_chat_days', '60'),      -- group chat: you stay in a group's chat this many days after your last class of it
  ('tab_limit', '30'),            -- shop: most a member can have open "on their tab" (drinks and bars at the gym)
  ('room_places', '2'),           -- the gym room: how many 1:1 sessions (own coaches and renters) fit at the same time
  ('rent_shared_price', '15'),    -- room rental per hour: a renter who shares the room (takes one place)
  ('rent_full_price', '25'),      -- room rental per hour: the whole room, weekdays before 17:00
  ('rent_full_peak_price', '35')  -- room rental per hour: the whole room, from 17:00 and in the weekend
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

-- Shop management (admin.html -> Shop): category, on/off, stock left (null = no limit) and an end date for limited drops.
-- New products start switched off, so nobody can pay for something that isn't for sale yet.
alter table public.shop_items add column if not exists category text not null default 'merch';
alter table public.shop_items add column if not exists active boolean not null default true;
alter table public.shop_items add column if not exists stock integer check (stock is null or stock >= 0);
alter table public.shop_items add column if not exists drop_ends_at timestamptz;
-- Discounts: a sale price (optionally until a date); "price" stays the normal price and shows crossed out
alter table public.shop_items add column if not exists sale_price numeric(10, 2) check (sale_price is null or sale_price >= 0);
alter table public.shop_items add column if not exists sale_ends_at timestamptz;
alter table public.shop_items add column if not exists announced_at timestamptz;       -- "New in the shop" went out
alter table public.shop_items add column if not exists sale_announced_at timestamptz;  -- the last "on sale" message
update public.shop_items set category = 'tools' where id in ('parallettes', 'bands') and category = 'merch';
update public.shop_items set announced_at = now() where active and announced_at is null;  -- already on sale = already introduced
insert into public.shop_items (id, name, price, category, active, stock) values
  ('shake', 'Protein shake', 3.5, 'fuel', false, null),
  ('bar', 'Protein bar', 2.5, 'fuel', false, null),
  ('energy', 'Energy drink', 2.5, 'fuel', false, null),
  ('water', 'Water', 1.5, 'fuel', false, null),
  ('hoodie_s1', 'Season 1 Hoodie', 55, 'limited', false, 25)
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
-- Profile photo: a public URL in the Storage bucket "avatars" (folder = the player's id)
alter table public.profiles add column if not exists avatar_url text;
-- Birthday, day and month only ('MM-DD', no year): the mascot wears a cake that day. Only the member sees it.
alter table public.profiles add column if not exists birthday text;
do $$ begin
  alter table public.profiles add constraint profiles_birthday_check check (birthday is null or birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
exception when duplicate_object then null; end $$;
alter table public.profiles add column if not exists streak_reminded_week date;  -- training streak: last week a reminder went out

-- Likes between players (the hearts on the high scores): one like per person per player per week
-- (Monday to Sunday, Brussels time). The count is everything someone ever received.
create table if not exists public.player_likes (
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  week date not null,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id, week),
  check (from_id <> to_id)
);
create index if not exists player_likes_to_idx on public.player_likes (to_id, week);
alter table public.player_likes enable row level security;  -- no policies: only the functions below read and write it

-- News for everyone: a new group class, a new product, a sale or a message from the admin.
-- It shows behind the bell on the website and goes out as a notification (see _broadcast for the anti-spam rules).
create table if not exists public.news (
  id bigint generated always as identity primary key,
  kind text not null default 'info',    -- class | shop_new | shop_sale | info
  title text not null,
  body text not null default '',
  url text not null default 'index.html',
  ref text,                              -- what it is about (class-<id>, shop-<id>), to take it away again
  expires_at timestamptz,                -- a class that started or a sale that ended is no news any more
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.news enable row level security;  -- read through pricing_info only
-- Celebrations (levelup-celebrate.js): a full-screen moment the player sees exactly once, on whatever device
-- they open next: a purchase that was really paid, a higher place on the high scores, a like they got.
-- The server puts them in this queue; the website claims each one just before it plays (see celebrations_claim).
create table if not exists public.celebrations (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('purchase', 'rank', 'like')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists celebrations_open_idx on public.celebrations (user_id) where seen_at is null;
alter table public.celebrations enable row level security;  -- only through the functions below
-- The place on the all-time high scores the player was last told about (to notice when they climb)
alter table public.profiles add column if not exists rank_place integer;
create or replace function public._celebrate(p_user uuid, p_kind text, p_payload jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.celebrations (user_id, kind, payload) select p_user, p_kind, coalesce(p_payload, '{}'::jsonb) where p_user is not null;
$$;

-- A member's page for other members: a short text about themselves, photos, and whether others may see it at all
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists profile_visible boolean not null default true;
create table if not exists public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  url text not null,          -- public URL in the Storage bucket "avatars" (the member's own folder)
  caption text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists profile_photos_user_idx on public.profile_photos (user_id, created_at desc);
-- A row is a post: one to six photos with a text. url is the first photo, more_urls the others; caption is the text.
alter table public.profile_photos add column if not exists more_urls text[] not null default '{}';
alter table public.profile_photos enable row level security;  -- only through the functions below
-- Reactions on those photos: a heart on the photo, comments, and a heart on a comment
create table if not exists public.photo_likes (
  photo_id uuid not null references public.profile_photos (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
create table if not exists public.photo_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.profile_photos (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists photo_comments_photo_idx on public.photo_comments (photo_id, created_at);
create table if not exists public.photo_comment_likes (
  comment_id uuid not null references public.photo_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.photo_likes enable row level security;
alter table public.photo_comments enable row level security;
alter table public.photo_comment_likes enable row level security;
-- Players can switch off news notifications (their own bookings, chat and XP always come through)
alter table public.profiles add column if not exists push_news boolean not null default true;

create table if not exists public.xp_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists xp_log_user_idx on public.xp_log (user_id, created_at desc);

-- Player of the Month: one row per month (the winner of the "This month" high scores), settled on the 1st
create table if not exists public.monthly_awards (
  month date primary key,                 -- first day of the month that was won
  user_id uuid references public.profiles (id) on delete set null,
  xp integer not null default 0,          -- XP earned in that month
  created_at timestamptz not null default now()
);
alter table public.monthly_awards enable row level security;

-- Reviews from real clients: players write one after a completed session, the admin approves it before it shows.
-- The admin can also add a review a client sent another way (WhatsApp, Google…).
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete cascade,   -- null = added by the admin
  name text not null,
  quote text not null check (char_length(quote) between 10 and 300),
  rating smallint not null default 5 check (rating between 1 and 5),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
alter table public.reviews enable row level security;
-- A review the admin added for a client has no account behind it: photo_user is the member whose profile photo shows with it
alter table public.reviews add column if not exists photo_user uuid references public.profiles (id) on delete set null;
-- photo_checked: the member was looked up by name once (or the admin chose); "no photo" then stays no photo
alter table public.reviews add column if not exists photo_checked boolean not null default false;
-- sample: an example review to fill the row while there are few real ones. The site marks it "Example";
-- delete them under Admin > Reviews once real reviews are in. Added once (app_config: sample_reviews_added).
alter table public.reviews add column if not exists sample boolean not null default false;
do $$ begin
  if not exists (select 1 from public.app_config where key = 'sample_reviews_added') then
    insert into public.reviews (user_id, name, quote, rating, status, approved_at, sample, photo_checked) values
      (null, 'Lotte', 'Na drie maanden doe ik mijn eerste pull-up. De sessies zijn pittig, maar ik kijk er elke week naar uit.', 5, 'approved', now() - interval '1 day', true, true),
      (null, 'Bram', 'De social run club is de reden dat ik op woensdag mijn loopschoenen aantrek. Topsfeer, niemand blijft achter.', 5, 'approved', now() - interval '2 days', true, true),
      (null, 'Sofie', 'Duidelijke uitleg en een schema op mijn maat. Een sessie boeken gaat heel vlot.', 4, 'approved', now() - interval '3 days', true, true),
      (null, 'Thomas', 'XP verdienen per sessie klinkt als een spelletje, maar het werkt: ik heb nog geen training overgeslagen.', 5, 'approved', now() - interval '4 days', true, true);
    insert into public.app_config (key, value) values ('sample_reviews_added', '1') on conflict (key) do nothing;
  end if;
end $$;

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

-- The weekly check-in: one row per member per week (the Monday, Brussels time). A tap on "Check in" on the start
-- screen and a saved set of body stats both count. It pays XP once a week and keeps the streak going.
create table if not exists public.checkins (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week)
);
alter table public.checkins enable row level security;  -- only through the functions below
-- the weeks that already had a check-in (a saved set of body stats) before this table existed
insert into public.checkins (user_id, week, created_at)
  select b.user_id, date_trunc('week', b.day)::date, min(b.created_at) from public.body_stats b group by 1, 2
  on conflict do nothing;

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
-- "On my tab": drinks and bars taken at the gym, paid later at the desk. The XP comes once it's paid.
alter table public.orders add column if not exists status text not null default 'paid' check (status in ('paid', 'open', 'cancelled'));
alter table public.orders add column if not exists paid_at timestamptz;

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
-- A pack can come with a gift from the shop (a bundle, e.g. 10 sessions + a T-shirt), handed out at the desk
alter table public.session_packs add column if not exists gift text;
alter table public.session_packs add column if not exists gift_given_at timestamptz;

alter table public.session_packs add column if not exists pay_method text not null default 'in_person';
alter table public.session_packs add column if not exists mollie_id text;

-- Bookable hours per trainer, edited in the admin dashboard:
--   weekly hours (weekday 0 = Sunday … 6 = Saturday) that repeat every week,
--   extra hours on one date (kind 'open'), or closed on one date (kind 'closed': day off, holiday).
create table if not exists public.trainer_hours (
  id uuid primary key default gen_random_uuid(),
  trainer_id text not null references public.trainers (id) on delete cascade,
  weekday smallint check (weekday between 0 and 6),
  day date,
  start_hour smallint not null check (start_hour between 0 and 23),
  end_hour smallint not null check (end_hour between 1 and 24),
  kind text not null default 'open' check (kind in ('open', 'closed')),
  note text not null default '',
  created_at timestamptz not null default now(),
  check (end_hour > start_hour),
  check ((weekday is null) <> (day is null)),
  check (kind = 'open' or day is not null)
);
create index if not exists trainer_hours_trainer_idx on public.trainer_hours (trainer_id);

-- Health questionnaire (PAR-Q style), filled in before the first booking. Health data is
-- sensitive: only the player, their trainers (for their bookings) and admins can see it.
create table if not exists public.health_forms (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,   -- {"q1": false, …, "q8": true}
  has_risk boolean not null default false,       -- at least one "yes"
  notes text not null default '',
  signed_name text not null default '',
  accepted_at timestamptz not null default now()
);

create or replace function public._health_brief(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('hasRisk', h.has_risk, 'answers', h.answers, 'notes', h.notes, 'acceptedAt', h.accepted_at,
    'valid', h.accepted_at > now() - make_interval(months => public._config('health_form_months')::int))
  from public.health_forms h where h.user_id = p_user;
$$;

create or replace function public._health_valid(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.health_forms h where h.user_id = p_user
    and h.accepted_at > now() - make_interval(months => public._config('health_form_months')::int));
$$;

-- Free 1:1 session vouchers: one for every loyalty_sessions completed sessions (source 'loyalty',
-- seq 1, 2, 3 …) and rank rewards (Champion, Legend: Legend also gets a LEVEL-UP hoodie, handed out
-- at the desk). A booking that uses a voucher has price 0; LEVEL-UP still pays the trainer's fee.
-- A declined, expired or freely cancelled booking gives the voucher back (like a pack credit).
create table if not exists public.reward_vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('loyalty', 'champion', 'legend')),
  seq integer not null default 1,
  earned_at timestamptz not null default now(),
  expires_at timestamptz not null,
  hoodie boolean not null default false,
  hoodie_given_at timestamptz,
  unique (user_id, source, seq)
);
alter table public.bookings add column if not exists voucher_id uuid references public.reward_vouchers (id) on delete set null;

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
  check (pay_method in ('online', 'in_person', 'pack', 'reward') and pay_status in ('unpaid', 'paid', 'refunded', 'n/a'));
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

-- Weekly sessions: the same hour with the same trainer every week, for a number of weeks or until someone stops it.
-- The series only says what repeats; every week is an ordinary booking (bookings.series_id) with the ordinary rules
-- for price, cancelling and rewarding. Weeks further away than the booking window are added as they come closer.
create table if not exists public.booking_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  trainer_id text not null references public.trainers (id),
  weekday smallint not null check (weekday between 1 and 7),   -- 1 = Monday … 7 = Sunday
  hour smallint not null check (hour between 0 and 23),
  kind text not null default 'solo',
  partner text not null default '',
  note text not null default '',
  first_day date not null,
  last_day date,                              -- null = every week until someone stops it
  next_day date not null,                     -- the next week that still has to be planned
  status text not null default 'requested' check (status in ('requested', 'active', 'ended')),
  ended_reason text,                          -- declined, expired, stopped, done
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists booking_series_user_idx on public.booking_series (user_id);
create index if not exists booking_series_open_idx on public.booking_series (status) where status <> 'ended';
alter table public.booking_series enable row level security;  -- only through the functions below
alter table public.bookings add column if not exists series_id uuid references public.booking_series (id) on delete set null;
alter table public.bookings add column if not exists moved_from text;  -- "Mon 16 Nov 18:00": where it stood before the trainer moved it
create index if not exists bookings_series_idx on public.bookings (series_id) where series_id is not null;

-- Money per booking, fixed at the moment of booking (so later price changes don't rewrite history)
alter table public.bookings add column if not exists price numeric(8, 2) not null default 60;
alter table public.bookings add column if not exists trainer_fee numeric(8, 2) not null default 40;
alter table public.bookings add column if not exists payout_at timestamptz; -- when the admin paid the trainer
update public.bookings set trainer_fee = price
  where trainer_id = public._config('owner_trainer_id') and trainer_fee <> price;

-- A voucher is used while a booking holds it (declined, expired and cancelled bookings don't)
create or replace function public._voucher_used(p_voucher uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.bookings where voucher_id = p_voucher and status not in ('declined', 'expired', 'cancelled') limit 1;
$$;

create or replace function public._voucher_json(v public.reward_vouchers)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', v.id, 'source', v.source, 'seq', v.seq, 'earnedAt', v.earned_at, 'expiresAt', v.expires_at,
    'hoodie', v.hoodie, 'hoodieGivenAt', v.hoodie_given_at, 'bookingId', public._voucher_used(v.id),
    'name', p.name, 'email', p.email)
  from public.profiles p where p.id = v.user_id;
$$;

-- Completed sessions that count for the loyalty card (free sessions themselves don't)
create or replace function public._loyalty_count(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.bookings where user_id = p_user and status = 'completed' and price_type <> 'reward';
$$;

create or replace function public._rewards_json(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'every', public._config('loyalty_sessions')::int,
    'count', public._loyalty_count(p_user),
    'validMonths', public._config('reward_valid_months')::int,
    'vouchers', coalesce((select jsonb_agg(public._voucher_json(v) order by v.earned_at desc, v.seq desc)
                          from public.reward_vouchers v where v.user_id = p_user), '[]'::jsonb));
$$;

create or replace function public._booking_json(b public.bookings)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id, 'trainerId', b.trainer_id, 'date', b.day, 'hour', b.hour, 'note', b.note, 'xp', b.xp,
    'status', b.status, 'createdAt', b.created_at, 'respondedAt', b.responded_at, 'rewardedAt', b.rewarded_at,
    'price', b.price, 'trainerFee', b.trainer_fee, 'payoutAt', b.payout_at,
    'kind', b.kind, 'partner', b.partner, 'priceType', b.price_type, 'packId', b.pack_id, 'voucherId', b.voucher_id,
    'payMethod', b.pay_method, 'payStatus', b.pay_status, 'paidAt', b.paid_at, 'refundStatus', b.refund_status,
    'freeCancelUntil', ((b.day + make_interval(hours => b.hour)) at time zone 'Europe/Brussels')
                       - make_interval(hours => public._config('free_cancel_hours')::int),
    'name', p.name, 'email', p.email, 'avatar', p.avatar_url, 'userId', b.user_id,
    'trainerEmail', (select t.email from public.trainers t where t.id = b.trainer_id),
    -- part of a weekly session? and did the trainer move it?
    'movedFrom', b.moved_from,
    'series', (select jsonb_build_object('id', s.id, 'weekday', s.weekday, 'hour', s.hour, 'firstDay', s.first_day,
                                         'lastDay', s.last_day, 'status', s.status)
               from public.booking_series s where s.id = b.series_id)
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
    'gift', sp.gift, 'giftGivenAt', sp.gift_given_at,
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

-- Group classes: one trainer, several players (CrossFit WOD, HIIT, bootcamp …), booked per class.
-- class_signups holds every player's place: booked, on the waitlist, present (attended) or not.
create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 40),
  trainer_id text not null references public.trainers (id),
  starts_at timestamptz not null,
  minutes integer not null default 60 check (minutes between 15 and 240),
  capacity integer not null check (capacity between 2 and 60),
  price numeric(8, 2) not null check (price >= 0),
  trainer_fee numeric(8, 2) not null default 0 check (trainer_fee >= 0),
  xp integer not null default 50 check (xp between 0 and 500),
  location text not null default 'Hoogstraat 40, Aalst',
  note text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  cancel_reason text not null default '',
  series_id uuid,                     -- classes made together with "repeat weekly"
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  reminder_pushed_at timestamptz,
  finished_at timestamptz,
  payout_at timestamptz               -- the trainer's fee for this class was paid out
);
create index if not exists class_sessions_start_idx on public.class_sessions (starts_at);
create index if not exists class_sessions_trainer_idx on public.class_sessions (trainer_id, starts_at);

create table if not exists public.class_signups (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'booked'
    check (status in ('awaiting_payment', 'booked', 'waitlist', 'attended', 'no_show', 'cancelled', 'late_cancel')),
  price numeric(8, 2) not null default 0,
  pay_method text not null default 'in_person' check (pay_method in ('online', 'in_person')),
  pay_status text not null default 'unpaid' check (pay_status in ('unpaid', 'paid', 'refunded')),
  paid_at timestamptz,
  mollie_id text,
  refund_status text,                 -- due / processing / done (online) or manual (paid at the desk)
  refund_id text,
  xp integer not null default 0,      -- XP given for being present (taken back when unticked)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),   -- last sign-up / change (the payment hold counts from here)
  unique (class_id, user_id)
);
create index if not exists class_signups_user_idx on public.class_signups (user_id);
create index if not exists class_signups_class_idx on public.class_signups (class_id, status, updated_at);

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
alter table public.class_sessions enable row level security;
alter table public.class_signups enable row level security;
revoke all on public.class_sessions, public.class_signups from anon, authenticated; -- only through the class_* functions
alter table public.trainer_applications enable row level security;
alter table public.session_packs enable row level security;
alter table public.trainer_pricing enable row level security;
alter table public.trainer_hours enable row level security;
alter table public.health_forms enable row level security;
drop policy if exists "own health form or admin" on public.health_forms;
create policy "own health form or admin" on public.health_forms for select using (user_id = auth.uid() or public.is_admin());
alter table public.reward_vouchers enable row level security;
drop policy if exists "own vouchers or admin" on public.reward_vouchers;
create policy "own vouchers or admin" on public.reward_vouchers for select using (user_id = auth.uid() or public.is_admin());

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
  perform public._check_rewards(p_user);
end $$;

-- Hands out the free session vouchers a player has earned (safe to run again: one per card / rank)
create or replace function public._check_rewards(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  cards integer;
  valid interval := make_interval(months => public._config('reward_valid_months')::int);
begin
  select * into p from public.profiles where id = p_user;
  if not found then return; end if;
  cards := public._loyalty_count(p_user) / greatest(1, public._config('loyalty_sessions')::int);
  insert into public.reward_vouchers (user_id, source, seq, expires_at)
    select p_user, 'loyalty', g, now() + valid from generate_series(1, cards) g
    on conflict (user_id, source, seq) do nothing;
  -- rank rewards are for clients: trainers earn their XP by coaching
  if exists (select 1 from public.trainers t where t.email is not null and lower(t.email) = lower(p.email)) then return; end if;
  if p.xp >= 6600 then   -- Champion, LVL 12
    insert into public.reward_vouchers (user_id, source, expires_at) values (p_user, 'champion', now() + valid)
      on conflict (user_id, source, seq) do nothing;
  end if;
  if p.xp >= 12000 then  -- Legend, LVL 16
    insert into public.reward_vouchers (user_id, source, expires_at, hoodie) values (p_user, 'legend', now() + valid, true)
      on conflict (user_id, source, seq) do nothing;
  end if;
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
  owns_all boolean;
begin
  select * into p from public.profiles where id = p_user;
  if not found then return; end if;

  perform public._unlock(p_user, 'new_player', 50, 'New player');

  if exists (select 1 from public.body_stats where user_id = p_user) then
    perform public._unlock(p_user, 'stats_saved', 25, 'Know your numbers');
  end if;


  if (select count(*) from public.checkins where user_id = p_user) >= 4 then
    perform public._unlock(p_user, 'checkins_4', 150, 'On track');
  end if;

  if p.sessions_booked >= 1 then perform public._unlock(p_user, 'first_session', 100, 'First session'); end if;
  if (select count(distinct trainer_id) from public.bookings where user_id = p_user and status = 'completed') >= 3 then
    perform public._unlock(p_user, 'full_party', 200, 'Full squad');
  end if;
  if p.sessions_booked >= 5 then perform public._unlock(p_user, 'sessions_5', 250, 'Regular'); end if;

  if exists (select 1 from public.orders where user_id = p_user) then
    perform public._unlock(p_user, 'first_loot', 100, 'First buy');
  end if;
  if coalesce((p.inventory ->> 'tshirt')::int, 0) > 0 and coalesce((p.inventory ->> 'hoodie')::int, 0) > 0 then
    perform public._unlock(p_user, 'full_drip', 150, 'Full drip');
  end if;
  if coalesce((p.inventory ->> 'parallettes')::int, 0) > 0 and coalesce((p.inventory ->> 'bands')::int, 0) > 0 then
    perform public._unlock(p_user, 'home_gym', 150, 'Home gym');
  end if;
  select bool_and(coalesce((p.inventory ->> s.id)::int, 0) > 0) into owns_all from public.shop_items s where s.category in ('merch', 'tools');
  if owns_all then perform public._unlock(p_user, 'collector', 300, 'Collector'); end if;
end $$;

-- The checks every saved set of stats must pass (new check-in or a correction)
create or replace function public._check_stats(p jsonb)
returns void language plpgsql immutable as $$
declare
  w numeric := (p ->> 'weight')::numeric;
  h numeric := (p ->> 'height')::numeric;
  a integer := (p ->> 'age')::int;
begin
  if w is null or w < 30 or w > 300 then raise exception 'Enter a weight between 30 and 300 kg.'; end if;
  if h is null or h < 120 or h > 230 then raise exception 'Enter a height between 120 and 230 cm.'; end if;
  if a is null or a < 14 or a > 100 then raise exception 'Enter an age between 14 and 100.'; end if;
end $$;

-- This week's check-in (Monday to Sunday, Brussels): the first one in a week pays the check-in XP, a second one
-- changes nothing. Returns the XP it gave (0 = already checked in this week).
create or replace function public._week_checkin(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare w date := date_trunc('week', now() at time zone 'Europe/Brussels')::date;
begin
  insert into public.checkins (user_id, week) values (p_user, w) on conflict do nothing;
  if not found then return 0; end if;
  perform public._grant_xp(p_user, 25, 'Weekly check-in');
  return 25;
end $$;

-- Saves a set of character stats; it also counts as this week's check-in (XP once a week).
-- A second save on the same day corrects that day's row instead of adding one.
create or replace function public._insert_stats(p_user uuid, p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Brussels')::date;
  gained integer := 0;
begin
  perform public._check_stats(p);

  update public.body_stats set
    weight = (p ->> 'weight')::numeric, height = (p ->> 'height')::numeric, age = (p ->> 'age')::int,
    sex = left(coalesce(p ->> 'sex', 'male'), 10), goal = left(coalesce(p ->> 'goal', 'maintain'), 20),
    activity = least(2.0, greatest(1.0, coalesce((p ->> 'activity')::numeric, 1.55))),
    bmi = (p ->> 'bmi')::numeric, bmr = (p ->> 'bmr')::int, maintenance = (p ->> 'maintenance')::int,
    target = (p ->> 'target')::int, protein = (p ->> 'protein')::int
  where id = (select max(id) from public.body_stats where user_id = p_user and day = today);
  if found then
    return public._week_checkin(p_user);
  end if;

  insert into public.body_stats (user_id, day, weight, height, age, sex, goal, activity, bmi, bmr, maintenance, target, protein)
  values (p_user, today,
    (p ->> 'weight')::numeric, (p ->> 'height')::numeric, (p ->> 'age')::int, left(coalesce(p ->> 'sex', 'male'), 10), left(coalesce(p ->> 'goal', 'maintain'), 20),
    least(2.0, greatest(1.0, coalesce((p ->> 'activity')::numeric, 1.55))),
    (p ->> 'bmi')::numeric, (p ->> 'bmr')::int, (p ->> 'maintenance')::int, (p ->> 'target')::int, (p ->> 'protein')::int);

  gained := public._week_checkin(p_user);
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
  -- The head coach says hello in the chat
  begin
    perform public._welcome_chat(new.id);
  exception when others then
    null; -- never block a sign-up because of the welcome message
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- Player data in one call (shape used by the website)
-- ---------------------------------------------------------
-- ---------------------------------------------------------
-- Player of the Month and training streaks
-- ---------------------------------------------------------
-- Month score = XP earned in that month (Brussels time); the Player of the Month bonus itself doesn't count.
create or replace function public._month_xp(p_user uuid, p_month date)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(x.amount), 0)::int from public.xp_log x
  where x.user_id = p_user and x.reason <> 'Player of the Month'
    and x.created_at >= (p_month::timestamp at time zone 'Europe/Brussels')
    and x.created_at < ((p_month + interval '1 month')::timestamp at time zone 'Europe/Brussels');
$$;

-- Last month's winner (null when nobody earned XP), for the crown on the player card and the high scores
create or replace function public._potm_month()
returns date language sql stable as $$
  select (date_trunc('month', now() at time zone 'Europe/Brussels') - interval '1 month')::date;
$$;

-- Start of a booked hour (Brussels time); defined here because _streak below already uses it
create or replace function public._slot_start(p_day date, p_hour integer)
returns timestamptz language sql stable as $$
  select (p_day + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
$$;

-- Weekly sessions (booking_series): their names and how the website gets them (the rest is under "Weekly sessions")
create or replace function public._weekday_name(p_weekday integer)
returns text language sql immutable as $$
  select (array['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])[p_weekday];
$$;
-- "every Monday 18:00"
create or replace function public._series_label(s public.booking_series)
returns text language sql immutable as $$
  select 'every ' || public._weekday_name(s.weekday) || ' ' || lpad(s.hour::text, 2, '0') || ':00';
$$;
create or replace function public._series_json(s public.booking_series)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'trainerId', s.trainer_id, 'weekday', s.weekday, 'hour', s.hour, 'kind', s.kind,
    'firstDay', s.first_day, 'lastDay', s.last_day, 'status', s.status, 'endedReason', s.ended_reason,
    'name', (select p.name from public.profiles p where p.id = s.user_id),
    'upcoming', (select count(*) from public.bookings k where k.series_id = s.id and k.status in ('pending', 'confirmed')
                 and public._slot_start(k.day, k.hour) > now()),
    'next', (select min(k.day) from public.bookings k where k.series_id = s.id and k.status in ('pending', 'confirmed')
             and public._slot_start(k.day, k.hour) > now()));
$$;


-- Weeks in a row (Monday to Sunday, Brussels) with at least one completed session, a group class you were at,
-- or the weekly check-in. This week counts as soon as it has one of those; until then the streak runs up to last week.
create or replace function public._streak(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with w as (select date_trunc('week', (now() at time zone 'Europe/Brussels')::date)::date as w0),
  done as (select distinct date_trunc('week', k.day)::date as wk from public.bookings k
           where k.user_id = p_user and k.status = 'completed'
           union
           select distinct date_trunc('week', (c.starts_at at time zone 'Europe/Brussels')::date)::date
           from public.class_signups g join public.class_sessions c on c.id = g.class_id
           where g.user_id = p_user and g.status = 'attended'
           union
           select h.week from public.checkins h where h.user_id = p_user),
  this_week as (select exists (select 1 from done, w where done.wk = w.w0) as done,
                       exists (select 1 from public.bookings k, w where k.user_id = p_user
                               and k.status in ('pending', 'confirmed', 'awaiting_payment')
                               and k.day between w.w0 and w.w0 + 6 and public._slot_start(k.day, k.hour) > now())
                       or exists (select 1 from public.class_signups g join public.class_sessions c on c.id = g.class_id, w
                                  where g.user_id = p_user and g.status = 'booked' and c.status = 'scheduled'
                                    and c.starts_at > now() and (c.starts_at at time zone 'Europe/Brussels')::date between w.w0 and w.w0 + 6) as planned),
  start as (select case when (select done from this_week) then w0 else w0 - 7 end as s from w),
  run as (select coalesce(min(g), 105) as weeks from generate_series(0, 105) g, start
          where not exists (select 1 from done where done.wk = start.s - 7 * g))
  select jsonb_build_object(
    'weeks', run.weeks,
    'thisWeek', tw.done,
    'planned', tw.planned,
    'atRisk', run.weeks >= 1 and not tw.done and not tw.planned)
  from run, this_week tw;
$$;

-- Your group classes (for the profile), recent and upcoming (the helpers it uses are in "Group classes" below)
create or replace function public._class_mine_json(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select jsonb_agg(public._class_json(c, p_user) order by c.starts_at)
    from public.class_sessions c join public.class_signups g on g.class_id = c.id and g.user_id = p_user
    where g.status <> 'cancelled' or g.updated_at > now() - interval '30 days'), '[]'::jsonb);
end $$;

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
    'pushNews', p.push_news,
    'bio', p.bio,
    'profileVisible', p.profile_visible,
    'birthday', p.birthday,
    'celebrations', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'payload', c.payload, 'date', c.created_at) order by c.id)
                              from public.celebrations c where c.user_id = p.id and c.seen_at is null), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'url', ph.url, 'urls', to_jsonb(array[ph.url] || ph.more_urls),
                                  'caption', ph.caption, 'date', ph.created_at) order by ph.created_at desc)
                        from public.profile_photos ph where ph.user_id = p.id), '[]'::jsonb),
    'avatarUrl', p.avatar_url,
    'application', (select jsonb_build_object('status', a.status, 'role', a.role_title, 'specialties', a.specialties,
                      'bio', a.bio, 'createdAt', a.created_at, 'reviewedAt', a.reviewed_at)
                    from public.trainer_applications a where a.user_id = p.id),
    'trainerId', (select t.id from public.trainers t where t.email is not null and lower(t.email) = lower(p.email)),
    'admin', lower(p.email) = any (string_to_array(lower(replace(public._config('admin_emails'), ' ', '')), ',')),
    'xpLog', coalesce((select jsonb_agg(jsonb_build_object('date', x.created_at, 'amount', x.amount, 'reason', x.reason) order by x.id desc)
                       from (select * from public.xp_log where user_id = p.id order by id desc limit 50) x), '[]'::jsonb),
    'workouts', coalesce((select jsonb_agg(jsonb_build_object('date', w.day, 'type', w.type, 'minutes', w.minutes, 'xp', w.xp) order by w.id desc)
                          from public.workouts w where w.user_id = p.id), '[]'::jsonb),
    'bodyStats', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'date', b.day, 'weight', b.weight, 'height', b.height, 'age', b.age,
                              'sex', b.sex, 'goal', b.goal, 'bmi', b.bmi, 'bmr', b.bmr, 'maintenance', b.maintenance,
                              'target', b.target, 'protein', b.protein, 'activity', b.activity) order by b.day desc, b.id desc)
                           from public.body_stats b where b.user_id = p.id), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'date', o.created_at, 'items', o.items, 'total', o.total, 'status', o.status, 'xp', o.xp) order by o.created_at desc)
                           from public.orders o where o.user_id = p.id and o.status <> 'cancelled'), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(public._booking_json(k) order by k.day, k.hour)
                          from public.bookings k where k.user_id = p.id), '[]'::jsonb),
    'packs', coalesce((select jsonb_agg(public._pack_json(sp) order by sp.created_at desc)
                       from public.session_packs sp where sp.user_id = p.id), '[]'::jsonb),
    -- weekly sessions that run, wait for the trainer, or ended in the last two weeks
    'series', coalesce((select jsonb_agg(public._series_json(q) order by q.created_at)
                        from public.booking_series q where q.user_id = p.id
                          and (q.status <> 'ended' or q.ended_at > now() - interval '14 days')), '[]'::jsonb),
    'classes', public._class_mine_json(p.id),
    'healthForm', public._health_brief(p.id),
    'streak', public._streak(p.id),
    -- the weekly check-in: done this week?, in how many weeks so far, and what it pays
    'checkin', jsonb_build_object(
      'done', exists (select 1 from public.checkins h where h.user_id = p.id
                      and h.week = date_trunc('week', now() at time zone 'Europe/Brussels')::date),
      'weeks', (select count(*) from public.checkins h where h.user_id = p.id),
      'xp', 25),
    'potm', (select jsonb_build_object('month', a.month, 'xp', a.xp) from public.monthly_awards a
             where a.user_id = p.id and a.month = public._potm_month()),
    'potmWins', (select count(*) from public.monthly_awards a where a.user_id = p.id),
    'review', (select jsonb_build_object('quote', r.quote, 'rating', r.rating, 'status', r.status, 'createdAt', r.created_at)
               from public.reviews r where r.user_id = p.id),
    'rewards', public._rewards_json(p.id),
    'likes', (select count(*) from public.player_likes l where l.to_id = p.id),
    'likesWeek', (select count(*) from public.player_likes l where l.to_id = p.id
                  and l.week = date_trunc('week', now() at time zone 'Europe/Brussels')::date),
    'likedBy', coalesce((select jsonb_agg(jsonb_build_object('userId', f.id, 'name', f.name, 'avatarUrl', f.avatar_url, 'date', l.created_at) order by l.created_at desc)
                         from (select * from public.player_likes where to_id = p.id order by created_at desc limit 8) l
                         join public.profiles f on f.id = l.from_id), '[]'::jsonb),
    'introEligible', not exists (select 1 from public.bookings k where k.user_id = p.id
                                 and k.status in ('awaiting_payment', 'pending', 'confirmed', 'completed', 'no_show', 'late_cancel'))
  )
  from public.profiles p
  where p.id = p_user;
$$;

-- Did the player climb on the all-time high scores since they were last told? Then a celebration with the old
-- and the new place. A lower or equal place is only remembered. Hidden players and trainers have no place.
create or replace function public._check_rank(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  place integer;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then return; end if;
  if not p.show_on_leaderboard
     or exists (select 1 from public.trainers t where t.email is not null and lower(t.email) = lower(p.email)) then
    update public.profiles set rank_place = null where id = p_user and rank_place is not null;
    return;
  end if;
  -- the same order as the high scores: most XP first, equal XP = who joined first
  select count(*) + 1 into place from public.profiles o
  where o.show_on_leaderboard and o.id <> p.id
    and (o.xp > p.xp or (o.xp = p.xp and o.created_at < p.created_at))
    and not exists (select 1 from public.trainers t where t.email is not null and lower(t.email) = lower(o.email));
  if p.rank_place is not null and place < p.rank_place then
    perform public._celebrate(p_user, 'rank', jsonb_build_object('from', p.rank_place, 'to', place));
  end if;
  if p.rank_place is distinct from place then
    update public.profiles set rank_place = place where id = p_user;
  end if;
end $$;

-- The celebrations still waiting for the logged-in player (the website asks when something may be new)
create or replace function public.celebrations_open()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  perform public._check_rank(auth.uid());
  -- old news is no party: after 30 days they just count as seen
  update public.celebrations set seen_at = now() where user_id = auth.uid() and seen_at is null and created_at < now() - interval '30 days';
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'payload', c.payload, 'date', c.created_at) order by c.id)
                   from public.celebrations c where c.user_id = auth.uid() and c.seen_at is null), '[]'::jsonb);
end $$;

-- Just before a celebration plays: mark it as seen. Returns the ids that were still open, so two tabs or two
-- phones never both play the same one.
create or replace function public.celebrations_claim(p_ids bigint[])
returns bigint[] language sql security definer set search_path = public as $$
  with done as (
    update public.celebrations set seen_at = now()
    where id = any (p_ids) and user_id = auth.uid() and seen_at is null
    returning id
  )
  select coalesce(array_agg(id order by id), '{}'::bigint[]) from done;
$$;

create or replace function public.my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  perform public._expire_requests();
  perform public._series_extend();
  perform public._settle_player_of_month();
  -- profile can be missing if the account was made before this schema existed
  insert into public.profiles (id, email, name)
  select u.id, lower(u.email), left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'name'), ''), split_part(u.email, '@', 1)), 24)
  from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
  perform public._check_achievements(auth.uid());
  perform public._check_rank(auth.uid());
  update public.celebrations set seen_at = now() where user_id = auth.uid() and seen_at is null and created_at < now() - interval '30 days';
  return public._player_json(auth.uid());
end $$;

create or replace function public.touch_login()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_login = now() where id = auth.uid();
$$;

-- ---------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------
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
-- The booking itself, for a player: every check and the price. book_session (one session) and the weekly sessions
-- (book_series, _series_extend) both go through here.
create or replace function public._book(p_user uuid, p_trainer text, p_day date, p_hour integer, p_note text,
                                        p_kind text, p_partner text, p_pay text, p_series uuid default null)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  uid uuid := p_user;
  q jsonb;
  t public.trainers;
  horizon date := (date_trunc('week', now() at time zone 'Europe/Brussels')::date
                   + 7 * public._config('booking_weeks_ahead')::int);
  b public.bookings;
  voucher uuid;
begin
  if uid is null then raise exception 'Log in to book a session.'; end if;
  perform public._expire_requests();
  select * into t from public.trainers where id = p_trainer and active;
  if not found then raise exception 'This trainer is not available.'; end if;
  if p_hour < 0 or p_hour > 23 then raise exception 'Invalid time.'; end if;
  if p_kind not in ('solo', 'duo') then raise exception 'Invalid session type.'; end if;
  if p_kind = 'duo' and trim(coalesce(p_partner, '')) = '' then raise exception 'Enter the name of the person you train with.'; end if;
  if p_pay not in ('online', 'in_person', 'reward') then raise exception 'Invalid payment method.'; end if;
  if p_pay = 'reward' and p_kind <> 'solo' then raise exception 'A free session voucher is for a 1:1 session.'; end if;
  if not public._health_valid(uid) then
    raise exception 'Fill in the health questionnaire before you book a session.';
  end if;
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
  if exists (select 1 from public.class_sessions c where c.trainer_id = p_trainer and c.status = 'scheduled'
             and tstzrange(c.starts_at, c.starts_at + make_interval(mins => c.minutes))
                 && tstzrange(public._slot_start(p_day, p_hour), public._slot_start(p_day, p_hour) + interval '1 hour')) then
    raise exception 'This trainer leads a group class at that time. Join the class or pick another hour.';
  end if;
  if exists (select 1 from public.bookings where user_id = uid and day = p_day and hour = p_hour
             and status in ('awaiting_payment', 'pending', 'confirmed', 'completed')) then
    raise exception 'You already have a session at this time.';
  end if;
  -- the gym room itself: a class or a rental can take it whole, and it has a set number of places
  perform pg_advisory_xact_lock(hashtext('room-' || p_day::text));
  if public._room_blocker(public._slot_start(p_day, p_hour), public._slot_start(p_day, p_hour) + interval '1 hour', false) is not null then
    raise exception 'The gym is full at that time. Pick another hour.';
  end if;

  -- one booking at a time per player, so two tabs can't spend the same pack credit
  perform 1 from public.profiles where id = uid for update;
  q := public._quote(uid, p_trainer, p_kind);
  if p_pay = 'reward' then
    select id into voucher from public.reward_vouchers v
      where v.user_id = uid and v.expires_at > now() and public._voucher_used(v.id) is null
      order by v.expires_at limit 1;
    if voucher is null then raise exception 'You have no free session voucher to use.'; end if;
    q := jsonb_build_object('type', 'reward', 'price', 0,
      'fee', case when p_trainer = public._config('owner_trainer_id') then 0
                  else coalesce((select tp.fee from public.trainer_pricing tp where tp.trainer_id = p_trainer),
                                public._config('trainer_fee')::numeric) end);
  end if;
  begin
    insert into public.bookings (series_id, user_id, trainer_id, day, hour, note, xp, status, price, trainer_fee,
                                 kind, partner, price_type, pack_id, voucher_id, pay_method, pay_status, request_at, request_notice_sent)
    values (p_series, uid, p_trainer, p_day, p_hour, left(coalesce(p_note, ''), 300), public._config('session_xp')::int,
            case when q ->> 'type' <> 'pack' and p_pay = 'online' then 'awaiting_payment' else 'pending' end,
            (q ->> 'price')::numeric, (q ->> 'fee')::numeric,
            p_kind, case when p_kind = 'duo' then left(trim(p_partner), 40) else '' end,
            q ->> 'type', (q ->> 'packId')::uuid, voucher,
            case when q ->> 'type' in ('pack', 'reward') then q ->> 'type' else p_pay end,
            case when q ->> 'type' in ('pack', 'reward') then 'n/a' else 'unpaid' end,
            case when q ->> 'type' <> 'pack' and p_pay = 'online' then null else now() end,
            not (q ->> 'type' <> 'pack' and p_pay = 'online'))
    returning * into b;
  exception when unique_violation then
    raise exception 'Someone just booked this slot. Pick another hour.';
  end;

  return b;
end $$;

create or replace function public.book_session(p_trainer text, p_day date, p_hour integer, p_note text default '',
                                               p_kind text default 'solo', p_partner text default '',
                                               p_pay text default 'in_person')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Log in to book a session.'; end if;
  return public._booking_json(public._book(auth.uid(), p_trainer, p_day, p_hour, p_note, p_kind, p_partner, p_pay));
end $$;


-- ---------------------------------------------------------
-- Weekly sessions
-- ---------------------------------------------------------
-- Ask a trainer for the same hour every week. p_weeks: how many weeks (2 to 26), or null = until someone stops it.
-- The first week must be free; a later week in which the hour is already taken is left out (and said so).
-- Every week is paid like any session: with a pack credit when you have one, else at the headquarters.
create or replace function public.book_series(p_trainer text, p_day date, p_hour integer, p_weeks integer default null,
                                              p_note text default '', p_kind text default 'solo', p_partner text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.booking_series;
  b public.bookings;
  horizon date := (date_trunc('week', now() at time zone 'Europe/Brussels')::date
                   + 7 * public._config('booking_weeks_ahead')::int);
  d date := p_day;
  planned jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
  client text;
begin
  if uid is null then raise exception 'Log in to book a session.'; end if;
  if p_weeks is not null and (p_weeks < 2 or p_weeks > 26) then raise exception 'Choose between 2 and 26 weeks.'; end if;
  if (select count(*) from public.booking_series where user_id = uid and status <> 'ended') >= 4 then
    raise exception 'You already have 4 weekly sessions. Stop one first.';
  end if;
  if exists (select 1 from public.booking_series where user_id = uid and status <> 'ended'
             and weekday = extract(isodow from p_day)::int and hour = p_hour) then
    raise exception 'You already have a weekly session at that time.';
  end if;
  insert into public.booking_series (user_id, trainer_id, weekday, hour, kind, partner, note, first_day, last_day, next_day)
  values (uid, p_trainer, extract(isodow from p_day)::int, p_hour, p_kind,
          case when p_kind = 'duo' then left(trim(coalesce(p_partner, '')), 40) else '' end, left(coalesce(p_note, ''), 300),
          p_day, case when p_weeks is null then null else p_day + 7 * (p_weeks - 1) end, p_day)
  returning * into s;
  perform set_config('levelup.quiet', '1', true);  -- one message for the whole request, not one per week
  b := public._book(uid, p_trainer, d, p_hour, p_note, p_kind, p_partner, 'in_person', s.id);
  planned := planned || public._booking_json(b);
  d := d + 7;
  while d < horizon and (s.last_day is null or d <= s.last_day) loop
    begin
      b := public._book(uid, p_trainer, d, p_hour, p_note, p_kind, p_partner, 'in_person', s.id);
      planned := planned || public._booking_json(b);
    exception when others then
      skipped := skipped || jsonb_build_object('date', d, 'reason', sqlerrm);
    end;
    d := d + 7;
  end loop;
  update public.booking_series set next_day = d where id = s.id returning * into s;
  perform set_config('levelup.quiet', '', true);
  select name into client from public.profiles where id = uid;
  perform public._push(public._trainer_user(p_trainer), 'New weekly request',
    client || ' · ' || public._series_label(s) || ' · from ' || to_char(p_day, 'Dy DD Mon')
      || case when p_weeks is null then ' · until stopped' else ' · ' || p_weeks || ' weeks' end,
    'profile.html#coach', 'series-' || s.id);
  return jsonb_build_object('series', public._series_json(s), 'planned', planned, 'skipped', skipped);
end $$;

-- The trainer answers a weekly request: one answer for all its weeks
create or replace function public._series_answer(b public.bookings, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.booking_series;
  first date;
  trainer text := (select split_part(name, ' ', 1) from public.trainers where id = b.trainer_id);
begin
  select * into s from public.booking_series where id = b.series_id for update;
  select min(k.day) into first from public.bookings k where k.series_id = s.id and k.status = 'pending';
  perform set_config('levelup.quiet', '1', true);
  update public.bookings k
    set status = case when p_accept then 'confirmed' else 'declined' end, responded_at = now(),
        refund_status = case when p_accept then k.refund_status else public._refund_state(k) end
    where k.series_id = s.id and k.status = 'pending' and public._slot_start(k.day, k.hour) > now();
  update public.booking_series
    set status = case when p_accept then 'active' else 'ended' end,
        ended_reason = case when p_accept then null else 'declined' end,
        ended_at = case when p_accept then null else now() end
    where id = s.id returning * into s;
  perform set_config('levelup.quiet', '', true);
  if p_accept then
    perform public._push(s.user_id, 'Weekly session confirmed ✓',
      trainer || ' · ' || public._series_label(s) || ', from ' || to_char(first, 'Dy DD Mon'), 'profile.html#overview', 'series-' || s.id);
  else
    perform public._push(s.user_id, 'Weekly request declined',
      trainer || ' can''t do ' || public._series_label(s) || '. Pick another hour.', 'index.html#schedule', 'series-' || s.id);
  end if;
  select * into b from public.bookings where id = b.id;
  return public._booking_json(b);
end $$;

-- Keeps the weekly sessions going: plans the weeks that came inside the booking window (confirmed at once, the
-- trainer said yes to the series), and closes series that are over or were never answered. Runs with every profile
-- load and in the 10-minute job. A week whose hour is taken is left out; both hear about it.
create or replace function public._series_extend()
returns integer language plpgsql security definer set search_path = public as $$
declare
  s public.booking_series;
  b public.bookings;
  today date := (now() at time zone 'Europe/Brussels')::date;
  horizon date := (date_trunc('week', now() at time zone 'Europe/Brussels')::date
                   + 7 * public._config('booking_weeks_ahead')::int);
  notice interval := make_interval(hours => public._config('booking_notice_hours')::int);
  trainer text;
  client text;
  n integer := 0;
begin
  for s in select * from public.booking_series where status = 'active' and next_day < horizon
             and (last_day is null or next_day <= last_day) for update skip locked loop
    trainer := (select split_part(name, ' ', 1) from public.trainers where id = s.trainer_id);
    client := (select name from public.profiles where id = s.user_id);
    while s.next_day < horizon and (s.last_day is null or s.next_day <= s.last_day) loop
      if public._slot_start(s.next_day, s.hour) > now() + notice
         and not exists (select 1 from public.bookings k where k.series_id = s.id and k.day = s.next_day) then
        begin
          perform set_config('levelup.quiet', '1', true);
          b := public._book(s.user_id, s.trainer_id, s.next_day, s.hour, s.note, s.kind, s.partner, 'in_person', s.id);
          update public.bookings set status = 'confirmed', responded_at = now() where id = b.id;
          perform set_config('levelup.quiet', '', true);
          n := n + 1;
        exception when others then
          perform set_config('levelup.quiet', '', true);
          perform public._push(s.user_id, 'Weekly session not planned',
            trainer || ' · ' || public._slot_label(s.next_day, s.hour) || ' is not free. Pick another hour for that week.',
            'index.html#schedule', 'series-skip-' || s.id || '-' || s.next_day);
          perform public._push(public._trainer_user(s.trainer_id), 'Weekly session not planned',
            client || ' · ' || public._slot_label(s.next_day, s.hour) || ' is not free.',
            'profile.html#coach', 'series-skip-' || s.id || '-' || s.next_day);
        end;
      end if;
      s.next_day := s.next_day + 7;
    end loop;
    update public.booking_series set next_day = s.next_day where id = s.id;
  end loop;
  update public.booking_series set status = 'ended', ended_reason = 'done', ended_at = now()
    where status = 'active' and last_day is not null and last_day < today;
  update public.booking_series q set status = 'ended', ended_reason = 'expired', ended_at = now()
    where q.status = 'requested'
      and not exists (select 1 from public.bookings k where k.series_id = q.id and k.status in ('pending', 'awaiting_payment'));
  return n;
end $$;

-- Stop a weekly session: the player, the trainer or an admin. The weeks that are still to come go away at no cost.
-- When the player stops it, a confirmed week that starts within the free-cancellation time stays (cancel it yourself).
create or replace function public.series_stop(p_series uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.booking_series;
  k public.bookings;
  mine boolean;
  free interval := make_interval(hours => public._config('free_cancel_hours')::int);
  removed integer := 0;
  kept integer := 0;
  trainer text;
  client text;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into s from public.booking_series where id = p_series for update;
  if not found or not (s.user_id = auth.uid() or public._can_coach(s.trainer_id)) then
    raise exception 'Weekly session not found.';
  end if;
  if s.status = 'ended' then raise exception 'This weekly session has already stopped.'; end if;
  mine := s.user_id = auth.uid() and not public.is_admin();
  perform set_config('levelup.quiet', '1', true);
  for k in select * from public.bookings where series_id = s.id and status in ('pending', 'confirmed', 'awaiting_payment')
             and public._slot_start(day, hour) > now() order by day loop
    if mine and k.status = 'confirmed' and public._slot_start(k.day, k.hour) - free < now() then
      kept := kept + 1;
      continue;
    end if;
    if k.pay_status = 'paid' then
      update public.bookings set status = 'cancelled', responded_at = now(), refund_status = public._refund_state(k) where id = k.id;
    else
      delete from public.bookings where id = k.id;
    end if;
    removed := removed + 1;
  end loop;
  update public.booking_series set status = 'ended', ended_reason = 'stopped', ended_at = now() where id = s.id returning * into s;
  perform set_config('levelup.quiet', '', true);
  trainer := (select split_part(name, ' ', 1) from public.trainers where id = s.trainer_id);
  client := (select name from public.profiles where id = s.user_id);
  if s.user_id = auth.uid() then
    perform public._push(public._trainer_user(s.trainer_id), 'Weekly session stopped',
      client || ' · ' || public._series_label(s), 'profile.html#coach', 'series-' || s.id);
  else
    perform public._push(s.user_id, 'Weekly session stopped',
      trainer || ' · ' || public._series_label(s) || '. No costs for the weeks that were still to come.', 'profile.html#overview', 'series-' || s.id);
  end if;
  return jsonb_build_object('removed', removed, 'kept', kept, 'series', public._series_json(s));
end $$;

-- Why a trainer and a player can't meet at a moment (null = they can). p_skip: the booking that is being moved.
create or replace function public._slot_taken(p_trainer text, p_user uuid, p_day date, p_hour integer, p_skip uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  t0 timestamptz := public._slot_start(p_day, p_hour);
begin
  if exists (select 1 from public.bookings where trainer_id = p_trainer and day = p_day and hour = p_hour and id <> p_skip
             and status in ('awaiting_payment', 'pending', 'confirmed', 'completed')) then
    return 'the trainer already has a session then';
  end if;
  if exists (select 1 from public.bookings where user_id = p_user and day = p_day and hour = p_hour and id <> p_skip
             and status in ('awaiting_payment', 'pending', 'confirmed', 'completed')) then
    return 'the player already has a session then';
  end if;
  if exists (select 1 from public.class_sessions c where c.trainer_id = p_trainer and c.status = 'scheduled'
             and tstzrange(c.starts_at, c.starts_at + make_interval(mins => c.minutes)) && tstzrange(t0, t0 + interval '1 hour')) then
    return 'the trainer leads a group class then';
  end if;
  if public._room_blocker(t0, t0 + interval '1 hour', false) is not null then return 'the gym is full then'; end if;
  return null;
end $$;

-- The trainer (or an admin) moves a session to another day or hour, after agreeing on it with the player.
-- p_scope 'once': only this session. 'series': this week and every week after it of a weekly session (same shift).
-- The player gets a message that says which of the two it is.
create or replace function public.move_booking(p_id uuid, p_day date, p_hour integer, p_scope text default 'once')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  s public.booking_series;
  k public.bookings;
  shift integer;
  why text;
  was text;
  trainer text;
  today date := (now() at time zone 'Europe/Brussels')::date;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into b from public.bookings where id = p_id;
  if not found or not public._can_coach(b.trainer_id) then raise exception 'Booking not found.'; end if;
  if b.status not in ('pending', 'confirmed') then raise exception 'Only a session that is still to come can be moved.'; end if;
  if public._slot_start(b.day, b.hour) <= now() then raise exception 'This session has already started.'; end if;
  if p_scope not in ('once', 'series') then raise exception 'Invalid choice.'; end if;
  if p_day is null or p_hour is null or p_hour < 0 or p_hour > 23 then raise exception 'Invalid time.'; end if;
  if public._slot_start(p_day, p_hour) <= now() then raise exception 'Pick a moment that is still to come.'; end if;
  if p_day > today + 180 then raise exception 'Pick a day within six months.'; end if;
  if p_day = b.day and p_hour = b.hour then raise exception 'Pick another day or hour.'; end if;
  trainer := (select split_part(name, ' ', 1) from public.trainers where id = b.trainer_id);
  was := public._slot_label(b.day, b.hour);
  perform pg_advisory_xact_lock(hashtext('room-' || p_day::text));
  begin
    if p_scope = 'series' then
      if b.series_id is null then raise exception 'This session is not part of a weekly session.'; end if;
      select * into s from public.booking_series where id = b.series_id for update;
      if s.status = 'ended' then raise exception 'This weekly session has stopped.'; end if;
      shift := p_day - b.day;
      -- later weeks first when moving forward, so a week never lands on the one after it
      for k in select * from public.bookings where series_id = s.id and status in ('pending', 'confirmed') and day >= b.day
               order by case when shift > 0 then -1 else 1 end * (day - date '2000-01-01') loop
        why := public._slot_taken(k.trainer_id, k.user_id, k.day + shift, p_hour, k.id);
        if why is not null then
          raise exception '% is not possible: %.', public._slot_label(k.day + shift, p_hour), why;
        end if;
        update public.bookings set moved_from = public._slot_label(k.day, k.hour), day = k.day + shift, hour = p_hour,
               reminder_pushed_at = null where id = k.id;
      end loop;
      update public.booking_series set weekday = extract(isodow from p_day)::int, hour = p_hour,
             next_day = next_day + shift, last_day = last_day + shift where id = s.id returning * into s;
      perform public._push(b.user_id, '📅 Weekly session changed',
        trainer || ' · now ' || public._series_label(s) || ', from ' || to_char(p_day, 'Dy DD Mon'), 'profile.html#overview', 'move-' || b.id);
    else
      why := public._slot_taken(b.trainer_id, b.user_id, p_day, p_hour, b.id);
      if why is not null then raise exception 'That moment is not possible: %.', why; end if;
      update public.bookings set moved_from = was, day = p_day, hour = p_hour, reminder_pushed_at = null where id = b.id;
      perform public._push(b.user_id, '📅 Session moved',
        trainer || ' · ' || was || ' → ' || public._slot_label(p_day, p_hour)
          || case when b.series_id is not null then ' · this week only' else '' end, 'profile.html#overview', 'move-' || b.id);
    end if;
  exception when unique_violation then
    raise exception 'That moment is already taken.';
  end;
  select * into b from public.bookings where id = p_id;
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
  if b.series_id is not null and exists (select 1 from public.booking_series q where q.id = b.series_id and q.status = 'requested') then
    return public._series_answer(b, p_accept);  -- a weekly request: one answer for all its weeks
  end if;
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
  return (select coalesce(jsonb_agg(public._booking_json(b) || jsonb_build_object('health', public._health_brief(b.user_id))
                                   order by b.day, b.hour), '[]'::jsonb)
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
-- cancellations, expected = confirmed ones. Group classes add their fixed fee once finished
-- (expected: planned classes with someone signed up). The owner keeps what the players pay.
create or replace function public.coach_earnings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t public.trainers;
  owner boolean;
  out jsonb;
  cls record;
begin
  select * into t from public.trainers where email is not null and lower(email) = lower(auth.jwt() ->> 'email') limit 1;
  if not found then return null; end if;
  owner := t.id = public._config('owner_trainer_id');
  select
    count(*) filter (where c.status = 'done') as done,
    coalesce(sum(case when owner then (public._class_money(c.id) ->> 'charged')::numeric else c.trainer_fee end) filter (where c.status = 'done'), 0) as earned,
    coalesce(sum(c.trainer_fee) filter (where c.status = 'done' and c.payout_at is not null and not owner), 0) as paid,
    coalesce(sum(c.trainer_fee) filter (where c.status = 'done' and c.payout_at is null and not owner), 0) as owed,
    coalesce(sum(case when owner then c.price * public._class_taken(c.id) else c.trainer_fee end)
             filter (where c.status = 'scheduled' and public._class_taken(c.id) > 0), 0) as expected,
    max(c.payout_at) as last_payout
  into cls
  from public.class_sessions c where c.trainer_id = t.id;
  select jsonb_build_object(
    'trainerId', t.id,
    'isOwner', owner,
    'price', coalesce((select tp.price from public.trainer_pricing tp where tp.trainer_id = t.id), public._config('session_price')::numeric),
    'fee', case when owner
                then coalesce((select tp.price from public.trainer_pricing tp where tp.trainer_id = t.id), public._config('session_price')::numeric)
                else coalesce((select tp.fee from public.trainer_pricing tp where tp.trainer_id = t.id), public._config('trainer_fee')::numeric) end,
    'classFee', public._config('class_trainer_fee')::numeric,
    'sessions', count(b.id) filter (where public._billable(b.status)),
    'classes', cls.done,
    'charged', count(b.id) filter (where b.status in ('no_show', 'late_cancel')),
    'earned', coalesce(sum(b.trainer_fee) filter (where public._billable(b.status)), 0) + cls.earned,
    'paid', coalesce(sum(b.trainer_fee) filter (where public._billable(b.status) and b.payout_at is not null), 0) + cls.paid,
    'owed', coalesce(sum(b.trainer_fee) filter (where public._billable(b.status) and b.payout_at is null), 0) + cls.owed,
    'expected', coalesce(sum(b.trainer_fee) filter (where b.status = 'confirmed'), 0) + cls.expected,
    'lastPayout', greatest(max(b.payout_at), cls.last_payout)
  ) into out
  from public.bookings b where b.trainer_id = t.id;
  return out;
end $$;

-- A trainer's charged sessions in a period, for their monthly statement (basis for their invoice)
create or replace function public.coach_statement(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return (select coalesce(jsonb_agg(x.j order by x.day, x.hour), '[]'::jsonb) from (
    select public._booking_json(b) as j, b.day, b.hour
    from public.bookings b
    join public.trainers t on t.id = b.trainer_id
    where t.email is not null and lower(t.email) = lower(auth.jwt() ->> 'email')
      and public._billable(b.status) and b.day between p_from and least(p_to, p_from + 62)
    union all
    -- finished group classes: one line each, with the class fee
    select jsonb_build_object('id', c.id, 'kind', 'class', 'trainerId', c.trainer_id,
             'date', (c.starts_at at time zone 'Europe/Brussels')::date,
             'hour', extract(hour from c.starts_at at time zone 'Europe/Brussels')::int,
             'name', c.title, 'partner', (public._class_money(c.id) ->> 'present') || ' present',
             'status', 'completed', 'price', (public._class_money(c.id) ->> 'charged')::numeric,
             'trainerFee', c.trainer_fee, 'payoutAt', c.payout_at, 'payMethod', 'class', 'payStatus', 'paid', 'priceType', 'class'),
           (c.starts_at at time zone 'Europe/Brussels')::date, extract(hour from c.starts_at at time zone 'Europe/Brussels')::int
    from public.class_sessions c
    join public.trainers t on t.id = c.trainer_id
    where t.email is not null and lower(t.email) = lower(auth.jwt() ->> 'email')
      and c.status = 'done' and (c.starts_at at time zone 'Europe/Brussels')::date between p_from and least(p_to, p_from + 62)
  ) x);
end $$;

-- Admin: record that a trainer's open earnings have been paid out
create or replace function public.mark_payout(p_trainer text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n integer;
  total numeric;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  select count(*), coalesce(sum(trainer_fee), 0) into n, total
    from (select trainer_fee from public.bookings where trainer_id = p_trainer and public._billable(status) and payout_at is null
          union all
          select trainer_fee from public.class_sessions where trainer_id = p_trainer and status = 'done' and payout_at is null) x;
  if n = 0 then raise exception 'Nothing to pay out for this trainer.'; end if;
  update public.bookings set payout_at = now()
    where trainer_id = p_trainer and public._billable(status) and payout_at is null;
  update public.class_sessions set payout_at = now()
    where trainer_id = p_trainer and status = 'done' and payout_at is null;
  return jsonb_build_object('trainerId', p_trainer, 'sessions', n, 'amount', total);
end $$;

-- ---------------------------------------------------------
-- The gym room: places, group classes that take it whole, and rentals
-- ---------------------------------------------------------
-- One room (12 m x 12 m). A 1:1 session takes one place, own coach or renter alike; the room has room_places
-- places (app_config). A group class in the room and a "whole room" rental take all of it. A class that is not
-- in the room (the run club) has uses_room off and takes nothing.
alter table public.class_sessions add column if not exists uses_room boolean not null default true;
-- classes that were planned before this existed: the outdoor ones don't take the room (once)
do $$ begin
  if not exists (select 1 from public.app_config where key = 'room_backfill') then
    update public.class_sessions set uses_room = false where title ~* '(run|loop|outdoor|buiten|walk|wandel|bike|fiets)';
    insert into public.app_config (key, value) values ('room_backfill', '1') on conflict (key) do nothing;
  end if;
end $$;

-- A rental: someone from outside uses the room for whole hours on one day. The admin enters it; nothing is
-- booked or paid online. Not public: only the admin functions further down read and write it.
create table if not exists public.room_rentals (
  id uuid primary key default gen_random_uuid(),
  renter text not null check (char_length(renter) between 2 and 60),
  contact text not null default '',
  kind text not null default 'shared' check (kind in ('shared', 'full')),  -- shared = one place, full = the whole room
  day date not null,
  start_hour smallint not null check (start_hour between 0 and 23),
  end_hour smallint not null check (end_hour between 1 and 24),
  price_hour numeric(8, 2) not null check (price_hour >= 0),
  note text not null default '',
  series_id uuid,                     -- rentals made together with "repeat weekly"
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  check (end_hour > start_hour)
);
create index if not exists room_rentals_day_idx on public.room_rentals (day);
alter table public.room_rentals enable row level security;
revoke all on public.room_rentals from anon, authenticated;

-- Does this booking hold its hour? (confirmed, a request that can still be answered, an online payment in progress)
create or replace function public._booking_holds(b public.bookings)
returns boolean language sql stable security definer set search_path = public as $$
  select b.status = 'confirmed'
      or (b.status = 'pending' and public._confirm_deadline(coalesce(b.request_at, b.created_at), b.day, b.hour) > now())
      or (b.status = 'awaiting_payment' and b.created_at + make_interval(mins => public._config('payment_hold_minutes')::int) > now());
$$;

-- The room per hour: places in use, and whether something takes it whole
create or replace function public._room_load(p_from date, p_to date)
returns table (day date, hour integer, used integer, whole boolean)
language sql stable security definer set search_path = public as $$
  select x.day, x.hour, sum(x.used)::int, bool_or(x.whole)
  from (
    select b.day, b.hour::int as hour, 1 as used, false as whole
    from public.bookings b
    where b.day between p_from and p_to and (b.status = 'completed' or public._booking_holds(b))
    union all
    select r.day, h, case when r.kind = 'shared' then 1 else 0 end, r.kind = 'full'
    from public.room_rentals r cross join lateral generate_series(r.start_hour::int, r.end_hour::int - 1) h
    where r.status = 'booked' and r.day between p_from and p_to
    union all
    select h.day, h.hour, 0, true
    from public.class_sessions c
    cross join lateral (
      select (t at time zone 'Europe/Brussels')::date as day, extract(hour from t at time zone 'Europe/Brussels')::int as hour
      from generate_series(date_trunc('hour', c.starts_at), c.starts_at + make_interval(mins => c.minutes) - interval '1 minute', interval '1 hour') t
    ) h
    where c.status = 'scheduled' and c.uses_room and h.day between p_from and p_to
  ) x
  group by x.day, x.hour;
$$;

-- What stands in the way of using the room from p_start to p_end, or null when it is free.
-- p_whole: the whole room is needed (a group class, a "whole room" rental); otherwise one place.
create or replace function public._room_blocker(p_start timestamptz, p_end timestamptz, p_whole boolean,
                                                p_skip_class uuid default null, p_skip_rental uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  places integer := greatest(coalesce(nullif(public._config('room_places'), '')::int, 2), 1);
  what text;
  h timestamptz;
  used integer;
begin
  -- something that takes the whole room in that time
  select 'the group class ' || c.title into what from public.class_sessions c
  where c.status = 'scheduled' and c.uses_room and c.id is distinct from p_skip_class
    and tstzrange(c.starts_at, c.starts_at + make_interval(mins => c.minutes)) && tstzrange(p_start, p_end)
  order by c.starts_at limit 1;
  if what is not null then return what; end if;
  select 'it is rented out (' || r.renter || ')' into what from public.room_rentals r
  where r.status = 'booked' and r.id is distinct from p_skip_rental and (r.kind = 'full' or p_whole)
    and tstzrange(public._slot_start(r.day, r.start_hour::int), public._slot_start(r.day, r.start_hour::int) + make_interval(hours => r.end_hour - r.start_hour))
        && tstzrange(p_start, p_end)
  order by r.day, r.start_hour limit 1;
  if what is not null then return what; end if;
  if p_whole then
    select 'a 1:1 session of ' || split_part(t.name, ' ', 1) || ' at ' || to_char(public._slot_start(b.day, b.hour) at time zone 'Europe/Brussels', 'HH24:MI')
      into what
    from public.bookings b join public.trainers t on t.id = b.trainer_id
    where b.day between (p_start at time zone 'Europe/Brussels')::date - 1 and (p_end at time zone 'Europe/Brussels')::date + 1
      and public._booking_holds(b)
      and tstzrange(public._slot_start(b.day, b.hour), public._slot_start(b.day, b.hour) + interval '1 hour') && tstzrange(p_start, p_end)
    order by b.day, b.hour limit 1;
    return what;
  end if;
  -- one place is needed: count hour by hour
  for h in select generate_series(date_trunc('hour', p_start), p_end - interval '1 minute', interval '1 hour') loop
    used := (select count(*) from public.bookings b
             where b.day = (h at time zone 'Europe/Brussels')::date and b.hour = extract(hour from h at time zone 'Europe/Brussels')::int
               and public._booking_holds(b))
          + (select count(*) from public.room_rentals r
             where r.status = 'booked' and r.kind = 'shared' and r.id is distinct from p_skip_rental
               and r.day = (h at time zone 'Europe/Brussels')::date
               and extract(hour from h at time zone 'Europe/Brussels')::int >= r.start_hour
               and extract(hour from h at time zone 'Europe/Brussels')::int < r.end_hour);
    if used >= places then return 'all ' || places || ' places are taken'; end if;
  end loop;
  return null;
end $$;
revoke execute on function public._booking_holds(public.bookings) from public, anon, authenticated;
revoke execute on function public._room_load(date, date) from public, anon, authenticated;
revoke execute on function public._room_blocker(timestamptz, timestamptz, boolean, uuid, uuid) from public, anon, authenticated;

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
             and b.created_at + make_interval(mins => public._config('payment_hold_minutes')::int) > now()))
  union all
  -- every hour a trainer leads a group class (the class itself shows on the schedule)
  select c.trainer_id, h.day, h.hour::smallint, null::uuid, 'class'
  from public.class_sessions c
  cross join lateral (
    select (t at time zone 'Europe/Brussels')::date as day, extract(hour from t at time zone 'Europe/Brussels')::int as hour
    from generate_series(date_trunc('hour', c.starts_at), c.starts_at + make_interval(mins => c.minutes) - interval '1 minute', interval '1 hour') t
  ) h
  where c.status = 'scheduled' and h.day between p_from and least(p_to, p_from + 70)
  union all
  -- every hour the gym room has no place left (a class or a rental takes it whole, or all places are in use):
  -- trainer '*' = it counts for every trainer
  select '*', l.day, l.hour::smallint, null::uuid, 'room'
  from public._room_load(p_from, least(p_to, p_from + 70)) l
  where l.whole or l.used >= greatest(coalesce(nullif(public._config('room_places'), '')::int, 2), 1);
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
-- High scores: the top 25 players (and your own place), all time or this month.
-- "month" = XP earned since the 1st of this month (Brussels time); players with 0 XP that month are left out.
-- total_xp is always the all-time XP (for the level). Trainers and hidden players are left out.
drop function if exists public.leaderboard();
drop function if exists public.leaderboard(text);
-- user_id is only given to logged-in players (they need it to give a like); likes = all likes ever received,
-- liked = you already liked this player this week
create or replace function public.leaderboard(p_period text default 'all')
returns table (place bigint, name text, xp integer, total_xp integer, is_me boolean, avatar_url text, potm boolean,
               user_id uuid, likes integer, liked boolean)
language sql stable security definer set search_path = public as $$
  with players as (
    select p.id, p.name, p.xp as total_xp, p.created_at, p.avatar_url,
      case when p_period = 'month' then public._month_xp(p.id, date_trunc('month', now() at time zone 'Europe/Brussels')::date)
           else p.xp end as score
    from public.profiles p
    where p.show_on_leaderboard
      and not exists (select 1 from public.trainers t where t.email is not null and lower(t.email) = lower(p.email))
  ), ranked as (
    select *, row_number() over (order by score desc, created_at) as place from players  -- equal scores: who got there first
    where p_period <> 'month' or score > 0
  )
  select r.place, r.name, r.score, r.total_xp, coalesce(r.id = auth.uid(), false), r.avatar_url,
    exists (select 1 from public.monthly_awards a where a.user_id = r.id and a.month = public._potm_month()),
    case when auth.uid() is not null then r.id end,
    (select count(*)::int from public.player_likes l where l.to_id = r.id),
    exists (select 1 from public.player_likes l where l.from_id = auth.uid() and l.to_id = r.id
            and l.week = date_trunc('week', now() at time zone 'Europe/Brussels')::date)
  from ranked r
  where r.place <= 25 or r.id = auth.uid()
  order by r.place;
$$;

-- Give a player a like (a heart). Once per player per week; the player gets a push notification.
create or replace function public.give_like(p_to uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w date := date_trunc('week', now() at time zone 'Europe/Brussels')::date;
  me public.profiles;
  total integer;
  added integer;
begin
  if auth.uid() is null then raise exception 'Log in to give a like.'; end if;
  if p_to is null or p_to = auth.uid() then raise exception 'You can''t like yourself. Others can like you.'; end if;
  if not exists (select 1 from public.profiles where id = p_to and show_on_leaderboard) then raise exception 'Player not found.'; end if;
  select * into me from public.profiles where id = auth.uid();
  if (select count(*) from public.player_likes where from_id = auth.uid() and created_at > now() - interval '1 day') >= 40 then
    raise exception 'That''s a lot of love for one day. Try again tomorrow.';
  end if;
  insert into public.player_likes (from_id, to_id, week) values (auth.uid(), p_to, w) on conflict do nothing;
  get diagnostics added = row_count;
  select count(*)::int into total from public.player_likes where to_id = p_to;
  if added > 0 then  -- a second tap in the same week sends nothing
    perform public._celebrate(p_to, 'like', jsonb_build_object('by', me.name));
    perform public._push(p_to, '❤️ ' || me.name || ' gave you a like', 'You have ' || total || ' like' || case when total = 1 then '' else 's' end || '. Keep it up!',
      'profile.html#likes', 'like-' || auth.uid());
  end if;
  return jsonb_build_object('likes', total, 'liked', true);
end $$;

-- ---------------------------------------------------------
-- Member pages: what one member sees of another (opened from the high scores, a chat or a coach card)
-- ---------------------------------------------------------
-- Limited on purpose: name, photo, level, likes, streak, achievements, their own photos and the GROUP classes they
-- go to or went to. Never: email, body stats, health form, payments, orders or 1:1 sessions with times.
-- Members see each other only when logged in; a trainer's page is public like their card on the home page.
-- A member who switched "profile_visible" off shows only a name and photo to others.
-- A photo as a member page shows it: likes and comments (with their own likes) for logged-in members
create or replace function public._photo_json(ph public.profile_photos)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', ph.id, 'url', ph.url, 'urls', to_jsonb(array[ph.url] || ph.more_urls),
    'caption', ph.caption, 'date', ph.created_at, 'userId', ph.user_id,
    -- who posted it (for the start screen, where posts of different members stand under each other)
    'name', (select coalesce((select t.name from public.trainers t where t.email is not null and lower(t.email) = lower(o.email) and t.active limit 1), o.name)
             from public.profiles o where o.id = ph.user_id),
    'avatarUrl', (select o.avatar_url from public.profiles o where o.id = ph.user_id),
    'ownerTrainerId', (select t.id from public.profiles o join public.trainers t on t.email is not null and lower(t.email) = lower(o.email) and t.active
                       where o.id = ph.user_id limit 1),
    'mine', ph.user_id = auth.uid(),
    'likes', (select count(*) from public.photo_likes l where l.photo_id = ph.id),
    'liked', exists (select 1 from public.photo_likes l where l.photo_id = ph.id and l.user_id = auth.uid()),
    'commentCount', (select count(*) from public.photo_comments c where c.photo_id = ph.id),
    'comments', case when auth.uid() is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'date', c.created_at,
               'userId', c.user_id, 'name', u.name, 'avatarUrl', u.avatar_url,
               'trainerId', (select t.id from public.trainers t where t.email is not null and lower(t.email) = lower(u.email) and t.active limit 1),
               'mine', c.user_id = auth.uid(),
               'canDelete', c.user_id = auth.uid() or ph.user_id = auth.uid() or public.is_admin(),
               'likes', (select count(*) from public.photo_comment_likes l where l.comment_id = c.id),
               'liked', exists (select 1 from public.photo_comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()))
             order by c.created_at)
      from (select * from public.photo_comments where photo_id = ph.id order by created_at desc limit 40) c
      join public.profiles u on u.id = c.user_id), '[]'::jsonb) end);
$$;

-- May the logged-in member see (and react to) this photo? Same rule as the page it is on.
create or replace function public._photo_open(ph public.profile_photos)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p where p.id = ph.user_id
      and (p.profile_visible or p.id = auth.uid() or public.is_admin()
           or exists (select 1 from public.trainers t where t.email is not null and lower(t.email) = lower(p.email) and t.active)));
$$;

create or replace function public.public_profile(p_user uuid default null, p_trainer text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.trainers;
  p public.profiles;
  uid uuid := p_user;
  open_page boolean;
  out jsonb;
begin
  if p_trainer is not null then
    select * into t from public.trainers where id = p_trainer and active;
    if not found then raise exception 'Profile not found.'; end if;
    uid := public._trainer_user(t.id);
  end if;
  if uid is not null then
    select * into p from public.profiles where id = uid;
    if t.id is null then
      select tr.* into t from public.trainers tr where tr.email is not null and lower(tr.email) = lower(p.email) and tr.active limit 1;
    end if;
  end if;
  if p.id is null and t.id is null then raise exception 'Profile not found.'; end if;
  if t.id is null and me is null then raise exception 'Log in to see other players.'; end if;
  open_page := p.id is not null and (p.profile_visible or t.id is not null or p.id = me or public.is_admin());
  out := jsonb_build_object(
    'userId', case when me is not null then p.id end,
    'name', coalesce(case when t.id is not null then t.name end, p.name),
    'avatarUrl', p.avatar_url, 'isMe', coalesce(p.id = me, false),
    'trainerId', t.id, 'role', case when t.id is not null then coalesce(t.role, 'Personal trainer') end,
    'private', p.id is not null and not open_page,
    'linked', p.id is not null,
    'canModerate', public.is_admin());
  if t.id is not null then
    out := out || jsonb_build_object(
      'trainerBio', t.bio, 'specialties', t.specialties,
      'teaching', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'startsAt', c.starts_at,
                                'taken', public._class_taken(c.id), 'capacity', c.capacity,
                                'mine', exists (select 1 from public.class_signups v where v.class_id = c.id and v.user_id = me and v.status in ('booked', 'waitlist'))) order by c.starts_at)
                            from (select * from public.class_sessions where trainer_id = t.id and status = 'scheduled' and starts_at > now()
                                  order by starts_at limit 6) c), '[]'::jsonb));
  end if;
  if not open_page then return out; end if;
  return out || jsonb_build_object(
    'xp', p.xp, 'since', p.created_at, 'bio', p.bio,
    'likes', (select count(*) from public.player_likes l where l.to_id = p.id),
    'liked', exists (select 1 from public.player_likes l where l.from_id = me and l.to_id = p.id
                     and l.week = date_trunc('week', now() at time zone 'Europe/Brussels')::date),
    'canLike', me is not null and p.id <> me and p.show_on_leaderboard,
    'streak', coalesce((public._streak(p.id) ->> 'weeks')::int, 0),
    'potmWins', (select count(*) from public.monthly_awards a where a.user_id = p.id),
    'place', case when t.id is null and p.show_on_leaderboard then
               (select count(*) + 1 from public.profiles o where o.show_on_leaderboard and o.xp > p.xp
                  and not exists (select 1 from public.trainers tr where tr.email is not null and lower(tr.email) = lower(o.email))) end,
    'sessions', (select count(*) from public.bookings k where k.user_id = p.id and k.status = 'completed'),
    'classesDone', (select count(*) from public.class_signups g where g.user_id = p.id and g.status = 'attended'),
    'achievements', coalesce((select jsonb_agg(k) from jsonb_object_keys(p.achievements) k), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(public._photo_json(ph) order by ph.created_at desc)
                        from public.profile_photos ph where ph.user_id = p.id), '[]'::jsonb),
    'monthXp', public._month_xp(p.id, date_trunc('month', now() at time zone 'Europe/Brussels')::date),
    -- what they did lately, newest first: group classes, achievements, photos and Player of the Month (never 1:1 sessions)
    'activity', coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'text', a.txt, 'date', a.at) order by a.at desc) from (
        select * from (
          select 'class' as kind, c.title as txt, c.starts_at as at
            from public.class_sessions c join public.class_signups g on g.class_id = c.id
            where g.user_id = p.id and g.status = 'attended' and c.starts_at > now() - interval '90 days'
          union all
          select 'achievement', k.key, (k.value #>> '{}')::timestamptz
            from jsonb_each(p.achievements) k where (k.value #>> '{}') ~ '^\d{4}-'
          union all
          select 'photo', ph.caption, ph.created_at from public.profile_photos ph where ph.user_id = p.id
          union all
          select 'potm', to_char(m.month, 'FMMonth YYYY'), (m.month + interval '1 month')::timestamptz
            from public.monthly_awards m where m.user_id = p.id
        ) x where x.at > now() - interval '90 days' order by x.at desc limit 12) a), '[]'::jsonb),
    -- group classes only: the ones they are signed up for, and the ones they did lately
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'startsAt', c.starts_at,
                              'mine', exists (select 1 from public.class_signups v where v.class_id = c.id and v.user_id = me and v.status in ('booked', 'waitlist'))) order by c.starts_at)
                          from (select c.* from public.class_sessions c join public.class_signups g on g.class_id = c.id
                                where g.user_id = p.id and g.status = 'booked' and c.status = 'scheduled' and c.starts_at > now()
                                order by c.starts_at limit 5) c), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('title', c.title, 'startsAt', c.starts_at) order by c.starts_at desc)
                        from (select c.* from public.class_sessions c join public.class_signups g on g.class_id = c.id
                              where g.user_id = p.id and g.status = 'attended' and c.starts_at > now() - interval '60 days'
                              order by c.starts_at desc limit 5) c), '[]'::jsonb));
end $$;

-- Your own page: the text about yourself and whether other members may see your page
create or replace function public.set_profile(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare about text := btrim(coalesce(p ->> 'bio', ''));
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if p ? 'bio' and char_length(about) > 1200 then raise exception 'Keep the text about yourself under 1200 characters.'; end if;
  update public.profiles set
    bio = case when p ? 'bio' then nullif(about, '') else bio end,
    profile_visible = coalesce((p ->> 'visible')::boolean, profile_visible)
  where id = auth.uid();
  return public._player_json(auth.uid());
end $$;

-- A post on your page: one to six photos with a text (at most 30 posts). The files are already in your own Storage
-- folder. It shows on your page and, for the other members, on their start screen ("From the club").
create or replace function public.post_add(p_urls text[], p_text text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  body text := btrim(coalesce(p_text, ''));
  ok_url text := '^https://' || replace(public._config('storage_host'), '.', '\.')
                 || '/storage/v1/object/public/avatars/' || auth.uid()::text || '/[A-Za-z0-9._-]+$';
  u text;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if p_urls is null or coalesce(array_length(p_urls, 1), 0) < 1 then raise exception 'Add at least one photo.'; end if;
  if array_length(p_urls, 1) > 6 then raise exception 'A post takes up to 6 photos.'; end if;
  foreach u in array p_urls loop
    if u is null or u !~ ok_url then raise exception 'Invalid photo.'; end if;
  end loop;
  if char_length(body) > 500 then raise exception 'Keep the text under 500 characters.'; end if;
  if (select count(*) from public.profile_photos where user_id = auth.uid()) >= 30 then
    raise exception 'You can show 30 posts. Remove one first.';
  end if;
  insert into public.profile_photos (user_id, url, more_urls, caption)
  values (auth.uid(), p_urls[1], coalesce(p_urls[2:], '{}'), body);
  return public._player_json(auth.uid());
end $$;

-- The older call with one photo (a browser that still has the previous version of the site)
create or replace function public.photo_add(p_url text, p_caption text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.post_add(array[p_url], p_caption);
end $$;

-- Remove a photo: your own, or any photo as admin (not suitable). Returns its URL so the file can go too.
create or replace function public.photo_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ph public.profile_photos;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  delete from public.profile_photos where id = p_id and (user_id = auth.uid() or public.is_admin()) returning * into ph;
  if not found then raise exception 'Photo not found.'; end if;
  return jsonb_build_object('url', ph.url, 'urls', to_jsonb(array[ph.url] || ph.more_urls), 'userId', ph.user_id);
end $$;

-- A heart on a photo (tap again to take it back). No notification and no celebration: it just counts.
create or replace function public.photo_like(p_photo uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ph public.profile_photos;
begin
  select * into ph from public.profile_photos where id = p_photo;
  if not found or not public._photo_open(ph) then raise exception 'Photo not found.'; end if;
  delete from public.photo_likes where photo_id = p_photo and user_id = auth.uid();
  if not found then insert into public.photo_likes (photo_id, user_id) values (p_photo, auth.uid()); end if;
  return public._photo_json(ph);
end $$;

-- A comment under a photo. The owner of the photo hears about it (not about their own comments).
create or replace function public.photo_comment(p_photo uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ph public.profile_photos;
  msg text := btrim(coalesce(p_body, ''));
  who text;
begin
  select * into ph from public.profile_photos where id = p_photo;
  if not found or not public._photo_open(ph) then raise exception 'Photo not found.'; end if;
  if msg = '' then raise exception 'Type a comment first.'; end if;
  if char_length(msg) > 300 then raise exception 'Keep your comment under 300 characters.'; end if;
  if (select count(*) from public.photo_comments where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 6 then
    raise exception 'Slow down a little: try again in a minute.';
  end if;
  if (select count(*) from public.photo_comments where photo_id = p_photo) >= 200 then raise exception 'This photo has enough comments.'; end if;
  insert into public.photo_comments (photo_id, user_id, body) values (p_photo, auth.uid(), msg);
  if ph.user_id <> auth.uid() then
    select name into who from public.profiles where id = auth.uid();
    perform public._push(ph.user_id, '💬 ' || coalesce(who, 'A member') || ' on your post', left(msg, 140),
      'profile.html?u=' || ph.user_id || '#photo-' || ph.id, 'photo-' || ph.id);
  end if;
  return public._photo_json(ph);
end $$;

-- Remove a comment: your own, one under your own photo, or any as admin
create or replace function public.photo_comment_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.photo_comments;
  ph public.profile_photos;
begin
  select * into c from public.photo_comments where id = p_id;
  if found then select * into ph from public.profile_photos where id = c.photo_id; end if;
  if c.id is null or auth.uid() is null or not (c.user_id = auth.uid() or ph.user_id = auth.uid() or public.is_admin()) then
    raise exception 'Comment not found.';
  end if;
  delete from public.photo_comments where id = p_id;
  return public._photo_json(ph);
end $$;

-- A heart on a comment (tap again to take it back). No notification.
create or replace function public.photo_comment_like(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.photo_comments;
  ph public.profile_photos;
begin
  select * into c from public.photo_comments where id = p_id;
  if found then select * into ph from public.profile_photos where id = c.photo_id; end if;
  if c.id is null or not public._photo_open(ph) then raise exception 'Comment not found.'; end if;
  delete from public.photo_comment_likes where comment_id = p_id and user_id = auth.uid();
  if not found then insert into public.photo_comment_likes (comment_id, user_id) values (p_id, auth.uid()); end if;
  return public._photo_json(ph);
end $$;

create or replace function public.set_leaderboard_visibility(p_show boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles set show_on_leaderboard = coalesce(p_show, true) where id = auth.uid();
$$;

-- The member's birthday as 'MM-DD' (no year), or null to remove it. A day that does not exist (31 April) is refused.
create or replace function public.set_birthday(p_md text)
returns void language plpgsql security definer set search_path = public as $$
declare md text := nullif(trim(coalesce(p_md, '')), '');
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if md is not null then
    if md !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then raise exception 'Pick a day and a month.'; end if;
    begin perform ('2024-' || md)::date; -- 2024 is a leap year: 29 February is a real birthday
    exception when others then raise exception 'That day does not exist.'; end;
  end if;
  update public.profiles set birthday = md where id = auth.uid();
end $$;

-- ---------------------------------------------------------
-- Workouts, body stats and orders
-- ---------------------------------------------------------
-- "Log a workout" was removed: old logged workouts stay in public.workouts, but nobody can add new ones.
drop function if exists public.log_workout(text, integer);

-- Corrects one of your own earlier check-ins (a typo in the weight …). Only the values change: the date stays,
-- and no XP or achievement is ever given, so editing can't be used to earn extra XP.
create or replace function public.update_body_stats(p_id bigint, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first.'; end if;
  perform public._check_stats(p);
  update public.body_stats set
    weight = (p ->> 'weight')::numeric, height = (p ->> 'height')::numeric, age = (p ->> 'age')::int,
    sex = left(coalesce(p ->> 'sex', 'male'), 10), goal = left(coalesce(p ->> 'goal', 'maintain'), 20),
    activity = least(2.0, greatest(1.0, coalesce((p ->> 'activity')::numeric, 1.55))),
    bmi = (p ->> 'bmi')::numeric, bmr = (p ->> 'bmr')::int, maintenance = (p ->> 'maintenance')::int,
    target = (p ->> 'target')::int, protein = (p ->> 'protein')::int
  where id = p_id and user_id = uid;
  if not found then raise exception 'Check-in not found.'; end if;
end $$;

drop function if exists public.save_body_stats(jsonb);
create or replace function public.save_body_stats(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first.'; end if;
  return jsonb_build_object('xp', public._insert_stats(uid, p));
end $$;

-- The weekly check-in from the start screen ("For you"): one tap, XP once a week, and the week counts for the streak
create or replace function public.check_in()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  gained integer;
begin
  if uid is null then raise exception 'Log in first.'; end if;
  gained := public._week_checkin(uid);
  if gained > 0 then
    perform public._check_achievements(uid);
    perform public._check_rank(uid);
  end if;
  return jsonb_build_object('xp', gained, 'streak', public._streak(uid));
end $$;

-- What the start screen ("For you") needs on top of your own data:
--  race: you on the high scores with the player just above and just below you; when you are hidden from the
--        high scores or a trainer (ranked = false) the top 3 instead
--  photos: the latest posts (photos with a text, likes and comments) of members and coaches, your own too;
--          only from pages that are open to members
--  trainersDone: with how many different trainers you completed a session (for the "Full squad" achievement)
-- Your race on the high scores: you between the players just above and below you (or the top 3 when you are not
-- on the board), all time or this month, with what each of them earned in the last 7 days
create or replace function public._race(p_user uuid, p_month boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m0 date := date_trunc('month', now() at time zone 'Europe/Brussels')::date;
  res jsonb;
begin
  -- the same order as the high scores: the most XP first, equal XP = who joined first
  with players as (
    select o.id, o.name, o.xp as total_xp, o.avatar_url, o.created_at,
           case when p_month then public._month_xp(o.id, m0) else o.xp end as score
    from public.profiles o
    where o.show_on_leaderboard
      and not exists (select 1 from public.trainers t where t.email is not null and lower(t.email) = lower(o.email))
  ), board as (
    select pl.*, row_number() over (order by pl.score desc, pl.created_at) as place, count(*) over () as total
    from players pl where not p_month or pl.score > 0
  ), mine as (
    select (select b.place from board b where b.id = p_user) as place, coalesce((select max(b.total) from board b), 0) as total
  )
  select jsonb_build_object(
    'place', m.place, 'total', m.total,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('place', b.place, 'name', b.name, 'xp', b.score, 'totalXp', b.total_xp,
        'avatarUrl', b.avatar_url, 'userId', b.id, 'isMe', b.id = p_user,
        'week', (select coalesce(sum(x.amount), 0) from public.xp_log x where x.user_id = b.id and x.created_at > now() - interval '7 days')) order by b.place)
      from board b
      where b.place between greatest(1, least(coalesce(m.place, 2) - 1, m.total - 2)) and greatest(coalesce(m.place, 2) + 1, 3)), '[]'::jsonb))
  into res from mine m;
  return res;
end $$;
revoke execute on function public._race(uuid, boolean) from public, anon, authenticated;

create or replace function public.for_you()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.profiles;
  ranked boolean;
  board_all jsonb;
  race jsonb;
begin
  if me is null then raise exception 'Log in first.'; end if;
  select * into p from public.profiles where id = me;
  ranked := coalesce(p.show_on_leaderboard, false)
    and not exists (select 1 from public.trainers t where t.email is not null and lower(t.email) = lower(p.email));
  board_all := public._race(case when ranked then me end, false);
  race := board_all -> 'rows';
  return jsonb_build_object(
    'race', coalesce(race, '[]'::jsonb), 'ranked', ranked,
    'board', jsonb_build_object('all', board_all, 'month', public._race(case when ranked then me end, true),
                                'sessionXp', coalesce(nullif(public._config('session_xp'), '')::int, 75)),
    'photos', coalesce((select jsonb_agg(public._photo_json(ph) order by ph.created_at desc)
      from public.profile_photos ph
      where ph.id in (
        select q.id from public.profile_photos q
        join public.profiles u on u.id = q.user_id
        where q.user_id = me or u.profile_visible
           or exists (select 1 from public.trainers t where t.email is not null and lower(t.email) = lower(u.email) and t.active)
        order by q.created_at desc limit 8)), '[]'::jsonb),
    'trainersDone', (select count(distinct k.trainer_id) from public.bookings k where k.user_id = me and k.status = 'completed'));
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

-- Can this be sold right now? Switched on, in stock, and the drop hasn't ended
create or replace function public._shop_available(s public.shop_items)
returns boolean language sql stable as $$
  select s.active and (s.stock is null or s.stock > 0) and (s.drop_ends_at is null or s.drop_ends_at > now());
$$;

-- Is the sale price running right now?
create or replace function public._shop_on_sale(s public.shop_items)
returns boolean language sql stable as $$
  select s.sale_price is not null and s.sale_price < s.price and (s.sale_ends_at is null or s.sale_ends_at > now());
$$;
-- What it costs right now: the sale price while the sale runs, else the normal price
create or replace function public._shop_price(s public.shop_items)
returns numeric language sql stable as $$
  select case when public._shop_on_sale(s) then s.sale_price else s.price end;
$$;
create or replace function public._euro(p numeric)
returns text language sql immutable as $$
  select '€' || case when p = trunc(p) then trunc(p)::text else to_char(p, 'FM999990.00') end;
$$;

-- The shop as the website shows it: price, on/off, stock left and the end of a drop (anyone).
-- price = what you pay now; listPrice = the normal price while there is a sale
create or replace function public.shop_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'price', public._shop_price(s), 'category', s.category,
           'listPrice', case when public._shop_on_sale(s) then s.price end,
           'saleEndsAt', case when public._shop_on_sale(s) then s.sale_ends_at end,
           'active', s.active, 'stock', s.stock, 'dropEndsAt', s.drop_ends_at, 'available', public._shop_available(s)) order by s.id), '[]'::jsonb)
  from public.shop_items s;
$$;

-- A basket checked against the shop: known items only, 1-10 each, prices from the database.
-- p_strict: everything must be for sale right now (and, for the tab, be a drink or bar).
create or replace function public._shop_basket(p_items jsonb, p_strict boolean, p_tab boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  clean jsonb := '[]'::jsonb;
  item jsonb;
  s public.shop_items;
  qty integer;
  v_total numeric := 0;
begin
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into s from public.shop_items where id = item ->> 'id';
    if not found then continue; end if;
    qty := least(10, greatest(1, coalesce((item ->> 'qty')::int, 1)));
    if p_strict then
      if not public._shop_available(s) then raise exception '% is not available right now.', s.name; end if;
      if s.stock is not null and qty > s.stock then raise exception 'Only % × % left.', s.stock, s.name; end if;
      if p_tab and s.category <> 'fuel' then raise exception 'Only drinks and bars can go on your tab.'; end if;
    elsif not s.active then
      continue; -- a product that isn't for sale never earns XP
    end if;
    v_total := v_total + public._shop_price(s) * qty;
    clean := clean || jsonb_build_array(jsonb_build_object('id', s.id, 'name', s.name, 'size', item ->> 'size', 'qty', qty, 'price', public._shop_price(s)));
  end loop;
  if jsonb_array_length(clean) = 0 then raise exception 'Invalid order.'; end if;
  return jsonb_build_object('items', clean, 'total', v_total, 'xp', round(v_total * 10));
end $$;

-- Before paying: is everything still for sale (sold out, drop ended)? Returns the total and XP.
create or replace function public.shop_check(p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return public._shop_basket(p_items, true);
end $$;

-- Sold: lower the stock of limited items (never below 0)
create or replace function public._shop_take_stock(p_items jsonb, p_sign integer default 1)
returns void language sql security definer set search_path = public as $$
  update public.shop_items s set stock = greatest(0, s.stock - p_sign * (i ->> 'qty')::int)
  from jsonb_array_elements(p_items) i
  where s.id = i ->> 'id' and s.stock is not null;
$$;

-- Records a paid PayPal order. The total and XP are recalculated from the
-- shop prices, so a changed price in the browser can't inflate the XP.
create or replace function public.record_order(p_id text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  basket jsonb;
begin
  if p_id is null or length(p_id) < 6 or p_id like 'TAB-%' then raise exception 'Invalid order.'; end if;
  if exists (select 1 from public.orders where id = p_id) then
    return jsonb_build_object('duplicate', true);
  end if;
  -- already paid: record it even if it sold out in the meantime (the stock just stays at 0)
  basket := public._shop_basket(p_items, false);
  insert into public.orders (id, user_id, items, total, xp, status, paid_at)
  values (p_id, null, basket -> 'items', (basket ->> 'total')::numeric, (basket ->> 'xp')::int, 'paid', now());
  perform public._shop_take_stock(basket -> 'items');
  if auth.uid() is not null then
    perform public._credit_order(p_id, auth.uid());
    perform public._celebrate(auth.uid(), 'purchase', jsonb_build_object('what', 'order', 'order', p_id,
      'items', (select jsonb_agg(i ->> 'name') from jsonb_array_elements(basket -> 'items') i), 'xp', (basket ->> 'xp')::int));
  end if;
  return jsonb_build_object('xp', (basket ->> 'xp')::int, 'total', (basket ->> 'total')::numeric, 'guest', auth.uid() is null);
end $$;

-- "On my tab": a member takes drinks or bars at the gym and pays later at the desk.
-- At most tab_limit euro open at a time; the XP comes when an admin marks it as paid.
create or replace function public.shop_tab_order(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  basket jsonb;
  open_total numeric;
  oid text := 'TAB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
begin
  if auth.uid() is null then raise exception 'Log in to put it on your tab.'; end if;
  perform 1 from public.profiles where id = auth.uid() for update;
  basket := public._shop_basket(p_items, true, true);
  select coalesce(sum(total), 0) into open_total from public.orders where user_id = auth.uid() and status = 'open';
  if open_total + (basket ->> 'total')::numeric > public._config('tab_limit')::numeric then
    raise exception 'Your tab is limited to % euro. Pay your open tab at the desk first.', public._config('tab_limit');
  end if;
  insert into public.orders (id, user_id, items, total, xp, status)
  values (oid, auth.uid(), basket -> 'items', (basket ->> 'total')::numeric, (basket ->> 'xp')::int, 'open');
  perform public._shop_take_stock(basket -> 'items');
  return jsonb_build_object('id', oid, 'total', (basket ->> 'total')::numeric, 'xp', (basket ->> 'xp')::int,
                            'openTotal', open_total + (basket ->> 'total')::numeric);
end $$;

-- Took the wrong drink: the member can undo an open tab line within 15 minutes; an admin any time
create or replace function public.shop_tab_cancel(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_id for update;
  if not found or o.status <> 'open' or (o.user_id is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'Open tab not found.';
  end if;
  if not public.is_admin() and o.created_at < now() - interval '15 minutes' then
    raise exception 'Ask at the desk to change this tab.';
  end if;
  update public.orders set status = 'cancelled' where id = p_id;
  perform public._shop_take_stock(o.items, -1);
end $$;

-- Admin: the member paid their tab at the desk -> the order and its XP count
create or replace function public.shop_tab_paid(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  gained integer;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  select * into o from public.orders where id = p_id for update;
  if not found or o.status <> 'open' then raise exception 'Open tab not found.'; end if;
  update public.orders set status = 'paid', paid_at = now() where id = p_id;
  gained := public._credit_order(p_id, o.user_id);
  perform public._push(o.user_id, 'Tab paid ✓', '+' || gained || ' XP for your drinks and bars', 'profile.html', 'tab-' || p_id);
  return jsonb_build_object('id', p_id, 'xp', gained);
end $$;

-- Admin: everything for the Shop tab (products, open tabs, bundles and gifts to hand out)
create or replace function public.admin_shop()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'price', s.price, 'category', s.category,
                'active', s.active, 'stock', s.stock, 'dropEndsAt', s.drop_ends_at, 'available', public._shop_available(s),
                'salePrice', s.sale_price, 'saleEndsAt', s.sale_ends_at, 'onSale', public._shop_on_sale(s), 'announced', s.announced_at is not null,
                'sold', (select coalesce(sum((i ->> 'qty')::int), 0) from public.orders o, jsonb_array_elements(o.items) i
                         where o.status <> 'cancelled' and i ->> 'id' = s.id)) order by s.category, s.id), '[]'::jsonb)
              from public.shop_items s),
    'tabs', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'userId', o.user_id, 'name', p.name, 'email', p.email,
                'items', o.items, 'total', o.total, 'xp', o.xp, 'date', o.created_at) order by p.name, o.created_at), '[]'::jsonb)
             from public.orders o join public.profiles p on p.id = o.user_id where o.status = 'open'),
    'packs', public._config('packs')::jsonb,
    'gifts', (select coalesce(jsonb_agg(public._pack_json(sp) order by sp.paid_at), '[]'::jsonb)
              from public.session_packs sp where sp.gift is not null and sp.status = 'paid' and sp.gift_given_at is null)
  );
end $$;

-- Admin: change a product: price, sale price (and until when), on/off, stock left, end of the drop.
-- With "notify" members hear about it once: a product that goes on sale for the first time ("New in the shop")
-- or a new or deeper discount (at most one sale message per product every 3 days).
drop function if exists public.admin_shop_update(text, jsonb);
create or replace function public.admin_shop_update(p_id text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_price numeric := nullif(p ->> 'price', '')::numeric;
  was public.shop_items;
  s public.shop_items;
  was_sale boolean;
  pct integer;
  reached integer;
  told text;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  select * into was from public.shop_items where id = p_id for update;
  if not found then raise exception 'Product not found.'; end if;
  if v_price is not null and (v_price < 0 or v_price > 1000) then raise exception 'Enter a price between 0 and 1000.'; end if;
  was_sale := public._shop_on_sale(was);
  update public.shop_items set
    price = coalesce(v_price, price),
    active = coalesce((p ->> 'active')::boolean, active),
    stock = case when p ? 'stock' then nullif(p ->> 'stock', '')::int else stock end,
    drop_ends_at = case when p ? 'dropEndsAt' then nullif(p ->> 'dropEndsAt', '')::timestamptz else drop_ends_at end,
    sale_price = case when p ? 'salePrice' then nullif(p ->> 'salePrice', '')::numeric else sale_price end,
    sale_ends_at = case when p ? 'salePrice' and nullif(p ->> 'salePrice', '') is null then null
                        when p ? 'saleEndsAt' then nullif(p ->> 'saleEndsAt', '')::timestamptz else sale_ends_at end
  where id = p_id returning * into s;
  if s.sale_price is not null and s.sale_price >= s.price then raise exception 'The sale price must be lower than the normal price.'; end if;
  if s.sale_price is not null and s.sale_ends_at is not null and s.sale_ends_at <= now() then raise exception 'The end of the sale must be in the future.'; end if;

  if coalesce((p ->> 'notify')::boolean, false) and public._shop_available(s) then
    if not was.active and s.announced_at is null then
      reached := public._broadcast('shop_new', '🆕 New in the shop: ' || s.name,
        public._euro(public._shop_price(s)) || ' · +' || round(public._shop_price(s) * 10) || ' XP'
          || case when s.stock is not null then ' · only ' || s.stock || ' pieces' else '' end,
        'shop.html', 'shop-' || s.id, coalesce(s.drop_ends_at, now() + interval '10 days'));
      told := 'new';
    elsif public._shop_on_sale(s) and (not was_sale or s.sale_price < was.sale_price)
          and (s.sale_announced_at is null or s.sale_announced_at < now() - interval '3 days') then
      pct := round((1 - s.sale_price / s.price) * 100);
      reached := public._broadcast('shop_sale', '🔥 −' || pct || '% on ' || s.name,
        'Now ' || public._euro(s.sale_price) || ' instead of ' || public._euro(s.price)
          || case when s.sale_ends_at is not null then ' · until ' || to_char(s.sale_ends_at at time zone 'Europe/Brussels', 'Dy DD Mon') else '' end,
        'shop.html', 'shop-' || s.id, coalesce(s.sale_ends_at, now() + interval '10 days'));
      told := 'sale';
    end if;
  end if;
  -- anything that is on sale counts as introduced, so switching it off and on later is not "new" again
  update public.shop_items set announced_at = case when active then coalesce(announced_at, now()) else announced_at end,
    sale_announced_at = case when told = 'sale' then now() else sale_announced_at end
  where id = p_id;
  if not public._shop_on_sale(s) then delete from public.news where ref = 'shop-' || s.id and kind = 'shop_sale'; end if;
  if not s.active then delete from public.news where ref = 'shop-' || s.id; end if;
  return jsonb_build_object('announced', told, 'reached', coalesce(reached, 0));
end $$;

-- Admin: a discount on a whole category (or 'all') in one go; 0 % ends the sale. One message for everyone.
create or replace function public.admin_shop_sale(p_category text, p_pct integer, p_ends timestamptz default null, p_notify boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cat text := lower(coalesce(p_category, 'all'));
  n integer;
  reached integer := 0;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  if cat not in ('all', 'merch', 'tools', 'fuel', 'limited') then raise exception 'Unknown category.'; end if;
  if p_pct is null or p_pct < 0 or p_pct > 90 then raise exception 'Choose a discount between 0 and 90%%.'; end if;
  if p_pct > 0 and p_ends is not null and p_ends <= now() then raise exception 'The end of the sale must be in the future.'; end if;
  if p_pct = 0 then
    update public.shop_items set sale_price = null, sale_ends_at = null where cat = 'all' or category = cat;
    get diagnostics n = row_count;
    delete from public.news where kind = 'shop_sale' and (ref = 'shop-sale-' || cat or cat = 'all'
      or ref in (select 'shop-' || id from public.shop_items where category = cat));
    return jsonb_build_object('items', n, 'reached', 0);
  end if;
  update public.shop_items set sale_price = round(price * (100 - p_pct) / 100.0, 2), sale_ends_at = p_ends
    where active and price > 0 and (cat = 'all' or category = cat);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'No products on sale in this category. Switch them on first.'; end if;
  if p_notify then
    reached := public._broadcast('shop_sale',
      '🔥 −' || p_pct || '% on ' || case cat when 'all' then 'everything in the shop' when 'merch' then 'all merch'
        when 'tools' then 'all training tools' when 'fuel' then 'all drinks and bars' else 'the limited drops' end,
      case when p_ends is not null then 'Until ' || to_char(p_ends at time zone 'Europe/Brussels', 'Dy DD Mon') || ' · ' else '' end || 'Every euro still earns 10 XP',
      'shop.html', 'shop-sale-' || cat, coalesce(p_ends, now() + interval '10 days'));
    update public.shop_items set sale_announced_at = now() where active and (cat = 'all' or category = cat);
  end if;
  return jsonb_build_object('items', n, 'reached', reached);
end $$;

-- Admin: a message for everyone (bell on the website + notification), e.g. "Closed on Monday"
create or replace function public.admin_announce(p_title text, p_body text default '', p_url text default 'index.html')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ttl text := btrim(coalesce(p_title, ''));
  link text := case when p_url in ('index.html', 'index.html#schedule', 'index.html#highScores', 'shop.html', 'profile.html') then p_url else 'index.html' end;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  if char_length(ttl) < 3 or char_length(ttl) > 60 then raise exception 'Write a title of 3 to 60 characters.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) > 200 then raise exception 'Keep the message under 200 characters.'; end if;
  if (select count(*) from public.news where kind = 'info' and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'That''s 3 messages in one day already. More would feel like spam: try again tomorrow.';
  end if;
  return jsonb_build_object('reached', public._broadcast('info', ttl, btrim(coalesce(p_body, '')), link, null, now() + interval '14 days', true));
end $$;

-- Admin: take a news item away again (it disappears behind the bell; notifications already sent stay sent)
create or replace function public.admin_delete_news(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  delete from public.push_outbox where tag = 'news-' || p_id and sent_at is null;
  delete from public.news where id = p_id;
end $$;

-- Players switch news notifications on or off
create or replace function public.set_push_news(p_on boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles set push_news = coalesce(p_on, true) where id = auth.uid();
$$;

-- Admin: a pack size comes with a gift from the shop (or none)
create or replace function public.admin_pack_gift(p_size integer, p_gift text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare packs jsonb := public._config('packs')::jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  if nullif(p_gift, '') is not null and not exists (select 1 from public.shop_items where id = p_gift) then
    raise exception 'Product not found.';
  end if;
  select coalesce(jsonb_agg(case when (o ->> 'size')::int = p_size
                                 then case when nullif(p_gift, '') is null then o - 'gift' else o || jsonb_build_object('gift', p_gift) end
                                 else o end), '[]'::jsonb)
    into packs from jsonb_array_elements(packs) o;
  update public.app_config set value = packs::text where key = 'packs';
  return packs;
end $$;

-- Admin: the gift that came with a pack was handed out; it lands in the member's inventory
create or replace function public.mark_pack_gift_given(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sp public.session_packs;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  update public.session_packs set gift_given_at = now()
    where id = p_id and gift is not null and status = 'paid' and gift_given_at is null returning * into sp;
  if not found then raise exception 'No gift to hand out for this pack.'; end if;
  update public.profiles
    set inventory = jsonb_set(inventory, array[sp.gift], to_jsonb(coalesce((inventory ->> sp.gift)::int, 0) + 1))
    where id = sp.user_id;
  perform public._check_achievements(sp.user_id);
  return public._pack_json(sp);
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
-- avatar_url: the profile photo of the coach's own account. One photo per coach: the one they put on their page
-- is also the one on their coach card, in the calendar and in the chat (the site falls back to the card's own photo).
drop function if exists public.trainer_list(); -- the columns changed (avatar_url)
create or replace function public.trainer_list()
returns table (id text, name text, role text, bio text, specialties text, color text, chart_color text, linked boolean, avatar_url text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.role, t.bio, t.specialties, t.color, t.chart_color, t.email is not null,
         (select p.avatar_url from public.profiles p where t.email is not null and lower(p.email) = lower(t.email) limit 1)
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
    'classPrice', public._config('class_price')::numeric,
    'classXp', public._config('class_xp')::int,
    'classCapacity', public._config('class_capacity')::int,
    'classCancelHours', public._config('class_cancel_hours')::int,
    'classTrainerFee', public._config('class_trainer_fee')::numeric,
    'tabLimit', public._config('tab_limit')::numeric,
    -- the latest news (new classes, products, sales, messages) for the bell on every page
    'news', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'url', n.url, 'date', n.created_at) order by n.id desc)
                      from (select * from public.news where created_at > now() - interval '14 days' and (expires_at is null or expires_at > now())
                            order by id desc limit 8) n), '[]'::jsonb),
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
  insert into public.session_packs (user_id, size, price, pay_method, gift)
  values (auth.uid(), p_size, (opt ->> 'price')::numeric, p_pay,
          (select s.id from public.shop_items s where s.id = opt ->> 'gift'))
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
-- Opening hours per trainer
-- ---------------------------------------------------------
-- Start once with the hours that used to be in the website code; after that the admin dashboard decides
do $$ begin
  if not exists (select 1 from public.app_config where key = 'hours_seeded') then
    insert into public.trainer_hours (trainer_id, weekday, start_hour, end_hour)
    select v.t, v.w, v.a, v.b
    from (values ('pieter', 3, 19, 21), ('pieter', 6, 17, 20), ('filip', 3, 13, 18), ('maxim', 0, 9, 18)) v(t, w, a, b)
    where exists (select 1 from public.trainers where id = v.t)
      and not exists (select 1 from public.trainer_hours h where h.trainer_id = v.t);
    insert into public.app_config (key, value) values ('hours_seeded', 'yes');
  end if;
end $$;

-- For the schedule and the hours editors. Notes (can be private) only for the admin and the trainer themselves.
create or replace function public.trainer_hours_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'trainerId', h.trainer_id, 'weekday', h.weekday, 'date', h.day,
                    'start', h.start_hour, 'end', h.end_hour, 'kind', h.kind,
                    'note', case when public._can_coach(h.trainer_id) then h.note else '' end)
                  order by h.trainer_id, h.weekday, h.day, h.start_hour), '[]'::jsonb)
  from public.trainer_hours h join public.trainers t on t.id = h.trainer_id
  where t.active and (h.day is null or h.day >= (now() at time zone 'Europe/Brussels')::date - 1);
$$;

-- Is this hour open in the admin's hours (weekly or extra on that date, and not closed that date)?
create or replace function public._hours_cover(p_trainer text, p_day date, p_hour integer)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trainer_hours h where h.trainer_id = p_trainer and h.kind = 'open'
                   and (h.weekday = extract(dow from p_day) or h.day = p_day) and p_hour >= h.start_hour and p_hour < h.end_hour)
     and not exists (select 1 from public.trainer_hours h where h.trainer_id = p_trainer and h.kind = 'closed'
                   and h.day = p_day and p_hour >= h.start_hour and p_hour < h.end_hour);
$$;

-- Upcoming booked or requested sessions of a trainer that are inside the open hours right now
create or replace function public._covered_bookings(p_trainer text)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(b.id), '{}') from public.bookings b
  where b.trainer_id = p_trainer and b.status in ('awaiting_payment', 'pending', 'confirmed')
    and public._slot_start(b.day, b.hour) > now() and public._hours_cover(b.trainer_id, b.day, b.hour);
$$;

-- Hours with a booking or request can't be removed: raise when a change left one of them outside the hours
create or replace function public._check_booked_hours(p_trainer text, p_before uuid[])
returns void language plpgsql stable security definer set search_path = public as $$
declare lost text;
begin
  select string_agg(to_char(b.day, 'Dy DD Mon') || ' ' || lpad(b.hour::text, 2, '0') || ':00', ', ' order by b.day, b.hour)
    into lost
  from public.bookings b where b.id = any(p_before) and not public._hours_cover(b.trainer_id, b.day, b.hour);
  if lost is not null then
    raise exception 'These hours are already booked or requested: %. Cancel or move those sessions first.', lost;
  end if;
end $$;

-- Add or change a block of hours (admin, or the trainer for their own card).
-- p_id null = new. Weekly: p_weekday set, p_day null. One date: p_day set, p_weekday null.
create or replace function public.save_trainer_hours(p_id uuid, p_trainer text, p_weekday integer, p_day date,
                                                     p_start integer, p_end integer, p_kind text default 'open', p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  h public.trainer_hours;
  before uuid[] := public._covered_bookings(p_trainer);
begin
  if auth.uid() is null or not public._can_coach(p_trainer) then raise exception 'Only an admin or the trainer can change these hours.'; end if;
  if not exists (select 1 from public.trainers where id = p_trainer) then raise exception 'Trainer not found.'; end if;
  if (p_weekday is null) = (p_day is null) then raise exception 'Choose a weekday or a date.'; end if;
  if p_start is null or p_end is null or p_start < 0 or p_end > 24 or p_end <= p_start then
    raise exception 'The end time must be after the start time.';
  end if;
  if p_kind not in ('open', 'closed') or (p_kind = 'closed' and p_day is null) then raise exception 'Invalid type of hours.'; end if;
  if p_day is not null and p_day < (now() at time zone 'Europe/Brussels')::date then raise exception 'Pick today or a date in the future.'; end if;
  if p_id is null then
    insert into public.trainer_hours (trainer_id, weekday, day, start_hour, end_hour, kind, note)
    values (p_trainer, p_weekday, p_day, p_start, p_end, p_kind, left(coalesce(p_note, ''), 80)) returning * into h;
  else
    update public.trainer_hours set trainer_id = p_trainer, weekday = p_weekday, day = p_day, start_hour = p_start,
           end_hour = p_end, kind = p_kind, note = left(coalesce(p_note, ''), 80)
     where id = p_id and trainer_id = p_trainer and public._can_coach(trainer_id) returning * into h;
    if not found then raise exception 'These hours no longer exist.'; end if;
  end if;
  perform public._check_booked_hours(p_trainer, before);
  return to_jsonb(h);
end $$;

create or replace function public.delete_trainer_hours(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t text;
  before uuid[];
begin
  select trainer_id into t from public.trainer_hours where id = p_id;
  if t is null then raise exception 'These hours no longer exist.'; end if;
  before := public._covered_bookings(t);
  delete from public.trainer_hours where id = p_id and public._can_coach(trainer_id);
  if not found then raise exception 'These hours no longer exist.'; end if;
  perform public._check_booked_hours(t, before);
end $$;

-- ---------------------------------------------------------
-- Health questionnaire
-- ---------------------------------------------------------
create or replace function public.save_health_form(p_answers jsonb, p_notes text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k text;
  risk boolean := false;
  clean jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  foreach k in array array['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] loop
    if jsonb_typeof(p_answers -> k) is distinct from 'boolean' then raise exception 'Answer every question with yes or no.'; end if;
    clean := clean || jsonb_build_object(k, (p_answers ->> k)::boolean);
    risk := risk or (p_answers ->> k)::boolean;
  end loop;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Type your full name to sign.'; end if;
  if risk and length(trim(coalesce(p_notes, ''))) < 3 then
    raise exception 'You answered yes to a question: tell your trainer a bit more about it.';
  end if;
  insert into public.health_forms (user_id, answers, has_risk, notes, signed_name, accepted_at)
  values (auth.uid(), clean, risk, left(trim(coalesce(p_notes, '')), 600), left(trim(p_name), 80), now())
  on conflict (user_id) do update set answers = excluded.answers, has_risk = excluded.has_risk, notes = excluded.notes,
    signed_name = excluded.signed_name, accepted_at = now();
  return public._health_brief(auth.uid());
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
  g public.class_signups;
  c public.class_sessions;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if public._config('online_payments') <> 'on' then raise exception 'Online payment is not available yet.'; end if;
  if p_type = 'booking' then
    select * into b from public.bookings where id = p_id and user_id = auth.uid();
    if not found then raise exception 'Booking not found.'; end if;
    if b.pay_method in ('pack', 'reward') or b.pay_status <> 'unpaid' then raise exception 'This session doesn''t need a payment.'; end if;
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
  elsif p_type = 'class' then
    perform public._expire_class_payments();
    select * into g from public.class_signups where id = p_id and user_id = auth.uid();
    if not found then raise exception 'Sign-up not found.'; end if;
    if g.pay_status <> 'unpaid' or g.price <= 0 then raise exception 'This class doesn''t need a payment.'; end if;
    if g.status not in ('awaiting_payment', 'booked', 'attended', 'no_show', 'late_cancel') then
      raise exception 'This sign-up can''t be paid anymore.';
    end if;
    select * into c from public.class_sessions where id = g.class_id;
    return jsonb_build_object('type', 'class', 'id', g.id, 'amount', g.price,
      'description', 'LEVEL-UP group class ' || c.title || ' ' || to_char(c.starts_at at time zone 'Europe/Brussels', 'DD-MM-YYYY HH24:MI'));
  end if;
  raise exception 'Unknown payment type.';
end $$;

-- Edge Function only (service role): remember the Mollie payment for a booking or pack
create or replace function public.attach_payment(p_type text, p_id uuid, p_mollie text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'booking' then
    update public.bookings set mollie_id = p_mollie, pay_method = 'online' where id = p_id and pay_status = 'unpaid';
  elsif p_type = 'class' then
    update public.class_signups set mollie_id = p_mollie, pay_method = 'online' where id = p_id and pay_status = 'unpaid';
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
  g public.class_signups;
  c public.class_sessions;
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
      perform public._celebrate(b.user_id, 'purchase', jsonb_build_object('what', 'session',
        'trainer', (select split_part(name, ' ', 1) from public.trainers where id = b.trainer_id), 'slot', public._slot_label(b.day, b.hour)));
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
  elsif p_type = 'class' then
    select * into g from public.class_signups where id = p_id for update;
    if not found then
      return jsonb_build_object('action', case when p_status = 'paid' then 'refund' else 'none' end);
    end if;
    if g.mollie_id is distinct from p_mollie and g.pay_status = 'paid' then
      return jsonb_build_object('action', case when p_status = 'paid' then 'refund' else 'none' end);
    end if;
    if p_status = 'paid' then
      if g.pay_status = 'paid' then return jsonb_build_object('action', 'none'); end if;
      if g.status = 'cancelled' then
        update public.class_signups set mollie_id = p_mollie, pay_method = 'online', pay_status = 'paid', paid_at = now(),
               refund_status = 'due' where id = p_id;
        return jsonb_build_object('action', 'none'); -- the refund runs from refund_status
      end if;
      update public.class_signups set mollie_id = p_mollie, pay_method = 'online', pay_status = 'paid', paid_at = now(),
             status = case when status = 'awaiting_payment' then 'booked' else status end
        where id = p_id;
      perform public._celebrate(g.user_id, 'purchase', (select jsonb_build_object('what', 'class', 'title', cs.title,
        'slot', to_char(cs.starts_at at time zone 'Europe/Brussels', 'Dy DD Mon HH24:MI')) from public.class_sessions cs where cs.id = g.class_id));
      if g.status = 'awaiting_payment' then
        select * into c from public.class_sessions where id = g.class_id;
        perform public._push(public._trainer_user(c.trainer_id), 'New sign-up: ' || c.title,
          (select name from public.profiles where id = g.user_id) || ' · ' || public._class_label(c) || ' · '
            || public._class_taken(c.id) || '/' || c.capacity, 'profile.html#coach', 'class-' || c.id || '-roster');
      end if;
    elsif p_status in ('failed', 'canceled', 'expired') and g.status = 'awaiting_payment' and g.mollie_id = p_mollie then
      update public.class_signups set status = 'cancelled', updated_at = now() where id = p_id;
      perform public._class_promote(g.class_id);
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
  ), claimed_classes as (
    update public.class_signups set refund_status = 'processing'
    where refund_status = 'due' and pay_method = 'online' and mollie_id is not null
    returning id, mollie_id, price
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'mollieId', mollie_id, 'amount', price)), '[]'::jsonb)
  from (select * from claimed union all select * from claimed_classes) x;
$$;

-- Edge Function only: the result of a refund
create or replace function public.refund_done(p_id uuid, p_refund text, p_ok boolean)
returns void language sql security definer set search_path = public as $$
  update public.bookings
     set refund_status = case when p_ok then 'done' else 'due' end,
         refund_id = coalesce(p_refund, refund_id),
         pay_status = case when p_ok then 'refunded' else pay_status end
   where id = p_id;
  update public.class_signups
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
  if b.pay_method in ('pack', 'reward') or b.pay_status <> 'unpaid' then raise exception 'This session doesn''t need a payment.'; end if;
  update public.bookings set pay_status = 'paid', pay_method = 'in_person', paid_at = now(),
         status = case when status = 'awaiting_payment' then 'pending' else status end,
         request_at = case when status = 'awaiting_payment' then now() else request_at end
    where id = p_id returning * into b;
  return public._booking_json(b);
end $$;

-- The player couldn't (or didn't want to) pay online: pay at the headquarters instead.
-- The request goes to the trainer right away.
create or replace function public.pay_in_person_instead(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  perform public._expire_requests();
  select * into b from public.bookings where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Booking not found.'; end if;
  if b.status <> 'awaiting_payment' then raise exception 'This booking is no longer waiting for payment.'; end if;
  update public.bookings set status = 'pending', pay_method = 'in_person', request_at = now(), request_notice_sent = true
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

-- Admin: a group class place paid at the desk was refunded by hand
create or replace function public.class_mark_refunded(p_signup uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.class_signups;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  update public.class_signups set refund_status = 'done', pay_status = 'refunded'
    where id = p_signup and refund_status = 'manual' returning * into g;
  if not found then raise exception 'No manual refund open for this sign-up.'; end if;
  return jsonb_build_object('id', g.id, 'refundStatus', g.refund_status);
end $$;

-- Admin: the Legend hoodie was handed out at the desk
create or replace function public.mark_hoodie_given(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.reward_vouchers;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  update public.reward_vouchers set hoodie_given_at = now()
    where id = p_id and hoodie and hoodie_given_at is null returning * into v;
  if not found then raise exception 'No hoodie to hand out for this reward.'; end if;
  return public._voucher_json(v);
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
    'bookings', coalesce((select jsonb_agg(public._booking_json(b) || jsonb_build_object('health', public._health_brief(b.user_id))
                                    order by b.day, b.hour)
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
    'packs', coalesce((select jsonb_agg(public._pack_json(sp) order by sp.created_at desc) from public.session_packs sp), '[]'::jsonb),
    'vouchers', coalesce((select jsonb_agg(public._voucher_json(v) order by v.earned_at desc) from public.reward_vouchers v), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'trainerId', h.trainer_id, 'weekday', h.weekday, 'date', h.day,
                          'start', h.start_hour, 'end', h.end_hour, 'kind', h.kind, 'note', h.note) order by h.weekday, h.day, h.start_hour)
                       from public.trainer_hours h where h.day is null or h.day >= (now() at time zone 'Europe/Brussels')::date - 1), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------
-- Push notifications (the app on your phone: "Session confirmed", "New request" …)
-- The website saves each phone's push subscription; triggers queue messages in push_outbox;
-- the Edge Function "push" sends them (and makes the VAPID keys the first time).
-- None of these tables can be read from the website: only through the functions below.
-- ---------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_outbox (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null default '',
  url text not null default 'profile.html',
  tag text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists push_outbox_open_idx on public.push_outbox (id) where sent_at is null;

-- The VAPID key pair (made by the Edge Function). The private key never leaves the server.
create table if not exists public.push_keys (
  id integer primary key default 1 check (id = 1),
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;
alter table public.push_keys enable row level security;
revoke all on public.push_subscriptions, public.push_outbox, public.push_keys from anon, authenticated;

alter table public.bookings add column if not exists reminder_pushed_at timestamptz;
-- A trainer who hasn't answered a request gets a reminder (at most two per request)
alter table public.bookings add column if not exists pending_reminders integer not null default 0;
alter table public.bookings add column if not exists pending_reminded_at timestamptz;
-- News and reminders queued at night wait until the morning
alter table public.push_outbox add column if not exists send_after timestamptz;

-- Quiet hours (22:00 - 8:00, Brussels time): the time to wait until, or null during the day
create or replace function public._after_quiet(p_now timestamptz default now())
returns timestamptz language sql stable as $$
  select case when extract(hour from p_now at time zone 'Europe/Brussels') >= 22
                then (((p_now at time zone 'Europe/Brussels')::date + 1) + time '08:00') at time zone 'Europe/Brussels'
              when extract(hour from p_now at time zone 'Europe/Brussels') < 8
                then ((p_now at time zone 'Europe/Brussels')::date + time '08:00') at time zone 'Europe/Brussels'
         end;
$$;

-- News for everyone: it always shows behind the bell; as a notification it goes to everyone with notifications on
-- who didn't switch news off. So it never feels like spam: at most 2 news notifications per person per 24 hours
-- (p_force: a message the admin wrote always goes out) and nothing at night. The sender gets a copy too, so they
-- see what their members see.
create or replace function public._broadcast(p_kind text, p_title text, p_body text, p_url text, p_ref text default null,
                                             p_expires timestamptz default null, p_force boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  nid bigint;
  n integer := 0;
  u record;
  later timestamptz := public._after_quiet();
begin
  if p_ref is not null then delete from public.news where ref = p_ref and kind = p_kind; end if;
  insert into public.news (kind, title, body, url, ref, expires_at, created_by)
  values (p_kind, left(p_title, 80), left(coalesce(p_body, ''), 240), p_url, p_ref, p_expires, auth.uid()) returning id into nid;
  for u in
    select p.id from public.profiles p
    where p.push_news
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
      and (p_force or p.id = auth.uid() or (select count(*) from public.push_outbox o
                       where o.user_id = p.id and o.tag like 'news-%' and o.created_at > now() - interval '24 hours') < 2)
  loop
    insert into public.push_outbox (user_id, title, body, url, tag, send_after)
    values (u.id, left(p_title, 80), left(coalesce(p_body, ''), 240), p_url, 'news-' || nid, later);
    n := n + 1;
  end loop;
  delete from public.news where created_at < now() - interval '60 days';
  return n;
end $$;

-- Queue a message for a player (only when they have notifications on somewhere)
create or replace function public._push(p_user uuid, p_title text, p_body text, p_url text, p_tag text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or not exists (select 1 from public.push_subscriptions where user_id = p_user) then return; end if;
  insert into public.push_outbox (user_id, title, body, url, tag) values (p_user, p_title, coalesce(p_body, ''), p_url, coalesce(p_tag, ''));
end $$;

-- The account linked to a trainer card
create or replace function public._trainer_user(p_trainer text)
returns uuid language sql stable security definer set search_path = public as $$
  select p.id from public.trainers t join public.profiles p on lower(p.email) = lower(t.email)
  where t.id = p_trainer and t.email is not null limit 1;
$$;

create or replace function public._slot_label(p_day date, p_hour integer)
returns text language sql immutable as $$
  select to_char(p_day, 'Dy DD Mon') || ' ' || lpad(p_hour::text, 2, '0') || ':00';
$$;

-- Booking changes -> messages for the player or the trainer
create or replace function public._push_booking_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b public.bookings := case when tg_op = 'DELETE' then old else new end;
  was text := case when tg_op = 'INSERT' then null else old.status end;
  coach uuid := public._trainer_user(b.trainer_id);
  client text := (select name from public.profiles where id = b.user_id);
  trainer text := (select split_part(name, ' ', 1) from public.trainers where id = b.trainer_id);
  slot text := public._slot_label(b.day, b.hour);
  tag text := 'booking-' || b.id;
  by_player boolean := auth.uid() = b.user_id;
begin
  -- a weekly session answered, stopped or planned as a whole sends its own single message
  if coalesce(current_setting('levelup.quiet', true), '') = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- a weekly request that expires: one message, for its first week
  if tg_op = 'UPDATE' and new.status = 'expired' and new.series_id is not null
     and exists (select 1 from public.bookings o where o.series_id = new.series_id and o.id <> new.id
                 and o.status = 'expired' and o.day < new.day and o.responded_at > now() - interval '1 minute') then
    return new;
  end if;
  if tg_op = 'DELETE' then
    if was in ('pending', 'confirmed') then
      perform public._push(coach, case when was = 'pending' then 'Request withdrawn' else 'Session cancelled' end,
                           client || ' · ' || slot, 'profile.html#coach', tag);
      if not by_player then
        perform public._push(b.user_id, 'Session cancelled', trainer || ' · ' || slot || '. No costs.', 'profile.html#overview', tag);
      end if;
    end if;
    return old;
  end if;
  if was is not distinct from new.status or (tg_op = 'INSERT' and new.status <> 'pending') then return new; end if;

  if new.status = 'pending' and (was is null or was = 'awaiting_payment') then
    perform public._push(coach, 'New session request', client || ' · ' || slot || case when new.kind = 'duo' then ' · duo' else '' end,
                         'profile.html#coach', tag);
  elsif new.status = 'confirmed' then
    perform public._push(new.user_id, 'Session confirmed ✓', trainer || ' · ' || slot, 'profile.html#overview', tag);
  elsif new.status = 'declined' then
    perform public._push(new.user_id, 'Request declined', trainer || ' can''t make ' || slot || '. Pick another hour.', 'index.html#schedule', tag);
  elsif new.status = 'expired' and was = 'pending' then
    perform public._push(new.user_id, 'Request expired', trainer || ' didn''t confirm ' || slot || ' in time. Pick another hour.', 'index.html#schedule', tag);
  elsif new.status = 'completed' then
    perform public._push(new.user_id, '+' || new.xp || ' XP earned!', 'Session with ' || trainer || ' rewarded. Keep levelling up.', 'profile.html#overview', tag);
  elsif new.status = 'no_show' then
    perform public._push(new.user_id, 'Missed session', trainer || ' · ' || slot || ' was marked as a no-show.', 'profile.html#overview', tag);
  elsif new.status in ('late_cancel', 'cancelled') then
    perform public._push(coach, case when new.status = 'late_cancel' then 'Late cancellation' else 'Session cancelled' end,
                         client || ' · ' || slot, 'profile.html#coach', tag);
    if not by_player then
      perform public._push(new.user_id, 'Session cancelled', trainer || ' · ' || slot, 'profile.html#overview', tag);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists push_booking_event on public.bookings;
create trigger push_booking_event after insert or update of status or delete on public.bookings
  for each row execute function public._push_booking_event();

create or replace function public._push_voucher_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._push(new.user_id,
    case new.source when 'legend' then 'Legend reward! 🎁' when 'champion' then 'Champion reward! 🎁' else 'Free session earned! 🎁' end,
    case when new.hoodie then 'A free 1:1 session + a LEVEL-UP hoodie. ' else 'A free 1:1 session is waiting for you. ' end
      || 'Book it within ' || public._config('reward_valid_months') || ' months.',
    'profile.html#rewards', 'voucher-' || new.id);
  return new;
end $$;

drop trigger if exists push_voucher_event on public.reward_vouchers;
create trigger push_voucher_event after insert on public.reward_vouchers
  for each row execute function public._push_voucher_event();

create or replace function public._push_pack_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'requested' and new.status = 'paid' then
    perform public._push(new.user_id, 'Pack active', new.size || ' session credits are ready to use.'
      || case when new.gift is not null then ' · Your free ' || (select name from public.shop_items where id = new.gift) || ' is waiting at the desk' else '' end,
      'index.html#schedule', 'pack-' || new.id);
    -- paid online or marked as paid at the desk: the player's purchase celebration
    perform public._celebrate(new.user_id, 'purchase', jsonb_build_object('what', 'pack', 'size', new.size,
      'gift', (select name from public.shop_items where id = new.gift)));
  end if;
  return new;
end $$;

drop trigger if exists push_pack_event on public.session_packs;
create trigger push_pack_event after update of status on public.session_packs
  for each row execute function public._push_pack_event();

-- The website: turn notifications on or off for this phone
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'Invalid subscription.'; end if;
  if length(coalesce(p_p256dh, '')) not between 80 and 100 or length(coalesce(p_auth, '')) not between 16 and 30 then
    raise exception 'Invalid subscription.';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
                                       user_agent = excluded.user_agent;
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- A test message for the logged-in player ("Notifications are on")
create or replace function public.push_test()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  perform public._push(auth.uid(), 'Notifications are on 💪', 'You''ll hear from LEVEL-UP when something happens with your sessions.',
                       'profile.html', 'test');
end $$;

create or replace function public.push_public_key()
returns text language sql stable security definer set search_path = public as $$
  select public_key from public.push_keys where id = 1;
$$;

-- Edge Function only (service role): reminders for tomorrow's / today's confirmed sessions
-- ---------- Reviews ----------
-- Write or edit your review (edits go back to "waiting for approval")
create or replace function public.submit_review(p_quote text, p_rating integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); q text := trim(coalesce(p_quote, ''));
begin
  if uid is null then raise exception 'Log in first.'; end if;
  if not exists (select 1 from public.bookings where user_id = uid and status = 'completed') then
    raise exception 'You can write a review after your first session.';
  end if;
  if char_length(q) < 10 then raise exception 'Write a few more words (at least 10 characters).'; end if;
  if char_length(q) > 300 then raise exception 'Keep it short: 300 characters at most.'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose 1 to 5 stars.'; end if;
  insert into public.reviews (user_id, name, quote, rating, status)
  values (uid, (select split_part(trim(name), ' ', 1) from public.profiles where id = uid), q, p_rating, 'pending')
  on conflict (user_id) do update set quote = excluded.quote, rating = excluded.rating, name = excluded.name,
    status = 'pending', created_at = now(), approved_at = null;
  return public._player_json(uid);
end $$;

create or replace function public.delete_my_review()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  delete from public.reviews where user_id = auth.uid();
  return public._player_json(auth.uid());
end $$;

-- Approved reviews for the home page: first name, current profile photo, newest first
create or replace function public.public_reviews()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'quote', r.quote, 'rating', r.rating,
                  'avatarUrl', p.avatar_url, 'date', r.approved_at, 'sample', r.sample) order by r.sample, r.approved_at desc), '[]'::jsonb)
  from (select * from public.reviews where status = 'approved' order by sample, approved_at desc limit 12) r
  left join public.profiles p on p.id = coalesce(r.user_id, r.photo_user);
$$;

-- Admin: all reviews, approve / hide / delete, add one by hand
create or replace function public.admin_reviews()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'quote', r.quote, 'rating', r.rating,
            'status', r.status, 'createdAt', r.created_at, 'byAdmin', r.user_id is null,
            'photoUser', r.photo_user, 'sample', r.sample,
            'avatarUrl', (select avatar_url from public.profiles where id = coalesce(r.user_id, r.photo_user)),
            'email', (select email from public.profiles where id = r.user_id))
          order by (r.status = 'pending') desc, r.created_at desc) from public.reviews r), '[]'::jsonb);
end $$;

create or replace function public.admin_set_review(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  if p_status = 'delete' then delete from public.reviews where id = p_id; return; end if;
  if p_status not in ('approved', 'hidden', 'pending') then raise exception 'Unknown status.'; end if;
  update public.reviews set status = p_status,
    approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end
  where id = p_id;
end $$;

-- Whose photo goes with a review the admin added: the one member with that first name ("Hilke VdB" -> Hilke).
-- Two members with the same first name: the one whose last name starts with the same letter. Otherwise nobody.
create or replace function public._review_member(p_name text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  first text := lower(split_part(btrim(coalesce(p_name, '')), ' ', 1));
  rest text := lower(left(split_part(btrim(coalesce(p_name, '')), ' ', 2), 1));
  ids uuid[];
begin
  if first = '' then return null; end if;
  select array_agg(id) into ids from public.profiles where lower(split_part(btrim(name), ' ', 1)) = first;
  if coalesce(array_length(ids, 1), 0) = 1 then return ids[1]; end if;
  if coalesce(array_length(ids, 1), 0) > 1 and rest <> '' then
    select array_agg(id) into ids from public.profiles
    where lower(split_part(btrim(name), ' ', 1)) = first and lower(left(split_part(btrim(name), ' ', 2), 1)) = rest;
    if coalesce(array_length(ids, 1), 0) = 1 then return ids[1]; end if;
  end if;
  return null;
end $$;
-- Reviews added before this existed: look their member up once
update public.reviews set photo_user = public._review_member(name), photo_checked = true
where user_id is null and photo_user is null and not photo_checked;

-- Show a member's profile photo with a review the admin added for them (null = just their first letter)
create or replace function public.admin_review_photo(p_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  update public.reviews set photo_user = p_user, photo_checked = true where id = p_id and user_id is null;
  if not found then raise exception 'Only for a review you added yourself.'; end if;
end $$;

create or replace function public.admin_add_review(p_name text, p_quote text, p_rating integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 then raise exception 'Add the client''s first name.'; end if;
  if char_length(trim(coalesce(p_quote, ''))) not between 10 and 300 then raise exception 'The quote needs 10 to 300 characters.'; end if;
  insert into public.reviews (user_id, name, quote, rating, status, approved_at, photo_user, photo_checked)
  values (null, left(trim(p_name), 24), trim(p_quote), greatest(1, least(5, coalesce(p_rating, 5))), 'approved', now(),
          public._review_member(p_name), true);
end $$;

-- On the 1st of the month (the first time anyone loads their profile, or the 10-minute push job runs):
-- crown last month's winner of the "This month" high scores, give them +250 XP and tell everyone.
create or replace function public._settle_player_of_month()
returns void language plpgsql security definer set search_path = public as $$
declare
  m date := public._potm_month();
  winner record;
  s record;
begin
  if exists (select 1 from public.monthly_awards where month = m) then return; end if;
  select p.id, p.name, public._month_xp(p.id, m) as xp into winner
  from public.profiles p
  where p.show_on_leaderboard
    and not exists (select 1 from public.trainers t where t.email is not null and lower(t.email) = lower(p.email))
  order by public._month_xp(p.id, m) desc, p.created_at
  limit 1;
  if winner.id is null or coalesce(winner.xp, 0) <= 0 then
    insert into public.monthly_awards (month, user_id, xp) values (m, null, 0) on conflict do nothing;
    return;
  end if;
  insert into public.monthly_awards (month, user_id, xp) values (m, winner.id, winner.xp) on conflict do nothing;
  if not found then return; end if;  -- someone else settled it a moment earlier
  perform public._grant_xp(winner.id, 250, 'Player of the Month');
  for s in select distinct user_id from public.push_subscriptions where user_id is not null loop
    if s.user_id = winner.id then
      perform public._push(s.user_id, '👑 You''re Player of the Month!',
        'Most XP in ' || trim(to_char(m, 'FMMonth')) || '. +250 XP and the crown on your card.', 'profile.html', 'potm-' || m);
    else
      perform public._push(s.user_id, '👑 ' || winner.name || ' is Player of the Month',
        trim(to_char(m, 'FMMonth')) || ': ' || winner.xp || ' XP. A new month just started: go for the crown!', 'index.html#highScores', 'potm-' || m);
    end if;
  end loop;
end $$;

-- Last month's winner for the high scores banner (anyone can read it)
create or replace function public.player_of_month()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('month', a.month, 'xp', a.xp, 'name', p.name, 'avatarUrl', p.avatar_url,
                            'isMe', coalesce(p.id = auth.uid(), false),
                            'userId', case when auth.uid() is not null and p.show_on_leaderboard then p.id end,
                            'likes', (select count(*) from public.player_likes l where l.to_id = p.id),
                            'liked', exists (select 1 from public.player_likes l where l.from_id = auth.uid() and l.to_id = p.id
                                             and l.week = date_trunc('week', now() at time zone 'Europe/Brussels')::date))
  from public.monthly_awards a join public.profiles p on p.id = a.user_id
  where a.month = public._potm_month();
$$;

-- Thursday evening: a gentle nudge to players whose streak (2+ weeks) ends on Sunday without a session or a
-- check-in this week
drop function if exists public._push_streak_reminders();
create or replace function public._push_streak_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare
  local timestamp := p_now at time zone 'Europe/Brussels';
  w0 date := date_trunc('week', local)::date;
  u record;
  st jsonb;
  n integer := 0;
begin
  if extract(isodow from local) <> 4 or extract(hour from local) < 18 then return 0; end if;
  for u in
    select p.id as user_id from public.profiles p
    where p.streak_reminded_week is distinct from w0
      and (exists (select 1 from public.bookings k where k.user_id = p.id and k.status = 'completed' and k.day between w0 - 7 and w0 - 1)
           or exists (select 1 from public.checkins h where h.user_id = p.id and h.week = w0 - 7)
           or exists (select 1 from public.class_signups g join public.class_sessions c on c.id = g.class_id
                      where g.user_id = p.id and g.status = 'attended'
                        and (c.starts_at at time zone 'Europe/Brussels')::date between w0 - 7 and w0 - 1))
  loop
    st := public._streak(u.user_id);
    if (st ->> 'weeks')::int >= 2 and (st ->> 'atRisk')::boolean then
      perform public._push(u.user_id, '🔥 Keep your ' || (st ->> 'weeks') || '-week streak',
        'Train or check in before Sunday to keep it going.', 'index.html', 'streak-' || w0);
      n := n + 1;
    end if;
    update public.profiles set streak_reminded_week = w0 where id = u.user_id;
  end loop;
  return n;
end $$;

-- "Starts soon" for group classes, class_reminder_minutes before the start (sent once):
-- the trainer gets the numbers they need, every player signed up a LEVEL-UP line to get going
create or replace function public._push_class_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  c record;
  g record;
  quotes text[] := array[
    'Every rep is XP. Go collect it.',
    'Show up, sweat, level up.',
    'The boss fight is in your head. You''ve got this.',
    'One more workout, one more level.',
    'Your future self is watching. Make it proud.',
    'Strong squad, stronger you. See you on the floor.',
    'No checkpoints skipped. Today you level up.',
    'Respawn complete. Time to train.'];
  n integer := 0;
  booked integer;
  unpaid integer;
  waiting integer;
  fresh integer;
begin
  for c in
    select * from public.class_sessions
    where status = 'scheduled' and reminder_pushed_at is null
      and starts_at > now() and starts_at <= now() + make_interval(mins => public._config('class_reminder_minutes')::int)
    for update skip locked
  loop
    select count(*) filter (where status in ('booked', 'attended')),
           count(*) filter (where status in ('booked', 'attended') and pay_status = 'unpaid' and price > 0),
           count(*) filter (where status = 'waitlist'),
           count(*) filter (where status in ('booked', 'attended')
                            and not exists (select 1 from public.class_signups o where o.user_id = s.user_id and o.status = 'attended' and o.id <> s.id))
      into booked, unpaid, waiting, fresh
    from public.class_signups s where s.class_id = c.id;
    perform public._push(public._trainer_user(c.trainer_id),
      c.title || ' starts at ' || to_char(c.starts_at at time zone 'Europe/Brussels', 'HH24:MI'),
      booked || '/' || c.capacity || ' signed up'
        || case when unpaid > 0 then ' · ' || unpaid || ' to pay at the class' else '' end
        || case when fresh > 0 then ' · ' || fresh || ' first-timer' || case when fresh > 1 then 's' else '' end else '' end
        || case when waiting > 0 then ' · ' || waiting || ' on the waitlist' else '' end
        || ' · Tick off who''s there in the app',
      'profile.html#coach', 'class-' || c.id || '-start');
    for g in select * from public.class_signups where class_id = c.id and status = 'booked' loop
      perform public._push(g.user_id,
        c.title || ' starts at ' || to_char(c.starts_at at time zone 'Europe/Brussels', 'HH24:MI') || ' 🔥',
        quotes[1 + floor(random() * array_length(quotes, 1))::int] || ' · ' || c.location
          || case when g.pay_status = 'unpaid' and g.price > 0 then ' · Pay ' || to_char(g.price, 'FM990.00') || ' euro at the class' else '' end,
        'profile.html#classes', 'class-' || c.id || '-start');
    end loop;
    update public.class_sessions set reminder_pushed_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Requests a trainer hasn't answered: a reminder after 3 hours, and a last call when under 3 hours are left.
-- One message per trainer however many requests are waiting, never at night. With the last call the admins hear
-- it too, so someone can still save the session.
create or replace function public._push_request_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  t record;
  a record;
  coach uuid;
  n integer := 0;
begin
  if public._after_quiet() is not null then return 0; end if;
  for t in
    with due as (
      select k.id, k.trainer_id, k.day, k.hour, k.pending_reminders, p.name,
             public._confirm_deadline(coalesce(k.request_at, k.created_at), k.day, k.hour) as deadline
      from public.bookings k join public.profiles p on p.id = k.user_id
      where k.status = 'pending'
    )
    select d.trainer_id, count(*) as waiting, min(d.deadline) as deadline, bool_or(d.pending_reminders = 1) as last_call,
           (array_agg(d.name order by d.deadline))[1] as who, (array_agg(public._slot_label(d.day, d.hour) order by d.deadline))[1] as slot,
           array_agg(d.id) as ids
    from due d join public.bookings k on k.id = d.id
    where d.deadline > now()
      and ((d.pending_reminders = 0 and coalesce(k.request_at, k.created_at) < now() - interval '3 hours')
        or (d.pending_reminders = 1 and d.deadline < now() + interval '3 hours' and k.pending_reminded_at < now() - interval '1 hour'))
    group by d.trainer_id
  loop
    coach := public._trainer_user(t.trainer_id);
    perform public._push(coach,
      case when t.waiting = 1 then '⏳ ' || t.who || ' is waiting for your answer'
           else '⏳ ' || t.waiting || ' requests are waiting for your answer' end,
      case when t.waiting = 1 then t.slot else t.who || ' · ' || t.slot || ' and ' || (t.waiting - 1) || ' more' end
        || ' · Confirm or decline before ' || to_char(t.deadline at time zone 'Europe/Brussels', 'Dy HH24:MI'),
      'profile.html#coach', 'pending-' || t.trainer_id);
    if t.last_call then
      for a in select p.id from public.profiles p
               where lower(p.email) = any (string_to_array(lower(replace(public._config('admin_emails'), ' ', '')), ','))
                 and p.id is distinct from coach loop
        perform public._push(a.id, '⏳ Request about to expire',
          t.who || ' → ' || (select split_part(name, ' ', 1) from public.trainers where id = t.trainer_id) || ' · ' || t.slot
            || ' · expires ' || to_char(t.deadline at time zone 'Europe/Brussels', 'Dy HH24:MI'),
          'admin.html#bookings', 'pending-' || t.trainer_id);
      end loop;
    end if;
    update public.bookings set pending_reminders = pending_reminders + 1, pending_reminded_at = now() where id = any (t.ids);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.push_due_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  b record;
  n integer := 0;
  today date := (now() at time zone 'Europe/Brussels')::date;
begin
  for b in
    select k.*, split_part(t.name, ' ', 1) as trainer
    from public.bookings k join public.trainers t on t.id = k.trainer_id
    where k.status = 'confirmed' and k.reminder_pushed_at is null
      and public._slot_start(k.day, k.hour) between now() + interval '1 hour' and now() + interval '26 hours'
    for update of k skip locked
  loop
    perform public._push(b.user_id, 'Session ' || case when b.day = today then 'today' else 'tomorrow' end || ' at ' || lpad(b.hour::text, 2, '0') || ':00',
      'With ' || b.trainer || ' at Hoogstraat 40, Aalst. See you there!', 'profile.html#overview', 'reminder-' || b.id);
    update public.bookings set reminder_pushed_at = now() where id = b.id;
    n := n + 1;
  end loop;
  n := n + public._push_class_reminders();
  n := n + public._push_request_reminders();
  perform public._settle_player_of_month();
  n := n + public._push_streak_reminders();
  perform public._series_extend();
  return n;
end $$;

-- Edge Function only: take the waiting messages (each one once) with the phones to send them to
create or replace function public.push_claim(p_limit integer default 100)
returns jsonb language sql security definer set search_path = public as $$
  with picked as (
    select id from public.push_outbox
    where sent_at is null and created_at > now() - interval '2 days' and (send_after is null or send_after <= now())
    order by id limit p_limit for update skip locked
  ), claimed as (
    update public.push_outbox o set sent_at = now() from picked where o.id = picked.id
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'title', c.title, 'body', c.body, 'url', c.url, 'tag', c.tag,
    'targets', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
                from public.push_subscriptions s where s.user_id = c.user_id))), '[]'::jsonb)
  from claimed c;
$$;

-- Edge Function only: forget phones the push service says are gone (404 / 410), note the others as used
create or replace function public.push_report(p_gone uuid[], p_ok uuid[])
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where id = any (p_gone);
  update public.push_subscriptions set last_used_at = now() where id = any (p_ok);
  delete from public.push_outbox where sent_at < now() - interval '30 days';
$$;

-- ---------------------------------------------------------
-- Profile photos (Storage bucket "avatars", public to view; players only write in their own folder)
-- ---------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    drop policy if exists "avatars: read own" on storage.objects;
    drop policy if exists "avatars: upload own" on storage.objects;
    drop policy if exists "avatars: change own" on storage.objects;
    drop policy if exists "avatars: delete own" on storage.objects;
    create policy "avatars: read own" on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy "avatars: upload own" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy "avatars: change own" on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy "avatars: delete own" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
    -- an admin can take away a photo that isn't suitable (profile photos and the photos on member pages share this bucket)
    drop policy if exists "avatars: admin delete" on storage.objects;
    create policy "avatars: admin delete" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and public.is_admin());
  end if;
end $$;

-- The website saves the photo's public URL; it must point into the player's own folder
create or replace function public.set_avatar(p_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if p_url is not null and p_url !~ ('^https://' || replace(public._config('storage_host'), '.', '\.')
                                     || '/storage/v1/object/public/avatars/' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Invalid photo.';
  end if;
  update public.profiles set avatar_url = p_url where id = auth.uid();
  return public._player_json(auth.uid());
end $$;

-- Admin: remove someone's photo (e.g. not suitable for the public high scores)
create or replace function public.admin_clear_avatar(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  update public.profiles set avatar_url = null where id = p_user;
end $$;

-- ---------------------------------------------------------
-- Chat: private conversations between a player and a coach, or between two members
-- Only the two people in a conversation can read it (through the functions below);
-- each new message queues a push notification for the other side.
-- ---------------------------------------------------------
create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  trainer_id text not null references public.trainers (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  client_read_id bigint not null default 0,   -- the last message each side has seen
  trainer_read_id bigint not null default 0,
  unique (client_id, trainer_id)
);
create index if not exists chat_threads_trainer_idx on public.chat_threads (trainer_id, last_at desc);

create table if not exists public.chat_messages (
  id bigserial primary key,
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  from_trainer boolean not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, id);

-- Members can also chat with each other (found by name in the chat): member_id is the second person and
-- trainer_id stays empty. In those conversations "client" = whoever started it, "trainer" side = member_id.
alter table public.chat_threads add column if not exists member_id uuid references public.profiles (id) on delete cascade;
alter table public.chat_threads alter column trainer_id drop not null;
do $$ begin
  alter table public.chat_threads add constraint chat_threads_kind_check check ((trainer_id is null) <> (member_id is null));
exception when duplicate_object then null; end $$;
create unique index if not exists chat_threads_pair_idx on public.chat_threads
  (least(client_id, member_id), greatest(client_id, member_id)) where member_id is not null;
create index if not exists chat_threads_member_idx on public.chat_threads (member_id, last_at desc) where member_id is not null;

-- Group chats: ONE per kind of group class (its name: "Social run club", "Hyrox" ...), not one per class.
-- It is made with the first class of that name and stays; only an admin can delete it. In it: everyone who signed up
-- for a class of that group lately (class_chat_days), the trainers who give it and every admin.
-- Each member's read position (and "muted") is kept in chat_reads. class_id is the old model (one chat per class).
alter table public.chat_threads add column if not exists class_id uuid references public.class_sessions (id) on delete cascade;
alter table public.chat_threads add column if not exists group_key text;     -- the class name, lower case
alter table public.chat_threads add column if not exists group_title text;   -- the name as it shows
alter table public.chat_threads alter column client_id drop not null;
alter table public.chat_threads drop constraint if exists chat_threads_kind_check;
create unique index if not exists chat_threads_class_idx on public.chat_threads (class_id) where class_id is not null;
create unique index if not exists chat_threads_group_idx on public.chat_threads (group_key) where group_key is not null;
create or replace function public._group_key(p_title text)
returns text language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g'));
$$;

-- Kinds of group training: one card per kind on the home page ("Choose your training"), with its own photo and
-- text. A kind is made by the first class with that name; the admin adds the photo and the text.
create table if not exists public.class_kinds (
  key text primary key,                 -- _group_key(title): "social run club"
  title text not null,
  description text not null default '',
  photo_url text,
  created_at timestamptz not null default now()
);
alter table public.class_kinds enable row level security;  -- read through class_kinds() only
insert into public.class_kinds (key, title)
  select distinct on (public._group_key(c.title)) public._group_key(c.title), c.title
  from public.class_sessions c order by public._group_key(c.title), c.starts_at desc
on conflict do nothing;

-- The kinds that are alive: a class of that name is planned, or was held in the last 30 days.
-- With the trainers who give it and when the next one is. Anyone can read it (home page).
create or replace function public.class_kinds()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', k.key, 'title', k.title, 'description', k.description, 'photoUrl', k.photo_url,
             'trainers', x.trainers, 'next', x.next_at, 'upcoming', x.upcoming) order by x.next_at nulls last, k.title)
    from public.class_kinds k
    cross join lateral (
      select coalesce(jsonb_agg(distinct c.trainer_id), '[]'::jsonb) as trainers,
             min(c.starts_at) filter (where c.status = 'scheduled' and c.starts_at > now()) as next_at,
             count(*) filter (where c.status = 'scheduled' and c.starts_at > now()) as upcoming,
             count(*) as n
      from public.class_sessions c
      where public._group_key(c.title) = k.key and c.status <> 'cancelled' and c.starts_at > now() - interval '30 days'
    ) x
    where x.n > 0), '[]'::jsonb);
end $$;

-- Admin: the text and the photo of a kind of group training (the photo is a file in the admin's own Storage folder)
create or replace function public.admin_class_kind(p_key text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  about text := btrim(coalesce(p ->> 'description', ''));
  photo text := nullif(btrim(coalesce(p ->> 'photoUrl', '')), '');
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  if not exists (select 1 from public.class_kinds where key = p_key) then raise exception 'Group training not found.'; end if;
  if p ? 'description' and char_length(about) > 600 then raise exception 'Keep the text under 600 characters.'; end if;
  if p ? 'photoUrl' and photo is not null and photo !~ ('^https://' || replace(public._config('storage_host'), '.', '\.')
                                || '/storage/v1/object/public/avatars/' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Invalid photo.';
  end if;
  update public.class_kinds set
    description = case when p ? 'description' then about else description end,
    photo_url = case when p ? 'photoUrl' then photo else photo_url end
  where key = p_key;
  return public.class_kinds();
end $$;

create table if not exists public.chat_reads (
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_id bigint not null default 0,
  primary key (thread_id, user_id)
);
alter table public.chat_reads add column if not exists muted boolean not null default false;  -- no notifications for this group
-- A heart on a chat message (from someone else in that conversation). It only counts: no notification, no celebration.
create table if not exists public.chat_message_likes (
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.chat_message_likes enable row level security;
revoke all on public.chat_message_likes from anon, authenticated;
alter table public.chat_reads enable row level security;
revoke all on public.chat_reads from anon, authenticated;

-- Once: the old chats per class move into the chat of their group (messages and read positions keep their ids)
insert into public.chat_threads (group_key, group_title, last_at)
select distinct on (public._group_key(c.title)) public._group_key(c.title), btrim(c.title), th.last_at
from public.chat_threads th join public.class_sessions c on c.id = th.class_id
order by public._group_key(c.title), c.starts_at
on conflict do nothing;
update public.chat_messages m set thread_id = g.id
from public.chat_threads old join public.class_sessions c on c.id = old.class_id
     join public.chat_threads g on g.group_key = public._group_key(c.title)
where m.thread_id = old.id;
insert into public.chat_reads (thread_id, user_id, read_id)
select g.id, r.user_id, max(r.read_id)
from public.chat_reads r join public.chat_threads old on old.id = r.thread_id
     join public.class_sessions c on c.id = old.class_id
     join public.chat_threads g on g.group_key = public._group_key(c.title)
group by g.id, r.user_id
on conflict (thread_id, user_id) do update set read_id = greatest(public.chat_reads.read_id, excluded.read_id);
update public.chat_threads g set last_at = x.at
from (select thread_id, max(created_at) as at from public.chat_messages group by thread_id) x
where g.id = x.thread_id and g.group_key is not null and x.at > g.last_at;
delete from public.chat_threads where class_id is not null;
alter table public.chat_threads add constraint chat_threads_kind_check check (
  (group_key is not null and class_id is null and client_id is null and trainer_id is null and member_id is null)
  or (group_key is null and class_id is null and client_id is not null and (trainer_id is null) <> (member_id is null)));

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_threads, public.chat_messages from anon, authenticated;

-- The trainer card of the logged-in account (by linked email), if any
create or replace function public._my_trainer()
returns text language sql stable security definer set search_path = public as $$
  select t.id from public.trainers t
  where t.email is not null and lower(t.email) = lower(auth.jwt() ->> 'email') limit 1;
$$;

-- The trainer card linked to an account, if any
create or replace function public._trainer_of(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select t.id from public.trainers t join public.profiles p on lower(p.email) = lower(t.email)
  where p.id = p_user and t.email is not null limit 1;
$$;

drop function if exists public._class_chat_member(uuid);
-- Everyone in a group's chat: signed up (booked or present) for one of its classes in the last class_chat_days
-- (or a coming one), the trainers who give it, and every admin
create or replace function public._group_chat_users(p_key text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select g.user_id from public.class_sessions c join public.class_signups g on g.class_id = c.id
  where public._group_key(c.title) = p_key and c.status <> 'cancelled' and g.status in ('booked', 'attended')
    and c.starts_at > now() - make_interval(days => public._config('class_chat_days')::int)
  union
  select public._trainer_user(c.trainer_id) from public.class_sessions c
  where public._group_key(c.title) = p_key and c.status <> 'cancelled'
    and c.starts_at > now() - make_interval(days => public._config('class_chat_days')::int)
    and public._trainer_user(c.trainer_id) is not null
  union
  select p.id from public.profiles p
  where lower(p.email) = any (string_to_array(lower(replace(public._config('admin_emails'), ' ', '')), ','));
$$;
create or replace function public._group_chat_member(p_key text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return auth.uid() is not null and (public.is_admin() or auth.uid() in (select public._group_chat_users(p_key)));
end $$;

-- 'client', 'trainer', 'group' or null (not your conversation)
create or replace function public._chat_side(p_thread public.chat_threads)
returns text language sql stable security definer set search_path = public as $$
  select case when p_thread.group_key is not null then case when public._group_chat_member(p_thread.group_key) then 'group' end
              when p_thread.client_id = auth.uid() then 'client'
              when p_thread.member_id is not null and p_thread.member_id = auth.uid() then 'trainer'
              when p_thread.member_id is null and p_thread.trainer_id = public._my_trainer() then 'trainer' end;
$$;

-- A member as the chat shows them (a trainer gets their card's id and role)
create or replace function public._chat_person(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', p.name, 'avatarUrl', p.avatar_url, 'userId', p.id,
           'trainerId', t.id, 'role', coalesce(case when t.id is not null then coalesce(t.role, 'Personal trainer') end, 'Player'))
  from public.profiles p
  left join public.trainers t on t.email is not null and lower(t.email) = lower(p.email) and t.active
  where p.id = p_user;
$$;

-- The other person in a conversation
create or replace function public._chat_peer(p_thread public.chat_threads, p_side text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when p_thread.group_key is not null then
      jsonb_build_object('name', p_thread.group_title, 'role', 'Group chat', 'group', true, 'groupKey', p_thread.group_key,
              'trainerId', null, 'avatarUrl', null, 'title', p_thread.group_title,
              'members', (select count(*) from public._group_chat_users(p_thread.group_key)),
              'next', (select min(c.starts_at) from public.class_sessions c
                       where public._group_key(c.title) = p_thread.group_key and c.status = 'scheduled' and c.starts_at > now()),
              'muted', coalesce((select r.muted from public.chat_reads r where r.thread_id = p_thread.id and r.user_id = auth.uid()), false),
              'canDelete', public.is_admin())
    when p_thread.member_id is not null then
      public._chat_person(case when p_side = 'client' then p_thread.member_id else p_thread.client_id end)
    when p_side = 'client' then
      (select jsonb_build_object('name', t.name, 'role', coalesce(t.role, 'Personal trainer'), 'trainerId', t.id,
              'avatarUrl', (select p.avatar_url from public.profiles p where p.id = public._trainer_user(t.id)))
       from public.trainers t where t.id = p_thread.trainer_id)
    else
      (select jsonb_build_object('name', p.name, 'role', 'Player', 'trainerId', null, 'avatarUrl', p.avatar_url, 'userId', p.id)
       from public.profiles p where p.id = p_thread.client_id)
    end;
$$;

-- Your conversations, newest first, with the last message and how many you haven't read
create or replace function public.chat_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_trainer text := public._my_trainer();
  out jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(row order by (row ->> 'lastAt') desc), '[]'::jsonb) into out from (
    select public._chat_peer(th, s.side) || jsonb_build_object(
      'id', th.id, 'side', s.side, 'direct', th.member_id is not null, 'lastAt', th.last_at,
      'lastBody', case when s.side = 'group' and m.body is not null and m.sender_id is distinct from auth.uid()
                       then coalesce(split_part(m.sender_name, ' ', 1) || ': ', '') || m.body else m.body end,
      'lastMine', case when s.side = 'group' then m.sender_id = auth.uid() else m.from_trainer = (s.side = 'trainer') end,
      'unread', case when s.side = 'group' then
                  (select count(*) from public.chat_messages u
                   where u.thread_id = th.id and u.sender_id is distinct from auth.uid()
                     and u.id > coalesce((select r.read_id from public.chat_reads r where r.thread_id = th.id and r.user_id = auth.uid()), 0))
                else
                  (select count(*) from public.chat_messages u
                   where u.thread_id = th.id and u.from_trainer = (s.side = 'client')
                     and u.id > case when s.side = 'client' then th.client_read_id else th.trainer_read_id end) end
    ) as row
    from public.chat_threads th
    cross join lateral (select case when th.group_key is not null then 'group'
                                    when th.client_id = auth.uid() then 'client' else 'trainer' end as side) s
    left join lateral (select x.body, x.from_trainer, x.sender_id, p.name as sender_name from public.chat_messages x
                       left join public.profiles p on p.id = x.sender_id
                       where x.thread_id = th.id order by x.id desc limit 1) m on true
    where (th.client_id = auth.uid() or th.member_id = auth.uid()
           or (me_trainer is not null and th.member_id is null and th.group_key is null and th.trainer_id = me_trainer)
           or (th.group_key is not null and public._group_chat_member(th.group_key)))
      and (s.side in ('client', 'group') or m.body is not null)   -- the other side only sees it once there is a message
  ) q;
  return out;
end $$;

-- Start (or reopen) your conversation with a coach
create or replace function public.chat_open(p_trainer text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if not exists (select 1 from public.trainers where id = p_trainer and active) then raise exception 'Unknown coach.'; end if;
  if public._my_trainer() = p_trainer then raise exception 'This is you: your clients can start a chat with you.'; end if;
  if public._trainer_user(p_trainer) is null then raise exception 'This coach is not on the chat yet.'; end if;
  insert into public.chat_threads (client_id, trainer_id) values (auth.uid(), p_trainer)
  on conflict (client_id, trainer_id) do nothing;
  select id into tid from public.chat_threads where client_id = auth.uid() and trainer_id = p_trainer;
  return tid;
end $$;

-- Find members by name to start a chat (never emails); at least 2 letters
create or replace function public.chat_search(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := btrim(coalesce(p_query, ''));
  out jsonb;
begin
  if auth.uid() is null or char_length(q) < 2 then return '[]'::jsonb; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  select coalesce(jsonb_agg(public._chat_person(x.id) order by x.is_trainer desc, x.starts desc, lower(x.name)), '[]'::jsonb) into out
  from (
    select p.id, p.name, (public._trainer_of(p.id) is not null) as is_trainer, (p.name ilike q || '%') as starts
    from public.profiles p
    where p.id <> auth.uid() and p.name ilike '%' || q || '%'
    order by (public._trainer_of(p.id) is not null) desc, (p.name ilike q || '%') desc, lower(p.name)
    limit 12
  ) x;
  return out;
end $$;

-- Open (or start) a conversation with a member found by name.
-- A trainer -> the usual coach conversation; a trainer who looks up their client -> that coach conversation;
-- anyone else -> a private conversation between the two of you (never a second one).
create or replace function public.chat_open_user(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  me_trainer text := public._my_trainer();
  their_card text;
  tid uuid;
begin
  if me is null then raise exception 'Log in first.'; end if;
  if p_user is null or p_user = me then raise exception 'Pick someone else to chat with.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'Member not found.'; end if;
  their_card := public._trainer_of(p_user);
  if their_card is not null and their_card is distinct from me_trainer
     and exists (select 1 from public.trainers where id = their_card and active) then
    return public.chat_open(their_card);
  end if;
  if me_trainer is not null then
    insert into public.chat_threads (client_id, trainer_id) values (p_user, me_trainer)
    on conflict (client_id, trainer_id) do nothing;
    select id into tid from public.chat_threads where client_id = p_user and trainer_id = me_trainer;
    return tid;
  end if;
  select id into tid from public.chat_threads
  where member_id is not null and least(client_id, member_id) = least(me, p_user) and greatest(client_id, member_id) = greatest(me, p_user);
  if tid is null then
    insert into public.chat_threads (client_id, member_id) values (me, p_user)
    on conflict do nothing returning id into tid;
    if tid is null then
      select id into tid from public.chat_threads
      where member_id is not null and least(client_id, member_id) = least(me, p_user) and greatest(client_id, member_id) = greatest(me, p_user);
    end if;
  end if;
  return tid;
end $$;

-- One conversation: the messages after p_after (the last 200 when 0); marks them as read
create or replace function public.chat_thread(p_thread uuid, p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  th public.chat_threads;
  side text;
  msgs jsonb;
  top bigint;
begin
  select * into th from public.chat_threads where id = p_thread;
  side := case when found then public._chat_side(th) end;
  if side is null then raise exception 'Conversation not found.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id,
                                               'mine', case when side = 'group' then x.sender_id = auth.uid() else x.from_trainer = (side = 'trainer') end,
                                               'name', case when side = 'group' then coalesce(
                                                 (select split_part(tr.name, ' ', 1) from public.trainers tr
                                                  where x.from_trainer and tr.id = public._trainer_of(x.sender_id)),
                                                 (select p.name from public.profiles p where p.id = x.sender_id), 'Member') end,
                                               'coach', side = 'group' and x.from_trainer,
                                               'userId', case when side = 'group' then x.sender_id end,
                                               'likes', (select count(*) from public.chat_message_likes l where l.message_id = x.id),
                                               'liked', exists (select 1 from public.chat_message_likes l where l.message_id = x.id and l.user_id = auth.uid()),
                                               'body', x.body, 'at', x.created_at) order by x.id), '[]'::jsonb),
         max(x.id)
    into msgs, top
  from (select * from public.chat_messages where thread_id = th.id and id > coalesce(p_after, 0)
        order by id desc limit 200) x;
  if top is not null then
    if side = 'group' then
      insert into public.chat_reads (thread_id, user_id, read_id) values (th.id, auth.uid(), top)
      on conflict (thread_id, user_id) do update set read_id = greatest(public.chat_reads.read_id, excluded.read_id);
    elsif side = 'client' then update public.chat_threads set client_read_id = greatest(client_read_id, top) where id = th.id;
    else update public.chat_threads set trainer_read_id = greatest(trainer_read_id, top) where id = th.id; end if;
  end if;
  return public._chat_peer(th, side) || jsonb_build_object(
    'id', th.id, 'side', side, 'direct', th.member_id is not null, 'messages', msgs,
    -- every message in this conversation that has hearts, so an open chat keeps its counts up to date
    'hearts', coalesce((select jsonb_agg(jsonb_build_object('id', h.message_id, 'n', h.n, 'mine', h.mine))
                        from (select l.message_id, count(*) as n, bool_or(l.user_id = auth.uid()) as mine
                              from public.chat_message_likes l join public.chat_messages m on m.id = l.message_id
                              where m.thread_id = th.id group by l.message_id) h), '[]'::jsonb),
    'peerReadId', case when side = 'group' then null when side = 'client' then th.trainer_read_id else th.client_read_id end);
end $$;

-- A heart on someone else's message in one of your conversations (tap again to take it back)
create or replace function public.chat_like(p_message bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.chat_messages;
  th public.chat_threads;
  side text;
  own boolean;
begin
  select * into m from public.chat_messages where id = p_message;
  if found then select * into th from public.chat_threads where id = m.thread_id; end if;
  side := case when th.id is not null then public._chat_side(th) end;
  if m.id is null or side is null then raise exception 'Message not found.'; end if;
  own := case when side = 'group' then m.sender_id = auth.uid() else m.from_trainer = (side = 'trainer') end;
  if own then raise exception 'You can''t like your own message.'; end if;
  delete from public.chat_message_likes where message_id = m.id and user_id = auth.uid();
  if not found then insert into public.chat_message_likes (message_id, user_id) values (m.id, auth.uid()); end if;
  return jsonb_build_object('id', m.id,
    'likes', (select count(*) from public.chat_message_likes l where l.message_id = m.id),
    'liked', exists (select 1 from public.chat_message_likes l where l.message_id = m.id and l.user_id = auth.uid()));
end $$;

-- Send a message; the other person gets a push notification
create or replace function public.chat_send(p_thread uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  th public.chat_threads;
  side text;
  msg text := btrim(coalesce(p_body, ''));
  new_id bigint;
  at timestamptz;
  sender text;
  recipient uuid;
begin
  select * into th from public.chat_threads where id = p_thread;
  side := case when found then public._chat_side(th) end;
  if side is null then raise exception 'Conversation not found.'; end if;
  if msg = '' then raise exception 'Type a message first.'; end if;
  if char_length(msg) > 2000 then raise exception 'That message is too long (2000 characters max).'; end if;
  if (select count(*) from public.chat_messages where sender_id = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Slow down a little: try again in a minute.';
  end if;
  if side = 'group' then
    insert into public.chat_messages (thread_id, sender_id, from_trainer, body)
    values (th.id, auth.uid(), public._my_trainer() is not null, msg)
    returning id, created_at into new_id, at;
    update public.chat_threads set last_at = at where id = th.id;
    insert into public.chat_reads (thread_id, user_id, read_id) values (th.id, auth.uid(), new_id)
    on conflict (thread_id, user_id) do update set read_id = greatest(public.chat_reads.read_id, excluded.read_id);
    select name into sender from public.profiles where id = auth.uid();
    perform public._push(u.id, '💬 ' || th.group_title, coalesce(split_part(sender, ' ', 1), 'Member') || ': ' || left(msg, 120),
                         'chat.html?t=' || th.id, 'chat-' || th.id)
    from public._group_chat_users(th.group_key) u(id)
    where u.id is not null and u.id <> auth.uid()
      and not exists (select 1 from public.chat_reads r where r.thread_id = th.id and r.user_id = u.id and r.muted);
    return jsonb_build_object('id', new_id, 'mine', true, 'body', msg, 'at', at);
  end if;
  insert into public.chat_messages (thread_id, sender_id, from_trainer, body)
  values (th.id, auth.uid(), side = 'trainer', msg) returning id, created_at into new_id, at;
  if side = 'client' then
    update public.chat_threads set last_at = at, client_read_id = new_id where id = th.id;
    select name into sender from public.profiles where id = auth.uid();
    recipient := coalesce(th.member_id, public._trainer_user(th.trainer_id));
  else
    update public.chat_threads set last_at = at, trainer_read_id = new_id where id = th.id;
    if th.member_id is not null then select name into sender from public.profiles where id = auth.uid();
    else select split_part(name, ' ', 1) into sender from public.trainers where id = th.trainer_id; end if;
    recipient := th.client_id;
  end if;
  perform public._push(recipient, '💬 ' || coalesce(sender, 'New message'), left(msg, 140),
                       'chat.html?t=' || th.id, 'chat-' || th.id);
  return jsonb_build_object('id', new_id, 'mine', true, 'body', msg, 'at', at);
end $$;

-- A member switches the notifications of one group chat off (or on again)
create or replace function public.chat_mute(p_thread uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare th public.chat_threads;
begin
  select * into th from public.chat_threads where id = p_thread;
  if not found or th.group_key is null or not public._group_chat_member(th.group_key) then raise exception 'Conversation not found.'; end if;
  insert into public.chat_reads (thread_id, user_id, muted) values (th.id, auth.uid(), coalesce(p_on, true))
  on conflict (thread_id, user_id) do update set muted = excluded.muted;
end $$;

-- Admin only: delete a group chat with all its messages. A new class of that name starts a fresh one.
create or replace function public.chat_group_delete(p_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can delete a group chat.'; end if;
  delete from public.chat_threads where id = p_thread and group_key is not null;
  if not found then raise exception 'Conversation not found.'; end if;
end $$;

-- For the chat icon: unread messages in total and the newest one (to pop up a notice on the page)
create or replace function public.chat_unread()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_trainer text := public._my_trainer();
  total integer;
  last_id bigint;
  last_thread uuid;
  last_body text;
  last_name text;
begin
  if auth.uid() is null then return jsonb_build_object('unread', 0); end if;
  with u as (
    select m.id, m.thread_id, m.body,
           case when t.client_id = auth.uid() then
                  coalesce((select p.name from public.profiles p where p.id = t.member_id),
                           (select split_part(tr.name, ' ', 1) from public.trainers tr where tr.id = t.trainer_id))
                else (select p.name from public.profiles p where p.id = t.client_id) end as name
    from public.chat_threads t join public.chat_messages m on m.thread_id = t.id
    where t.group_key is null
      and (t.client_id = auth.uid() or t.member_id = auth.uid()
           or (me_trainer is not null and t.member_id is null and t.trainer_id = me_trainer))
      and m.from_trainer = (t.client_id = auth.uid())
      and m.id > case when t.client_id = auth.uid() then t.client_read_id else t.trainer_read_id end
    union all
    select m.id, m.thread_id, m.body, t.group_title || ' · ' || coalesce(split_part(p.name, ' ', 1), 'Member')
    from public.chat_threads t
    join public.chat_messages m on m.thread_id = t.id
    left join public.profiles p on p.id = m.sender_id
    where t.group_key is not null and public._group_chat_member(t.group_key)
      and not exists (select 1 from public.chat_reads r where r.thread_id = t.id and r.user_id = auth.uid() and r.muted)
      and m.sender_id is distinct from auth.uid()
      and m.id > coalesce((select r.read_id from public.chat_reads r where r.thread_id = t.id and r.user_id = auth.uid()), 0)
  )
  select (select count(*) from u), x.id, x.thread_id, left(x.body, 140), x.name
    into total, last_id, last_thread, last_body, last_name
  from (select 1) one left join lateral (select * from u order by u.id desc limit 1) x on true;
  return jsonb_build_object('unread', total, 'lastId', last_id, 'thread', last_thread, 'body', last_body, 'name', last_name,
    -- the website checks the chat every 20 seconds: celebrations that are waiting (a like, a purchase) ride along
    'celebrations', (select count(*) from public.celebrations c where c.user_id = auth.uid() and c.seen_at is null));
end $$;

revoke execute on function public._my_trainer() from public, anon, authenticated;
revoke execute on function public._trainer_of(uuid) from public, anon, authenticated;
revoke execute on function public._chat_side(public.chat_threads) from public, anon, authenticated;
revoke execute on function public._chat_person(uuid) from public, anon, authenticated;
revoke execute on function public._chat_peer(public.chat_threads, text) from public, anon, authenticated;
revoke execute on function public._group_chat_users(text) from public, anon, authenticated;
revoke execute on function public._group_chat_member(text) from public, anon, authenticated;
revoke execute on function public.chat_mute(uuid, boolean) from public, anon;
revoke execute on function public.chat_like(bigint) from public, anon;
grant execute on function public.chat_like(bigint) to authenticated;
revoke execute on function public.chat_group_delete(uuid) from public, anon;
grant execute on function public.chat_mute(uuid, boolean) to authenticated;
grant execute on function public.chat_group_delete(uuid) to authenticated;
revoke execute on function public.chat_list() from public, anon;
revoke execute on function public.chat_open(text) from public, anon;
revoke execute on function public.chat_search(text) from public, anon;
revoke execute on function public.chat_open_user(uuid) from public, anon;
revoke execute on function public.chat_thread(uuid, bigint) from public, anon;
revoke execute on function public.chat_send(uuid, text) from public, anon;
revoke execute on function public.chat_unread() from public, anon;
grant execute on function public.chat_list() to authenticated;
grant execute on function public.chat_open(text) to authenticated;
grant execute on function public.chat_search(text) to authenticated;
grant execute on function public.chat_open_user(uuid) to authenticated;
grant execute on function public.chat_thread(uuid, bigint) to authenticated;
grant execute on function public.chat_send(uuid, text) to authenticated;
grant execute on function public.chat_unread() to authenticated;

-- ---------------------------------------------------------
-- Admin: give (or take back) XP by hand, e.g. for helping LEVEL-UP; the player gets a push with the reason
-- ---------------------------------------------------------
create or replace function public.admin_grant_xp(p_user uuid, p_amount integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  why text := btrim(coalesce(p_reason, ''));
  new_xp integer;
begin
  if not public.is_admin() then raise exception 'Admin access only.'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'Enter an amount of XP.'; end if;
  if abs(p_amount) > 5000 then raise exception 'At most 5000 XP at once.'; end if;
  if char_length(why) < 3 then raise exception 'Write a short reason (the player sees it).'; end if;
  if char_length(why) > 140 then raise exception 'Keep the reason under 140 characters.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'Player not found.'; end if;
  perform public._grant_xp(p_user, p_amount, why);
  select xp into new_xp from public.profiles where id = p_user;
  perform public._push(p_user,
    case when p_amount > 0 then '🎁 +' || p_amount || ' XP from LEVEL-UP' else 'XP correction: ' || p_amount || ' XP' end,
    why, 'profile.html#rewards', 'note-xp-' || extract(epoch from now())::bigint);
  return jsonb_build_object('xp', new_xp);
end $$;

revoke execute on function public.admin_grant_xp(uuid, integer, text) from public, anon;
grant execute on function public.admin_grant_xp(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------
-- Group classes: a trainer (or an admin) plans a class with a number of places; players sign up
-- (or join the waitlist), pay online or at the class, and the trainer ticks off who is there,
-- which gives them their XP. Every class has its own chat for the people signed up.
-- ---------------------------------------------------------

-- "Wed 11 Nov 19:00" in Brussels time (pushes and payment descriptions)
create or replace function public._class_label(c public.class_sessions)
returns text language sql stable as $$
  select to_char(c.starts_at at time zone 'Europe/Brussels', 'Dy DD Mon HH24:MI');
$$;

-- Places taken: booked, present, no-show, and (for a few minutes) waiting for an online payment
create or replace function public._class_taken(p_class uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.class_signups
  where class_id = p_class and status in ('booked', 'attended', 'no_show', 'awaiting_payment');
$$;

-- The trainer of the class (their linked account) or an admin
create or replace function public._can_lead(p_class uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select public._can_coach(c.trainer_id) from public.class_sessions c where c.id = p_class), false);
end $$;

-- A class as the website shows it, with the counts and (for p_user) their own place
create or replace function public._class_json(c public.class_sessions, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me public.class_signups;
  ends timestamptz := c.starts_at + make_interval(mins => c.minutes);
begin
  if p_user is not null then
    select * into me from public.class_signups where class_id = c.id and user_id = p_user;
  end if;
  return jsonb_build_object(
    'id', c.id, 'title', c.title, 'trainerId', c.trainer_id,
    'startsAt', c.starts_at, 'endsAt', ends, 'minutes', c.minutes,
    'date', to_char(c.starts_at at time zone 'Europe/Brussels', 'YYYY-MM-DD'),
    'time', to_char(c.starts_at at time zone 'Europe/Brussels', 'HH24:MI'),
    'capacity', c.capacity, 'taken', public._class_taken(c.id),
    'waitlist', (select count(*) from public.class_signups w where w.class_id = c.id and w.status = 'waitlist'),
    'price', c.price, 'xp', c.xp, 'location', c.location, 'note', c.note,
    'status', c.status, 'cancelReason', c.cancel_reason, 'seriesId', c.series_id, 'usesRoom', c.uses_room,
    'freeCancelUntil', c.starts_at - make_interval(hours => public._config('class_cancel_hours')::int),
    'chatId', (select th.id from public.chat_threads th where th.group_key = public._group_key(c.title)),
    'chatOpen', c.status <> 'cancelled' and now() < ends + make_interval(days => public._config('class_chat_days')::int),
    'mine', case when me.id is null then null else jsonb_build_object(
      'id', me.id, 'status', me.status, 'price', me.price, 'payMethod', me.pay_method, 'payStatus', me.pay_status,
      'refundStatus', me.refund_status, 'xp', me.xp, 'updatedAt', me.updated_at,
      'waitPos', case when me.status = 'waitlist' then
        (select count(*) from public.class_signups w where w.class_id = c.id and w.status = 'waitlist'
           and (w.updated_at, w.id) <= (me.updated_at, me.id)) end) end
  );
end $$;

-- One person on a class list (for the trainer and the admin)
create or replace function public._class_person_json(g public.class_signups)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'userId', g.user_id, 'name', p.name, 'avatar', p.avatar_url, 'email', p.email,
    'status', g.status, 'price', g.price, 'payMethod', g.pay_method, 'payStatus', g.pay_status, 'refundStatus', g.refund_status,
    'xp', g.xp, 'signedUpAt', g.updated_at,
    'firstClass', not exists (select 1 from public.class_signups o where o.user_id = g.user_id and o.status = 'attended' and o.id <> g.id),
    'health', public._health_brief(g.user_id))
  from public.profiles p where p.id = g.user_id;
$$;

-- Money of a class: what was paid, what is still to be paid (charged places only) and the places paid for
create or replace function public._class_money(p_class uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'present', count(*) filter (where status = 'attended'),
    'charged', coalesce(sum(price) filter (where status in ('attended', 'no_show', 'late_cancel')), 0),
    'paid', coalesce(sum(price) filter (where pay_status = 'paid' and status not in ('cancelled')), 0),
    'unpaid', count(*) filter (where pay_status = 'unpaid' and price > 0 and status in ('booked', 'attended', 'no_show', 'late_cancel')),
    'unpaidTotal', coalesce(sum(price) filter (where pay_status = 'unpaid' and price > 0 and status in ('booked', 'attended', 'no_show', 'late_cancel')), 0))
  from public.class_signups where class_id = p_class;
$$;

-- Fill free places from the waitlist (oldest first); each promoted player gets a push
create or replace function public._class_promote(p_class uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.class_sessions;
  g public.class_signups;
begin
  select * into c from public.class_sessions where id = p_class for update;
  if not found or c.status <> 'scheduled' or c.starts_at <= now() then return; end if;
  loop
    exit when public._class_taken(c.id) >= c.capacity;
    select * into g from public.class_signups where class_id = c.id and status = 'waitlist'
      order by updated_at, id limit 1 for update;
    exit when not found;
    update public.class_signups set status = 'booked', pay_method = 'in_person', updated_at = now() where id = g.id;
    perform public._push(g.user_id, 'You''re in! 🎉',
      c.title || ' · ' || public._class_label(c) || ' · A spot opened up for you', 'profile.html#classes', 'class-' || c.id);
    perform public._push(public._trainer_user(c.trainer_id), 'From the waitlist: ' || c.title,
      (select name from public.profiles where id = g.user_id) || ' · ' || public._class_label(c) || ' · '
        || public._class_taken(c.id) || '/' || c.capacity, 'profile.html#coach', 'class-' || c.id || '-roster');
  end loop;
end $$;

-- Unpaid online sign-ups give their place back after payment_hold_minutes
create or replace function public._expire_class_payments()
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  for cid in
    update public.class_signups set status = 'cancelled', updated_at = now()
    where status = 'awaiting_payment'
      and updated_at + make_interval(mins => public._config('payment_hold_minutes')::int) <= now()
    returning class_id
  loop
    perform public._class_promote(cid);
  end loop;
end $$;

-- Classes in a period (anyone): times, places taken, price; logged in: your own place too
create or replace function public.class_list(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._expire_class_payments();
  return coalesce((select jsonb_agg(public._class_json(c, auth.uid()) order by c.starts_at)
    from public.class_sessions c
    where (c.starts_at at time zone 'Europe/Brussels')::date between p_from and least(p_to, p_from + 70)
      and (c.status <> 'cancelled'
           or exists (select 1 from public.class_signups g where g.class_id = c.id and g.user_id = auth.uid()))), '[]'::jsonb);
end $$;

-- Sign up: a free place (pay online now or at the class) or, when it's full, the waitlist
create or replace function public.class_signup(p_class uuid, p_pay text default 'in_person')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c public.class_sessions;
  g public.class_signups;
  st text;
begin
  if uid is null then raise exception 'Log in to sign up for a group class.'; end if;
  perform public._expire_class_payments();
  select * into c from public.class_sessions where id = p_class for update;
  if not found then raise exception 'Group class not found.'; end if;
  if c.status = 'cancelled' then raise exception 'This group class was cancelled.'; end if;
  if c.status <> 'scheduled' or c.starts_at <= now() then raise exception 'This group class has already started.'; end if;
  if public._trainer_of(uid) = c.trainer_id then raise exception 'You lead this class.'; end if;
  if p_pay not in ('online', 'in_person') then raise exception 'Invalid payment method.'; end if;
  if p_pay = 'online' and public._config('online_payments') <> 'on' then
    raise exception 'Online payment is not available yet. Choose to pay at the class.';
  end if;
  if not public._health_valid(uid) then raise exception 'Fill in the health questionnaire before you book a session.'; end if;
  select * into g from public.class_signups where class_id = c.id and user_id = uid for update;
  if found then
    if g.status in ('booked', 'awaiting_payment', 'waitlist', 'attended') then raise exception 'You''re already signed up for this class.'; end if;
    if g.status in ('late_cancel', 'no_show') then raise exception 'You signed out of this class too late to sign up again.'; end if;
    if g.refund_status in ('due', 'processing', 'manual') then raise exception 'Your refund for this class is still open. Ask us at the gym.'; end if;
  end if;
  st := case when public._class_taken(c.id) >= c.capacity then 'waitlist'
             when p_pay = 'online' and c.price > 0 then 'awaiting_payment' else 'booked' end;
  insert into public.class_signups (class_id, user_id, status, price, pay_method, pay_status, updated_at)
  values (c.id, uid, st, c.price, case when st = 'awaiting_payment' then 'online' else 'in_person' end,
          case when c.price = 0 then 'paid' else 'unpaid' end, now())
  on conflict (class_id, user_id) do update set status = excluded.status, price = excluded.price, pay_method = excluded.pay_method,
    pay_status = excluded.pay_status, paid_at = null, mollie_id = null, refund_status = null, refund_id = null, xp = 0, updated_at = now()
  returning * into g;
  if st <> 'awaiting_payment' then
    perform public._push(public._trainer_user(c.trainer_id),
      case when st = 'waitlist' then 'Waitlist: ' else 'New sign-up: ' end || c.title,
      (select name from public.profiles where id = uid) || ' · ' || public._class_label(c) || ' · '
        || public._class_taken(c.id) || '/' || c.capacity, 'profile.html#coach', 'class-' || c.id || '-roster');
  end if;
  return public._class_json(c, uid);
end $$;

-- Sign out (or leave the waitlist). Up to class_cancel_hours before: free (paid = refunded);
-- later: a late cancellation, charged in full. An admin can always cancel for free.
create or replace function public.class_cancel(p_signup uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.class_signups;
  c public.class_sessions;
  by_admin boolean := public.is_admin();
  late boolean;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into g from public.class_signups where id = p_signup for update;
  if not found or (g.user_id <> auth.uid() and not by_admin) then raise exception 'Sign-up not found.'; end if;
  select * into c from public.class_sessions where id = g.class_id for update;
  if g.status not in ('booked', 'awaiting_payment', 'waitlist') then raise exception 'This sign-up can no longer be cancelled.'; end if;
  if c.starts_at <= now() then raise exception 'This class has already started.'; end if;
  late := g.status = 'booked' and not by_admin and g.price > 0
          and c.starts_at - make_interval(hours => public._config('class_cancel_hours')::int) < now();
  if late then
    update public.class_signups set status = 'late_cancel', updated_at = now() where id = g.id;
  else
    update public.class_signups set status = 'cancelled', updated_at = now(),
      refund_status = case when pay_status = 'paid' and price > 0 then case when pay_method = 'online' then 'due' else 'manual' end end
    where id = g.id;
  end if;
  if g.status = 'booked' then
    perform public._push(public._trainer_user(c.trainer_id), 'Signed out: ' || c.title,
      (select name from public.profiles where id = g.user_id) || ' · ' || public._class_label(c) || ' · '
        || public._class_taken(c.id) || '/' || c.capacity, 'profile.html#coach', 'class-' || c.id || '-roster');
  end if;
  perform public._class_promote(c.id);
  return public._class_json(c, g.user_id) || jsonb_build_object('late', late);
end $$;

-- Plan a class (the trainer for themselves, an admin for anyone), optionally every week for up to 12 weeks.
-- Price and trainer fee come from the settings; only an admin can change them.
create or replace function public.class_create(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  admin boolean := public.is_admin();
  trainer text := coalesce(nullif(p ->> 'trainerId', ''), public._my_trainer());
  ttl text := btrim(coalesce(p ->> 'title', ''));
  d date := nullif(p ->> 'date', '')::date;
  tm time := nullif(p ->> 'time', '')::time;
  mins integer := coalesce(nullif(p ->> 'minutes', '')::int, 60);
  cap integer := coalesce(nullif(p ->> 'capacity', '')::int, public._config('class_capacity')::int);
  cost numeric := case when admin and nullif(p ->> 'price', '') is not null then (p ->> 'price')::numeric
                       else public._config('class_price')::numeric end;
  fee numeric := case when admin and nullif(p ->> 'trainerFee', '') is not null then (p ->> 'trainerFee')::numeric
                      else public._config('class_trainer_fee')::numeric end;
  weeks integer := least(greatest(coalesce(nullif(p ->> 'repeatWeeks', '')::int, 1), 1), 12);
  loc text := left(coalesce(nullif(btrim(p ->> 'location'), ''), 'Hoogstraat 40, Aalst'), 80);
  remark text := left(btrim(coalesce(p ->> 'note', '')), 300);
  series uuid := case when weeks > 1 then gen_random_uuid() end;
  room boolean := coalesce((p ->> 'usesRoom')::boolean, true); -- off for a class outside the gym room
  blocker text;
  start timestamptz;
  c public.class_sessions;
  made jsonb := '[]'::jsonb;
  skipped integer := 0;
  first public.class_sessions;
  reached integer;
begin
  if uid is null then raise exception 'Log in first.'; end if;
  if trainer is null or not public._can_coach(trainer) then raise exception 'Only the trainer or an admin can plan a group class.'; end if;
  if not exists (select 1 from public.trainers where id = trainer and active) then raise exception 'Unknown trainer.'; end if;
  if char_length(ttl) < 2 or char_length(ttl) > 40 then raise exception 'Give the class a name (2 to 40 characters).'; end if;
  if d is null or tm is null then raise exception 'Pick a date and a start time.'; end if;
  if mins < 15 or mins > 240 then raise exception 'A class lasts between 15 and 240 minutes.'; end if;
  if cap < 2 or cap > 60 then raise exception 'A class has between 2 and 60 places.'; end if;
  if cost < 0 or cost > 500 or fee < 0 or fee > 1000 then raise exception 'Check the price and the trainer fee.'; end if;
  for i in 0 .. weeks - 1 loop
    start := ((d + 7 * i) + tm) at time zone 'Europe/Brussels';
    if start <= now() + interval '1 hour' then
      if i = 0 then raise exception 'Plan a group class at least 1 hour ahead.'; end if;
      skipped := skipped + 1; continue;
    end if;
    if exists (select 1 from public.class_sessions o where o.trainer_id = trainer and o.status = 'scheduled'
               and tstzrange(o.starts_at, o.starts_at + make_interval(mins => o.minutes)) && tstzrange(start, start + make_interval(mins => mins))) then
      if i = 0 then raise exception 'This trainer already has a group class at that time.'; end if;
      skipped := skipped + 1; continue;
    end if;
    if exists (select 1 from public.bookings k where k.trainer_id = trainer and k.status in ('awaiting_payment', 'pending', 'confirmed')
               and tstzrange(public._slot_start(k.day, k.hour), public._slot_start(k.day, k.hour) + interval '1 hour')
                   && tstzrange(start, start + make_interval(mins => mins))) then
      if i = 0 then raise exception 'This trainer has a 1:1 session at that time.'; end if;
      skipped := skipped + 1; continue;
    end if;
    if room then
      -- a class in the gym takes the whole room: no other class, 1:1 session or rental at that time
      perform pg_advisory_xact_lock(hashtext('room-' || (d + 7 * i)::text));
      blocker := public._room_blocker(start, start + make_interval(mins => mins), true);
      if blocker is not null then
        if i = 0 then raise exception 'The gym is not free at that time: %.', blocker; end if;
        skipped := skipped + 1; continue;
      end if;
    end if;
    insert into public.class_sessions (title, trainer_id, starts_at, minutes, capacity, price, trainer_fee, xp, location, note, series_id, created_by, uses_room)
    values (ttl, trainer, start, mins, cap, cost, fee, public._config('class_xp')::int, loc, remark, series, uid, room)
    returning * into c;
    insert into public.chat_threads (group_key, group_title) values (public._group_key(ttl), ttl) on conflict do nothing;
    insert into public.class_kinds (key, title) values (public._group_key(ttl), ttl) on conflict do nothing;
    made := made || jsonb_build_array(public._class_json(c, uid));
    if first.id is null then first := c; end if;
  end loop;
  -- Tell everyone (one message, also for a weekly series): the name, when, the trainer's own words
  if first.id is not null and coalesce((p ->> 'announce')::boolean, true) then
    reached := public._broadcast('class',
      '📣 ' || ttl || ' · ' || to_char(first.starts_at at time zone 'Europe/Brussels', 'Dy DD Mon') || ' ' || to_char(first.starts_at at time zone 'Europe/Brussels', 'HH24:MI'),
      case when remark <> '' then remark || ' · ' else '' end
        || 'With ' || (select split_part(name, ' ', 1) from public.trainers where id = trainer)
        || case when jsonb_array_length(made) > 1 then ' · every week' else '' end || ' · Sign up in the app',
      'index.html#schedule', 'class-' || first.id, first.starts_at);
  end if;
  return jsonb_build_object('created', made, 'skipped', skipped, 'announced', reached);
end $$;

-- Cancel a class (or it and the rest of its weekly series): everyone signed up is told, paid places are refunded
create or replace function public.class_cancel_class(p_class uuid, p_reason text default '', p_series boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  first public.class_sessions;
  c public.class_sessions;
  g public.class_signups;
  why text := left(btrim(coalesce(p_reason, '')), 200);
  n integer := 0;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into first from public.class_sessions where id = p_class;
  if not found or not public._can_lead(p_class) then raise exception 'Group class not found.'; end if;
  for c in
    select * from public.class_sessions
    where status = 'scheduled' and starts_at > now()
      and (id = p_class or (p_series and first.series_id is not null and series_id = first.series_id and starts_at >= first.starts_at))
    order by starts_at for update
  loop
    update public.class_sessions set status = 'cancelled', cancel_reason = why where id = c.id;
    delete from public.news where ref = 'class-' || c.id;
    for g in select * from public.class_signups where class_id = c.id and status in ('booked', 'awaiting_payment', 'waitlist', 'late_cancel') for update loop
      update public.class_signups set status = 'cancelled', updated_at = now(),
        refund_status = case when pay_status = 'paid' and price > 0 then case when pay_method = 'online' then 'due' else 'manual' end end
      where id = g.id;
      perform public._push(g.user_id, 'Class cancelled', c.title || ' · ' || public._class_label(c)
        || case when why <> '' then ' · ' || why else '' end
        || ' · ' || case when g.pay_status = 'paid' and g.price > 0 then 'Your payment is refunded' else 'No costs' end,
        'profile.html#classes', 'class-' || c.id);
    end loop;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'This class can no longer be cancelled.'; end if;
  return jsonb_build_object('cancelled', n);
end $$;

-- Change a planned class at any moment: name, trainer (admin), date, time, duration, places, location, note,
-- and for an admin the price and the trainer fee. Only what is in p changes. Everyone signed up hears it when
-- the day, hour, place, name or trainer changed. A new price counts for people who sign up from then on.
create or replace function public.class_update(p_class uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  admin boolean := public.is_admin();
  c public.class_sessions;
  trainer text;
  ttl text;
  d date;
  tm time;
  mins integer;
  cap integer;
  cost numeric;
  fee numeric;
  loc text;
  remark text;
  start timestamptz;
  taken integer;
  changed text := '';
  g record;
  room boolean;
  blocker text;
begin
  if uid is null then raise exception 'Log in first.'; end if;
  select * into c from public.class_sessions where id = p_class for update;
  if not found or not public._can_lead(p_class) then raise exception 'Group class not found.'; end if;
  if c.status <> 'scheduled' then raise exception 'A finished or cancelled class can''t be changed.'; end if;
  trainer := case when admin then coalesce(nullif(p ->> 'trainerId', ''), c.trainer_id) else c.trainer_id end;
  ttl := case when p ? 'title' then btrim(coalesce(p ->> 'title', '')) else c.title end;
  d := coalesce(nullif(p ->> 'date', '')::date, (c.starts_at at time zone 'Europe/Brussels')::date);
  tm := coalesce(nullif(p ->> 'time', '')::time, (c.starts_at at time zone 'Europe/Brussels')::time);
  mins := coalesce(nullif(p ->> 'minutes', '')::int, c.minutes);
  cap := coalesce(nullif(p ->> 'capacity', '')::int, c.capacity);
  cost := case when admin and nullif(p ->> 'price', '') is not null then (p ->> 'price')::numeric else c.price end;
  fee := case when admin and nullif(p ->> 'trainerFee', '') is not null then (p ->> 'trainerFee')::numeric else c.trainer_fee end;
  loc := case when p ? 'location' then left(coalesce(nullif(btrim(p ->> 'location'), ''), 'Hoogstraat 40, Aalst'), 80) else c.location end;
  remark := case when p ? 'note' then left(btrim(coalesce(p ->> 'note', '')), 300) else c.note end;
  start := (d + tm) at time zone 'Europe/Brussels';
  room := case when p ? 'usesRoom' then coalesce((p ->> 'usesRoom')::boolean, true) else c.uses_room end;
  if not exists (select 1 from public.trainers where id = trainer and active) then raise exception 'Unknown trainer.'; end if;
  if char_length(ttl) < 2 or char_length(ttl) > 40 then raise exception 'Give the class a name (2 to 40 characters).'; end if;
  if mins < 15 or mins > 240 then raise exception 'A class lasts between 15 and 240 minutes.'; end if;
  if cap < 2 or cap > 60 then raise exception 'A class has between 2 and 60 places.'; end if;
  if cost < 0 or cost > 500 or fee < 0 or fee > 1000 then raise exception 'Check the price and the trainer fee.'; end if;
  taken := public._class_taken(c.id);
  if cap < taken then raise exception '% signed up already: the class needs at least that many places.', taken; end if;
  if start <> c.starts_at and start <= now() then raise exception 'Pick a day and hour that are still to come.'; end if;
  if start <> c.starts_at or mins <> c.minutes or trainer <> c.trainer_id then
    if exists (select 1 from public.class_sessions o where o.id <> c.id and o.trainer_id = trainer and o.status = 'scheduled'
               and tstzrange(o.starts_at, o.starts_at + make_interval(mins => o.minutes)) && tstzrange(start, start + make_interval(mins => mins))) then
      raise exception 'This trainer already has a group class at that time.';
    end if;
    if exists (select 1 from public.bookings k where k.trainer_id = trainer and k.status in ('awaiting_payment', 'pending', 'confirmed')
               and tstzrange(public._slot_start(k.day, k.hour), public._slot_start(k.day, k.hour) + interval '1 hour')
                   && tstzrange(start, start + make_interval(mins => mins))) then
      raise exception 'This trainer has a 1:1 session at that time.';
    end if;
  end if;
  -- a class in the gym takes the whole room (checked when its time changes or when it moves into the room)
  if room and (start <> c.starts_at or mins <> c.minutes or not c.uses_room) then
    perform pg_advisory_xact_lock(hashtext('room-' || d::text));
    blocker := public._room_blocker(start, start + make_interval(mins => mins), true, c.id);
    if blocker is not null then raise exception 'The gym is not free at that time: %.', blocker; end if;
  end if;
  -- what the players need to hear
  if start <> c.starts_at then changed := 'New time: ' || to_char(start at time zone 'Europe/Brussels', 'Dy DD Mon HH24:MI'); end if;
  if loc <> c.location then changed := changed || case when changed <> '' then ' · ' else '' end || 'New place: ' || loc; end if;
  if trainer <> c.trainer_id then
    changed := changed || case when changed <> '' then ' · ' else '' end || 'Now with ' || (select split_part(name, ' ', 1) from public.trainers where id = trainer);
  end if;
  if ttl <> c.title and changed = '' then changed := 'Now called ' || ttl; end if;
  update public.class_sessions set title = ttl, trainer_id = trainer, starts_at = start, minutes = mins, capacity = cap,
    price = cost, trainer_fee = fee, location = loc, note = remark, uses_room = room,
    reminder_pushed_at = case when start <> c.starts_at then null else reminder_pushed_at end
  where id = c.id returning * into c;
  insert into public.chat_threads (group_key, group_title) values (public._group_key(ttl), ttl) on conflict do nothing;
  insert into public.class_kinds (key, title) values (public._group_key(ttl), ttl) on conflict do nothing;
  -- the news item of this class follows its new name and hour
  update public.news set title = '📣 ' || ttl || ' · ' || to_char(start at time zone 'Europe/Brussels', 'Dy DD Mon') || ' ' || to_char(start at time zone 'Europe/Brussels', 'HH24:MI'),
    expires_at = start where ref = 'class-' || c.id;
  if changed <> '' then
    for g in select user_id from public.class_signups where class_id = c.id and status in ('booked', 'awaiting_payment', 'waitlist') loop
      perform public._push(g.user_id, 'Class changed: ' || ttl, changed, 'profile.html#classes', 'class-' || c.id || '-changed');
    end loop;
  end if;
  return public._class_json(c, uid);
end $$;

-- The class list for the trainer or an admin: everyone signed up and on the waitlist, with payment and health flags
create or replace function public.class_roster(p_class uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.class_sessions;
  class_day date;
begin
  if auth.uid() is null or not public._can_lead(p_class) then raise exception 'Group class not found.'; end if;
  perform public._expire_class_payments();
  select * into c from public.class_sessions where id = p_class;
  class_day := (c.starts_at at time zone 'Europe/Brussels')::date;
  return public._class_json(c, auth.uid()) || public._class_money(c.id) || jsonb_build_object(
    'people', coalesce((select jsonb_agg(public._class_person_json(g)
                          order by case g.status when 'waitlist' then 2 when 'late_cancel' then 3 else 1 end, g.updated_at, g.id)
                        from public.class_signups g where g.class_id = c.id and g.status <> 'cancelled'), '[]'::jsonb),
    'canCheck', c.status <> 'cancelled' and now() >= c.starts_at - interval '30 minutes'
                and (public.is_admin() or (now() at time zone 'Europe/Brussels')::date <= class_day + public._config('reward_window_days')::int),
    'trainerFee', c.trainer_fee, 'finishedAt', c.finished_at, 'payoutAt', c.payout_at);
end $$;

-- Tick someone off as present (they get the class XP right away) or untick a mistake (the XP goes back)
create or replace function public.class_mark(p_signup uuid, p_present boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.class_signups;
  c public.class_sessions;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into g from public.class_signups where id = p_signup for update;
  if not found or not public._can_lead(g.class_id) then raise exception 'Sign-up not found.'; end if;
  select * into c from public.class_sessions where id = g.class_id;
  if c.status = 'cancelled' then raise exception 'This class was cancelled.'; end if;
  if now() < c.starts_at - interval '30 minutes' then raise exception 'You can tick people off from 30 minutes before the start.'; end if;
  if not public.is_admin()
     and (now() at time zone 'Europe/Brussels')::date > (c.starts_at at time zone 'Europe/Brussels')::date + public._config('reward_window_days')::int then
    raise exception 'The % day window has passed. Ask the admin.', public._config('reward_window_days');
  end if;
  if p_present and g.status <> 'attended' then
    if g.status not in ('booked', 'no_show', 'waitlist', 'late_cancel', 'awaiting_payment') then
      raise exception 'This person isn''t signed up anymore.';
    end if;
    update public.class_signups set status = 'attended', xp = c.xp, updated_at = now() where id = g.id;
    perform public._grant_xp(g.user_id, c.xp, 'Group class: ' || c.title);
    perform public._check_achievements(g.user_id);
    perform public._push(g.user_id, '+' || c.xp || ' XP earned!', 'Group class: ' || c.title || ' · Keep levelling up.',
                         'profile.html', 'class-' || c.id || '-xp');
  elsif not p_present and g.status = 'attended' then
    update public.class_signups set status = case when c.status = 'done' then 'no_show' else 'booked' end, xp = 0, updated_at = now()
      where id = g.id;
    if g.xp > 0 then perform public._grant_xp(g.user_id, -g.xp, 'Correction: group class ' || c.title); end if;
  end if;
  return public.class_roster(c.id);
end $$;

-- Paid at the class (cash, Payconiq …): the trainer or an admin notes it; untick undoes it
create or replace function public.class_mark_paid(p_signup uuid, p_paid boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.class_signups;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into g from public.class_signups where id = p_signup for update;
  if not found or not public._can_lead(g.class_id) then raise exception 'Sign-up not found.'; end if;
  if p_paid and g.pay_status = 'unpaid' then
    update public.class_signups set pay_status = 'paid', pay_method = 'in_person', paid_at = now(),
      status = case when status = 'awaiting_payment' then 'booked' else status end where id = g.id;
  elsif not p_paid and g.pay_status = 'paid' and g.pay_method = 'in_person' and g.price > 0 and g.refund_status is null then
    update public.class_signups set pay_status = 'unpaid', paid_at = null where id = g.id;
  end if;
  return public.class_roster(g.class_id);
end $$;

-- After the class: whoever wasn't ticked off is a no-show (charged, no XP), the waitlist closes,
-- the trainer gets coaching XP and their fee counts as earned
create or replace function public.class_finish(p_class uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.class_sessions;
  present integer;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into c from public.class_sessions where id = p_class for update;
  if not found or not public._can_lead(p_class) then raise exception 'Group class not found.'; end if;
  if c.status = 'cancelled' then raise exception 'This class was cancelled.'; end if;
  if c.status = 'done' then raise exception 'This class is already finished.'; end if;
  if now() < c.starts_at then raise exception 'The class hasn''t started yet.'; end if;
  update public.class_signups set status = 'no_show', updated_at = now() where class_id = c.id and status in ('booked', 'awaiting_payment');
  update public.class_signups set status = 'cancelled', updated_at = now() where class_id = c.id and status = 'waitlist';
  update public.class_sessions set status = 'done', finished_at = now() where id = c.id;
  select count(*) into present from public.class_signups where class_id = c.id and status = 'attended';
  if present > 0 then
    perform public._grant_xp(public._trainer_user(c.trainer_id), 100 + 10 * present,
                             'Led group class: ' || c.title || ' (' || present || ')');
  end if;
  return public.class_roster(c.id);
end $$;

-- Classes the caller leads (an admin: all of them), from p_days ago on, with the counts and money
create or replace function public.class_manage_list(p_days integer default 35)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  admin boolean := public.is_admin();
  mine text := public._my_trainer();
begin
  if auth.uid() is null or (not admin and mine is null) then return '[]'::jsonb; end if;
  perform public._expire_class_payments();
  return coalesce((select jsonb_agg(public._class_json(c, auth.uid()) || public._class_money(c.id) || jsonb_build_object(
      'trainerFee', c.trainer_fee, 'finishedAt', c.finished_at, 'payoutAt', c.payout_at,
      'canFinish', c.status = 'scheduled' and now() >= c.starts_at,
      -- places paid at the class that must be given back by hand (cancelled class or free sign-out)
      'refunds', case when admin then coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', p.name, 'price', g.price))
                   from public.class_signups g join public.profiles p on p.id = g.user_id
                   where g.class_id = c.id and g.refund_status = 'manual'), '[]'::jsonb) else '[]'::jsonb end) order by c.starts_at)
    from public.class_sessions c
    where (admin or c.trainer_id = mine)
      and c.starts_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 35), 1), 800))), '[]'::jsonb);
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
revoke execute on function public.coach_statement(date, date) from public, anon;
grant execute on function public.coach_statement(date, date) to authenticated;
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
revoke all on function public.set_birthday(text) from public, anon;
grant execute on function public.set_birthday(text) to authenticated;
grant execute on function public.leaderboard(text) to anon, authenticated;
revoke execute on function public.give_like(uuid) from public, anon;
revoke execute on function public._celebrate(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public._check_rank(uuid) from public, anon, authenticated;
revoke execute on function public.celebrations_open() from public, anon;
revoke execute on function public.celebrations_claim(bigint[]) from public, anon;
grant execute on function public.celebrations_open() to authenticated;
grant execute on function public.celebrations_claim(bigint[]) to authenticated;
revoke execute on function public.set_profile(jsonb) from public, anon;
revoke execute on function public.photo_add(text, text) from public, anon;
revoke execute on function public.photo_delete(uuid) from public, anon;
revoke execute on function public._photo_json(public.profile_photos) from public, anon, authenticated;
revoke execute on function public._photo_open(public.profile_photos) from public, anon, authenticated;
revoke execute on function public.photo_like(uuid) from public, anon;
revoke execute on function public.photo_comment(uuid, text) from public, anon;
revoke execute on function public.photo_comment_delete(uuid) from public, anon;
revoke execute on function public.photo_comment_like(uuid) from public, anon;
grant execute on function public.photo_like(uuid) to authenticated;
grant execute on function public.photo_comment(uuid, text) to authenticated;
grant execute on function public.photo_comment_delete(uuid) to authenticated;
grant execute on function public.photo_comment_like(uuid) to authenticated;
grant execute on function public.public_profile(uuid, text) to anon, authenticated;
grant execute on function public.set_profile(jsonb) to authenticated;
grant execute on function public.photo_add(text, text) to authenticated;
revoke execute on function public.post_add(text[], text) from public, anon;
grant execute on function public.post_add(text[], text) to authenticated;
grant execute on function public.photo_delete(uuid) to authenticated;
grant execute on function public.give_like(uuid) to authenticated;
grant execute on function public.player_of_month() to anon, authenticated;
grant execute on function public.public_reviews() to anon, authenticated;
revoke execute on function public.submit_review(text, integer) from public, anon;
revoke execute on function public.delete_my_review() from public, anon;
revoke execute on function public.admin_reviews() from public, anon;
revoke execute on function public.admin_set_review(uuid, text) from public, anon;
revoke execute on function public.admin_add_review(text, text, integer) from public, anon;
revoke execute on function public._review_member(text) from public, anon, authenticated;
revoke execute on function public.admin_review_photo(uuid, uuid) from public, anon;
grant execute on function public.admin_review_photo(uuid, uuid) to authenticated;
grant execute on function public.submit_review(text, integer) to authenticated;
grant execute on function public.delete_my_review() to authenticated;
grant execute on function public.admin_reviews() to authenticated;
grant execute on function public.admin_set_review(uuid, text) to authenticated;
grant execute on function public.admin_add_review(text, text, integer) to authenticated;
revoke execute on function public._settle_player_of_month() from public, anon, authenticated;
revoke execute on function public._push_streak_reminders(timestamptz) from public, anon, authenticated;
-- Internal helpers: anyone could otherwise read another member's monthly XP or streak by their id
revoke execute on function public._month_xp(uuid, date) from public, anon, authenticated;
revoke execute on function public._streak(uuid) from public, anon, authenticated;
revoke execute on function public.set_avatar(text) from public, anon;
revoke execute on function public.admin_clear_avatar(uuid) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;
grant execute on function public.admin_clear_avatar(uuid) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.my_data() from public, anon;
revoke execute on function public.touch_login() from public, anon;
revoke execute on function public.book_session(text, date, integer, text, text, text, text) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.save_body_stats(jsonb) from public, anon;
revoke execute on function public.update_body_stats(bigint, jsonb) from public, anon;
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
revoke execute on function public.pay_in_person_instead(uuid) from public, anon;
grant execute on function public.pay_in_person_instead(uuid) to authenticated;
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
grant execute on function public.trainer_hours_list() to anon, authenticated;
revoke execute on function public._health_brief(uuid) from public, anon, authenticated;
revoke execute on function public._health_valid(uuid) from public, anon, authenticated;
revoke execute on function public.save_health_form(jsonb, text, text) from public, anon;
grant execute on function public.save_health_form(jsonb, text, text) to authenticated;
revoke execute on function public._voucher_used(uuid) from public, anon, authenticated;
revoke execute on function public._voucher_json(public.reward_vouchers) from public, anon, authenticated;
revoke execute on function public._loyalty_count(uuid) from public, anon, authenticated;
revoke execute on function public._rewards_json(uuid) from public, anon, authenticated;
revoke execute on function public._check_rewards(uuid) from public, anon, authenticated;
revoke execute on function public.mark_hoodie_given(uuid) from public, anon;
grant execute on function public.mark_hoodie_given(uuid) to authenticated;
revoke execute on function public._push(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public._trainer_user(text) from public, anon, authenticated;
revoke execute on function public._push_booking_event() from public, anon, authenticated;
revoke execute on function public._push_voucher_event() from public, anon, authenticated;
revoke execute on function public._push_pack_event() from public, anon, authenticated;
revoke execute on function public.push_due_reminders() from public, anon, authenticated;
revoke execute on function public.push_claim(integer) from public, anon, authenticated;
revoke execute on function public.push_report(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.push_due_reminders() to service_role;
grant execute on function public.push_claim(integer) to service_role;
grant execute on function public.push_report(uuid[], uuid[]) to service_role;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.delete_push_subscription(text) from public, anon;
revoke execute on function public.push_test() from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.push_test() to authenticated;
grant execute on function public.push_public_key() to anon, authenticated;
revoke execute on function public._hours_cover(text, date, integer) from public, anon, authenticated;
revoke execute on function public._covered_bookings(text) from public, anon, authenticated;
revoke execute on function public._check_booked_hours(text, uuid[]) from public, anon, authenticated;
revoke execute on function public.save_trainer_hours(uuid, text, integer, date, integer, integer, text, text) from public, anon;
revoke execute on function public.delete_trainer_hours(uuid) from public, anon;
grant execute on function public.save_trainer_hours(uuid, text, integer, date, integer, integer, text, text) to authenticated;
grant execute on function public.delete_trainer_hours(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
revoke execute on function public._book(uuid, text, date, integer, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public._series_json(public.booking_series) from public, anon, authenticated;
revoke execute on function public._series_label(public.booking_series) from public, anon, authenticated;
revoke execute on function public._series_answer(public.bookings, boolean) from public, anon, authenticated;
revoke execute on function public._series_extend() from public, anon, authenticated;
revoke execute on function public._slot_taken(text, uuid, date, integer, uuid) from public, anon, authenticated;
revoke execute on function public.book_series(text, date, integer, integer, text, text, text) from public, anon;
revoke execute on function public.series_stop(uuid) from public, anon;
revoke execute on function public.move_booking(uuid, date, integer, text) from public, anon;
grant execute on function public.book_series(text, date, integer, integer, text, text, text) to authenticated;
grant execute on function public.series_stop(uuid) to authenticated;
grant execute on function public.move_booking(uuid, date, integer, text) to authenticated;
grant execute on function public.save_body_stats(jsonb) to authenticated;
revoke execute on function public._week_checkin(uuid) from public, anon, authenticated;
revoke execute on function public.check_in() from public, anon;
revoke execute on function public.for_you() from public, anon;
grant execute on function public.check_in() to authenticated;
grant execute on function public.for_you() to authenticated;
grant execute on function public.update_body_stats(bigint, jsonb) to authenticated;
grant execute on function public.claim_orders(text[]) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_data() to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.slot_status(date, date) to anon, authenticated;
grant execute on function public.trainer_stats() to anon, authenticated;
grant execute on function public.record_order(text, jsonb) to anon, authenticated;
grant execute on function public.calendar_feed() to anon, authenticated;

-- Group classes: helpers private; the class list is public, the rest needs an account
revoke execute on function public._class_label(public.class_sessions) from public, anon, authenticated;
revoke execute on function public._class_taken(uuid) from public, anon, authenticated;
revoke execute on function public._can_lead(uuid) from public, anon, authenticated;
revoke execute on function public._class_json(public.class_sessions, uuid) from public, anon, authenticated;
revoke execute on function public._class_person_json(public.class_signups) from public, anon, authenticated;
revoke execute on function public._class_money(uuid) from public, anon, authenticated;
revoke execute on function public._class_promote(uuid) from public, anon, authenticated;
revoke execute on function public._expire_class_payments() from public, anon, authenticated;
revoke execute on function public._class_mine_json(uuid) from public, anon, authenticated;
revoke execute on function public._push_class_reminders() from public, anon, authenticated;
revoke execute on function public.class_signup(uuid, text) from public, anon;
revoke execute on function public.class_cancel(uuid) from public, anon;
revoke execute on function public.class_create(jsonb) from public, anon;
revoke execute on function public.class_cancel_class(uuid, text, boolean) from public, anon;
revoke execute on function public.admin_class_kind(text, jsonb) from public, anon;
grant execute on function public.admin_class_kind(text, jsonb) to authenticated;
grant execute on function public.class_kinds() to anon, authenticated;
revoke execute on function public.class_update(uuid, jsonb) from public, anon;
grant execute on function public.class_update(uuid, jsonb) to authenticated;
revoke execute on function public.class_roster(uuid) from public, anon;
revoke execute on function public.class_mark(uuid, boolean) from public, anon;
revoke execute on function public.class_mark_paid(uuid, boolean) from public, anon;
revoke execute on function public.class_finish(uuid) from public, anon;
revoke execute on function public.class_manage_list(integer) from public, anon;
revoke execute on function public.class_mark_refunded(uuid) from public, anon;
grant execute on function public.class_list(date, date) to anon, authenticated;
grant execute on function public.class_signup(uuid, text) to authenticated;
grant execute on function public.class_cancel(uuid) to authenticated;
grant execute on function public.class_create(jsonb) to authenticated;
grant execute on function public.class_cancel_class(uuid, text, boolean) to authenticated;
grant execute on function public.class_roster(uuid) to authenticated;
grant execute on function public.class_mark(uuid, boolean) to authenticated;
grant execute on function public.class_mark_paid(uuid, boolean) to authenticated;
grant execute on function public.class_finish(uuid) to authenticated;
grant execute on function public.class_manage_list(integer) to authenticated;
grant execute on function public.class_mark_refunded(uuid) to authenticated;

-- Shop: catalogue and basket check are public; tabs need an account; the rest is admin only
revoke execute on function public._shop_basket(jsonb, boolean, boolean) from public, anon, authenticated;
revoke execute on function public._shop_take_stock(jsonb, integer) from public, anon, authenticated;
revoke execute on function public.shop_tab_order(jsonb) from public, anon;
revoke execute on function public.shop_tab_cancel(text) from public, anon;
revoke execute on function public.shop_tab_paid(text) from public, anon;
revoke execute on function public.admin_shop() from public, anon;
revoke execute on function public.admin_shop_update(text, jsonb) from public, anon;
revoke execute on function public.admin_pack_gift(integer, text) from public, anon;
revoke execute on function public.mark_pack_gift_given(uuid) from public, anon;
grant execute on function public.shop_catalog() to anon, authenticated;
revoke execute on function public._broadcast(text, text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public._push_request_reminders() from public, anon, authenticated;
revoke execute on function public.admin_shop_sale(text, integer, timestamptz, boolean) from public, anon;
revoke execute on function public.admin_announce(text, text, text) from public, anon;
revoke execute on function public.admin_delete_news(bigint) from public, anon;
revoke execute on function public.set_push_news(boolean) from public, anon;
grant execute on function public.admin_shop_sale(text, integer, timestamptz, boolean) to authenticated;
grant execute on function public.admin_announce(text, text, text) to authenticated;
grant execute on function public.admin_delete_news(bigint) to authenticated;
grant execute on function public.set_push_news(boolean) to authenticated;
grant execute on function public.shop_check(jsonb) to anon, authenticated;
grant execute on function public.shop_tab_order(jsonb) to authenticated;
grant execute on function public.shop_tab_cancel(text) to authenticated;
grant execute on function public.shop_tab_paid(text) to authenticated;
grant execute on function public.admin_shop() to authenticated;
grant execute on function public.admin_shop_update(text, jsonb) to authenticated;
grant execute on function public.admin_pack_gift(integer, text) to authenticated;
grant execute on function public.mark_pack_gift_given(uuid) to authenticated;

-- Hand out the free session vouchers members already earned before rewards existed
do $$ begin perform public._check_rewards(id) from public.profiles; end $$;

-- ---------------------------------------------------------
-- Gym room for the admin: how busy it is, and the rentals
-- ---------------------------------------------------------
create or replace function public._rental_json(r public.room_rentals)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'renter', r.renter, 'contact', r.contact, 'kind', r.kind,
    'date', to_char(r.day, 'YYYY-MM-DD'), 'start', r.start_hour, 'end', r.end_hour, 'hours', r.end_hour - r.start_hour,
    'price', r.price_hour, 'total', r.price_hour * (r.end_hour - r.start_hour),
    'note', r.note, 'seriesId', r.series_id, 'status', r.status, 'paidAt', r.paid_at,
    'past', public._slot_start(r.day, r.start_hour::int) + make_interval(hours => r.end_hour - r.start_hour) <= now());
$$;

-- Everything the "Gym room" tab shows: the settings, how the room was used per weekday and hour over the last
-- p_weeks full weeks (1:1 sessions, group classes in the room, rentals), and the rentals (the last two years and
-- everything unpaid: the Finances tab counts them per week and month).
create or replace function public.admin_room(p_weeks integer default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  weeks integer := least(greatest(coalesce(p_weeks, 8), 1), 26);
  this_week date := date_trunc('week', now() at time zone 'Europe/Brussels')::date;
  d0 date;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  d0 := this_week - 7 * weeks;
  return jsonb_build_object(
    'places', greatest(coalesce(nullif(public._config('room_places'), '')::int, 2), 1),
    'prices', jsonb_build_object('shared', public._config('rent_shared_price')::numeric,
                                 'full', public._config('rent_full_price')::numeric,
                                 'fullPeak', public._config('rent_full_peak_price')::numeric),
    'weeks', weeks, 'from', to_char(d0, 'YYYY-MM-DD'), 'to', to_char(this_week - 1, 'YYYY-MM-DD'),
    'usage', coalesce((
      select jsonb_agg(jsonb_build_object('dow', x.dow, 'hour', x.hour, 'weeks', x.wk, 'sessions', x.s, 'classes', x.c, 'rentals', x.r)
                       order by x.dow, x.hour)
      from (
        select extract(isodow from u.day)::int as dow, u.hour, count(distinct date_trunc('week', u.day)) as wk,
               sum(u.s) as s, sum(u.c) as c, sum(u.r) as r
        from (
          select b.day, b.hour::int as hour, 1 as s, 0 as c, 0 as r
          from public.bookings b where b.day >= d0 and b.day < this_week and b.status in ('confirmed', 'completed')
          union all
          select h.day, h.hour, 0, 1, 0
          from public.class_sessions cs
          cross join lateral (
            select (t at time zone 'Europe/Brussels')::date as day, extract(hour from t at time zone 'Europe/Brussels')::int as hour
            from generate_series(date_trunc('hour', cs.starts_at), cs.starts_at + make_interval(mins => cs.minutes) - interval '1 minute', interval '1 hour') t
          ) h
          where cs.status in ('scheduled', 'done') and cs.uses_room and h.day >= d0 and h.day < this_week
          union all
          select r.day, g, 0, 0, 1
          from public.room_rentals r cross join lateral generate_series(r.start_hour::int, r.end_hour::int - 1) g
          where r.status = 'booked' and r.day >= d0 and r.day < this_week
        ) u
        group by 1, 2
      ) x), '[]'::jsonb),
    'rentals', coalesce((
      select jsonb_agg(public._rental_json(r) order by r.day, r.start_hour, r.created_at)
      from public.room_rentals r
      where r.day >= (now() at time zone 'Europe/Brussels')::date - 800 or (r.status = 'booked' and r.paid_at is null)), '[]'::jsonb));
end $$;

-- Add a rental (or the same hours every week for a number of weeks). The room has to be free: a "whole room"
-- rental needs it empty, a shared one needs a place. In a weekly series a week that clashes is skipped.
create or replace function public.admin_rental_add(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  who text := btrim(coalesce(p ->> 'renter', ''));
  k text := coalesce(nullif(p ->> 'kind', ''), 'shared');
  d date := nullif(p ->> 'date', '')::date;
  h1 integer := nullif(p ->> 'start', '')::int;
  h2 integer := nullif(p ->> 'end', '')::int;
  weeks integer := least(greatest(coalesce(nullif(p ->> 'repeatWeeks', '')::int, 1), 1), 26);
  cost numeric;
  series uuid;
  made integer := 0;
  skipped integer := 0;
  blocker text;
  dd date;
  s timestamptz;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if char_length(who) < 2 or char_length(who) > 60 then raise exception 'Fill in who rents the room (2 to 60 characters).'; end if;
  if k not in ('shared', 'full') then raise exception 'Choose shared or the whole room.'; end if;
  if d is null or h1 is null or h2 is null then raise exception 'Pick a date, a start hour and an end hour.'; end if;
  if h1 < 0 or h2 > 24 or h2 <= h1 then raise exception 'The end hour has to be after the start hour.'; end if;
  if d < (now() at time zone 'Europe/Brussels')::date - 62 then raise exception 'That date is too long ago.'; end if;
  cost := coalesce(nullif(p ->> 'price', '')::numeric,
                   case when k = 'shared' then public._config('rent_shared_price')::numeric
                        when h2 > 17 or extract(isodow from d) in (6, 7) then public._config('rent_full_peak_price')::numeric
                        else public._config('rent_full_price')::numeric end);
  if cost < 0 or cost > 1000 then raise exception 'Check the price per hour.'; end if;
  series := case when weeks > 1 then gen_random_uuid() end;
  for i in 0 .. weeks - 1 loop
    dd := d + 7 * i;
    s := public._slot_start(dd, h1);
    perform pg_advisory_xact_lock(hashtext('room-' || dd::text));
    blocker := public._room_blocker(s, s + make_interval(hours => h2 - h1), k = 'full');
    if blocker is not null then
      if i = 0 then raise exception 'The gym is not free at that time: %.', blocker; end if;
      skipped := skipped + 1; continue;
    end if;
    insert into public.room_rentals (renter, contact, kind, day, start_hour, end_hour, price_hour, note, series_id, created_by)
    values (who, left(btrim(coalesce(p ->> 'contact', '')), 80), k, dd, h1, h2, cost, left(btrim(coalesce(p ->> 'note', '')), 200), series, auth.uid());
    made := made + 1;
  end loop;
  return jsonb_build_object('created', made, 'skipped', skipped);
end $$;

-- Cancel one rental, or (p_series) this one and every later one of the same weekly series
create or replace function public.admin_rental_cancel(p_id uuid, p_series boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r public.room_rentals;
  n integer;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into r from public.room_rentals where id = p_id;
  if not found then raise exception 'Rental not found.'; end if;
  update public.room_rentals set status = 'cancelled'
  where status = 'booked' and (id = r.id or (coalesce(p_series, false) and r.series_id is not null and series_id = r.series_id and day >= r.day));
  get diagnostics n = row_count;
  return n;
end $$;

-- Paid or not: one rental, or (p_all) every rental of that renter that is over and still open
create or replace function public.admin_rental_paid(p_id uuid, p_paid boolean default true, p_all boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r public.room_rentals;
  n integer;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into r from public.room_rentals where id = p_id;
  if not found then raise exception 'Rental not found.'; end if;
  update public.room_rentals x set paid_at = case when coalesce(p_paid, true) then coalesce(x.paid_at, now()) end
  where x.status = 'booked'
    and (x.id = r.id or (coalesce(p_all, false) and lower(x.renter) = lower(r.renter) and x.paid_at is null
                         and public._slot_start(x.day, x.start_hour::int) <= now()));
  get diagnostics n = row_count;
  return n;
end $$;

-- The room's settings: places at the same time and the standard prices per hour
create or replace function public.admin_room_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  places integer := nullif(p ->> 'places', '')::int;
  v numeric;
  k text;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if places is not null then
    if places < 1 or places > 10 then raise exception 'The room has between 1 and 10 places.'; end if;
    insert into public.app_config (key, value) values ('room_places', places::text) on conflict (key) do update set value = excluded.value;
  end if;
  foreach k in array array['shared', 'full', 'fullPeak'] loop
    v := nullif(p ->> k, '')::numeric;
    if v is not null then
      if v < 0 or v > 1000 then raise exception 'Check the prices.'; end if;
      insert into public.app_config (key, value)
      values (case k when 'shared' then 'rent_shared_price' when 'full' then 'rent_full_price' else 'rent_full_peak_price' end, v::text)
      on conflict (key) do update set value = excluded.value;
    end if;
  end loop;
end $$;

-- What the schedule on the website shows of the rentals. Everyone: the hours the whole room is rented out, without
-- a name (so it is clear why no coach can be booked then). The admin and the coaches also see who rents, and the
-- rentals that take only a place in the room.
create or replace function public.room_blocks(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', to_char(r.day, 'YYYY-MM-DD'), 'start', r.start_hour, 'end', r.end_hour, 'kind', r.kind,
           'name', case when public.is_admin() or public._my_trainer() is not null then r.renter end)
         order by r.day, r.start_hour, r.created_at), '[]'::jsonb)
  from public.room_rentals r
  where r.status = 'booked' and r.day between p_from and least(p_to, p_from + 70)
    and (r.kind = 'full' or public.is_admin() or public._my_trainer() is not null);
$$;
grant execute on function public.room_blocks(date, date) to anon, authenticated;

revoke execute on function public._rental_json(public.room_rentals) from public, anon, authenticated;
revoke execute on function public.admin_room(integer) from public, anon;
revoke execute on function public.admin_rental_add(jsonb) from public, anon;
revoke execute on function public.admin_rental_cancel(uuid, boolean) from public, anon;
revoke execute on function public.admin_rental_paid(uuid, boolean, boolean) from public, anon;
revoke execute on function public.admin_room_settings(jsonb) from public, anon;
grant execute on function public.admin_room(integer) to authenticated;
grant execute on function public.admin_rental_add(jsonb) to authenticated;
grant execute on function public.admin_rental_cancel(uuid, boolean) to authenticated;
grant execute on function public.admin_rental_paid(uuid, boolean, boolean) to authenticated;
grant execute on function public.admin_room_settings(jsonb) to authenticated;

-- ---------------------------------------------------------
-- Welcome in the chat: the head coach says hello to every member
-- ---------------------------------------------------------
-- A new account gets one chat message from the head coach (app_config: owner_trainer_id): a welcome, what you can
-- do in the app and who to turn to. Members who already had an account get it once too (the first time this
-- script runs with this block). It is an ordinary chat message: the member sees the red dot on the chat icon and
-- the "new message" notice, gets a push message when they have those on (not at night), and can simply answer.
-- The text is in app_config (welcome_chat_text); {name} becomes the member's first name. Change it there (Table
-- Editor > app_config) and every later welcome uses the new text; an empty text switches the welcome off.
alter table public.profiles add column if not exists welcomed_at timestamptz;

insert into public.app_config (key, value) values ('welcome_chat_text', $welcome$Hey {name}! 👋

Pieter hier, hoofdcoach van LEVEL-UP. Welkom, en merci dat je de app een kans geeft. Een account maken is al je eerste level-up. 💪

Wat kan je hier doen?
🗓️ Een training boeken: 1-op-1 met een coach of mee in een groepsles.
⚡ XP verdienen met elke sessie, in level stijgen en beloningen vrijspelen.
🏆 Je plaats in het klassement volgen en anderen aanmoedigen met een hartje.
🛍️ Rondkijken in de shop.
💬 Chatten met je coach en met andere leden.

Bij wie kan je terecht?
Voor alles over trainingen, je planning of de app: stuur mij hier gewoon een berichtje. Heb je al een vaste coach? Die vind je ook in de chat.

Nieuw bij ons? Boek dan je eerste sessie. Dat is meteen je intakegesprek: we maken kennis, bekijken waar je nu staat en kiezen samen je eerste doel.

Bij LEVEL-UP is sport een spel. Dus speel mee, heb plezier en level-up op je eigen tempo. Tot snel op de vloer!

Pieter$welcome$)
on conflict (key) do nothing;

-- Send the welcome to one member (once). True when a message was sent.
create or replace function public._welcome_chat(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  coach text := public._config('owner_trainer_id');
  coach_name text;
  txt text := btrim(coalesce(public._config('welcome_chat_text'), ''));
  pr public.profiles;
  tid uuid;
  mid bigint;
  at timestamptz;
begin
  select * into pr from public.profiles where id = p_user;
  if not found or pr.welcomed_at is not null or txt = '' then return false; end if;
  select split_part(name, ' ', 1) into coach_name from public.trainers where id = coach and active;
  if not found then return false; end if; -- no head coach (yet): try again at the next run
  -- coaches, the head coach included, don't get a welcome from the head coach
  if exists (select 1 from public.trainers t where t.active and t.email is not null and lower(t.email) = lower(pr.email)) then
    update public.profiles set welcomed_at = now() where id = p_user;
    return false;
  end if;
  insert into public.chat_threads (client_id, trainer_id) values (p_user, coach) on conflict do nothing;
  select id into tid from public.chat_threads where client_id = p_user and trainer_id = coach and member_id is null;
  if tid is null then return false; end if;
  txt := left(replace(txt, '{name}', coalesce(nullif(split_part(btrim(pr.name), ' ', 1), ''), 'daar')), 2000);
  insert into public.chat_messages (thread_id, sender_id, from_trainer, body)
  values (tid, public._trainer_user(coach), true, txt) returning id, created_at into mid, at;
  -- read for the coach (he "wrote" it), new for the member
  update public.chat_threads set last_at = at, trainer_read_id = greatest(trainer_read_id, mid) where id = tid;
  update public.profiles set welcomed_at = now() where id = p_user;
  -- a push for who has notifications on, never at night (22:00-08:00 waits till the morning)
  insert into public.push_outbox (user_id, title, body, url, tag, send_after)
  select p_user, '💬 ' || coach_name, left(txt, 140), 'chat.html?t=' || tid, 'chat-' || tid, public._after_quiet()
  where exists (select 1 from public.push_subscriptions where user_id = p_user);
  return true;
end $$;
revoke execute on function public._welcome_chat(uuid) from public, anon, authenticated;

-- Members who were here before the welcome existed: once, oldest account first
do $$ begin perform public._welcome_chat(p.id) from (select id from public.profiles where welcomed_at is null order by created_at) p; end $$;

-- ---------------------------------------------------------
-- The head coach's own text ("About Pieter" on his page), written once
-- ---------------------------------------------------------
-- Set one time on the account linked to the head coach's card (app_config: owner_about_added). After that the
-- text is his: he changes it on his own page (My page > About > Change) and this script leaves it alone.
do $$
declare owner_user uuid := public._trainer_user(public._config('owner_trainer_id'));
begin
  if owner_user is not null and not exists (select 1 from public.app_config where key = 'owner_about_added') then
    update public.profiles set bio = $about$Ik ben LEVEL-UP begonnen met één idee: sport moet voelen als spel. Niet als straf of als iets dat moet, wel als iets waar je naar uitkijkt. Samen zweten, samen lachen en elke keer een klein beetje beter worden.

Daarom werkt alles hier zoals in een game. Met elke training verdien je XP, je stijgt in level en we vieren elke stap, groot of klein. En je doet het nooit alleen: in de groepslessen, de run club en de chat leer je mensen kennen die er evenveel zin in hebben als jij. Mensen bij elkaar brengen, daar doe ik het voor.

Kort over mij: hoofdcoach en oprichter van LEVEL-UP, met een hart voor CrossFit, calisthenics, HIIT en Muay Thai.

Nieuw hier? Welkom! Boek je eerste sessie als intakegesprek: we maken kennis, bekijken waar je nu staat en kiezen samen je eerste doel. Ervaring heb je niet nodig, alleen goesting. Klaar om te level-uppen?$about$
    where id = owner_user;
    insert into public.app_config (key, value) values ('owner_about_added', '1') on conflict (key) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------
-- Levelupy: the assistant in the chat (the mascot)
-- ---------------------------------------------------------
-- A member asks a question in the chat. The Edge Function "assistant" (supabase/functions/assistant) lets a Claude
-- model answer it with what this file hands over: the knowledge text (the admin edits it in the dashboard), the
-- coaches, classes, shop and prices, and the member's own sessions, classes and what is still to pay.
-- Never the health questionnaire, body stats or anything of another member. Levelupy only reads: it never books,
-- cancels or pays; its answer can carry buttons that open the right screen.
-- Settings (app_config): assistant_mode = off | staff (the admin and the coaches only: the trial) | members;
-- assistant_model; assistant_daily_limit (questions per member per day); assistant_month_limit (questions per
-- month for everyone together); assistant_knowledge (what it knows about the gym).
insert into public.app_config (key, value) values
  ('assistant_mode', 'staff'),
  ('assistant_model', 'claude-opus-5-5'),
  ('assistant_daily_limit', '25'),
  ('assistant_month_limit', '2000'),
  ('assistant_knowledge', $know$LEVEL-UP is personal training in Aalst waar sport voelt als een spel: met elke training verdien je XP, je stijgt in level en rang en je staat op het klassement. Elke stap wordt gevierd.

De zaal (het hoofdkwartier): Hoogstraat 40, 9308 Aalst. Bellen of WhatsApp: +32 471 95 54 89 (Pieter). Mail: PieterV-D-S@hotmail.com. We antwoorden meestal dezelfde dag.

Pieter is hoofdcoach en oprichter van LEVEL-UP, met een hart voor CrossFit, calisthenics, HIIT en Muay Thai. Zijn eigen verhaal staat bij de gegevens van de coaches.

Voor wie: ook voor beginners. Sessies zijn één-op-één (of met één vriend: een duosessie), dus je coach werkt op jouw niveau. Voor je eerste sessie vul je een korte gezondheidsvragenlijst in. Je eerste sessie is een kennismaking: waar sta je nu en wat wordt je eerste doel.

Groepslessen (bijvoorbeeld HIIT, CrossFit WOD, bootcamp, run club) staan in het rooster met het aantal vrije plaatsen. Vol? Dan kan je op de wachtlijst: komt er een plaats vrij, dan ben je er automatisch bij. Elke groep heeft een eigen groepschat.

De app: open de site op je telefoon en kies Menu > Download de app. LEVEL-UP staat dan op je startscherm, gratis en zonder app store. Zet meldingen aan om te horen wanneer je coach bevestigt.

Wie ziet je gezondheidsantwoorden en lichaamsgegevens: alleen jijzelf, je coach en LEVEL-UP.$know$)
on conflict (key) do nothing;

create table if not exists public.assistant_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null,
  buttons jsonb not null default '[]'::jsonb,   -- (assistant) the buttons under the answer: [{label, action, arg}]
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_user_idx on public.assistant_messages (user_id, id desc);
-- questions per member per day (the daily limit; stays when a member clears the conversation)
create table if not exists public.assistant_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  questions integer not null default 0,
  primary key (user_id, day)
);
-- what the answers used, per month and model (for the admin: the size of the bill)
create table if not exists public.assistant_spend (
  month date not null,
  model text not null,
  answers integer not null default 0,
  tokens_in bigint not null default 0,       -- read at the full price (new text, and text stored for later)
  tokens_cached bigint not null default 0,   -- read from the store, at a tenth of the price
  tokens_out bigint not null default 0,
  primary key (month, model)
);
-- what Levelupy could not answer: a short subject in its own words, without the member (for a better knowledge text)
create table if not exists public.assistant_gaps (
  id bigint generated always as identity primary key,
  topic text not null,
  created_at timestamptz not null default now()
);
alter table public.assistant_messages enable row level security;  -- only through the functions below
alter table public.assistant_usage enable row level security;
alter table public.assistant_spend enable row level security;
alter table public.assistant_gaps enable row level security;

-- Is Levelupy there for the member who asks?
create or replace function public._assistant_on()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and case coalesce(public._config('assistant_mode'), 'off')
    when 'members' then true
    when 'staff' then public.is_admin() or public._my_trainer() is not null
    else false end;
$$;

create or replace function public._assistant_left()
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce(nullif(public._config('assistant_daily_limit'), '')::int, 25)
    - coalesce((select u.questions from public.assistant_usage u
                where u.user_id = auth.uid() and u.day = (now() at time zone 'Europe/Brussels')::date), 0));
$$;

-- For the website: is Levelupy there for me, how many questions are left today, and (when asked) the conversation
create or replace function public.assistant_state(p_messages boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not public._assistant_on() then return jsonb_build_object('on', false); end if;
  return jsonb_build_object(
    'on', true, 'left', public._assistant_left(),
    'limit', coalesce(nullif(public._config('assistant_daily_limit'), '')::int, 25),
    'trial', coalesce(public._config('assistant_mode'), 'off') = 'staff',
    'messages', case when p_messages then coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'body', m.body, 'buttons', m.buttons, 'at', m.created_at) order by m.id)
      from (select * from public.assistant_messages where user_id = me order by id desc limit 60) m), '[]'::jsonb) end);
end $$;

-- A member's own things, and what everyone may know, as the model gets them. No health data, no body stats.
create or replace function public._assistant_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.profiles;
  today date := (now() at time zone 'Europe/Brussels')::date;
  price1 numeric := coalesce(nullif(public._config('session_price'), '')::numeric, 60);
  owner_id text := public._config('owner_trainer_id');
  sessions jsonb; weekly jsonb; classes jsonb; due_sessions jsonb; due_classes jsonb; tab numeric; packs_due jsonb;
  credits integer; vouchers jsonb; done integer;
begin
  select * into p from public.profiles where id = me;
  select coalesce(jsonb_agg(jsonb_build_object(
      'date', b.day, 'weekday', trim(to_char(b.day, 'Day')), 'time', lpad(b.hour::text, 2, '0') || ':00',
      'coach', t.name, 'coachId', t.id,
      'status', case b.status when 'pending' then 'requested, waiting for the coach to confirm'
                              when 'awaiting_payment' then 'waiting for the online payment' else b.status end,
      'kind', case b.kind when 'duo' then 'duo session' else '1:1 session' end,
      'weekly', b.series_id is not null,
      'payment', case when b.pay_method = 'pack' then 'paid with a pack credit'
                      when b.pay_method = 'reward' then 'free session voucher'
                      when b.pay_status = 'paid' then 'paid'
                      else 'still to pay: ' || b.price || ' euro (' || case b.pay_method when 'online' then 'online' else 'at the gym' end || ')' end)
    order by b.day, b.hour), '[]'::jsonb)
  into sessions
  from (select * from public.bookings k where k.user_id = me and k.status in ('pending', 'confirmed', 'awaiting_payment')
          and public._slot_start(k.day, k.hour) > now() order by k.day, k.hour limit 12) b
  join public.trainers t on t.id = b.trainer_id;

  select coalesce(jsonb_agg(jsonb_build_object('when', public._series_label(s), 'coach', t.name,
      'until', coalesce(s.last_day::text, 'until someone stops it'),
      'status', case s.status when 'requested' then 'requested, waiting for the coach' else 'running' end)), '[]'::jsonb)
  into weekly
  from public.booking_series s join public.trainers t on t.id = s.trainer_id
  where s.user_id = me and s.status <> 'ended';

  select coalesce(jsonb_agg(jsonb_build_object(
      'class', c.title, 'start', to_char(c.starts_at at time zone 'Europe/Brussels', 'YYYY-MM-DD HH24:MI'),
      'weekday', trim(to_char(c.starts_at at time zone 'Europe/Brussels', 'Day')), 'coach', t.name,
      'status', case g.status when 'waitlist' then 'on the waitlist' when 'awaiting_payment' then 'waiting for the online payment' else 'signed up' end,
      'payment', case when g.price = 0 then 'free' when g.pay_status = 'paid' then 'paid'
                      else 'still to pay: ' || g.price || ' euro' end) order by c.starts_at), '[]'::jsonb)
  into classes
  from public.class_signups g join public.class_sessions c on c.id = g.class_id join public.trainers t on t.id = c.trainer_id
  where g.user_id = me and g.status in ('booked', 'waitlist', 'awaiting_payment') and c.status = 'scheduled' and c.starts_at > now();

  -- what is still to pay: sessions and classes that count (also ones that are over), the tab, packs asked for
  select coalesce(jsonb_agg(jsonb_build_object('date', b.day, 'time', lpad(b.hour::text, 2, '0') || ':00', 'coach', t.name,
      'what', case b.status when 'no_show' then 'session you missed (charged)' when 'late_cancel' then 'session cancelled too late (charged)'
                            when 'completed' then 'session that is done' else 'session that is planned' end,
      'euro', b.price) order by b.day, b.hour), '[]'::jsonb)
  into due_sessions
  from public.bookings b join public.trainers t on t.id = b.trainer_id
  where b.user_id = me and b.pay_status = 'unpaid' and b.pay_method in ('online', 'in_person')
    and b.status in ('confirmed', 'completed', 'no_show', 'late_cancel');
  select coalesce(jsonb_agg(jsonb_build_object('class', c.title, 'start', to_char(c.starts_at at time zone 'Europe/Brussels', 'YYYY-MM-DD HH24:MI'),
      'euro', g.price) order by c.starts_at), '[]'::jsonb)
  into due_classes
  from public.class_signups g join public.class_sessions c on c.id = g.class_id
  where g.user_id = me and g.pay_status = 'unpaid' and g.price > 0 and g.status in ('booked', 'attended', 'no_show', 'late_cancel')
    and c.status <> 'cancelled';
  select coalesce(sum(o.total), 0) into tab from public.orders o where o.user_id = me and o.status = 'open';
  select coalesce(jsonb_agg(jsonb_build_object('pack', sp.size || ' sessions', 'euro', sp.price)), '[]'::jsonb)
  into packs_due from public.session_packs sp where sp.user_id = me and sp.status = 'requested';

  select coalesce(sum(greatest(0, sp.size - public._pack_used(sp.id))), 0)::int into credits
  from public.session_packs sp where sp.user_id = me and sp.status = 'paid';
  select coalesce(jsonb_agg(jsonb_build_object('validUntil', (v.expires_at at time zone 'Europe/Brussels')::date)), '[]'::jsonb)
  into vouchers
  from public.reward_vouchers v
  where v.user_id = me and v.expires_at > now()
    and not exists (select 1 from public.bookings b where b.voucher_id = v.id and b.status not in ('declined', 'expired', 'cancelled'));
  select count(*)::int into done from public.bookings b where b.user_id = me and b.status = 'completed';

  return jsonb_build_object(
    'now', jsonb_build_object('date', today, 'weekday', trim(to_char(today, 'Day')),
                              'time', to_char(now() at time zone 'Europe/Brussels', 'HH24:MI'), 'timezone', 'Europe/Brussels'),
    'member', jsonb_build_object(
      'firstName', split_part(btrim(coalesce(p.name, '')), ' ', 1),
      'xp', p.xp,
      'isCoach', public._my_trainer() is not null,
      'sessionsDone', done,
      'streak', public._streak(me),
      'checkedInThisWeek', exists (select 1 from public.checkins h where h.user_id = me and h.week = date_trunc('week', today)::date),
      'upcomingSessions', sessions,
      'weeklySessions', weekly,
      'upcomingClasses', classes,
      'stillToPay', jsonb_build_object('sessions', due_sessions, 'classes', due_classes, 'shopTabEuro', tab, 'packsAskedFor', packs_due),
      'packCreditsLeft', credits,
      'freeSessionVouchers', vouchers),
    'coaches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'role', coalesce(t.role, ''), 'specialties', coalesce(t.specialties, ''),
        'about', left(coalesce(nullif(btrim(coalesce((select u.bio from public.profiles u where t.email is not null and lower(u.email) = lower(t.email) limit 1), '')), ''), t.bio, ''), 900),
        'headCoach', t.id = owner_id,
        'canBeMessagedInTheChat', t.email is not null,
        'priceFor1to1Euro', coalesce((select tp.price from public.trainer_pricing tp where tp.trainer_id = t.id), price1),
        'weeklyHours', coalesce((select string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[h.weekday + 1] || ' ' || lpad(h.start_hour::text, 2, '0') || ':00-' || lpad(h.end_hour::text, 2, '0') || ':00', ', '
                                                    order by (h.weekday + 6) % 7, h.start_hour)
                                 from public.trainer_hours h where h.trainer_id = t.id and h.weekday is not null and h.kind = 'open'), 'no fixed hours')
      ) order by t.created_at, t.id) from public.trainers t where t.active), '[]'::jsonb),
    'groupClasses', coalesce((select jsonb_agg(jsonb_build_object(
        'class', c.title, 'start', to_char(c.starts_at at time zone 'Europe/Brussels', 'YYYY-MM-DD HH24:MI'),
        'weekday', trim(to_char(c.starts_at at time zone 'Europe/Brussels', 'Day')), 'minutes', c.minutes, 'coach', t.name,
        'euro', c.price, 'xp', c.xp, 'where', c.location,
        'placesLeft', greatest(0, c.capacity - (select count(*) from public.class_signups g where g.class_id = c.id and g.status in ('booked', 'awaiting_payment', 'attended')))
      ) order by c.starts_at)
      from (select * from public.class_sessions where status = 'scheduled' and starts_at > now() and starts_at < now() + interval '21 days' order by starts_at limit 25) c
      join public.trainers t on t.id = c.trainer_id), '[]'::jsonb),
    'shop', coalesce((select jsonb_agg(jsonb_build_object('item', s.name, 'category', s.category, 'euro', s.price,
        'saleEuro', case when s.sale_price is not null and (s.sale_ends_at is null or s.sale_ends_at > now()) then s.sale_price end,
        'limitedLeft', s.stock) order by s.category, s.name)
      from public.shop_items s where public._shop_available(s)), '[]'::jsonb),
    'pricesAndRules', jsonb_build_object(
      'first1to1SessionEuro', nullif(public._config('intro_price'), '')::numeric,
      'session1to1Euro', price1,
      'duoSessionEuroForTwo', nullif(public._config('duo_price'), '')::numeric,
      'sessionPacks', coalesce(nullif(public._config('packs'), ''), '[]')::jsonb,
      'groupClassEuro', nullif(public._config('class_price'), '')::numeric,
      'xpPerSession', nullif(public._config('session_xp'), '')::int,
      'xpPerGroupClass', nullif(public._config('class_xp'), '')::int,
      'xpWeeklyCheckIn', 25,
      'freeSessionEveryNSessions', nullif(public._config('loyalty_sessions'), '')::int,
      'bookAtLeastHoursAhead', nullif(public._config('booking_notice_hours'), '')::int,
      'bookAtMostWeeksAhead', nullif(public._config('booking_weeks_ahead'), '')::int,
      'freeCancelUntilHoursBefore', nullif(public._config('free_cancel_hours'), '')::int,
      'classFreeSignOutUntilHoursBefore', nullif(public._config('class_cancel_hours'), '')::int,
      'onlinePayments', coalesce(public._config('online_payments'), 'off') = 'on',
      'levels', 'XP needed in total for level L = 50 * L * (L - 1): level 2 = 100 XP, level 3 = 300, level 4 = 600, level 5 = 1000'));
end $$;

-- A question comes in (called by the Edge Function, as the member): checks the limits, keeps the question and
-- gives everything the model needs
create or replace function public.assistant_begin(p_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  msg text := btrim(coalesce(p_message, ''));
  today date := (now() at time zone 'Europe/Brussels')::date;
  daily integer := coalesce(nullif(public._config('assistant_daily_limit'), '')::int, 25);
  monthly integer := coalesce(nullif(public._config('assistant_month_limit'), '')::int, 2000);
  used integer;
  history jsonb;
  new_id bigint;
begin
  if me is null then raise exception 'Log in first.'; end if;
  if not public._assistant_on() then raise exception 'Levelupy is not available right now.'; end if;
  if msg = '' then raise exception 'Write a question first.'; end if;
  if char_length(msg) > 600 then raise exception 'That question is too long. Keep it under 600 characters.'; end if;
  if exists (select 1 from public.assistant_messages m
             where m.user_id = me and m.role = 'user' and m.created_at > now() - interval '40 seconds'
               and m.id = (select max(x.id) from public.assistant_messages x where x.user_id = me)) then
    raise exception 'Levelupy is still working on your last question.';
  end if;
  select coalesce((select u.questions from public.assistant_usage u where u.user_id = me and u.day = today), 0) into used;
  if used >= daily then
    raise exception 'That was question % of today, the most Levelupy answers in a day. Tomorrow he is back. Your coach is in the chat too.', daily;
  end if;
  if (select coalesce(sum(u.questions), 0) from public.assistant_usage u where u.day >= date_trunc('month', today)::date) >= monthly then
    raise exception 'Levelupy has answered all he can this month. Your coach is in the chat for anything you need.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'body', m.body) order by m.id), '[]'::jsonb) into history
  from (select * from public.assistant_messages where user_id = me order by id desc limit 12) m;
  insert into public.assistant_usage (user_id, day, questions) values (me, today, 1)
  on conflict (user_id, day) do update set questions = public.assistant_usage.questions + 1;
  insert into public.assistant_messages (user_id, role, body) values (me, 'user', msg) returning id into new_id;
  return jsonb_build_object(
    'questionId', new_id, 'userId', me, 'left', greatest(0, daily - used - 1),
    'model', coalesce(nullif(public._config('assistant_model'), ''), 'claude-opus-5-5'),
    'knowledge', coalesce(public._config('assistant_knowledge'), ''),
    'history', history,
    'context', public._assistant_context());
end $$;

-- The free hours of a coach on the days asked for (the model calls this through the Edge Function, as the member).
-- The same rules as the schedule: the coach's open hours, minus what is taken or closed, not too soon, not too far.
create or replace function public.assistant_free_hours(p_trainer text, p_from date default null, p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Brussels')::date;
  d0 date := greatest(coalesce(p_from, today), today);
  n integer := least(greatest(coalesce(p_days, 7), 1), 14);
  notice integer := coalesce(nullif(public._config('booking_notice_hours'), '')::int, 12);
  weeks integer := coalesce(nullif(public._config('booking_weeks_ahead'), '')::int, 4);
  horizon timestamptz := public._slot_start((date_trunc('week', today)::date + weeks * 7), 0);
  tid text := lower(btrim(coalesce(p_trainer, '')));
  days jsonb;
begin
  if not public._assistant_on() then raise exception 'Levelupy is not available right now.'; end if;
  if not exists (select 1 from public.trainers t where t.id = tid and t.active) then
    return jsonb_build_object('error', 'Unknown coach id. Use one of the ids in the list of coaches.');
  end if;
  with taken as materialized (
    select s.day, s.hour from public.slot_status(d0, d0 + n - 1) s where s.trainer_id in (tid, '*')
  ), d as (
    select g::date as day from generate_series(d0, d0 + n - 1, interval '1 day') g
  )
  select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'weekday', trim(to_char(d.day, 'Day')),
      'freeHours', coalesce((
        select jsonb_agg(lpad(h::text, 2, '0') || ':00' order by h) from generate_series(0, 23) h
        where exists (select 1 from public.trainer_hours o where o.trainer_id = tid and o.kind = 'open'
                        and (o.weekday = extract(dow from d.day)::int or o.day = d.day) and h >= o.start_hour and h < o.end_hour)
          and not exists (select 1 from public.trainer_hours c where c.trainer_id = tid and c.kind = 'closed'
                            and c.day = d.day and h >= c.start_hour and h < c.end_hour)
          and not exists (select 1 from taken k where k.day = d.day and k.hour = h)
          and public._slot_start(d.day, h) > now() + make_interval(hours => notice)
          and public._slot_start(d.day, h) < horizon), '[]'::jsonb)) order by d.day), '[]'::jsonb)
  into days from d;
  return jsonb_build_object('coachId', tid, 'days', days,
    'note', 'Hours that can be asked for right now. The booking screen has the last word; the coach confirms a request.');
end $$;

-- The answer (the Edge Function only, with the server key): kept in the conversation, the use counted
create or replace function public.assistant_reply(p_user uuid, p_body text, p_buttons jsonb, p_gap text, p_model text,
                                                  p_in bigint, p_cached bigint, p_out bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.assistant_messages;
  month0 date := date_trunc('month', (now() at time zone 'Europe/Brussels')::date)::date;
begin
  insert into public.assistant_messages (user_id, role, body, buttons)
  values (p_user, 'assistant', left(btrim(coalesce(p_body, '')), 4000), coalesce(p_buttons, '[]'::jsonb)) returning * into m;
  insert into public.assistant_spend (month, model, answers, tokens_in, tokens_cached, tokens_out)
  values (month0, coalesce(p_model, ''), 1, greatest(coalesce(p_in, 0), 0), greatest(coalesce(p_cached, 0), 0), greatest(coalesce(p_out, 0), 0))
  on conflict (month, model) do update set answers = public.assistant_spend.answers + 1,
    tokens_in = public.assistant_spend.tokens_in + excluded.tokens_in,
    tokens_cached = public.assistant_spend.tokens_cached + excluded.tokens_cached,
    tokens_out = public.assistant_spend.tokens_out + excluded.tokens_out;
  if btrim(coalesce(p_gap, '')) <> '' then
    insert into public.assistant_gaps (topic) values (left(btrim(p_gap), 160));
    delete from public.assistant_gaps g where g.id not in (select id from public.assistant_gaps order by id desc limit 200);
  end if;
  return jsonb_build_object('id', m.id, 'role', m.role, 'body', m.body, 'buttons', m.buttons, 'at', m.created_at);
end $$;

-- No answer came (the model could not be reached): the question does not count and leaves the conversation
create or replace function public.assistant_undo(p_user uuid, p_question bigint)
returns void language plpgsql security definer set search_path = public as $$
declare gone integer;
begin
  delete from public.assistant_messages where id = p_question and user_id = p_user and role = 'user';
  get diagnostics gone = row_count;
  if gone > 0 then
    update public.assistant_usage set questions = greatest(0, questions - 1)
    where user_id = p_user and day = (now() at time zone 'Europe/Brussels')::date;
  end if;
end $$;

-- A member clears their conversation with Levelupy (the count of today stays)
create or replace function public.assistant_clear()
returns void language sql security definer set search_path = public as $$
  delete from public.assistant_messages where user_id = auth.uid();
$$;

-- Admin: the settings, how much it is used and what it could not answer
create or replace function public.admin_assistant()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Brussels')::date;
  month0 date := date_trunc('month', today)::date;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'mode', coalesce(public._config('assistant_mode'), 'off'),
    'model', coalesce(nullif(public._config('assistant_model'), ''), 'claude-opus-5-5'),
    'dailyLimit', coalesce(nullif(public._config('assistant_daily_limit'), '')::int, 25),
    'monthLimit', coalesce(nullif(public._config('assistant_month_limit'), '')::int, 2000),
    'knowledge', coalesce(public._config('assistant_knowledge'), ''),
    'month', jsonb_build_object(
      'questions', (select coalesce(sum(u.questions), 0) from public.assistant_usage u where u.day >= month0),
      'members', (select count(distinct u.user_id) from public.assistant_usage u where u.day >= month0 and u.questions > 0),
      'today', (select coalesce(sum(u.questions), 0) from public.assistant_usage u where u.day = today)),
    'spend', coalesce((select jsonb_agg(jsonb_build_object('month', s.month, 'model', s.model, 'answers', s.answers,
        'tokensIn', s.tokens_in, 'tokensCached', s.tokens_cached, 'tokensOut', s.tokens_out) order by s.month desc, s.model)
      from public.assistant_spend s where s.month >= month0 - interval '2 months'), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', x.day, 'questions', x.q) order by x.day)
      from (select u.day, sum(u.questions) as q from public.assistant_usage u where u.day > today - 30 group by u.day) x), '[]'::jsonb),
    'gaps', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'topic', g.topic, 'at', g.created_at) order by g.id desc)
      from (select * from public.assistant_gaps order by id desc limit 40) g), '[]'::jsonb));
end $$;

create or replace function public.admin_assistant_save(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  k text; v text;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p ? 'mode' and (p ->> 'mode') not in ('off', 'staff', 'members') then raise exception 'Unknown setting.'; end if;
  if p ? 'model' and (p ->> 'model') not in ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5') then raise exception 'Unknown model.'; end if;
  if p ? 'dailyLimit' and not ((p ->> 'dailyLimit') ~ '^\d{1,3}$' and (p ->> 'dailyLimit')::int between 1 and 200) then
    raise exception 'Questions per member per day: a number from 1 to 200.';
  end if;
  if p ? 'monthLimit' and not ((p ->> 'monthLimit') ~ '^\d{1,6}$' and (p ->> 'monthLimit')::int between 10 and 100000) then
    raise exception 'Questions per month: a number from 10 to 100000.';
  end if;
  if p ? 'knowledge' and char_length(p ->> 'knowledge') > 12000 then raise exception 'The text is too long (12000 characters at most).'; end if;
  for k, v in select * from (values ('assistant_mode', p ->> 'mode'), ('assistant_model', p ->> 'model'),
                                    ('assistant_daily_limit', p ->> 'dailyLimit'), ('assistant_month_limit', p ->> 'monthLimit'),
                                    ('assistant_knowledge', p ->> 'knowledge')) as s(key, value) loop
    if v is not null then
      insert into public.app_config (key, value) values (k, v) on conflict (key) do update set value = excluded.value;
    end if;
  end loop;
end $$;

-- Admin: this subject is dealt with (the knowledge text now covers it)
create or replace function public.admin_assistant_gap_done(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  delete from public.assistant_gaps where id = p_id;
end $$;

revoke execute on function public._assistant_on() from public, anon, authenticated;
revoke execute on function public._assistant_left() from public, anon, authenticated;
revoke execute on function public._assistant_context() from public, anon, authenticated;
revoke execute on function public.assistant_reply(uuid, text, jsonb, text, text, bigint, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.assistant_undo(uuid, bigint) from public, anon, authenticated;
grant execute on function public.assistant_reply(uuid, text, jsonb, text, text, bigint, bigint, bigint) to service_role;
grant execute on function public.assistant_undo(uuid, bigint) to service_role;
revoke execute on function public.assistant_state(boolean) from public, anon;
revoke execute on function public.assistant_begin(text) from public, anon;
revoke execute on function public.assistant_free_hours(text, date, integer) from public, anon;
revoke execute on function public.assistant_clear() from public, anon;
revoke execute on function public.admin_assistant() from public, anon;
revoke execute on function public.admin_assistant_save(jsonb) from public, anon;
revoke execute on function public.admin_assistant_gap_done(bigint) from public, anon;
grant execute on function public.assistant_state(boolean) to authenticated;
grant execute on function public.assistant_begin(text) to authenticated;
grant execute on function public.assistant_free_hours(text, date, integer) to authenticated;
grant execute on function public.assistant_clear() to authenticated;
grant execute on function public.admin_assistant() to authenticated;
grant execute on function public.admin_assistant_save(jsonb) to authenticated;
grant execute on function public.admin_assistant_gap_done(bigint) to authenticated;
