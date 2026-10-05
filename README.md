# LEVEL-UP
Personal training platform with a retro game theme: players and personal trainers meet, train and level up together.

## Pages
- `index.html`: home page: quest board with the next open sessions, the platform + XP table, classes, team with trainer levels and high scores, weekly booking schedule, contact. Photos and video open in a "Replays" pop-up (hero button and footer)
- `shop.html`: item shop for merch and tools. Every €1 spent = 10 XP, and complete sets unlock achievements. Checkout via PayPal; each order is emailed to the LEVEL-UP inbox (FormSubmit) and the buyer gets an automatic confirmation.
- `profile.html`: player profile with level, rank, XP, character stats (BMI, calories, protein, weight progress, weekly check-in), sessions, health check, achievements, inventory and orders. New players set their character stats as step 2 of sign-up. Split into tabs: Overview, Coach (trainers only), Rewards, Packs & shop, Me; `profile.html#rewards` (or any section id such as `#packs`) opens that tab.
- `admin.html`: admin dashboard (admins only): key numbers, charts for sessions per week and per trainer, member growth and ranks, trainer occupancy, all bookings (with cancel) and all members with their details. Split into tabs: Overview, Bookings, Finances, Team, Members, with counters for things waiting (e.g. `admin.html#finances`).
- `archive/webshop-v1/`: the old webshop, kept for reference
- `archive/img/`: photos no longer used on the site

## Phones
- A bar at the bottom (Home · Book · Scores · Profile · Menu) replaces the ☰ button; Scores jumps to the high scores, Menu opens the same menu (with Contact).
- Section descriptions (and the price cards in Level 04) sit behind a "Read more" button; elements marked
  `data-more` in `index.html` are hidden on phones until it's tapped.
- Shorter home page: one main button, two upcoming sessions, the steps and classes as swipe rows, the XP table and
  the map behind a button, the schedule as a compact week (only days with open hours, times as small buttons).
- In the profile the first 4 achievements show (unlocked first), the rest behind "See all".
- The closed menu and shopping bag are hidden, so nothing can make the page wider than the screen.
Desktop is unchanged. The phone rules live in the `@media (max-width: 640px / 760px)` blocks at the end of `style.css`.

## Code
- `game.js`: shared core on every page: Supabase login, player data, XP and levels, bookings, the Google Calendar schedule, the header player chip, login dialog and toasts. The shop catalog (`ITEMS`) and trainers (`TRAINERS`) live here too.
- `supabase/schema.sql`: database tables, security rules and server functions
- `schedule.js`: weekly booking board and quest board on the home page
- `admin.js`: admin dashboard
- `script.js`, `shop.js`, `profile.js`: page-specific behaviour
- `style.css` (shared + home), `shop.css`, `profile.css`, `admin.css`

## Server (Supabase)
Accounts and all data live in Supabase (project `zdwlihbsmqiggpyensxc`, region eu-west-1). The website only uses
the public publishable key; the rules in `supabase/schema.sql` decide what each visitor can see and do:
- players read only their own data; admins (`admin_emails` in the `app_config` table) read everything;
- nobody writes to the tables directly: booking, cancelling, saving stats and orders go through
  database functions that check the rules and award XP on the server;
- two people can never book the same hour (unique constraint);
- order totals and XP are recalculated from the prices in the `shop_items` table.

**Setup / updates:** Supabase → SQL Editor → paste all of `supabase/schema.sql` → Run. Running it again after an
update is safe. Settings such as XP per session, booking notice, weeks ahead and admin emails are rows in `app_config`.

**Auth settings:** Authentication → URL Configuration: set the Site URL to where the site is hosted and add
`<site>/**` to the Redirect URLs, so confirmation and password-reset links come back to the site. Supabase's built-in
email only reaches your own team; add your own SMTP (Authentication → Emails → SMTP settings) before real members sign up.

## Schedule (Google Calendar)
The booking board reads the public LEVEL-UP Google Calendar through the `calendar_feed` function (cached 10 minutes).
Event titles decide what an event does:
- **"Filip available"**, **"Maxim beschikbaar"**, **"Pieter available"**: open hours for that trainer, split into
  1-hour slots. Recurring events work.
