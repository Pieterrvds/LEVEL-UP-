# LEVEL-UP
Personal training website with a retro game theme: train, earn XP and level up your body.

## Pages
- `index.html`: home page (classes, stats calculator, team, schedule, contact)
- `shop.html`: item shop for merch and tools. Every €1 spent = 10 XP, and complete sets unlock achievements. Checkout via PayPal; each order is emailed to the LEVEL-UP inbox (FormSubmit) and the buyer gets an automatic confirmation.
- `profile.html`: player profile with level, rank, XP, workout log, body stats, achievements, inventory and orders
- `archive/webshop-v1/`: the old webshop, kept for reference (also git tag `webshop-v1`)

## Code
- `game.js`: shared game core on every page: player profiles and login, XP, levels, ranks, achievements, the header player chip, login dialog and toasts. The shop catalog (`ITEMS`) lives here too.
- `script.js`, `shop.js`, `profile.js`: page-specific behaviour
- `style.css` (shared + home), `shop.css`, `profile.css`

## About login
The site is static (no server), so player profiles are saved in the visitor's browser (localStorage).
A profile only exists on the device where it was created, and XP can't be verified server-side.
To get real accounts that work on every device, connect a backend such as Firebase or Supabase.
All profile logic goes through `game.js`, so only that file needs to change.

## Adding a shop item
Add an entry to `ITEMS` in `game.js` (id, name, price, category `merch` or `tools`, rarity, image, optional sizes, perks, description).
