# LEVEL-UP
Personal training platform with a sports-game look ("FC Ultimate"): players and personal trainers meet, train and level up together.

## Pages
- `index.html`: home page: "Up next" card with the next open sessions, how it works + XP table, trainings, coaches with trainer levels and high scores, weekly booking schedule (on phones a strip of 7 days, one day at a time), contact (one address line, small social buttons; on phones the form opens on request). Coach cards show the open hours in the coming 7 days on the photo ("Only 2 spots left this week") and their specialties as chips. Section intros are one short sentence, no "Read more" buttons. The old "Highlights" pop-up is gone (its posters stay in `img/highlights/`; the cycling one is the picture of a cycling class). Behind the hero: a black-and-white CrossFit box, `img/hero-box.jpg` (`hero-box-small.jpg` on phones), Unsplash photo `photo-1623874514711-0f321325f318` under the free Unsplash licence (commercial use allowed, no credit required)
  Sections in order: Level 1 · How it works, Level 2 · Training, Level 3 · The coaches (one row that scrolls sideways,
  ◀ ▶ buttons on a computer), Level 4 · High scores, Reviews, Level 5 · Schedule, Level 6 · Contact, Level 7 · Questions.
- `shop.html`: the web shop (see "The web shop"): supplements, merch, tools, fuel (drinks and bars) and limited drops, with departments, search, product pages, a bag in the header and pickup or delivery. Every €1 spent = 10 XP, and complete sets unlock achievements. Checkout via PayPal; each order is emailed to the LEVEL-UP inbox (FormSubmit) and the buyer gets an automatic confirmation. `shop.html?fridge` is the fridge mode behind the QR code on the fridge (see Shop below).
- `profile.html`: **your page and your account in one**, and the page of any other member or coach (see "Member pages"). On your own page only you see the tabs, four of them: My page (what others see), My sessions (sessions, group classes, packs), Progress (rewards, achievements, ranks, body stats, likes, inventory) and Settings (notifications first, then account, health check); trainers also get Coach. `profile.html#rewards` (or any section id such as `#packs`) opens that tab, and the links of the earlier tabs (`#shop`, `#body`, `#settings`) still land right (`TAB_ALIAS` in `profile.js`). Sign-up is one step (name, email, password); body stats are filled in later in their own tab.
- `chat.html`: private chat between a player and a coach (see "Chat"); a phone has it as a page of `index.html`
- `member.html`: only sends old links on to `profile.html` (the member pages used to live here)
- `admin.html`: admin dashboard (admins only): key numbers, charts for sessions per week and per trainer, member growth and ranks, trainer occupancy, all bookings (with cancel) and all members with their details. Split into tabs: Overview, Bookings, Finances, Team, Members, with counters for things waiting (e.g. `admin.html#finances`).
- `archive/webshop-v1/`: the old webshop, kept for reference
- `archive/img/`: photos no longer used on the site