- A title with **"group"** or **"groep"**: shown on the board as a group session (title, time, first part of the location).
- **Anything else** (intakes, days off): blocks the trainer named in the title, or Pieter when no trainer is named.
  These titles are never shown on the site.

**Opening hours** are set in the admin dashboard → **Opening hours**. On desktop that is a **team planner**
(`hours-planner.js`): every trainer in one week view. *Every week*: drag in an empty spot to add hours for the selected
trainer, drag a bar to move it, drag its top/bottom edge to change the times, click it to edit, delete or copy it to
other days. *Specific week*: the real dates with days off, extra hours and booked sessions; drag to add extra hours,
drag over (or click) a block to close those hours that day. Trainer checkboxes show or hide trainers; "List view"
switches to the list editor, which small screens always use. Each trainer also manages their own hours in their
profile → Coach panel → **My opening hours**: the same week planner on desktop (only their own card), the list
editor (`hours-editor.js`) on small screens or via "List view". In both, and each
trainer manages their own in their profile → Coach panel → **My opening hours** (same editor, `hours-editor.js`):
- **Every week:** blocks like Wednesday 19:00–21:00. Click a block to change or move it, ✕ to delete it.
- **Extra hours on one date** or **closed on one date** (day off, holiday, all day or a few hours).
- 🔒 Hours with a booking or request are locked: they can be made longer, but not removed, shortened, moved
  away or closed (the database refuses it too). Cancel or move the session first.
- Notes on days off are only visible to the admin and the trainer.
- "Filip available" events in the Google Calendar still add hours; other calendar events still block them.
They're stored in the `trainer_hours` table. The hours in `TRAINERS` in `game.js` (Pieter Wednesday 19–21 and
Saturday 17–20, Filip Wednesday 13–18, Maxim Sunday 9–18) were copied into it once and are only used when the
database can't be reached. Trainers can overlap: the training area fits two trainers with their clients.

## Trainers and bookings
Trainers (name, photo, colours, fallback hours) live in `TRAINERS` in `game.js`, and their ids in the `trainers`
table in Supabase. Sessions are 1 hour, need at least 12 hours notice and can be booked up to 4 weeks ahead.
Clients earn 75 XP per booking and 25 XP for the first stats check-in each week; trainers earn 100 XP per session and 50 XP per unique client.
Trainers sign up as "Personal trainer" (or apply later from their profile). The admin gets an email and a pop-up,
and approves the application in the admin dashboard: either linked to an existing trainer card (Filip, Maxim) or as a
new trainer card, which then appears in the team, the schedule filter and the booking board automatically. Coaching
XP goes to the trainer's own account, so the level on the team card and in the profile is the same.

## Booking flow (anti-cheat)
1. A player sends a booking request: status **pending**, the hour is reserved, no XP yet.
2. The trainer gets a pop-up when logged in (and an email copy when their account is linked) and
   **confirms** or **declines**. A declined request frees the hour. Admins can do this for any trainer.
   A request nobody answers within 48 hours (and at the latest 12 hours before the session, with at least
   2 hours to answer) **expires**: the hour opens up again and the player gets an email.
3. From the day of the session the trainer (or an admin) settles it:
   - **Reward**: the player gets 75 XP, the trainer 100 XP (+50 for a new player);
   - **No-show**: the player didn't come, the session is charged in full, no XP.
   Trainers can do this up to 7 days after the session; after that only an admin can. The trainer's pop-up
   and Coach panel list every session still to settle, the admin dashboard shows a reminder in Finances.
Players see the status (pending, confirmed, declined, completed, expired, no-show, late cancel) in their profile and on the schedule.

## Updates show up right away
The pages load `style.css?v=…`, `game.js?v=…` etc. Change that number (in all four HTML pages) with every update,
so browsers and the installed app fetch the new files instead of a saved copy (GitHub Pages lets them keep files
for 10 minutes).

## Phones: looping rows
On phones the steps (Level 01), classes (Level 02) and team (Level 03) are swipe rows that glide to the left in an
endless loop (`loopRows` in `script.js`): each row gets one copy of its cards, and when the first set has passed it
jumps back by one set. Touching a row pauses it; it starts again 3 seconds after you let go. Off for "reduce motion".

