# LEVEL-UP: overdracht voor een nieuwe chat

Lees dit eerst, daarna `README.md` (daar staat elke functie in detail). Dit bestand zegt wat je niet uit de code kan afleiden: de afspraken, de stand van zaken en wat nog openstaat.

## Wat het is

- LEVEL-UP is het platform van Pieter voor personal training in Aalst: klanten ("spelers") boeken een trainer, verdienen XP en stijgen in level; trainers en de admin beheren uren, lessen, betalingen en nieuws.
- Live: https://pieterrvds.github.io/LEVEL-UP-/ (GitHub Pages serveert de branch `main` van `Pieterrvds/LEVEL-UP-`). Een push naar `main` staat dus meteen live.
- Statische site in gewone HTML, CSS en JavaScript, zonder build-stap en zonder framework. De server is Supabase (project `zdwlihbsmqiggpyensxc`): databank, login, opslag en drie Edge Functions.
- Installeerbaar als app (`manifest.webmanifest`, `sw.js`).

## Kaart van de code

- `index.html` (home, "Voor jou", boeken, klassement), `profile.html` (eigen pagina, 4 tabs), `member.html` (pagina van iemand anders), `chat.html`, `shop.html`, `admin.html` (alleen Engels), `privacy.html`.
- `game.js`: de kern, exporteert `LevelUp` (login, RPC's, levels, meldingen, mascotte). `schedule.js` boeken, `profile.js`, `chat.js`, `foryou.js` (startscherm met de mascotte), `shop.js`, `posts.js`, `classes.js` (groepslessen), `hours-editor.js` en `hours-planner.js` (uren), `week-plan.js` (weekrooster voor coach en admin), `room.js`, `admin.js`, `levelupy-admin.js`.
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
- Chats archiveren en verwijderen: de knop ⋯ in een open gesprek heeft "Archive" en (alleen privéchats) "Delete chat". Beide gelden alleen voor wie tikt (`chat_reads`: `archived`, `hidden`, `cleared_id`); de andere persoon houdt zijn gesprek. Een gearchiveerde privéchat komt terug bij een nieuw bericht, een gearchiveerde groepschat blijft weg en stil. Na verwijderen begint een nieuwe chat met die persoon leeg; wat beide kanten verwijderden, wordt echt gewist.
- Webshop uitgewerkt (`shop.html`, `shop.js`, `shop.css`; zie "The web shop" in `README.md`): afdelingen (supplementen, merch, tools), zoeken en sorteren, een productpagina per artikel (`?p=<id>`), de winkeltas als knop in de kopbalk (geen zwevende knop meer), afhalen of leveren, bestellingen met status in Admin → Shop → Orders en in het profiel. 30 voorbeeldartikelen met getekende foto's in `img/shop/` staan in de databank **uitgeschakeld**; `shop.html?preview` toont ze aan de admin.
- Frigo en QR-codes: drank en snacks (10 artikelen) staan alleen op `shop.html?fridge`, met een eigen tas. Daar tik je aan wat je neemt en zet je het met één knop op je rekening. Admin → Shop drukt de frigo-poster en een QR-etiket per product af (`?fridge&take=<id>` telt dat product meteen); voor merch en tools opent het etiket de productpagina. De shop legt dit uit in de kaart "Scan en pak".
- Coachpaneel (Profiel → Coach): vier tegels bovenaan (Te doen, Vandaag, Komende 7 dagen, geld) en vier onderdelen die je één per één opent: Te doen, Agenda (1-op-1 en groepslessen samen, per dag), Mijn uren, Verdiensten. "Mijn uren" bevat nu ook de groepslessen: een weekrooster met per dag de 1-op-1-uren en de groepslessen, een ＋ per dag en de knop "Iets plannen" (vaste uren, extra uren, vrije dag of groepsles), en daaronder twee tegels: Personal training (uren instellen) en Groepslessen (plannen, wie komt, wijzigen, annuleren).
- Soorten les en goedkeuring: bij 1-op-1-uren kiest de coach wat hij geeft (bestaande training of een nieuwe soort met foto en korte tekst); bij een groepsles met een nieuwe naam idem. Een nieuwe soort van een coach wacht op de admin (Admin → Team → "To approve": goedkeuren, andere naam of weigeren); tot dan zien spelers de kaart, de uren en de les niet. "Boek je trainer" toont per 1-op-1-uur welke les het is; "Kies je training" toont wie ze geeft en maakt een kaart voor een nieuwe goedgekeurde soort.
- Admin → Team heeft vijf weergaven (`TEAM_VIEWS` in `admin.js`): **Team** (een kaart per trainer: "✎ Edit" naast de titel onder de naam om naam, titel, labels en korte tekst van de trainer aan te passen (`admin_trainer_update`; de coachkaart op de homepage volgt), schakelaar actief/afwezig, cijfers, zijn 1-op-1-lessen met uren en zijn groepslessen; per les Uren/Lessen, "Photo & text" (kaart van de homepage ter plaatse aanpassen) en Delete; "→ Group class" zet 1-op-1-uren om naar een groepsles), **Week** (weekrooster van het team, `week-plan.js`, gedeeld met het coachpaneel), **1:1 hours**, **Group classes** en **Changes** (wat de coaches zelf wijzigden). Een groepsles kan meerdere trainers hebben ("Also with", `co_trainers`, alleen de admin). Een groepstraining verwijderen annuleert alle komende lessen van die naam en wist de groepschat en de kaart. Het aparte admin-tabblad "Group classes" bestaat niet meer.
- Coaches hebben een eigen groepschat "Coaches" (elke actieve trainer met account en elke admin zit er vanzelf in; knop "Teamchat" in het coachpaneel) en krijgen een eigen welkomstbericht van de hoofdcoach met wat ze als coach kunnen doen, in plaats van het bericht voor klanten. De teksten staan in `app_config` (`welcome_coach_text`, `coach_join_text`).
- Uren instellen: "Wat geef je?" is verplicht. Een nieuw uur wordt pas opgeslagen als de coach (of de admin) kiest wat er gegeven wordt, ook bij het slepen in de weekplanner.
- Opruimen: wat voorbij is en geen geld draagt, verdwijnt na 2 weken (`_tidy_old`, `tidy_days` in `app_config`): geannuleerde lessen zonder betaling, groepschats zonder les, voorbije extra uren en vrije dagen; de lijst voorbije lessen van een coach gaat 2 weken terug. Afgewerkte lessen en sessies, betalingen, XP en privégesprekken blijven altijd.
- Klassement: de lijst onder het podium bevat alle spelers (tot 200); op de computer scrolt ze binnen het bord, op de telefoon staat ze volledig in de pagina.
- Level 3 (coaches): de kaarten sorteren zichzelf (`sortTeam`): actief eerst, hoogste level vooraan, afwezig achteraan.
- Level 2 en boeken sorteren mee: trainingskaarten waarvan minstens één coach actief is, staan eerst (`activeFirst` in `script.js`, level telt niet); in de filter boven het boekingsrooster en op het rooster zelf staan actieve trainers eerst (`byActive` in `schedule.js`).
- Trainingskaarten: alle kaarten behalve boksen, Muay Thai en social run gebruiken een Unsplash-foto uit `img/trainings/` (fotografen in README).
- Prijzen: een 1-op-1-uur kost €50 (was €60), de trainer krijgt €45 en €5 blijft bij het platform; de eerste sessie is gratis (`intro_price` 0; de trainer krijgt dan toch €45, dus die €45 draagt Pieter); pakketten 5 voor €240 en 10 voor €470. De waarden staan in `app_config`; `schema.sql` zet ze alleen om waar nog de oude standaard stond.
- Zaal: alleen wat in de grote zaal zelf gebeurt, telt voor de zaal. Een 1-op-1-uur of groepsles op een andere plaats mag met alles overlappen. In de grote zaal kunnen 3 personal trainers tegelijk een sessie geven (`room_places`, was 2); een groepsles in de zaal neemt de hele zaal.
- Plaats van de les: standaard "Grote zaal, Hoogstraat 40, Hofstade (Aalst)" (`default_location` in `app_config`); bij 1-op-1-uren en groepslessen kan de coach een andere plaats opgeven. De klant ziet de plaats bij het boeken, in zijn sessies en in elke melding (wat, met wie, wanneer, waar).
- Coach actief of afwezig: schakelaar op "Voor jou": op de telefoon een slanke eigen kaart onder de begroeting, op de computer een kleine schakelaar naast zijn level; de mascotte reageert als hij schakelt. Afwezig = niet boekbaar (ook op de server), geplande sessies blijven. Een lichtje (groen/grijs) op zijn foto, zijn teamkaart, de trainingskaarten en in de filter van het boekingsrooster.
- Elke wijziging van een coach (uren, groepsles, verplaatste sessie, nieuwe soort les, actief/afwezig) komt in `coach_log` en geeft de admin een melding die Admin → Team → Changes opent (`admin.html#changes`); het Team-tabblad telt wat nieuw is. Omgekeerd krijgt een coach een melding als de admin iets voor hem wijzigt, en een tweede trainer als hij op een les gezet wordt. Een sollicitatie als trainer geeft de admin een melding; de sollicitant hoort het antwoord.
- Admin → Team → "Personal trainings on the home page": per 1-op-1-kaart eigen tekst en foto, of de kaart verbergen; hetzelfde bestond al voor de groepstrainingen.
- Instagram: de map `instagram/` bevat profielfoto, 9 posts, story-sjablonen, covers en `teksten.md`; `tools/instagram-posts.js` en `tools/shop-art.js` maken de beelden opnieuw.

Wat Pieter zelf nog moet doen (vraag of het gebeurd is voor je erop bouwt):

- De laatste `supabase/schema.sql` uitvoeren (geboortedag, chatmeldingen aan/uit, account van Levelupy, en voor de shop: voorbeeldartikelen, levering, bestelstatus; voor de coaches: soorten les en goedkeuring, de groepschat Coaches, het coach-welkom, het opruimen na 2 weken, het volledige klassement, de plaats van de les, de kaarten van personal training, actief/afwezig, het logboek van coachwijzigingen, meerdere trainers per groepsles, een groepstraining verwijderen, de gratis eerste sessie, de zaalregels, het aanpassen van een trainerkaart en chats archiveren en verwijderen). Tot dan werkt de shop zoals vroeger, zonder leveringskeuze, en kan een coach bij 1-op-1-uren alleen "Personal training" kiezen.
- Shop: per voorbeeldartikel beslissen of hij het echt verkoopt, dan foto, tekst, prijs en voorraad nakijken en het aanzetten in Admin → Shop. Levering (prijs, gratis vanaf) instellen in Admin → Shop → Delivery; staat standaard uit.
- Shop, wettelijk: ondernemingsgegevens (naam, adres, btw-nummer), algemene voorwaarden en het herroepingsrecht horen op een Belgische webshop; supplementen onder eigen merk moeten genotificeerd zijn (FOODSUP). Dat moet hij zelf aanleveren of laten nakijken.
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
- Shop: producten beheren zonder code (naam, tekst, foto, varianten toevoegen in Admin) bestaat nog niet: nieuwe artikelen komen in `ITEMS` (`game.js`) en in `shop_items` (`schema.sql`).
- Shop: de betaling wordt niet op de server nagekeken bij PayPal. `record_order` vertrouwt het bestelnummer van de browser en rekent zelf de prijzen na; wie de functie rechtstreeks aanroept, kan zo XP krijgen zonder te betalen. Een Edge Function die de PayPal-betaling controleert, lost dat op.
- Shop: voorraad per maat of smaak bestaat niet (alleen per artikel).