## Phones
- **Five pages next to each other**, with a bar at the bottom: **For you · Home · Chat · Book · Scores**. Tap one, or
  swipe sideways: **the page follows your finger** and its neighbour comes along; let go past a third of the screen (or
  flick) and it slides on, else it springs back. All five are parts of `index.html` (only that part shows,
  `html[data-view]`). The home page still holds everything, so scrolling it also passes the high scores and the
  schedule; Book and Scores are the same sections on their own. Each page remembers where you were. `game.js`
  "Phones: five pages" (`openSlide`, `setView`), `style.css` same title.
  - A logged-in member **starts on For you**; a visitor on Home (For you then tells what an account gives, the chat
    page asks to log in). Links keep working: `index.html#schedule` opens Book, `#scores` / `#highScores` Scores,
    `#chat` the chat, anything else its place on Home.
  - **The chat is a page of the home page** on a phone: `chat.js` runs in the section `#chat`, and only works (checks
    for messages, has a conversation open) while that page is on screen. A conversation has the address
    `#chat/t/<conversation>` (the back button of the phone returns to the list), `#chat/coach/<trainer>` opens the one
    with a coach. `chat.html` stays the chat on a computer; on a phone it sends you on to `index.html#chat…`, so
    notifications and old links keep working. `LevelUp.gotoChat({ t, coach })` picks the right one.
  - How the slide works: every page but the home page is one section. While two pages are next to each other, that
    one section "floats" (`.pg-float`, fixed to the screen) beside the other page, which stays the real, scrolled page;
    `transform` moves both. Home to Book or Scores (sections of the home page itself, never neighbours) can't float:
    there the browser slides a picture of the page (view transitions).
  - Speed: the pages that are not on screen stay built but undrawn (`content-visibility: hidden`, parked above the
    page; older browsers: `display: none`) and are measured once in an idle moment, so a page can come along the moment
    a finger asks. The rules name the parts of `<main>` with `[data-pg]` on purpose: with `main > *` the browser would
    work out the looks of the whole page again at every page change. Keep `data-pg` on every direct child of `<main>`
    in `index.html` (`game.js` marks a forgotten one).
  - A swipe does nothing on a row that scrolls sideways itself (trainings, coaches, the cards on For you, price cards,
    the photos of a post), in a window, a form field or an open conversation, with the menu open, or from the very
    edge of the screen (the phone's own back gesture).
  - "Reduce motion": nothing follows the finger; a clear swipe or a tap changes the page at once.
- The menu (☰) sits at the **top right** in the header, with **My profile** at the top (and Contact).
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
- `levelupy-admin.js`: the admin's Levelupy tab: who has the assistant, the model, the limits, what it knows, the use
- `supabase/functions/assistant/index.ts`: the Edge Function behind Levelupy (see "Levelupy")
- `mascot-looks.js`: what the mascot wears on his head through the year (see "The mascot's wardrobe")
- `posts.js`: a post (photos with a text, hearts, comments) and the window to make one; used by the member page and "For you"
- `foryou.js`: "For you", a member's own start screen (see "For you: the start screen and the weekly check-in")
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
Clients earn 75 XP per booking and 25 XP for the weekly check-in: one tap on "Check in" on the start screen, or the first save of their body stats that week, whichever comes first (a second save on the same day corrects that day's check-in; earlier check-ins can be corrected under "My check-ins" with `update_body_stats`, which only changes the values and never gives XP); trainers earn 100 XP per session and 50 XP per unique client.
Trainers sign up as "Personal trainer" (or apply later from their profile). The admin gets an email and a pop-up,
and approves the application in the admin dashboard: either linked to an existing trainer card (Filip, Maxim) or as a
new trainer card, which then appears in the team, the schedule filter and the booking board automatically. Coaching
XP goes to the trainer's own account, so the level on the team card and in the profile is the same.

## Weekly sessions and moving a session
A player who found their trainer can ask for the same hour every week, and a trainer can move a session.
- **Asking:** in the booking window, "How often?": just this once (default), every week for 4, 8 or 12 weeks, or every
  week until I stop it. The request goes to the trainer as **one** request. The first week must be free; a later week
  whose hour is already taken is left out and named. Every week is an ordinary booking (`bookings.series_id`): the same
  price rules (first-session price for the first one, pack credits when there are any), paid per session at the
  headquarters (no online payment and no free-session voucher for a weekly request), free cancellation per week up to
  24 hours before, rewarded per session. The series itself (`booking_series`) only says what repeats.
- **Answering:** the trainer sees one row (Coach tab and the pop-up), "Confirm all weeks" or Decline: one answer for
  every week, and one message to the player. A request that isn't answered in time expires as a whole.
- **The weeks that follow:** bookings exist up to the booking window (4 weeks ahead). As a new week comes inside it,
  `_series_extend()` plans it, confirmed at once and without a message (it runs with every profile load and in the
  10-minute job). If the hour is taken that week, the week is left out and both hear it ("Weekly session not planned").
  A series closes by itself after its last week.
- **Moving (trainer or admin):** "Move" next to an upcoming session in the Coach tab, after agreeing on it with the
  client in the chat (the window links to it). Pick the new day and hour; for a weekly session choose **only this
  week** or **every week from then on** (then the series gets the new day and hour, also for the weeks still to be
  planned). The new moment must be free for the trainer, the player and the room. The player gets a message that says
  which of the two it is ("📅 Session moved · this week only" / "📅 Weekly session changed · now every Tuesday 19:00"),
  and "My sessions" shows "Moved by your trainer · was …". A single session can be moved the same way.
- **Stopping:** the player ("Stop weekly" under My sessions) or the trainer (in the move window). The weeks to come
  go away at no cost; when the player stops, a confirmed session that starts within 24 hours stays (cancel that one
  yourself, with the usual rule). The other side gets one message.
- Server: `book_series`, `_series_answer` (through `respond_booking`), `_series_extend`, `move_booking`, `series_stop`;
  `book_session` and the weekly sessions share `_book` (all checks and the price). Limits: 2 to 26 weeks or open-ended,
  at most 4 weekly sessions per player.

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

## A first booking, step by step
A visitor taps an hour and sees one window that carries them through: **1 Account → 2 Health check → 3 Request**
(the row of steps at the top, `stepsHtml` in `schedule.js`; members who booked before don't get the steps).
- The price a newcomer pays comes first ("€30 · your first session … · after that €60").
- "Create account" opens the account window: first name, e-mail, password. The choice "player or trainer" only shows
  after the small link "Are you a personal trainer? Apply as a coach".
- **The chosen hour is kept** on the device (`localStorage` `levelup.slot`, three days). After the confirmation e-mail
  the link opens the site again; as soon as that visitor is logged in, the booking window opens on the same hour
  (`resumeSlot`). Closed by hand or booked: forgotten. Taken by someone else meanwhile: a message, and the schedule.
- On a phone the hours come before the prices; "Prices ▾" at the top jumps to them.
- A coach's level is the level of their own account (`trainer_stats`, also for visitors).

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
The phone pages **For you**, **Book** and **Scores** and the **profile page** have one too: gymnastic rings like the
mascot's (`img/foryou-bg.jpg`, `img/foryou-bg-small.jpg`: a free photo from Unsplash by Maysaa Ahmar; For you and the
profile), a row of kettlebells (`img/book-bg-small.jpg`: by Heidi Erickson) and a runner on a track at night
(`img/scores-bg-small.jpg`: by Christian Lue), all made black and white. On the phone pages they are layers of their
own in `<main>` (`.view-photo[data-photo]`), so a page slides away together with its photo (`openSlide` in `game.js`);
the cards on For you are dark glass so the photo shimmers through.
How dark it all is sits in one place, at the top of that block in `style.css`: `--photo-o` (how strong the photo
shows) and `--layer-o` / `--layer-alt-o` (how solid the sections over it are). Level 1 · How it works is an animated demo on a loop (`#howto`, `howItWorks` in `script.js`, `.hx-…` in `style.css`):
six scenes (profile +50 XP, pick a coach, book an hour, train and level up, climb the high scores, the shop) in
14 seconds, with an XP bar that follows the real XP rules, a mouse that clicks what gets clicked (a touch dot on
touch screens) and a mascot: the gymnast of the celebration (`levelup-celebrate.js`, loaded the first time the
demo is on screen and not changed) hangs on his rings next to the scenes, does a rep when something good happens,
does his muscle-up with the celebration's own confetti and rays at the moment of the level-up, and drops into
the cross while the demo player climbs the high scores. The pace is one number (`SLOW` in `howItWorks`). The
layout follows the demo's own width (a container query): mascot left of the scenes, or in a band above them
when it is narrow. It plays only while it is on screen, a tap on a step jumps to that scene, with "reduce motion"
nothing plays by itself (the mascot hangs still), and without the celebration file the demo plays without him.

The XP table under it comes alive when it shows (`xpTable` in `script.js`): the rows slide in one after the other,
the numbers count up, the ranks light up from Rookie to Legend, and after that one row at a time gives off its XP
while the table is on screen. Not with "reduce motion".

On phones the classes (Level 2) and team (Level 3) are swipe rows that glide to the left in an
endless loop (`loopRows` in `script.js`): each row gets one copy of its cards, and when the first set has passed it
jumps back by one set. Touching a row pauses it; it starts again 3 seconds after you let go. Off for "reduce motion".

## Loading screen
Every page has a game-style loading screen (`#boot`: logo, progress bar, current step and a random tip). It only
appears when loading takes longer than 0.35 s, shows the real progress of the startup requests (which now run in
parallel) and closes as soon as the data is in; CSS hides it after 12 s as a safety net. Tips: `BOOT_TIPS` in `game.js`.
**The mascot is on it:** as soon as his file (`levelup-celebrate.js`) is in, the logo makes way for Levelupy, who
drops in on his rings and does pull-ups in the colour of your rank until the data is there (`bootMascot` in `game.js`).
On a slow connection the logo shows first; with "reduce motion", or when the file doesn't load, the logo stays.

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
- **On the schedule of the home page:** a rented hour is an hour that is taken, drawn like "Booked" with a 🔑, on
  every hour it covers, also outside the coaches' hours (the board grows to show it). Visitors and members see a
  whole-room rental as "Room rented out · Booked" without a name, and no extra block next to a coach's hour (that
  hour already reads "Booked"). The admin and the coaches read who rents and what (whole room or 1 place), also
  for rentals of one place; next to a coach's hour that is just the key. On phones it is a row in the day's list.
  `room_blocks` in `supabase/schema.sql`, `rentalBlock` in `schedule.js`.
- **The legend under the schedule** lists what you can meet there: free, requested, confirmed, booked (a rental
  counts as booked), 👥 group class, closed.
- **In the Finances tab:** rentals that are over count as income on their date. A tile "Room rental" (and it is
  part of "Your share"), a table per renter (hours, rental, paid, open now), a column in the week/month overview
  and its CSV, "Download rentals (CSV)", unpaid rental in "To collect" and planned rental in "Booked ahead".

## Chat
Players chat privately with a coach, like a messaging app (`chat.js`, `chat.css`; `chat.html` on a computer, the
chat page of `index.html` on a phone, see "Phones").
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
  on the last message, also on a phone; coming back to the app shows what came in meanwhile. When the list
  changes height (a lower window, the phone keyboard) it stays at the newest message if you were there, and does
  not move while you read back (`keepAtEnd` in `chat.js`).
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
3. **Turn it on yourself:** the switch "On this phone" (menu → Notifications on a phone, or Settings → App & notifications). The first time, the function makes its own
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

## Notifications: where a member switches them
Three switches, the same in two places (`notifyHtml` in `game.js`): on a phone **menu → Notifications** (a small window,
with "On"/"Off" behind the menu entry), and **Settings → App & notifications**. On a computer a gear next to the avatar
opens Settings; on a phone "Settings" is in the menu.
- **On this phone**: the subscription of this device (sessions, reminders, XP, rewards). When it can't be switched
  the reason is written under it: blocked in the browser, iPhone that needs the app on the home screen first, or a
  browser without notifications.
- **Chat messages**: `profiles.push_chat` (`set_push_chat`); off = `_push` drops everything tagged `chat-…` for that
  member. The red number in the app stays.
- **News**: `profiles.push_news` (see below).

## News and notifications for everyone
The 🔔 in the header (also for visitors) lists the latest news: new group classes, new products, discounts and
messages from the admin. The same items go out as a notification to everyone with notifications on.
So it never feels like spam:
- at most **2 news notifications per person per 24 hours** (more news still shows behind the bell);
- **nothing at night**: news and reminders queued between 22:00 and 8:00 go out at 8:00 (`push_outbox.send_after`);
- a weekly class series is one message; a product is "new" once and gets at most one discount message every 3 days;
- players switch news off with the **News** switch (menu → Notifications on a phone, or Settings; their own sessions
  always come through); the person who made the news gets a copy too, so they see what their members see;
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
- **One page, also for yourself:** your own page is the same page others see, plus tabs only you see (For you on a
  computer, My sessions, Coach for trainers, Progress, Settings). On a computer your page opens on **For you**
  (the start screen); on a phone on **My page**. The tab **My page** is exactly what others see, with your
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
- **Posts:** a post is one to six photos with a text (up to 500 characters). Big, one under the other; several photos
  swipe sideways with a counter ("2 / 3"). Each post has a ♥ (tap again to take it back) and **comments**; a comment
  can get a ♥ too. The owner gets a notification for a comment (never for likes, and there is no celebration for
  these). You remove your own comment, any comment under your own post, and an admin removes anything. At most 300
  characters and 6 comments a minute. The same post, with the same hearts and comments, shows on the start screen
  ("From the club"), where members react too. `posts.js` draws a post and holds the window for a new one.
- **What it never shows:** email, body stats, health questionnaire, payments, orders or 1:1 sessions.
- **Who sees it:** members see each other only when logged in. A coach page is public, like the coach card; visitors
  see the photos and counts but not the comments. A member can make their page private (Settings → Account →
  "Other members can see my page"): others then only see name and photo, and can't react to the photos.
- **Your own text and photos:** a text about yourself (up to 1200 characters, blank lines are kept; on your own
  page it shows the way others read it, with a ✎ Change button that opens it for writing), up to 30 posts ("New post": pick up to six photos, write a text), and
  on the My page tab; the private switch is under Settings → Account. Photos are shrunk in the browser (longest side 1280 px) and stored in the Storage bucket
  `avatars`, in the member's own folder, like the profile photo.
- **Moderation:** an admin sees every page and can remove any post or comment; the files of a removed post are deleted too.
- Files: `profile.html`, `member.js`, `member.css` (the page), `profile.js`, `profile.css` (the account tabs). Server: `public_profile`, `set_profile`, `post_add` (`photo_add` is the older call with one photo),
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
- **Training streak:** weeks in a row (Monday–Sunday) with at least one completed session, a group class you were
  at, or the weekly check-in. Shown on the start screen from the first week, and from 2 weeks ("🔥 4 weeks in a row")
  on the player card and share image. Without a session (done or booked) or a check-in this week, the card shows a
  gentle note, and on Thursday evening the push job sends one reminder ("Keep your 4-week streak · Train or check in
  before Sunday"). The reminder needs the 10-minute push job from "Push notifications" step 4.

## For you: the start screen and the weekly check-in
A member's own screen, made to give a reason to open the app every week (`foryou.js`, styles under "For you" at the
end of `style.css`).
- **Where:** on a phone it is a page of its own, the first one in the bar at the bottom and to the left of Home (see
  "Phones"), and where a logged-in member starts. On a computer the home page stays as it is and "For you" is the
  first tab of your account, so one click on your name in the header.
  The phone remembers that you are logged in (`levelup.fy` in the browser, set next to the rank colour), so the next
  visit starts on For you from the first moment. A visitor sees there what an account gives, with the buttons to
  create one or log in.
- **What is on it, top to bottom:**
  1. *Hello:* your first name, level, XP bar and the mascot on his rings, **Levelupy** (the gymnast of
     `levelup-celebrate.js`, used as it is). He hangs, breathes and blinks, and every 13 to 32 seconds he does
     something: a pull-up or a few, a muscle-up, an L-sit, a straddle or an iron cross, with sweat flying off him.
     About a third of the time he is **clumsy**: a hand slips off and he dangles from one ring, flailing, until he
     gets back (`slip`); a rep that will not go (`fail`); or he swings like a child (`swing`). He yelps and saves
     face afterwards ("That was on purpose. Really.").
     **He talks to you** (a speech bubble every 24 to 46 seconds, never the same line twice in a row): first hello
     by your first name with a wave, then what matters most today, then one of his thoughts, the important ones
     more often (`thoughts` in `foryou.js`). He knows your planning (a session or class today or tomorrow, by its
     coach and name, the sleeps until the next one, a request that waits, nothing planned), your score (XP to the
     next level, close to a new rank, who you can pass on the high scores, your streak, the check-in), the day of
     the week, and what he wears (three lines per outfit in `mascot-looks.js`, such as "HO HO HO!"; on a special day
     that is the first thing he says). A bubble with ▸ takes you somewhere when you tap it (the schedule, the high
     scores); the offer to help opens the conversation with Levelupy. Tap him: that conversation opens too (see
     "Levelupy"); without the assistant he does a move. He does a muscle-up when you check in; with "reduce motion"
     he hangs still. He only moves while his page is on screen. How: the engine has one timeline (hang, pulled up,
     support, cross); `sim.step(0)` gives the pose for a moment on it, and `startMascot` in `foryou.js` puts the
     legs, the breathing, the blinking and the sweat on top; for the one-hand moves it moves his body under the
     hand that holds on and works out both arms again. `LevelUpForYou.move("slip")` shows one move (pullup,
     pullups, muscleup, lsit, straddle, cross, slip, fail, swing, wave), `LevelUpForYou.think()` lists what is on
     his mind. All his lines are in Dutch in `i18n-nl.js`.
  2. *Your next step:* your first session or group class that is coming (with "View" and the chat), or a push to book
     one (mentions a free session that is waiting, or the first-session price). A coach first sees requests that wait.
  3. *Your streak:* the weeks in a row and the **Check in** button.
  4. *Your race:* your place ("#2 of 8 players") and a lane per runner: the player just above you, you and the one
     just below, each with their XP as a bar and what they earned in the last 7 days. Under it: how much XP and how
     many sessions until you pass the next one, and who is coming up behind you ("Watch out: Sara earned 350 XP this
     week…"). Two buttons switch between all time and this month. Tap a runner to open their page. Hidden from the
     high scores or a coach: the top 3.
  5. *Almost there:* the three goals you are closest to (loyalty card, next rank, achievements with their progress).
  6. *Picked for you:* group classes you are not in yet, one card per kind: a class you did before first, then your
     coach's, then by date. "Sign up" opens the same window as the schedule. No class planned: the coaches.
  7. *From the club:* the latest news item and the latest posts of members and coaches, your own too: whole posts,
     as wide as the screen, with their photos (swipe sideways), the text, the ♥ and the comments. You write a comment
     and give hearts right there; the name opens the member's page, a tap on a photo opens it large. "＋ New post"
     makes a post from here (it lands on your page and in this list).
- **Weekly check-in:** one per week (Monday–Sunday, Brussels time), +25 XP, and the week counts for the streak. The tap
  on the start screen and saving your body stats are the same check-in: whichever comes first that week gets the XP
  (table `checkins`, `_week_checkin`, `check_in()`). The achievement "On track" counts those weeks. When the schema
  runs, weeks with saved body stats from before are taken over as check-ins.
- **Server:** `for_you()` gives the race (`board.all` and `board.month` from `_race`, with each runner's XP of the
  last 7 days from `xp_log`), the latest posts (only from pages that are open to members, plus your own) and
  the number of trainers you trained with; everything else comes from `my_data` (`checkin: { done, weeks, xp }`).
- **A database without this yet** (schema not run): the screen still shows, without the check-in button, the race and
  the posts.

## Levelupy's own account: he posts once a month
The mascot as a member of the club. **Admin → Levelupy → "His own account"**: fill in the e-mail address of a spare
account (make it first and log in once). That account is renamed "Levelupy", gets his face as its photo
(`img/mascot/avatar.png`), leaves the high scores, and posts at once: a picture of him on the rings in a gym hall
(`img/mascot/hello.jpg`). From then on he posts once a month, the first time anyone opens the app that month
(`_mascot_post_due`, called by `my_data` and by the push function): the picture of that month
(`img/mascot/month-01.jpg` … `month-12.jpg`, each with the hat of the season) with a quote and a thank-you to players
and coaches for last month, with the number of sessions when there were at least five (`_mascot_text`). Members see it
on their start screen ("From the club") and on his page; they cannot start a chat with him and he is not in the chat
search. "Post now" makes an extra post, "Stop posting" ends it (the account and his posts stay). His page keeps his
24 newest posts. The pictures are drawn, not photographed: the gym hall and the mascot come from the same engine as
the celebrations.

## The mascot's wardrobe
Levelupy wears something on his head every day of the year, by itself: 29 looks in `mascot-looks.js`.
- **Feast days:** party hat (31 Dec–2 Jan), king's crown (5–6 Jan), heart glasses (12–14 Feb), jester hat (Aalst
  Carnaval, Thursday to Shrove Tuesday), leprechaun hat (17 Mar), funny glasses (1 Apr), bunny ears (Good Friday to
  Easter Monday), cycling cap (the week of the Tour of Flanders), hard hat (1 May), Flemish bucket hat (11 Jul),
  Belgian top hat (21 Jul), graduation cap (1–7 Sep), alpine hat (19 Sep–4 Oct), witch hat (18–24 Oct), pumpkin head
  (25–31 Oct), bishop's mitre with a beard (10–11 Nov for Sint-Maarten, 5–6 Dec for Sinterklaas), Santa hat (1–26 Dec),
  reindeer antlers and a red nose (27–30 Dec).
- **Seasons, when nothing special is on:** bobble hat (Jan), earmuffs and a scarf (Feb), rain hat (1–19 Mar and
  5–17 Oct), flower crown (20 Mar–Apr), cap (May–20 Jun), sunglasses and a sunburn (21 Jun–Jul), straw hat (Aug),
  headphones (8–18 Sep), Movember moustache (Nov).
- **Personal:** a birthday cake on the member's birthday (they fill in day and month under Settings → Account; stored
  as `profiles.birthday`, `MM-DD`, no year; RPC `set_birthday`) and a laurel wreath on the day they joined, every year.
  A birthday goes before everything, then the join day, then feast days, then seasons (`pick` in `mascot-looks.js`).
