// Example start screens with made-up data, only to judge the look. Step 2 and later replace them with the
// real screens (and real data from Supabase).
import { useState } from "react";
import { CalendarDays, Clock, MapPin, Flame, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, Badge, Button, Card, CardHead, List, ListRow, Notice, Page, Progress, Stat, Switch } from "../ui";

const Example = () => <Notice>Voorbeeld met verzonnen gegevens, om de look te beoordelen.</Notice>;

export function StartKlant() {
  return (
    <Page title="Hallo Lien" text="Klaar voor je volgende sessie?">
      <Example />
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Badge tone="accent">Volgende sessie</Badge>
          <span className="text-sm text-muted">over 2 dagen</span>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Boksen met Lars</h2>
        <ul className="mt-3 grid gap-2 text-[15px] text-muted">
          <li className="flex items-center gap-2.5"><CalendarDays size={18} aria-hidden /> Zaterdag 28 november</li>
          <li className="flex items-center gap-2.5"><Clock size={18} aria-hidden /> 10:00 – 11:00</li>
          <li className="flex items-center gap-2.5"><MapPin size={18} aria-hidden /> Grote zaal, Hoogstraat 40, Hofstade</li>
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/boeken" className="contents"><Button>Nog een sessie boeken</Button></Link>
          <Button variant="secondary">Verplaatsen</Button>
        </div>
      </Card>

      <Card>
        <CardHead title="Je vooruitgang" action={<Badge>Level 6 · Athlete</Badge>} />
        <Progress value={1340} max={1500} label="1340 XP" note="nog 160 XP tot level 7" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat value="18" label="sessies" />
          <Stat value={<span className="inline-flex items-center gap-1">4 <Flame size={18} className="text-warn" aria-hidden /></span>} label="weken reeks" />
          <Stat value={<span className="inline-flex items-center gap-1">#7 <Trophy size={18} className="text-accent-ink" aria-hidden /></span>} label="klassement" />
        </div>
      </Card>

      <div>
        <h2 className="mb-2 px-1 text-lg font-semibold">Coaches</h2>
        <List>
          <ListRow lead={<Avatar name="Lars Peeters" status="active" />} title="Lars" text="Boksen · conditie" trail={<Badge tone="accent">3 uren vrij</Badge>} onClick={() => {}} />
          <ListRow lead={<Avatar name="Pieter Van den Spiegel" status="active" />} title="Pieter" text="CrossFit · calisthenics" trail={<Badge tone="accent">5 uren vrij</Badge>} onClick={() => {}} />
          <ListRow lead={<Avatar name="Maxim Buyl" status="away" />} title="Maxim" text="Wielrennen" trail={<Badge>Afwezig</Badge>} onClick={() => {}} />
        </List>
      </div>
    </Page>
  );
}

export function StartCoach() {
  const [on, setOn] = useState(true);
  return (
    <Page title="Vandaag" text="Dinsdag 24 november">
      <Example />
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">{on ? "Je bent actief" : "Je bent afwezig"}</p>
            <p className="text-sm text-muted">{on ? "Klanten kunnen je boeken." : "Niemand kan je nu boeken. Wat gepland is, blijft."}</p>
          </div>
          <Switch checked={on} onChange={setOn} label="Actief of afwezig" />
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        <Stat value="2" label="te doen" />
        <Stat value="3" label="vandaag" />
        <Stat value="€ 405" label="deze maand" />
      </div>
      <div>
        <h2 className="mb-2 px-1 text-lg font-semibold">Te doen</h2>
        <List>
          <ListRow lead={<Avatar name="Emma Claes" />} title="Emma vraagt een sessie" text="Do 26 nov · 18:00 · Boksen" trail={<Badge tone="warn">Bevestigen</Badge>} onClick={() => {}} />
          <ListRow lead={<Avatar name="Jonas Maes" />} title="Jonas: sessie afronden" text="Gisteren · 19:00" trail={<Badge tone="warn">Afronden</Badge>} onClick={() => {}} />
        </List>
      </div>
      <div>
        <h2 className="mb-2 px-1 text-lg font-semibold">Vandaag</h2>
        <List>
          <ListRow lead={<span className="w-12 text-center font-semibold">10:00</span>} title="Lien" text="Boksen · Grote zaal" onClick={() => {}} />
          <ListRow lead={<span className="w-12 text-center font-semibold">17:00</span>} title="Bootcamp" text="Groepsles · 8 van 12" onClick={() => {}} />
          <ListRow lead={<span className="w-12 text-center font-semibold">19:00</span>} title="Kobe" text="Personal training · Grote zaal" onClick={() => {}} />
        </List>
      </div>
    </Page>
  );
}

export function StartAdmin() {
  return (
    <Page title="Overzicht" text="Wat vandaag je aandacht vraagt">
      <Example />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value="12" label="sessies deze week" />
        <Stat value="3 / 4" label="coaches actief" />
        <Stat value="€ 1.240" label="omzet deze maand" />
        <Stat value="2" label="nieuwe leden" />
      </div>
      <div>
        <h2 className="mb-2 px-1 text-lg font-semibold">Wacht op jou</h2>
        <List>
          <ListRow title="Nieuwe soort les: Kettlebell" text="Voorgesteld door Lars" trail={<Badge tone="warn">Goedkeuren</Badge>} onClick={() => {}} />
          <ListRow title="Sollicitatie als trainer" text="Nina · yoga" trail={<Badge tone="warn">Bekijken</Badge>} onClick={() => {}} />
          <ListRow title="3 wijzigingen van coaches" text="Uren en een verplaatste sessie" onClick={() => {}} />
        </List>
      </div>
    </Page>
  );
}
