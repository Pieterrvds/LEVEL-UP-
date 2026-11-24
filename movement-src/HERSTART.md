# LEVEL-UP movement: blauwdruk

De nieuwe voorkant van LEVEL-UP: zelfde platform (klanten boeken een trainer), zelfde databank, maar licht, rustig
en gefilterd. De oude site (`Pieterrvds/LEVEL-UP-`, map erboven) blijft live tot deze klaar is.

## 1. Beslist (november 2026)

- **Databank blijft.** Zelfde Supabase-project, zelfde functies (`supabase/schema.sql` in de oude repo). De regels
  voor boeken, zaal, prijzen en meldingen worden niet opnieuw gebouwd. Wie in de oude app een account heeft, logt
  hier met hetzelfde account in.
- **Lichte look**, zoals coachway.io en truecoach.co: zie "Stijlregels" in `CLAUDE.md`.
- **Nederlands eerst.** Alle tekst staat in het Nederlands in de code. Engels kan later, als het nodig blijkt.
- **Het spel blijft klein.** XP en level zijn één kaart op Start en op het profiel; het klassement is één scherm.
- **Maximaal vier knoppen** in de navigatie per rol, één hoofdactie per scherm.

## 2. Wat blijft, wat verandert

| Onderdeel van de oude app | Nieuw | Stap |
|---|---|---|
| Account maken, inloggen, wachtwoord vergeten | blijft | 1 |
| Gezondheidsvragen bij de eerste boeking | blijft, als korte stap in het boeken | 2 |
| 1-op-1 boeken: coach, soort les, uur, plaats, gratis eerste sessie | blijft, als één stroom in 3 stappen | 2 |
| Vaste wekelijkse sessie (reeks) | blijft, als keuze bij het bevestigen | 2 |
| Groepslessen: inschrijven, wachtlijst, uitschrijven | blijft | 5 |
| Mijn sessies: verplaatsen, annuleren, in agenda zetten | blijft | 3 |
| Pakketten (5 en 10 sessies) | vereenvoudigd: één regel bij de prijs, aanvragen met één knop | 3 |
| Profiel: foto, naam, geboortedag, meldingen, account wissen | blijft, als één lijst met instellingen | 3 |
| XP, level, reeks | klein: één kaart | 3 |
| Klassement, speler van de maand | één scherm onder Profiel | 8 |
| Coach: te doen, vandaag, agenda, uren, groepslessen, verdiensten | blijft: Vandaag + Agenda | 4, 5 |
| Coach actief of afwezig | blijft, schakelaar bovenaan Vandaag | 4 |
| Soorten les met goedkeuring door de admin | blijft | 4, 7 |
| Chat: privé, groepschat, archiveren, verwijderen | blijft | 6 |
| Pushmeldingen | blijft | 6 |
| Admin: team, weekrooster, wijzigingen van coaches, leden, betalingen, nieuws, zaal | blijft, herschikt in Overzicht, Team en Meer | 7 |
| De vijf "levels" als secties van de homepage | weg: de navigatie vervangt ze | - |
| Mascotte Levelupy en zijn looks | later, of niet | 8 |
| Posts, foto's, likes op een eigen pagina | later, of niet | 8 |
| Webshop, frigo, QR-etiketten | later: eigen onderdeel onder Profiel | 8 |
| Reviews op de homepage | later | 8 |
| AI-assistent, online betalen met Mollie | blijven uitgesteld | - |
| Instagram-beelden, verhuur van de zaal aan derden | niet in de app voor klanten; zaalverhuur alleen bij de admin | 7 |

## 3. Schermen per rol

**Klant** (Start · Boeken · Chat · Profiel)
- *Start*: je volgende sessie (of "boek je eerste sessie"), je vooruitgang, de coaches met hun lichtje.
- *Boeken*: 1. wat (training of groepsles), 2. wie en wanneer (coach, dag, uur), 3. bevestigen (plaats, prijs).
- *Chat*: lijst van gesprekken, een gesprek, gearchiveerd.
- *Profiel*: mijn sessies, vooruitgang en klassement, instellingen.

**Coach** (Vandaag · Agenda · Chat · Profiel)
- *Vandaag*: actief of afwezig, te doen (bevestigen, afronden), de sessies van vandaag.
- *Agenda*: week per dag met 1-op-1 en groepslessen; van daaruit uren en lessen plannen.
- *Profiel*: verdiensten, mijn kaart, instellingen. Een coach kan ook zelf boeken: knop "Boek een sessie".