- **Where:** everywhere he is drawn: the loading screen, the start screen ("For you"), the demo on the home page,
  his face in the chat and on the round button, and the celebrations. On "For you" his first speech bubble is a line
  about what he wears (`say` per look, Dutch in `i18n-nl.js`).
- **How it works:** `levelup-celebrate.js` draws the mascot and is not changed. `LevelUpLooks.dress(ctx, …)` listens
  to a canvas context and draws the look right after the engine has drawn his head, in the head's own coordinates
  (so it moves, tilts and bobs with him, and his arms stay in front of a wide brim). `game.js` loads the file with the
  engine (`loadCelebrate`), and offers `LevelUp.mascotLook()` and `LevelUp.dressMascot(ctx)`.
- **To see them all:** Admin → Levelupy → "His wardrobe" shows every look with the days he wears it this year. To try
  one on the site, add `?look=santa` (or `?look=none`) to the address.
- **A new look:** add an entry to `LOOKS` (a `draw(c, env)` in head coordinates, `up`/`down`/`side` for how far it
  reaches, a `name` and one or two `say` lines), give it days in `FIXED` or `SEASONS`, and add the lines to
  `i18n-nl.js`.

## Levelupy: the assistant in the chat
The mascot as an AI assistant: a member asks, a Claude model answers with what the site knows.
- **Where a member finds him:** the first conversation in the chat ("Levelupy · AI"), the mascot on the start screen
  (tap him, or the white speech bubble), and a small round button with his face on the other pages. The address is
  `chat.html?t=levelupy` on a computer and `#chat/t/levelupy` on a phone (`LevelUp.gotoChat({ t: "levelupy" })`).
