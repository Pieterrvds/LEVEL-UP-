# LEVEL-UP business cards

Standard business card, 85 × 55 mm, in the style of the website.

- `pieter-front.png` / `pieter-back.png`: front and back at the final size, 300 dpi (1005 × 650 px).
- `pieter-front-bleed.png` / `pieter-back-bleed.png`: the same with 3 mm bleed (91 × 61 mm), for printers that ask for bleed.
- `pieter-business-card-print.pdf`: print file, 2 pages (front, back), 91 × 61 mm including 3 mm bleed.
- The QR code opens the website's schedule filtered on Pieter: `https://pieterrvds.github.io/LEVEL-UP-/?trainer=pieter#schedule`.

`card.html` is the source. To make a card for another trainer: change the photo, name, role and stats in it,
generate a QR for `?trainer=<id>#schedule` and save it as an SVG next to the card.
Open the page in a browser and print to PDF at 91 × 61 mm (no margins, background graphics on).
