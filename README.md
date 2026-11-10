# LEVEL-UP
Personal training platform with a sports-game look ("FC Ultimate"): players and personal trainers meet, train and level up together.

## Pages
- `index.html`: home page: "Up next" card with the next open sessions, how it works + XP table, trainings, coaches with trainer levels and high scores, weekly booking schedule (on phones a strip of 7 days, one day at a time), contact (one address line, small social buttons; on phones the form opens on request). Coach cards show the open hours in the coming 7 days on the photo ("Only 2 spots left this week") and their specialties as chips. Section intros are one short sentence, no "Read more" buttons. A "Highlights" pop-up (hero button and footer) shows six posters: the logo and five exercises in `img/highlights/` (the first photos and video are in `archive/highlights/`). Behind the hero: a black-and-white CrossFit box, `img/hero-box.jpg` (`hero-box-small.jpg` on phones), Unsplash photo `photo-1623874514711-0f321325f318` under the free Unsplash licence (commercial use allowed, no credit required)
  Sections in order: Level 1 · How it works, Level 2 · Training, Level 3 · The coaches (one row that scrolls sideways,
  ◀ ▶ buttons on a computer), Level 4 · High scores, Reviews, Level 5 · Schedule, Level 6 · Contact, Level 7 · Questions.
- `shop.html`: item shop for merch, tools, fuel (drinks and bars) and limited drops. Every €1 spent = 10 XP, and complete sets unlock achievements. Checkout via PayPal; each order is emailed to the LEVEL-UP inbox (FormSubmit) and the buyer gets an automatic confirmation. `shop.html?fridge` is the fridge mode behind the QR code on the fridge (see Shop below).
- `profile.html`: **your page and your account in one**, and the page of any other member or coach (see "Member pages"). On your own page only you see the tabs: My page (what others see), Overview (sessions, group classes, likes), Coach (trainers only), Rewards, Packs & shop, Body stats, Settings; `profile.html#rewards` (or any section id such as `#packs`) opens that tab. Sign-up is one step (name, email, password); body stats are filled in later in their own tab.
- `chat.html`: private chat between a player and a coach (see "Chat")
- `member.html`: only sends old links on to `profile.html` (the member pages used to live here)
- `admin.html`: admin dashboard (admins only): key numbers, charts for sessions per week and per trainer, member growth and ranks, trainer occupancy, all bookings (with cancel) and all members with their details. Split into tabs: Overview, Bookings, Finances, Team, Members, with counters for things waiting (e.g. `admin.html#finances`).
- `archive/webshop-v1/`: the old webshop, kept for reference
- `archive/img/`: photos no longer used on the site

## Phones
- A bar at the bottom (Home · Book · Scores · Chat · Menu) replaces the ☰ button; Scores jumps to the high scores, Chat opens
  the conversations (red badge = unread), Menu opens the same menu with **My profile** at the top (and Contact).
- Section descriptions (and the price cards in Level 5 · Schedule) sit behind a "Read more" button; elements marked
  `data-more` in `index.html` are hidden on phones until it's tapped.
- Shorter home page: one main button, two upcoming sessions, the steps and classes as swipe rows, the XP table and
  the map behind a button, the schedule as a compact week (only days with open hours, times as small buttons).
- In the profile the first 4 achievements show (unlocked first), the rest behind "See all".
- The closed menu and shopping bag are hidden, so nothing can make the page wider than the screen.
Desktop is unchanged. The phone rules live in the `@media (max-width: 640px / 760px)` blocks at the end of `style.css`.