- **The conversation** (`chat.js`, "Levelupy"): a hello with five questions to tap, the answers with up to three
  buttons that open the right screen (`LevelUp.assistantGo`: book, with a coach filled in; the group classes; My
  sessions; the check-in; the high scores; the shop; the chat with a coach; the profile; contact), three dots while
  he thinks, how many questions are left today, and a broom to clear the conversation.
- **What he knows:** (1) how the app works, written into the function; (2) the knowledge text of the gym, which the
  admin edits in the dashboard (`app_config.assistant_knowledge`); (3) the facts of the moment from
  `_assistant_context()`: the coaches with their own text and weekly hours, the group classes of the next three weeks,
  the shop, prices and rules, and the member's own first name, XP, streak, planned sessions and classes, weekly
  sessions, what is still to pay, pack credits and free sessions; (4) the free hours of a coach, which he looks up
  himself (`assistant_free_hours`, the same rules as the schedule). **Never** the email address, the health
  questionnaire, body stats or anything of another member.
- **What he can't do:** he only reads. No booking, moving, cancelling or paying: he says how and gives a button.
- **Who has him** (`app_config.assistant_mode`, the admin's Levelupy tab): `off`, `staff` (the admin and the coaches:
  the trial, the start value) or `members`. Visitors without an account never.
