# LEVEL-UP: overdracht voor een nieuwe chat

Lees dit eerst, daarna `README.md` (daar staat elke functie in detail). Dit bestand zegt wat je niet uit de code kan afleiden: de afspraken, de stand van zaken en wat nog openstaat.

## Wat het is

- LEVEL-UP is het platform van Pieter voor personal training in Aalst: klanten ("spelers") boeken een trainer, verdienen XP en stijgen in level; trainers en de admin beheren uren, lessen, betalingen en nieuws.
- Live: https://pieterrvds.github.io/LEVEL-UP-/ (GitHub Pages serveert de branch `main` van `Pieterrvds/LEVEL-UP-`). Een push naar `main` staat dus meteen live.
- Statische site in gewone HTML, CSS en JavaScript, zonder build-stap en zonder framework. De server is Supabase (project `zdwlihbsmqiggpyensxc`): databank, login, opslag en drie Edge Functions.
- Installeerbaar als app (`manifest.webmanifest`, `sw.js`).

## Kaart van de code

- `index.html` (home, "Voor jou", boeken, klassement), `profile.html` (eigen pagina, 4 tabs), `member.html` (pagina van iemand anders), `chat.html`, `shop.html`, `admin.html` (alleen Engels), `privacy.html`.
- `game.js`: de kern, exporteert `LevelUp` (login, RPC's, levels, meldingen, mascotte). `schedule.js` boeken, `profile.js`, `chat.js`, `foryou.js` (startscherm met de mascotte), `shop.js`, `posts.js`, `classes.js`, `room.js`, `admin.js`, `levelupy-admin.js`.
- `levelup-celebrate.js`: de tekenmotor van de mascotte Levelupy. **Niet aanpassen**; hij wordt van buitenaf aangestuurd (`foryou.js`, `mascot-looks.js`).
- `mascot-looks.js`: 29 hoofddeksels per seizoen, feestdag en verjaardag.
- `i18n.js` + `i18n-nl.js`: de code bevat Engelse brontekst, `i18n-nl.js` vertaalt naar het Nederlands (exacte sleutels en patronen met `{0}`). Elke nieuwe tekst voor bezoekers krijgt een regel in `i18n-nl.js`. `data-no-i18n` slaat een blok over.
- `style.css` en de css per pagina: kleurstijl "Carbon 2.0" met tokens in `:root`. De levelkleur alleen op badge, XP-balk, eigen rij, cover en mascotte.
- `supabase/schema.sql`: één bestand met alle tabellen, regels en functies, opnieuw uitvoerbaar. `supabase/functions/{payments,push,assistant}`: Edge Functions.

## Vaste afspraken

1. **Taal:** Pieter schrijft Nederlands (Vlaams). Antwoord in het Nederlands, in gewone woorden, kort.
2. **Publiceren:** een afgewerkte en geteste wijziging gaat naar `main` (= live) en naar de werkbranch van de sessie. Geen pull request tenzij gevraagd. Controleer na de push met `git ls-remote` dat beide op dezelfde commit staan.
3. **Versies:** verhoog bij elke wijziging aan js of css de `?v=…` in de HTML-bestanden en `VERSION` in `sw.js`, anders zien telefoons de oude bestanden.
4. **Databank:** je kan de echte databank niet bekijken of wijzigen. Na een wijziging aan `supabase/schema.sql` voert Pieter het bestand zelf uit in de Supabase SQL Editor: stuur hem het bestand en zeg het erbij.
5. **Sleutels:** alleen de publishable key staat in de websitecode. Vraag of gebruik nooit de service_role key, het databankwachtwoord, de Mollie-sleutel, de VAPID-privésleutel of de Anthropic-sleutel; die staan alleen als secret bij de Edge Functions en Pieter stelt ze zelf in.
6. **Privé:** stuur nooit het e-mailadres of andere gegevens van Pieter naar externe diensten. Wachtwoorden die in een chat gedeeld worden, komen nooit in de repo.
7. **Foto's:** stockfoto's alleen van `images.unsplash.com`, met de fotograaf vermeld in `README.md`. Geen user-agent vervalsen of botcontroles omzeilen.
8. **Teksten:** kort houden. Controleer elke wijziging op telefoonbreedte 390 en 360 px (geen afgesneden tekst, geen overlap) en op desktop.
9. **Eerst uitleggen als hij dat vraagt:** "voer nog niet uit, leg uit" betekent alleen uitleg, geen code.
10. **README bijhouden:** elke nieuwe functie krijgt een stuk in `README.md`.
11. **Commits:** Engelse boodschap die zegt wat er voor de gebruiker verandert; geen modelnamen in code of commits buiten de vaste afsluitregels van de sessie.

## Testen

De testomgeving van de vorige sessies (lokale Postgres met `schema.sql` + testgegevens, een nagebouwde Supabase, Playwright-tests per onderdeel en een telefoon-audit) stond in een tijdelijke map en **zit niet in de repo**. Een nieuwe sessie moet ze opnieuw opzetten of minstens: `node --check` op elk gewijzigd js-bestand, de pagina's lokaal serveren en met Playwright (Chromium is voorgeïnstalleerd) op 390, 360 en 1280 px nakijken, met schermafbeeldingen. Zeg altijd eerlijk wat getest is en wat niet. Nooit getest tot nu toe: echte telefoons en Safari, echte pushmeldingen, de echte bevestigingsmail en de echte Supabase.

## Stand van zaken (november 2026)

Recent afgewerkt en live:

- Kleurstijl Carbon 2.0, kortere teksten, pop-ups nagekeken.
- Mascotte Levelupy: 29 looks door het jaar, verjaardag via de geboortedag in het account; op "Voor jou" spreekt hij de speler persoonlijk aan (voornaam, XP tot het volgende level, volgende sessie en trainer, speciale dag) en doet hij soms onhandig aan de ringen.
- Levelupy heeft een eigen account dat één keer per maand post (Admin → Levelupy → "His own account").
- Eerste boeking duidelijker (stappen, gekozen uur blijft bewaard tijdens het aanmaken van een account), meldingen in het menu met schakelaars, profiel met 4 tabs.
- Chat blijft bij het nieuwste bericht als het venster van hoogte verandert. De oude "Highlights"-pop-up is verwijderd.

Wat Pieter zelf nog moet doen (vraag of het gebeurd is voor je erop bouwt):

- De laatste `supabase/schema.sql` uitvoeren (geboortedag, chatmeldingen aan/uit, account van Levelupy).
- In Admin → Levelupy het e-mailadres van het testaccount invullen als account van de mascotte, en het wachtwoord van dat account veranderen.
- Eén keer alles echt doorlopen op een iPhone en een Android: account maken, boeken, bevestigingsmail, melding.

Bewust uitgesteld (niet over beginnen tenzij hij het vraagt):

- De AI-assistent in de chat (wacht op een betaalmethode voor de Anthropic-sleutel).
- Online betalen met Mollie.

Open verbeterpunten die voorgesteld maar nog niet gevraagd zijn:

- Sectienamen zoals "Level 5 · Planning" zijn onduidelijk voor nieuwkomers.
- De dagenrij in het boekingsschema toont cijfers zonder uitleg.
- Onderste balk op de telefoon: "Profiel" in plaats van "Klassement".
- Op 360 px drukt de admin-knop de menuknop weg (alleen voor de admin).
- Echte foto's en reviews in plaats van stockfoto's; privacytekst en bewaartermijnen laten nalezen (gezondheidsantwoorden, geboortedag).