## Code
- `game.js`: shared core on every page: Supabase login, player data, XP and levels, bookings, the Google Calendar schedule, the header player chip, login dialog and toasts. The shop catalog (`ITEMS`) and trainers (`TRAINERS`) live here too.
- `supabase/schema.sql`: database tables, security rules and server functions
- `schedule.js`: weekly booking board and the "Up next" card on the home page
- `admin.js`: admin dashboard
- `classes.js`: group classes for trainers and the admin: plan, who's coming, tick off, finish (profile Coach tab + admin)
- `room.js`: the admin's Gym room tab: how busy the room is, rentals, the room's settings
- `script.js`, `shop.js`, `profile.js`, `chat.js`: page-specific behaviour
- `levelup-celebrate.js`: the celebration animation, loaded by `game.js` when one is due (see "Celebrations")
- `i18n.js` + `i18n-nl.js`: Dutch translation layer (see "Dutch and English")
- `privacy.html`: privacy policy (NL + EN)
- `style.css` (shared + home), `shop.css`, `profile.css`, `admin.css`, `chat.css`

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
Clients earn 75 XP per booking and 25 XP for the first stats check-in each week (a second save on the same day corrects that day's check-in; earlier check-ins can be corrected under "My check-ins" with `update_body_stats`, which only changes the values and never gives XP); trainers earn 100 XP per session and 50 XP per unique client.
Trainers sign up as "Personal trainer" (or apply later from their profile). The admin gets an email and a pop-up,
and approves the application in the admin dashboard: either linked to an existing trainer card (Filip, Maxim) or as a
new trainer card, which then appears in the team, the schedule filter and the booking board automatically. Coaching
XP goes to the trainer's own account, so the level on the team card and in the profile is the same.

## Group classes
One trainer, several players (HIIT, CrossFit WOD, bootcamp …). Tables `class_sessions` and `class_signups`; every
`class_*` function is in `supabase/schema.sql` ("Group classes"). Settings in `app_config`: `class_price` (12),
`class_trainer_fee` (35, a fixed fee per class held), `class_xp` (50), `class_capacity` (12), `class_cancel_hours` (4),
`class_reminder_minutes` (90) and `class_chat_days` (60).
- **Planning:** a trainer plans their own classes in the profile's Coach tab, the admin plans any trainer's under
  admin.html → Group classes (`class_create`, once or every week for 4/8/12 weeks). Only the admin can change the price
  and the trainer fee. A class can't overlap the trainer's other classes or 1:1 sessions, and while it runs the
  trainer's 1:1 hours are blocked on the schedule (`slot_status`, `book_session`).
- **A card per kind on the home page:** under "Level 2 · Choose your training" every kind of group class (by its
  name: Social run club, Ring gymnastics …) has its own card, before the personal trainings. The kind is made by
  the first class with that name (`class_kinds`, filled by `class_create`/`class_update`) and shows as long as a
  class of that name is planned or was held in the last 30 days (`class_kinds()`). The card shows the next date and
  the places. Admin → Group classes → **Group trainings on the home page**: your own text (600 characters) and
  photo per kind (`admin_class_kind`); without them it gets a photo and text that fit its name (`GROUP_LOOKS` in
  `script.js`; `img/socialrunclub.jpg` is a free photo from Unsplash by Joshua Tsu).
- **Filters and the info window:** above the cards: All · Group classes · Personal training, and per trainer.
  A tap on a card opens a window with more about that training (text, price, XP, the coach, and for a group
  training the coming dates with Sign up); the button on a card still books straight away. The personal
  trainings and their texts are the `PERSONAL` list in `script.js`.
- **Changing a class:** **✎ Change** on a planned class opens the same form, filled in: name, trainer (admin),
  date, start, duration, places, location, note, and for the admin the price and trainer fee (`class_update`).
  Possible at any moment while the class is not finished or cancelled. Everyone signed up gets one message when
  the day, hour, place, name or trainer changed; a new price counts for who signs up from then on; places can't
  go below the number signed up. A class that gets another name moves to the group chat of that name.
- **No archive for the admin:** admin.html lists the classes to finish and the upcoming ones. A finished or
  cancelled class is gone from the list, unless money is still open on it (unpaid places, or a refund to give
  back by hand): those stay under "Money still open" until it's settled. Trainers keep "Past classes" in their
  Coach tab.
- **Signing up:** classes show on the schedule (`schedule.js`: the week board, the phone day list and the "Up next"
  board) with the places taken, e.g. 6/10. Everyone sees the numbers; the trainer and the admin see the names
  (`class_roster`). A player signs up (`class_signup`, health check first) and pays online (Mollie, type `class`) or at
  the class. Full: the waitlist; a place that opens up goes to the first on the list automatically, with a push.
  Free sign-out up to `class_cancel_hours` before (paid online = refunded automatically, paid at the desk = the
  admin gives it back and presses "Done"); later = charged.
- **During the class:** from 30 minutes before the start the trainer ticks off who is there (`class_mark`): the player
  gets `class_xp` right away (unticking takes it back) and a push. "Paid ✓" notes money taken at the class
  (`class_mark_paid`). "Finish class" (`class_finish`) makes everyone not ticked a no-show (charged, no XP), gives the
  trainer 100 XP + 10 per player present, and the trainer fee counts as earned: it shows in the trainer's earnings,
  their monthly statement and the admin's finances, and "Mark paid" pays it out with the 1:1 sessions.
- **Notifications:** the trainer gets a push for every sign-up, sign-out and waitlist move. `class_reminder_minutes`
  before the start (`_push_class_reminders`, run by the push Edge Function and its cron) the trainer gets the numbers
  (signed up, to pay at the class, first-timers, waitlist) and every player a LEVEL-UP line to get going plus the
  address and what to pay. Cancelling a class (one, or the rest of a weekly series) tells everyone, with the reason.
- **Announcement:** planning a class tells everyone (tick box "Tell all members", on by default): a news item behind
  the 🔔 and a notification with the class, the day and time, the trainer and the note the trainer wrote. A weekly
  series gives one message; cancelling the class takes the news away again. See "News and notifications for everyone".
- **Group chat:** one chat per kind of group class, by its name (`chat_threads.group_key`): every "Hyrox" class
  uses the Hyrox chat, every "Social run club" class the run club chat. It is made with the first class of that name
  and stays between classes. In it: everyone who signed up for a class of that group in the last `class_chat_days`
  (60) or a coming one, the trainers who give it, and every admin (admins are in all group chats). Each member can
  switch off its notifications (🔔 in the chat header). Only an admin can delete a group chat (🗑, with all its
  messages); a new class of that name starts a fresh one. Read positions and "muted" per member are in `chat_reads`.
  Old chats per class were merged into the chat of their group by `supabase/schema.sql`.
- **Online payment for classes** needs the updated `payments` Edge Function (it accepts `type: "class"`): redeploy
  `supabase/functions/payments/index.ts` when you switch online payments on.

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
**Home page extras.** The photo behind the hero hangs still behind the whole page (`.hero-bg` is fixed to the
screen): the hero text and every section after it slide over it as a second layer. The sections are dark glass
(a see-through background), the cards on them are solid. The shop works the same way, with a rack of dumbbells
behind it (`img/shop-bg.jpg`, `img/shop-bg-small.jpg`: a free photo from Unsplash by Rick Barrett / Ambitious
Studio, made black and white). The chat page has one too: a running track in a stadium (`img/chat-bg.jpg`,
`img/chat-bg-small.jpg`: a free photo from Unsplash by Anisa Ryanda Putri, made black and white), with the chat as the see-through layer.
How dark it all is sits in one place, at the top of that block in `style.css`: `--photo-o` (how strong the photo
shows) and `--layer-o` / `--layer-alt-o` (how solid the sections over it are). Level 1 · How it works is a small animated demo on a loop (`#howto`, `howItWorks` in `script.js`):
four scenes (sign up +50 XP, pick a trainer, book an hour, train and level up) with an XP bar that follows the
real XP rules. It plays only while it is on screen, a tap on a step jumps to that scene, and with "reduce motion"
on it doesn't play by itself.

On phones the classes (Level 2) and team (Level 3) are swipe rows that glide to the left in an
endless loop (`loopRows` in `script.js`): each row gets one copy of its cards, and when the first set has passed it
jumps back by one set. Touching a row pauses it; it starts again 3 seconds after you let go. Off for "reduce motion".

## Loading screen
Every page has a game-style loading screen (`#boot`: logo, progress bar, current step and a random tip). It only
appears when loading takes longer than 0.35 s, shows the real progress of the startup requests (which now run in
parallel) and closes as soon as the data is in; CSS hides it after 12 s as a safety net. Tips: `BOOT_TIPS` in `game.js`.

### Animated logo
`img/logo-anim.svg` is the logo stickman doing real pull-ups (SVG animation, 1.15 s per rep; each arm is one
smooth stroke hand → elbow → shoulder). The
loading screen shows it as an `<img>`, looping. In the header and footer `game.js` (`animateLogos`) points
`img.brand-logo` at a copy that does 3 reps: when the page opens (the footer one when it scrolls into view) and again on
hover or tap. It stays an `<img>` on purpose: Safari draws animated inline SVG blurry/grey on phones. Without the file
the plain `logo.JPG` stays; "reduce motion" on the phone/PC keeps the header/footer logo still.
To change the movement, edit and rerun `python3 tools/make-logo-anim.py` (pose, rise height and timing are at its top).

## App (installable)

The site is a progressive web app: people can install it on their phone like an app, without an app store.

- `manifest.webmanifest`: name, icons (`img/app/`), colours, full-screen mode and shortcuts (Book, Account, Shop).
- `sw.js`: the service worker. Pages, scripts and styles always come from the network, so the app is always the
  newest version; images and fonts are cached. Without a connection pages show `offline.html`. Supabase and payments
  are never cached. Change `VERSION` in `sw.js` to clear old caches.
- Install: Chrome on Android / computers can install with one tap ("Get the app"); every other phone browser gets the
  steps for that browser (Safari, Chrome or Firefox on iPhone; Samsung Internet, Firefox, Chrome on Android). A link
  opened inside WhatsApp, Instagram, Facebook, Messenger… can't install: the pop-up says so, with "Open in Chrome"
  (Android) and "Copy link". Banner on phones at most once every 3 weeks after "Not now"; My page → Settings has a
  "LEVEL-UP app" panel.

### Sign-up emails (confirmation, new password)
Supabase sends them. Its built-in sender only delivers to the addresses of the Supabase project team and at most
2 emails an hour, so for real clients set up your own sender once: Supabase → Authentication → Emails → SMTP Settings
(e.g. Brevo, free: 300 emails a day). Also check Authentication → URL Configuration: Site URL
`https://pieterrvds.github.io/LEVEL-UP-/` and redirect URL `https://pieterrvds.github.io/LEVEL-UP-/**`.
The log-in form has "Resend the confirmation email"; send limits show a clear message.

## The gym room: places and rentals
There is one room (12 m × 12 m), and the app now knows it. Rules, all checked on the server:
- **Places.** A 1:1 session takes one place, whoever the coach is. The room has `room_places` places (2 to start
  with; Admin → Gym room → Room settings). When they are all taken, that hour shows as taken for every coach and
  `book_session` answers "The gym is full at that time". Hours that already had more sessions stay as they are.
- **Group classes.** A class in the room takes all of it: no other class, 1:1 session or rental at that time, and
  the other way round a class can't be planned (or moved) on top of them; the message says what is in the way.
  A class outside (a run) has "This class is in the gym room" unticked in the class form (`uses_room` off) and
  takes nothing. Existing classes with run / loop / outdoor / walk / bike in the name were set to "outside" once.
- **Rentals** (Admin → Gym room). The admin enters them: who, a place in the room (a renter with their own PT
  client: 1 place, your coaches can train next to them) or the whole room (yoga, dance, a team building), the
  date, from–to in whole hours, once or weekly for 4 to 26 weeks, and a price per hour. The standard prices are
  in the settings: 15 for a place, 25 for the whole room in the daytime, 35 from 17:00 and in the weekend. In a
  weekly series a week where the room isn't free is skipped. The list shows what is coming, what each renter
  still has to pay for hours that are over ("All paid"), and cancelling (one, or this and every later week).
  Renters don't book or pay in the app; that is a possible next step.
- **How busy.** The same tab shows, per weekday and hour, in how many of the last 8 full weeks the room was used
  (1:1 sessions, classes in the room, rentals), the hours used and empty per week (of 07:00–22:00, 7 days) and
  the quiet blocks of 2 hours or more with what one renter would bring in. Only what is in the app counts.
- **Server:** table `room_rentals` (no direct access), column `class_sessions.uses_room`, `_room_load` (per hour:
  places used, whole room or not; feeds `slot_status` as trainer `*`), `_room_blocker` (what stands in the way),
  `admin_room`, `admin_rental_add`, `admin_rental_cancel`, `admin_rental_paid`, `admin_room_settings`.
  Rental income is not in the Finances tab yet.

## Chat
Players chat privately with a coach, like a messaging app (`chat.html`, `chat.js`, `chat.css`).
- **Start:** the **Chat** button on a coach card (it replaced the Instagram button) or "Start a chat" on the chat page.
  A coach can only chat once their card is linked to an account (trainer application approved with "link to an
  existing card", or `trainers.email` set); until then the button says they aren't on the chat yet.
- **Coaches** see the conversations their clients started; admins can't read other people's chats.
- **Search a member:** the search box at the top of the chat finds players and trainers by name (2+ letters; name,
  photo and role only, never emails). A trainer opens the usual coach chat; a trainer who looks up a player opens
  (or starts) the coach chat with them; two members get a private chat of their own (`member_id`), never a second one.
- **Unread:** red badge on the Chat tab (phones) and the chat icon in the header (computer); a pop-up at the top of
  any page when a new message comes in (tap = open it). A push notification arrives on phones with notifications on.
- **Opens at the newest message:** opening a conversation (from the list, a link or a notification) always lands
  on the last message, also on a phone; coming back to the app shows what came in meanwhile.
- **Live:** an open conversation checks for new messages every 3 seconds (right away when a push comes in), other
  pages every 20 seconds. Read receipts: "Seen" under your last message the other person has read.
- **Hearts:** tap the small heart next to someone else's message (or double-tap the message) to like it, tap again
  to take it back. Not on your own messages; there you see the hearts you got (with a number in a group chat). The
  other side sees it in the open chat within a few seconds. Quiet on purpose: no notification and no celebration.
  Table `chat_message_likes`, function `chat_like`; `chat_thread` returns `likes`/`liked` per message and `hearts`.
- **Server:** tables `chat_threads` + `chat_messages` (no direct access), functions `chat_list`, `chat_open`,
  `chat_thread`, `chat_send` (max 2000 characters, 20 messages a minute) and `chat_unread` in `supabase/schema.sql`.
- **Welcome from the head coach:** every new account gets one chat message from the head coach (`owner_trainer_id`
  in `app_config`): a welcome, what you can do in the app and who to turn to. Members who were already there got it
  once too. It is an ordinary message (red dot on the chat icon, the "new message" notice, a push for who has
  those on, never at night) and the member can answer it. The text is `welcome_chat_text` in `app_config`
  (`{name}` = the member's first name; empty = no welcome); `_welcome_chat` in `supabase/schema.sql`, called from
  the sign-up trigger. Coaches get none. A newest message that is taller than the screen opens at its first line.

## Bonus XP (admin)
Admin → Members: **+ XP** next to a member (or "Reward with XP" in their details) gives extra XP with your own reason,
e.g. for helping LEVEL-UP; a negative number takes XP back (a correction). The player gets a push notification
("🎁 +50 XP from LEVEL-UP" + your reason) and sees it in their XP log. You can reward yourself too. Server:
`admin_grant_xp` in `supabase/schema.sql` (admins only, max 5000 XP at once, reason 3–140 characters).

## Push notifications

Players and trainers can turn on notifications (My page → Settings, after booking, or in the coach panel). They get:

- **Players:** session confirmed, request declined or expired, reminder the day before, +XP after a session,
  no-show, free session earned, pack active, cancelled by LEVEL-UP.
- **Trainers** (linked account): new session request, request withdrawn, cancellation and late cancellation.
- **Bonus XP** from the admin, with the reason.
- **Trainers, open requests:** a request that still isn't answered after 3 hours gives one reminder ("⏳ Lien is
  waiting for your answer", or one message for several requests), and a last call when under 3 hours are left
  before it expires. With that last call the admins hear it too. Never at night.
- **Everyone, news:** a new group class, a new product, a discount or a message from the admin (see "News and
  notifications for everyone").
- **Both:** a new chat message (title = who sent it, text = the start of the message; not shown when that chat is
  already open on screen).

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
3. **Turn it on yourself:** My page → Settings → *Turn on notifications*. The first time, the function makes its own
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

## News and notifications for everyone
The 🔔 in the header (also for visitors) lists the latest news: new group classes, new products, discounts and
messages from the admin. The same items go out as a notification to everyone with notifications on.
So it never feels like spam:
- at most **2 news notifications per person per 24 hours** (more news still shows behind the bell);
- **nothing at night**: news and reminders queued between 22:00 and 8:00 go out at 8:00 (`push_outbox.send_after`);
- a weekly class series is one message; a product is "new" once and gets at most one discount message every 3 days;
- players switch news off under My page → Settings → **News notifications** (their own sessions, chat and XP always
  come through); the person who made the news gets a copy too, so they see what their members see;
- news about a class that started, a cancelled class or a discount that ended disappears by itself.

**Admin → Overview → Message to everyone** sends your own message (title, optional text, where it opens), at most 3
a day, and lists what is behind the bell now (✕ removes an item).
Server: table `news`, `_broadcast` and `admin_announce` in `supabase/schema.sql`; the list comes with `pricing_info`,
so it costs no extra request. What someone has seen is remembered on their device.

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
Confetti falls in a loop over the number one of the podium (`HS_CONFETTI` in `schedule.js`, `.hs-confetti` in
`style.css`: CSS only, takes no clicks, off with "reduce motion").
On phones the middle button of the bottom bar (Scores) jumps here.

## Dutch and English (NL | EN)
The site is **Dutch by default**, with an **NL | EN** switch in the menu and the footer (remembered per browser;
`?lang=en` or `?lang=nl` in a link sets it too). The pages are written in English; `i18n.js` translates every English
text the moment it appears (pages, pop-ups, messages, errors from the server, the Q&A, the share-card image) with the
dictionary in **`i18n-nl.js`**, and switches dates and numbers to Belgian Dutch. Push notifications are translated on
the phone by the service worker (`sw.js`), in the language the site last used there. The admin dashboard and the
emails stay English.
- **New or changed English text?** Add a line to `i18n-nl.js`: `"English text": "Nederlandse tekst",`. A changing part
  (name, number, date) is written as `{0}`, `{1}`… in both, e.g. `"{0} weeks in a row": "{0} weken op rij"`. Lines
  made of parts joined with " · " are translated part by part. Text that must never be translated (user content)
  can be wrapped in an element with `data-no-i18n`.
- Rank names (Rookie … Legend), XP and LVL stay the same in both languages.

## Privacy
`privacy.html` (+ `privacy.css`) holds the privacy policy in Dutch and English (the site language decides which one
shows). It's linked in every footer, the sign-up window and the health check. It describes what the site really
stores and which services it uses; update it when something changes (new service, new data), and have it checked if
you're unsure about anything legal.

## Reviews, Q&A and link preview
- **Reviews** (home page, above the schedule): only real clients. Players with at least one completed session write
  one under My account → Overview ("How is your training going?": 1–5 stars + max. 300 characters). Pieter gets an
  email and approves, hides or deletes it under Admin → Overview → Reviews. A review a client sent another way
  (WhatsApp, Google…) can be added there too, with their permission. Their profile photo shows with it when a
  member has that first name ("Hilke VdB" → the member Hilke; with two of that name, the one whose last name
  starts with the same letter): looked up once (`_review_member`, `reviews.photo_user`). Wrong person or nobody
  found: pick the member yourself under the review ("Photo of member", `admin_review_photo`), or "No photo".
- **One row that glides:** the reviews are one row of cards; when they don't fit next to each other (a phone,
  or many reviews) the row glides to the left in a loop like the trainings and the coaches (`loopRows` in
  `script.js`), and you can swipe it.
- **Example reviews:** `supabase/schema.sql` adds four example reviews once (`reviews.sample`), so the row is
  filled while there are few real ones. They are marked **Example** on the site (an invented review must never
  pass for a real client's: that is misleading and not allowed) and don't count in the average. Delete them under
  Admin → Reviews once real reviews are in; they are not added again. The section stays hidden until there is an
  approved review; it shows the first name and current profile photo. Editing a review sends it back for approval.
- **Q&A** (`#faq`, home page): the answers are built in `script.js` (`renderFaq`) with the live prices and rules,
  so they change along when prices change in admin.
- **Contact section:** three quick-action tiles (Call · WhatsApp · Route), the address card, and the socials as
  large brand-coloured cards (Instagram, WhatsApp community, Facebook) with Follow / Join / Like buttons.
- **Link preview:** `img/og-image.jpg` (1200×630) with the Open Graph tags on every page, used by WhatsApp,
  Facebook, LinkedIn… WhatsApp keeps old previews for a while; new shares show the new image.

## Celebrations (levelup-celebrate.js)
A full-screen moment (a gymnast doing a muscle-up on the rings) for three things, each shown **exactly once**:
- **Purchase:** when a payment is really in: a shop order paid with PayPal, a session pack (paid online or marked
  paid at the desk), a session or group class paid online. The subtitle names the product. After a shop payment it
  plays first and the order summary opens after it. A tab paid at the desk only gets the usual message.
- **Ranking:** when the player's place on the all-time high scores is better than the last time they were told
  (`profiles.rank_place`). A lower or equal place is only remembered; hidden players and trainers have no place.
- **Like:** for the player who **gets** the like. Online: within the 20-second chat check (at once when a push
  arrives); else at their next visit. Several likes become one: "3 new likes!" with the names.

How it works: the server puts each one in the table `celebrations` (`_celebrate`); `my_data` and the chat check tell
the website what is waiting. `game.js` loads `levelup-celebrate.js` the first time one is due (once, for every page),
sets the calm, full version as the default right after loading (`defaults.speed = 0.8`, `defaults.short = false`),
claims it (`celebrations_claim`: marks it seen and says whether this tab got it, so two tabs or phones never both
play it) and plays them one after another, waiting for `.done`. Order: purchases, ranking, likes.
It never plays over a dialog, the bag, the loading or promotion screen, while typing in a field or during a payment:
then it waits. Not on `admin.html`. After 30 days a waiting one just counts as seen.
`levelup-celebrate.js` is used as delivered (don't edit it): title and subtitle are passed in Dutch or English, and
the accent is the site's own colour (which changes with the player's rank).

## Member pages (profile.html: your own page with your account, and the pages of other members and coaches)
Tap someone's photo or name and their page opens: on the high scores (podium, rows, Player of the Month), in a
chat (the header, or a name in a group chat), in the likes on your own profile, under a photo comment, and on a coach
card ("Meet the team": the photo or name, and the small coach faces on the training cards).
`profile.html?u=<user id>` is a member, `profile.html?trainer=<trainer id>` a coach, without either your own page.
- **One page, also for yourself:** your own page is the same page others see, plus tabs only you see (Overview,
  Coach, Rewards, Packs & shop, Body stats, Settings). The first tab, **My page**, is exactly what others see, with your
  own buttons in it: 📷 on your photo, the text about yourself, "Add a photo" and Remove under your photos. `member.js` draws the top block and the My page tab, `profile.js` the
  other tabs; on someone else's page `profile.js` draws nothing.
- **One photo:** your profile photo is changed in one place (📷 on the photo at the top) and shows everywhere.
  For a coach it is also the photo on the coach card, in the calendar, the booking window and the chat
  (`trainer_list` returns `avatar_url`); a coach who uploaded nothing keeps the photo that came with the card.
- **Top:** a cover in the rank colour, photo, name, rank and level with the XP bar, place on the high scores, streak,
  Player of the Month, and the buttons: 💬 Chat, ♥ Like, and for a coach **Book**.
- **A coach's calendar:** the same week board and booking window as on the home page (`schedule.js`), for that coach
  only: pick an hour and book, or sign up for one of their group classes, without leaving the page. The home page
  keeps its own schedule with all coaches. `schedule.js` exposes `LevelUpSchedule.showTrainer(id)` for this.
- **About and numbers:** the line about themselves, a coach's specialties, level, sessions, players and price; XP,
  XP this month, sessions, group classes, likes and achievements.
- **Group classes:** "Going to" (the classes they signed up for, with "Join too →" or "You're going too ✓") and for
  a coach the classes they give. A tap opens the sign-up window.
- **Achievements** with their names, and **Lately**: group classes done, achievements unlocked, photos posted and
  Player of the Month, newest first.
- **Photos:** big, one under the other, each with a ♥ (tap again to take it back) and **comments**. A comment can
  get a ♥ too. The owner of the photo gets a notification for a comment (never for likes, and there is no celebration
  for these). You remove your own comment, any comment under your own photo, and an admin removes anything.
  At most 300 characters and 6 comments a minute.
- **What it never shows:** email, body stats, health questionnaire, payments, orders or 1:1 sessions.
- **Who sees it:** members see each other only when logged in. A coach page is public, like the coach card; visitors
  see the photos and counts but not the comments. A member can make their page private (Settings → Account →
  "Other members can see my page"): others then only see name and photo, and can't react to the photos.
- **Your own text and photos:** a text about yourself (up to 1200 characters, blank lines are kept; on your own
  page it shows the way others read it, with a ✎ Change button that opens it for writing), up to 12 photos with a caption, and
  on the My page tab; the private switch is under Settings → Account. Photos are shrunk in the browser (longest side 1280 px) and stored in the Storage bucket
  `avatars`, in the member's own folder, like the profile photo.
- **Moderation:** an admin sees every page and can remove any photo or comment; a removed photo's file is deleted too.
- Files: `profile.html`, `member.js`, `member.css` (the page), `profile.js`, `profile.css` (the account tabs). Server: `public_profile`, `set_profile`, `photo_add`,
  `photo_delete`, `photo_like`, `photo_comment`, `photo_comment_delete`, `photo_comment_like` and the tables
  `profile_photos`, `photo_likes`, `photo_comments`, `photo_comment_likes` in `supabase/schema.sql`.
  The privacy policy (`privacy.html`) describes all this.

## Likes (hearts on the high scores)
Logged-in players give each other a like by tapping the ♥ on someone's photo: on the podium, in the high score rows
and on the Player of the Month card. One like per player per week (Monday to Sunday); the number on the heart is
everything that player ever received, and a filled heart means you already liked them this week. The player gets a
push notification ("❤️ Lien gave you a like"), at most once per person per week. In the profile (Overview → Likes)
players see their total, this week's likes and who liked them. Visitors see the counts; tapping a heart asks them to
log in. You can't like yourself or players hidden from the high scores, and one account can give at most 40 likes a
day. Everything goes through `give_like` in `supabase/schema.sql` (table `player_likes`).

## Player card, promotions, Player of the Month and streaks
- **Share my card** (account page, under the player card): makes a 1080×1350 image in Ultimate Team style (photo,
  level, rank colour, total XP, sessions, streak, crown) with the site link. Phones open the share sheet
  (Instagram, WhatsApp…); computers get "Save image". Made in the browser (`drawPlayerCard` in `game.js`).
- **Promotion screen:** when a player reaches a new rank, a full-screen card reveal in the new colour appears once
  (per phone), with "Share my card". The rank last seen is remembered in the browser.
- **Player of the Month:** on the 1st, last month's #1 of the "This month" high scores (players only, not hidden)
  gets the crown for a month, +250 XP (this bonus doesn't count for the new month), and everyone with notifications
  gets "👑 Jonas is Player of the Month". It's settled by the first profile load of the month or by the 10-minute
  push job (`monthly_awards`, `_settle_player_of_month`). The winner shows in a banner on the high scores, with a
  crown chip on their card and share image.
- **Training streak:** weeks in a row (Monday–Sunday) with at least one completed session, shown from 2 weeks
  ("🔥 4 weeks in a row") on the player card and share image. Without a session (done or booked) this week, the
  card shows a gentle note, and on Thursday evening the push job sends one reminder ("Keep your 4-week streak").
  The reminder needs the 10-minute push job from "Push notifications" step 4.

## Style (FC Ultimate) and the backup of the old look
The site looks like a sports game menu: bold slanted letters (Barlow Condensed), slanted buttons and chips, rounded
cards with thin borders and soft shadows, and an Ultimate Team style player card on the account page (in the rank
colour). The display font is `--display` in `style.css`; every rule that uses it also gets `font-size-adjust`, so the
letter sizes from the old pixel font still fit. The FC details are in the "FC Ultimate" block at the end of `style.css`.
No sharp corners: everything has rounded corners in one family (cards 12px, list rows 10px, chips and tabs 6px,
faces round); see the "Rounded corners" block at the very end of `style.css`. Add new boxes to that block.

**Backup of the old pixel-arcade look:** the complete website and app as they were before this restyle are kept on
the GitHub branch `style/pixel-arcade` (commit 15210e6). You can browse it at
https://github.com/Pieterrvds/LEVEL-UP-/tree/style/pixel-arcade or download it as a zip from
https://github.com/Pieterrvds/LEVEL-UP-/archive/refs/heads/style/pixel-arcade.zip. To switch back, ask Claude to
"restore the pixel-arcade style from the branch style/pixel-arcade" (features added later are kept and only the look
is put back). Don't delete that branch.

## Colours (rank themes)
The base look is "Carbon": real black with neutral grey cards and a neon green main colour (tokens at the top of
`style.css`). When a player is logged in, the whole site takes the colours of their rank: Rookie green, Trainee
blue, Athlete purple, Warrior orange, Champion red, Legend gold (see "Rank colours" at the bottom of `style.css`).
`game.js` sets `<html data-rank="1…5">` and remembers it, so the next page opens straight in the right colour.
Visitors, logged-out people and Rookies see green. Under Account, "Always use Carbon green" keeps the green look on that device. Rank badges and avatars keep their own rank colour.

## Profile photos
Players upload a photo with the 📷 button on their photo at the top of their own page (the only place; Settings → Account
has "Remove my photo"). The photo is cropped square and shrunk to 640 px in the browser before upload (so it stays small and fast), then
stored in the Supabase Storage bucket `avatars`, in a folder named after the player's id. Everyone can only upload,
change or delete files in their own folder. The photo shows on the high scores (podium and rows), the page header,
the account page, coach booking requests and in admin. Remove sets it back to the letter. As admin you can remove
someone's photo in the member details (Remove photo). The bucket and its rules are created by `supabase/schema.sql`.

## Shop: fuel, limited drops, the tab and bundles
Everything is run from **admin → Shop**:
- **Products**: switch each product on or off, change its price, set the stock and the end date of a drop. New
  products start switched off, so nothing new shows until you turn it on. Leave stock empty for unlimited. A product
  with stock or an end date shows "Only N left" and a countdown; at 0 or after the date it shows Sold out / Drop ended.
  Before PayPal opens, the server checks the bag again (`shop_check`) and its prices are the ones charged.
- **Prices and discounts**: change the price in the product row. For a discount pick −10 % … −50 % (or type a sale
  price) and optionally an end date: the shop shows the normal price crossed out, a −% label, a countdown and a
  🔥 Sale filter; the XP counts on what the member pays. "Sale on a whole category" does this for everything, merch,
  tools, fuel or limited in one go, and "End all discounts" puts every price back. With "Tell members" ticked,
  members get one message when a product is new or goes on sale.
- **Fuel** (protein shake, bar, energy drink, water) is for the fridge at the gym. **The fridge**: print the poster with
  the QR code to `shop.html?fridge`. Members scan it, tap what they took and pay right away with PayPal, or put it
  **on their tab** (logged in, drinks and bars only, at most `tab_limit` euro open, default €30 in `app_config`). A wrong
  tap can be undone within 15 minutes. Open tabs appear under **Open tabs**: tap **Paid** when they pay at the desk;
  only then they get the XP (and a push). ✕ removes a line they don't pay for.
- **Bundles**: give a session pack a free item (e.g. 10 sessions + Season 1 Hoodie). It shows in the shop and the pack
  options; once that pack is paid it appears under **Gifts to hand out**, and **Handed out** puts it in their inventory.
- **Season 1 Hoodie** (`hoodie_s1`) is the first limited drop: 25 pieces, switched off until you set it live.

## Adding a shop item
Add an entry to `ITEMS` in `game.js` (id, name, price, category `merch`, `tools`, `fuel` or `limited`, rarity, image or
an emoji in `art`, optional sizes, perks, description) and the same id, name, price and category to the `shop_items`
table (in `supabase/schema.sql`, with `active false`). Then switch it on in admin → Shop.