- **Limits:** questions per member per day (25) and per month for everyone together (2000, the budget), one question at
  a time, at most 600 characters. A question the model could not answer does not count. The admin tab shows the
  questions and members of the month and an estimate of the cost from the tokens (`assistant_spend`).
- **What he could not answer:** he notes the subject in his own words, without the member or the question
  (`assistant_gaps`); the admin sees the list, adds the answer to the knowledge text and ticks it off. Nobody can read
  a member's conversation, the admin neither; a member clears it with the broom.
- **Server:** tables `assistant_messages`, `assistant_usage`, `assistant_spend`, `assistant_gaps` (no direct access);
  `assistant_state`, `assistant_begin` (the limits, keeps the question, hands over the knowledge and the facts),
  `assistant_free_hours`, `assistant_clear`, and for the function only (server key): `assistant_reply`,
  `assistant_undo`; admin: `admin_assistant`, `admin_assistant_save`, `admin_assistant_gap_done`.
- **The Edge Function** `supabase/functions/assistant/index.ts` (Deno, the official `@anthropic-ai/sdk`): it calls
  `assistant_begin` as the member, sends one request per round to the Messages API (the model of the admin's choice:
  Claude Opus 5.5, Sonnet 5.5 or Haiku 5.5; effort `low`; refusal fallbacks on) with three strict tools (`free_hours`,
  `show_buttons`, `note_unanswered`), runs the tools, and keeps the answer with `assistant_reply`. The fixed part of
  the prompt (tools, instructions, knowledge text) is the same for every member and ends with a cache marker, so
  repeat questions read it at a tenth of the price. A refused request, an error or a missing key: the question is
  undone and the member gets a clear line. Logs never hold a member's words.

