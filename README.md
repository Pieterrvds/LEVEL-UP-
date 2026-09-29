# LEVEL-UP
Personal training website with a retro game theme: train, earn XP and level up your body.

## Pages
- `index.html`: home page: the platform where players and personal trainers meet (classes, stats calculator, team with trainer levels, weekly booking schedule, contact)
- `shop.html`: item shop for merch and tools. Every €1 spent = 10 XP, and complete sets unlock achievements. Checkout via PayPal; each order is emailed to the LEVEL-UP inbox (FormSubmit) and the buyer gets an automatic confirmation.
- `profile.html`: player profile with level, rank, XP, workout log, body stats, achievements, inventory and orders
- `archive/webshop-v1/`: the old webshop, kept for reference

## Code
- `game.js`: shared game core on every page: player profiles and login, XP, levels, ranks, achievements, the header player chip, login dialog and toasts. The shop catalog (`ITEMS`) lives here too.
- `schedule.js`: weekly booking board on the home page
- `script.js`, `shop.js`, `profile.js`: page-specific behaviour
- `style.css` (shared + home), `shop.css`, `profile.css`

## About login
The site is static (no server), so player profiles are saved in the visitor's browser (localStorage).
A profile only exists on the device where it was created, and XP can't be verified server-side.
To get real accounts that work on every device, connect a backend such as Firebase or Supabase.
All profile logic goes through `game.js`, so only that file needs to change.

## Trainers and open hours
Trainers live in `TRAINERS` in `game.js`. `availability` sets their open hours per weekday
(0 = Sunday … 6 = Saturday), e.g. `{ 3: [13, 18] }` = Wednesday 13:00–18:00. Players book 1-hour slots within
those hours, up to 4 weeks ahead. Every booking and cancellation is emailed to the LEVEL-UP inbox, and the client
gets an automatic confirmation. Clients earn 75 XP per booking; trainers earn 100 XP per session and 50 XP per new client.
Like profiles, bookings are stored in the browser for now, so a real backend is needed before trainers and other
clients can see each other's bookings.

## Adding a shop item
Add an entry to `ITEMS` in `game.js` (id, name, price, category `merch` or `tools`, rarity, image, optional sizes, perks, description).