## Loading screen
Every page has a game-style loading screen (`#boot`: logo, progress bar, current step and a random tip). It only
appears when loading takes longer than 0.35 s, shows the real progress of the startup requests (which now run in
parallel) and closes as soon as the data is in; CSS hides it after 12 s as a safety net. Tips: `BOOT_TIPS` in `game.js`.

## App (installable)

The site is a progressive web app: people can install it on their phone like an app, without an app store.

- `manifest.webmanifest`: name, icons (`img/app/`), colours, full-screen mode and shortcuts (Book, Account, Shop).
- `sw.js`: the service worker. Pages, scripts and styles always come from the network, so the app is always the
  newest version; images and fonts are cached. Without a connection pages show `offline.html`. Supabase and payments
  are never cached. Change `VERSION` in `sw.js` to clear old caches.
- Install: Android / Chrome shows a "Get the app" button (menu and a banner on phones, at most once every 3 weeks
  after "Not now"); iPhone shows the Share → Add to Home Screen steps. My account → Me has a "LEVEL-UP app" panel.

## Push notifications

Players and trainers can turn on notifications (My account → Me, after booking, or in the coach panel). They get:

- **Players:** session confirmed, request declined or expired, reminder the day before, +XP after a session,
  no-show, free session earned, pack active, cancelled by LEVEL-UP.
- **Trainers** (linked account): new session request, request withdrawn, cancellation and late cancellation.

How it works: the website saves the phone's push subscription (`push_subscriptions`); database triggers on
bookings, rewards and packs queue messages in `push_outbox`; the Edge Function `push` encrypts and sends them
(Web Push with VAPID; Google, Apple and Mozilla all use this). The site calls `/push/flush` right after each
change, so messages go out within seconds. Logging out unlinks the phone from the account.
On iPhone, notifications only work in the home-screen app (iOS 16.4 or newer).

### Switching it on (once)
1. **Deploy the function:** Supabase → *Edge Functions* → *Deploy a new function* → *Via Editor*. Name it exactly
   `push`, replace the example code with everything in `supabase/functions/push/index.ts`, deploy.
2. **Turn off JWT verification** (Edge Functions → push → *Details* → "Enforce JWT verification" off → Save).
   The function only ever sends what the database queued, so anyone may ask it to send.
3. **Turn it on yourself:** My account → Me → *Turn on notifications*. The first time, the function makes its own
   key pair (`push_keys`, readable only by the server): there is no key to copy or keep secret. You get a test message.