### Switching it on (once)
1. Make an account on console.anthropic.com, add a payment method and create an **API key** (a spending limit can be
   set there).
2. Supabase → **Edge Functions → Secrets**: add `ANTHROPIC_API_KEY`. The key lives only there: never in the website,
   in this repository, in a chat or an email. Optional: `ASSISTANT_EFFORT` (`low`, `medium` or `high`).
3. Supabase → **Edge Functions → Deploy a new function → Via Editor**: name `assistant`, paste
   `supabase/functions/assistant/index.ts`, **Verify JWT off** (the function checks the member itself).
4. Run `supabase/schema.sql` in the SQL Editor.
5. Admin dashboard → **Levelupy**: it starts as "Trial: you and the coaches". Ask him things in the chat; then choose
   "On for all members".

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

## Colours ("Carbon 2.0")
The look is three tones of graphite (page `--bg`, card `--panel`, a box inside a card `--inset`) with **one fixed
site colour: white** (`--accent`). White is for the main buttons, the active tab and whatever is picked; the text on
it is dark. The second button (`.btn-ghost`) has a grey fill and a border you can see (`--btn2-bg`, `--btn2-line`).
All tokens are at the top of `style.css`.

Colour has a meaning, and only that meaning:
- **Level colour** (`--level`): only for what is about a level: the rank badge, the XP bars, your own row in the
  high scores and your lane in the race, the cover of a member page, the mascot. Rookie mint, Trainee blue, Athlete
  purple, Warrior orange, Champion pink, Legend gold (`--tier-0` … `--tier-5`; the same six are in `TIER_COLORS` in
  `game.js` and `HS_TIER_COLORS` in `schedule.js`). `game.js` sets `<html data-rank="1…5">` and remembers it, so the
  next page opens straight in the right colour. Visitors and Rookies get mint.
