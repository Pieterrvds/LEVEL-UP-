# LEVEL-UP
Personal training platform with a retro game theme: players and personal trainers meet, train and level up together.

## Pages
- `index.html`: home page: quest board with the next open sessions, the platform + XP table, classes, team with trainer levels and high scores, weekly booking schedule, contact
- `shop.html`: item shop for merch and tools. Every €1 spent = 10 XP, and complete sets unlock achievements. Checkout via PayPal; each order is emailed to the LEVEL-UP inbox (FormSubmit) and the buyer gets an automatic confirmation.
- `profile.html`: player profile with level, rank, XP, character stats (BMI, calories, protein, weight progress, weekly check-in), sessions, workout log, achievements, inventory and orders. New players set their character stats as step 2 of sign-up.
- `admin.html`: admin dashboard (admins only): key numbers, charts for sessions per week and per trainer, member growth and ranks, trainer occupancy, all bookings (with cancel) and all members with their details
- `archive/webshop-v1/`: the old webshop, kept for reference
- `archive/img/`: photos no longer used on the site

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
- nobody writes to the tables directly: booking, cancelling, logging workouts, saving stats and orders go through
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

A trainer without any "available" events falls back to the hours in `TRAINERS` in `game.js`.

## Trainers and bookings
Trainers (name, photo, colours, fallback hours) live in `TRAINERS` in `game.js`, and their ids in the `trainers`
table in Supabase. Sessions are 1 hour, need at least 12 hours notice and can be booked up to 4 weeks ahead.
Clients earn 75 XP per booking and 25 XP for the first stats check-in each week; trainers earn 100 XP per session and 50 XP per unique client.
Link a trainer to their account by filling in `email` in the `trainers` table (Pieter is linked by default): their coaching
XP then goes to that account, so the level on the team card and in the profile is the same.

## Booking flow (anti-cheat)
1. A player sends a booking request: status **pending**, the hour is reserved, no XP yet.
2. The trainer gets a pop-up when logged in (and an email copy when their account is linked) and
   **confirms** or **declines**. A declined request frees the hour. Admins can do this for any trainer.
3. On the day of the session the trainer (or an admin) presses **Reward**: the player gets 75 XP, the trainer
   100 XP (+50 for a new player). The server only allows this on the day itself, and only once.
Players see the status (pending, confirmed, declined, completed) in their profile and on the schedule.

## High scores
Under the team cards: the top 10 players by XP (player name and level only, never email). Trainers are left out
(their level is on their card). Players can hide themselves in their profile under Account.
Every booking and cancellation is emailed to the LEVEL-UP inbox, the client gets an automatic confirmation and can
add the session to their own Google Calendar.

## Adding a shop item
Add an entry to `ITEMS` in `game.js` (id, name, price, category `merch` or `tools`, rarity, image, optional sizes,
perks, description) and the same id, name and price to the `shop_items` table in Supabase.