4. **Reminders and expired requests** (recommended): these happen without anyone clicking, so let Supabase call the
   function every 10 minutes. SQL Editor:

   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select cron.schedule('levelup-push', '*/10 * * * *', $$
     select net.http_post(url := 'https://zdwlihbsmqiggpyensxc.supabase.co/functions/v1/push/flush',
                          headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb)
   $$);
   ```
   (Stop it with `select cron.unschedule('levelup-push');`.)

The admin dashboard shows a "To do: push notifications" card until step 3 is done.

## Health questionnaire

Before a client's first booking, the booking pop-up asks 8 short health questions (heart, chest pain,
dizziness, joints, medication, pregnancy, recent surgery, other) plus a disclaimer they tick and sign with
their name. A "yes" asks for a short explanation and advises them to check with a doctor first.

- The server refuses a booking without a valid questionnaire (`book_session`). It stays valid for
  `health_form_months` (12) months; after that the client confirms it again at their next booking.
- Clients can view and update their answers under **Health check** in My account.
- Trainers see a ⚠ **Health info** flag (the yes answers and the explanation) on the bookings of their
  clients; the admin sees it in the admin panel. Nobody else can read the answers (`health_forms` RLS).

## Rewards (free sessions)

- **Loyalty card:** every `loyalty_sessions` (20) completed sessions earn a free 1:1 session. Free sessions
  themselves don't count towards the card.
- **Rank rewards:** a free 1:1 session at **Champion** (LVL 12) and at **Legend** (LVL 16), where Legend also gets
  a LEVEL-UP hoodie. Warrior has no reward. Trainers' own accounts don't get rank rewards (they earn XP by coaching).
- A voucher is valid for `reward_valid_months` (3) months, for a 1:1 with any trainer, and replaces the intro price,
  a pack credit or a payment. In the booking window the player ticks "Use a free session".
- A declined, expired or freely cancelled request gives the voucher back; a late cancellation or a no-show uses it up.
- Money: the session is booked at €0, and LEVEL-UP still pays the trainer's normal fee (on the owner's own card the
  fee is €0). It shows in the finance overview as a charged session with €0 revenue.
- Players see their loyalty card, free sessions and rank rewards under **Rewards** in My account and get a pop-up
  when they earn one. The admin dashboard has a **Rewards** panel with open free sessions and the Legend hoodies
  to hand out ("Hoodie given").
- When the SQL runs, members who already earned rewards get them right away.

## Cancellations
- Players cancel for free up to **24 hours** before the session (and can always withdraw a pending request).
- A confirmed session cancelled later is a **late cancellation**: charged in full, the trainer keeps their fee,
  the hour opens up again. The site warns the player before they confirm.
- Admins can always cancel for free.
The numbers are rows in `app_config`: `free_cancel_hours`, `reward_window_days`, `confirm_hours`, `confirm_cutoff_hours`
(the texts on the site say 24 hours / 7 days, so update `FREE_CANCEL_HOURS` and `REWARD_WINDOW_DAYS` in `game.js` too).

## Prices and payouts
| What | Client pays | Trainer gets | Venue keeps |
|---|---|---|---|
| 1:1 session | €60 (or the trainer's own price) | €40 (or the trainer's own fee) | the rest |
| First session (a player's very first booking) | €30 | full fee (€40) | €30 − fee (you cover the discount) |
| Duo (2 people, 1 trainer, 1 hour) | €80 in total | €50 | €30 |
| Pack credit (5 for €280, 10 for €540) | €56 / €54 per session, paid up front | full fee (€40) | the rest |
Sessions with Pieter (the owner) keep the full price. Price, fee, how the price was set (standard, intro, pack or duo)
and the pack are saved on every booking, so later price changes never alter past sessions.
- **Packs:** a player requests a pack in their profile (you get an email), you send payment details and press
  **Mark paid** in the admin dashboard; the credits become active and the player gets an email. Every 1:1 booking
  uses a credit automatically; a declined or expired request or a free cancellation gives it back.
- **Price per trainer:** admin dashboard → Finances → Prices per trainer. Empty = the default.
- The numbers are rows in `app_config`: `session_price`, `trainer_fee`, `intro_price`, `duo_price`,
  `duo_trainer_fee`, `packs` (JSON list of `{size, price}`) and `owner_trainer_id`. The site reads them live.
- A session counts as earned once it is rewarded (completed), marked as no-show, or cancelled late by the client.
- Trainers see their earnings in their profile (Coach panel): earned, still to receive, paid out and expected.
- The admin dashboard has a **Finances** panel (revenue, your share, owed per trainer with **Mark paid**,
  packs sold) and a **Session packs** panel for pack requests.

## Finance overview and statements
Admin dashboard → **Finances**:
- **Week / Month / All time** with ◀ ▶ to browse back: session revenue, trainer fees, your share and packs sold
  for that period (sessions by session date, packs by payment date). "Right now" shows what is owed to trainers,
  what is still to collect at the HQ, what is booked ahead and how many pack credits are unused.
- **Overview per week / month:** the last 12 weeks or months (all time: every month since the first booking) with a
  total row. **Download overview (CSV)** exports it; **Download sessions (CSV)** exports every charged session in the
  selected period with price, trainer fee, venue share and payment.
- **Monthly statements per trainer:** pick a month, then **PDF** (opens a printable statement: use "Save as PDF") or
  **CSV**. It lists every charged session (completed, no-show, late cancellation) with the trainer's fee, the total,
  what was already paid out and what is still to receive: the basis for the trainer's invoice to you.
  Trainers download their own statement in their profile (Coach panel).
CSV files use `;` and decimal commas, so they open directly in Excel with Belgian settings.

## Payments
Players choose how to pay when they book (and when they buy a pack):
- **Online (recommended, preselected):** Mollie (Bancontact, card, Payconiq…). The booking holds the hour for
  20 minutes while they pay; the request only reaches the trainer once it's paid. If a paid session is declined,
  expires or is cancelled for free, the money is refunded automatically through Mollie. A pack paid online is
  active right away.
- **At the headquarters** (Hoogstraat 40, 9308 Aalst): the request goes to the trainer straight away. The admin
  presses **Paid at HQ** in the Bookings table once the money is in (Finances shows the total **To collect**).
  Players can still switch to paying online from their profile. If they cancel for free after paying at the HQ,
  the admin gives the money back and presses **Refunded**.
- Pack credits need no payment. Late cancellations and no-shows stay charged (no refund).

The website never sees the Mollie key: payments go through the Supabase Edge Function in
`supabase/functions/payments/index.ts`, which creates the payment, receives Mollie's webhook and does refunds.

### Setting up online payments (once)
1. **Mollie:** create an account at mollie.com. Under *Developers → API keys* you get a **test key**
   (`test_…`) right away; the **live key** (`live_…`) comes once Mollie has verified the business.
   Switch on the payment methods you want (Bancontact, cards, Payconiq) under *Settings → Payment methods*.
2. **Deploy the function:** Supabase → *Edge Functions* → *Deploy a new function* → *Via Editor*. Name it
   exactly `payments`, replace the example code with everything in `supabase/functions/payments/index.ts`, deploy.
3. **Turn off JWT verification** for the function (Edge Functions → payments → *Details* → "Enforce JWT
   verification" off → Save). Mollie's webhook can't log in; the function checks the player itself.
4. **Add the key as a secret:** *Edge Functions → Secrets* → add `MOLLIE_API_KEY` with your test key.
   Never put the key in the website code or send it to anyone.
5. **Switch it on:** SQL Editor → `update public.app_config set value = 'on' where key = 'online_payments';`
6. **Test:** book a session and pay; Mollie's test page lets you choose *Paid*, *Failed*, *Canceled*…
7. **Go live:** replace the `MOLLIE_API_KEY` secret with the live key.

To turn online payment off again: set `online_payments` back to `off` (everyone pays at the HQ).

## High scores
Under the team cards: an arcade-style board with a podium for the top 3 and 25 players in total, with two tabs:
**All time** (total XP) and **This month** (XP earned since the 1st of the month, Brussels time; a fresh race every
month). Equal scores are ordered by who got there first. Your own row is highlighted (also when you're below 25th),
with how much XP you need to pass the player above you. Player name and level only, never email. Trainers are left
out (their level is on their card). Players can hide themselves in their profile under Account.
On phones the middle button of the bottom bar (Scores) jumps here.

## Colours (rank themes)
The base look is "Carbon": real black with neutral grey cards and a neon green main colour (tokens at the top of
`style.css`). When a player is logged in, the whole site takes the colours of their rank: Rookie green, Trainee
blue, Athlete purple, Warrior orange, Champion red, Legend gold (see "Rank colours" at the bottom of `style.css`).
`game.js` sets `<html data-rank="1…5">` and remembers it, so the next page opens straight in the right colour.
Visitors, logged-out people and Rookies see green. Under Account, "Always use Carbon green" keeps the green look on that device. Rank badges and avatars keep their own rank colour.

## Profile photos
Players upload a photo with the 📷 button on their avatar (Me → top of the page) or under Account → Profile photo.
The photo is cropped square and shrunk to 320 px in the browser before upload (so it stays small and fast), then
stored in the Supabase Storage bucket `avatars`, in a folder named after the player's id. Everyone can only upload,
change or delete files in their own folder. The photo shows on the high scores (podium and rows), the page header,
the account page, coach booking requests and in admin. Remove sets it back to the letter. As admin you can remove
someone's photo in the member details (Remove photo). The bucket and its rules are created by `supabase/schema.sql`.

## Adding a shop item
Add an entry to `ITEMS` in `game.js` (id, name, price, category `merch` or `tools`, rarity, image, optional sizes,
perks, description) and the same id, name and price to the `shop_items` table in Supabase.