- **Gold** (`--gold`): XP and rewards, and "still to do" (requested, to pay).
- **Pink** (`--heart`): hearts.
- **Mint** (`--ok`): in order (confirmed, paid, done).
- Trainers keep their own colour in the planning (set per trainer in the admin).

The photos behind the pages do not depend on these colours (`--photo-o` and the `.hero-bg` layers).

## Profile photos
Players upload a photo with the 📷 button on their photo at the top of their own page (the only place; Settings → Account
has "Remove my photo"). The photo is cropped square and shrunk to 640 px in the browser before upload (so it stays small and fast), then
stored in the Supabase Storage bucket `avatars`, in a folder named after the player's id. Everyone can only upload,
change or delete files in their own folder. The photo shows on the high scores (podium and rows), the page header,
the account page, coach booking requests and in admin. Remove sets it back to the letter. As admin you can remove
someone's photo in the member details (Remove photo). The bucket and its rules are created by `supabase/schema.sql`.

## The web shop (shop.html)
What a visitor sees, top to bottom: a short hero, a strip with why to buy here (pickup in Aalst, delivery when it is on,
safe payment, €1 = 10 XP), the **departments** as tiles (Supplements, Merch, Tools, and Fuel or Limited when something
is for sale there), then the collection with a **search field**, **sorting** (featured, price, name) and a tab per
department. "All" without a search shows one row of products per department. On a phone the products stand two by two.

- **Product page:** a tap on a product opens its page over the shop (`#productDialog`, full screen on a phone). The
  address becomes `shop.html?p=<id>`, so the page can be shared and Back closes it. It shows the picture, the price, the
  XP, the choice (a **size** for clothes: `sizes`, a **flavour** for powders: `options`), the number, "Add to bag", and
  folding parts: details, how to use, ingredients and allergens (supplements), delivery and returns. Below: four
  products of the same department. A product without a choice can go straight into the bag from its card.
- **The bag** opens from the **bag button in the header** (`.hud-cart`, drawn by `renderHud` in `game.js`; it shows on
  every page as soon as something is in the bag and links to `shop.html#bag`). There is no floating bag button any
  more, so nothing sits on top of Levelupy's button. The bag shows each line with its total, pickup or delivery, a bar
  that says how much is missing for free delivery, a remark for the order, subtotal, delivery and total, and the XP.
- **Delivery** (admin → Shop → Delivery, `app_config`: `ship_on`, `ship_fee`, `ship_free_from`): pickup at the gym is
  always free. With sending switched on, the buyer chooses in the bag; the fee is added (free from the set amount) and
  PayPal asks the address. Only Belgian addresses are accepted. Drinks and bars from the fridge are never sent.
  The server decides the amount: `shop_check(p_items, p_delivery)` returns the items, `subtotal`, `shipping` and
  `total`, and that total is what PayPal charges. Sending is **off** until the admin switches it on.