**Admin** (Overzicht · Team · Chat · Meer). De admin die ook coach is, wisselt bovenaan tussen "Coach" en "Beheer".
- *Overzicht*: wat op hem wacht (goedkeuren, sollicitaties, wijzigingen van coaches) en vier cijfers.
- *Team*: een kaart per trainer, het weekrooster, de soorten les.
- *Meer*: leden, betalingen en uitbetalingen, nieuws, zaal, prijzen.

## 4. Databankfuncties per scherm

De namen komen uit `game.js` van de oude site (`call("…")`). Kijk daar na welke velden elke functie verwacht en
teruggeeft voor je een scherm bouwt; niets raden.

| Scherm | Functies |
|---|---|
| Inloggen, account | Supabase Auth; `my_data`, `touch_login`, `set_profile`, `set_avatar`, `set_birthday`, `delete_my_account` |
| Klant · Start | `my_data`, `trainer_list`, `trainer_stats`, `pricing_info`, `for_you` |
| Klant · Boeken | `trainer_list`, `trainer_hours_list`, `training_kinds`, `class_kinds`, `class_list`, `slot_status`, `room_blocks`, `pricing_info`, `save_health_form`, `book_session`, `book_series`, `class_signup`, `class_cancel` |
| Klant · Mijn sessies | `my_data`, `cancel_booking`, `move_booking`, `series_stop`, `pay_in_person_instead`, `calendar_feed`, `request_pack`, `cancel_pack_request` |
| Klant · Vooruitgang | `my_data`, `leaderboard`, `player_of_month`, `set_leaderboard_visibility` |
| Meldingen | `push_public_key`, `save_push_subscription`, `delete_push_subscription`, `set_push_chat`, `set_push_news`, `claim_booking_notices` |
| Coach · Vandaag | `coach_bookings`, `respond_booking`, `reward_session`, `mark_no_show`, `mark_paid_in_person`, `set_trainer_available` |
| Coach · Agenda en uren | `coach_bookings`, `trainer_hours_list`, `save_trainer_hours`, `delete_trainer_hours`, `kind_propose`, `move_booking`, `class_manage_list`, `class_create`, `class_update`, `class_cancel_class`, `class_roster`, `class_mark`, `class_finish`, `class_mark_paid` |
| Coach · Verdiensten | `coach_earnings`, `coach_statement` |
| Chat | `chat_list`, `chat_thread`, `chat_send`, `chat_open`, `chat_open_user`, `chat_search`, `chat_like`, `chat_mute`, `chat_archive`, `chat_delete`, `chat_unread`, `chat_group_delete` |
| Admin · Overzicht | `admin_data`, `admin_inbox`, `admin_coach_log`, `admin_kind_decide`, `review_trainer_application` |
| Admin · Team | `admin_trainer_update`, `set_trainer_available`, `set_trainer_pricing`, `admin_class_kind`, `admin_class_kind_delete`, en de functies van "Coach · Agenda en uren" voor elke trainer |
| Admin · Meer | `admin_data`, `mark_payout`, `mark_refunded`, `mark_pack_paid`, `admin_pack_gift`, `admin_grant_xp`, `admin_announce`, `admin_delete_news`, `admin_room`, `admin_room_settings`, `admin_rental_add`, `admin_rental_cancel`, `admin_rental_paid` |
| Later | shop (`shop_*`, `record_order`, `admin_shop*`, `admin_orders`), posts (`post_add`, `photo_*`, `give_like`, `public_profile`), reviews, mascotte en assistent |

## 5. Bouwvolgorde

Eén stap per chat. Aan het einde van elke stap: `CLAUDE.md` bijwerken ("Stand van zaken").

0. Project, stijl en bouwstenen, navigatie per rol, voorbeeldschermen. **Klaar.**
1. Inloggen, account maken, wachtwoord vergeten; de rol komt uit het account (klant, coach, admin).
2. Klant: Start en een sessie boeken.
3. Klant: mijn sessies en profiel.
4. Coach: Vandaag, Agenda en uren.
5. Groepslessen (klant en coach).
6. Chat en meldingen.
7. Admin.
8. Extra's die blijven (klassement, shop, …).
9. Overschakelen: alles doorlopen met echte accounts, dan live.

## 6. Nog te beslissen door Pieter

- Blijft Engels nodig?
- Shop, frigo, posts en mascotte: komen ze terug in stap 8, en welke?
- Eigen repository en eigen adres (zie `README.md`, "Verhuizen").
- Het logo: nu een eenvoudig teken met dubbele pijl; het echte logo kan het vervangen.