- **Orders** (admin → Shop → Orders): every paid order shows with what was bought, pickup or delivery, the name,
  e-mail and address PayPal gave, and the buyer's remark. The admin moves it on: *Ready to pick up* → *Picked up*, or
  *Sent* → *Done* (`admin_order_set`). A buyer with an account gets a notification and sees the status under
  Profile → Progress → Inventory → Orders. The admins get a notification for each new order (`record_order`); the
  e-mail through formsubmit.co still goes out as before.
- **Example articles:** 30 products in `ITEMS` (`game.js`) carry `example: true`: 10 supplements, 10 merch, 10 tools.
  Their pictures in `img/shop/` are drawn (1000 × 1000 px, made by `node tools/shop-art.js`), their texts and prices are examples. They are in
  `shop_items` **switched off**: nobody can see or buy them until the admin switches each one on. Replace a picture by
  putting a real photo under the same file name. For supplements, the ingredients and allergens must match the label
  of the product that is really sold.
- **Preview for the admin:** `shop.html?preview` (button in admin → Shop → Products) shows every product, also the
  switched-off ones, marked "Not live"; those can't go into a bag.
- **An older database:** until the latest `supabase/schema.sql` has run, `pricing_info` has no `shipping`. The shop then
  works as before: no delivery choice, no remark, and the old one-argument check. A product that is not in
  `shop_items` yet never shows, except the four that were always for sale (`CORE_ITEMS`).
- **Collector** now unlocks at 8 different articles (drinks and bars don't count), because "every item" grew a lot.

### The fridge and the QR codes
Drinks and snacks (category `fuel`, ten of them, each with a drawn picture) are **not** in the shop's collection: they
live on the fridge page, `shop.html?fridge`, which keeps its own bag (`levelup.fridge.v1`), apart from a shop order.
- **In the shop** a card "Scan and grab" (`#fridgeInfo`) explains it in three steps, shows what is in the fridge and
  has a button "Open the fridge". It only shows when something from the fridge is switched on. An old link
  `shop.html#fuel` leads to the fridge page.
- **The fridge page** starts with the three steps. A tap on "Take" counts on the tile (− 1 +) and a bar at the bottom
  shows the number, the amount and the XP, with one button: **On my tab** for a member (straight away, no bag in
  between), "Log in for your tab" for a visitor, and "or pay now" to open the bag with PayPal. While the bar shows,
  Levelupy's button moves up so nothing overlaps.
- **Two kinds of QR codes**, both printed from admin → Shop → The fridge:
  the **poster** (the fridge page) and **a label per product** (`shop.html?fridge&take=<id>`). Scanning a label puts
  that product in the fridge bag at once; the address is cleaned, so a reload doesn't add it twice. Something that is
  not in the fridge adds nothing and says so.
- **QR labels for the rest of the shop:** admin → Shop → Products → "QR labels" prints a label per product that is
  switched on; that code opens the product's page (`shop.html?p=<id>`), to stick next to merch or tools at the gym.
- Labels and poster are Dutch (the admin page fetches `i18n-nl.js` when it prints).

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
- **Fuel** (shakes, bars, pudding, energy drink, cold brew, sports drink, water, gel, nuts) is for the fridge at the gym. **The fridge**: print the poster with
  the QR code to `shop.html?fridge`. Members scan it, tap what they took and pay right away with PayPal, or put it
  **on their tab** (logged in, drinks and bars only, at most `tab_limit` euro open, default €30 in `app_config`). A wrong
  tap can be undone within 15 minutes. Open tabs appear under **Open tabs**: tap **Paid** when they pay at the desk;
  only then they get the XP (and a push). ✕ removes a line they don't pay for.
- **Bundles**: give a session pack a free item (e.g. 10 sessions + Season 1 Hoodie). It shows in the shop and the pack
  options; once that pack is paid it appears under **Gifts to hand out**, and **Handed out** puts it in their inventory.
- **Season 1 Hoodie** (`hoodie_s1`) is the first limited drop: 25 pieces, switched off until you set it live.

## Instagram (@levelup.movement)
The folder `instagram/` holds a ready-made set in the site's style: `profielfoto.jpg`, nine posts of 1080 × 1350 px that
form one grid (`rooster-voorbeeld.png` shows it), three story templates and six highlight covers of 1080 × 1920 px.
`instagram/teksten.md` has the name, bio, links, a caption per post, a posting rhythm and what to check before posting.
The pictures are made by `node tools/instagram-posts.js` from the photos in `img/`; edit a text or photo there and run
it again (one name as argument remakes only that picture).

## Adding a shop item
Add an entry to `ITEMS` in `game.js` (id, name, price, category `supps`, `merch`, `tools`, `fuel` or `limited`, rarity, image or
an emoji in `art`, optional `sizes` or `options: { label: "Flavour", values: [...] }`, perks, description, and for the
product page `details`, `use`, `ingredients`, `allergens`, `warning`, `supplement: true`) and the same id, name, price and category to the `shop_items`
table (in `supabase/schema.sql`, with `active false`). Then switch it on in admin → Shop.
