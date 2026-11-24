// Every building block on one page. This is the reference for the look: if something should look different
// everywhere, it changes here (src/ui and the tokens in src/index.css), never on one screen.
import { useState } from "react";
import { CalendarDays, Plus, Inbox } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHead, Chip, Empty, Field, List, ListRow, Notice, Page, Progress, Sheet, Stat, Switch, Tabs } from "../ui";
import { ROLE_LABEL } from "../nav";
import type { Role } from "../nav";

const SWATCHES: [string, string, string][] = [
  ["bg-canvas", "Achtergrond", "#F5F6F2"], ["bg-surface", "Kaart", "#FFFFFF"], ["bg-sunken", "Verzonken", "#ECEEE8"],
  ["bg-ink", "Tekst", "#13211B"], ["bg-brand", "Hoofdknop", "#12261D"], ["bg-accent", "Accent", "#1FB877"],
  ["bg-accent-soft", "Accent zacht", "#E1F5EA"], ["bg-warn-soft", "Let op", "#FBEFD9"], ["bg-danger-soft", "Fout", "#FBE8E6"],
];

export default function Stijl({ role, onRole }: { role: Role; onRole: (r: Role) => void }) {
  const [tab, setTab] = useState<"komend" | "voorbij" | "geannuleerd">("komend");
  const [hour, setHour] = useState("10:00");
  const [on, setOn] = useState(true);
  const [sheet, setSheet] = useState(false);
  return (
    <Page title="Stijl" text="De bouwstenen waarmee elk scherm gemaakt wordt.">
      <Card>
        <CardHead title="Bekijk de app als" hint="Elke rol heeft zijn eigen vier knoppen in de navigatie." />
        <Tabs label="Rol" value={role} onChange={onRole} tabs={(Object.keys(ROLE_LABEL) as Role[]).map((id) => ({ id, label: ROLE_LABEL[id] }))} />
      </Card>

      <Card>
        <CardHead title="Kleuren" hint="Eén accentkleur. Groen betekent: actief, vooruitgang of gekozen." />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {SWATCHES.map(([cls, name, hex]) => (
            <div key={cls}>
              <div className={`h-14 rounded-field border border-line ${cls}`} />
              <p className="mt-1.5 text-sm font-medium">{name}</p>
              <p className="text-xs text-muted">{hex}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title="Tekst" hint="Eén lettertype (Inter), gewone hoofdletters, geen schuinschrift." />
        <p className="text-4xl leading-tight font-semibold tracking-tight">Titel van een scherm</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">Titel van een kaart</p>
        <p className="mt-2">Gewone tekst: kort, in gewone woorden, één boodschap per regel.</p>
        <p className="mt-1 text-sm text-muted">Tweede regel of uitleg, kleiner en grijzer.</p>
      </Card>

      <Card>
        <CardHead title="Knoppen" hint="Eén hoofdknop per scherm; de rest is rustiger." />
        <div className="flex flex-wrap gap-2">
          <Button>Boek deze sessie</Button>
          <Button variant="secondary">Verplaatsen</Button>
          <Button variant="ghost">Later</Button>
          <Button variant="danger">Annuleren</Button>
          <Button icon={<Plus size={18} />} size="sm">Uren toevoegen</Button>
          <Button disabled>Niet beschikbaar</Button>
        </div>
        <Button block size="lg" className="mt-4">Bevestigen</Button>
      </Card>

      <Card>
        <CardHead title="Tabs en keuzes" hint="De rij schuift alleen zijwaarts." />
        <Tabs label="Sessies" value={tab} onChange={setTab} tabs={[{ id: "komend", label: "Komend", count: 2 }, { id: "voorbij", label: "Voorbij" }, { id: "geannuleerd", label: "Geannuleerd" }]} />
        <p className="mt-5 mb-2 text-sm font-medium">Kies een uur</p>
        <div className="slide-x gap-2">
          {["09:00", "10:00", "11:00", "14:00", "17:00", "18:00", "19:00"].map((h) => (
            <Chip key={h} selected={h === hour} disabled={h === "14:00"} onClick={() => setHour(h)}>{h}</Chip>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title="Invoervelden" />
        <div className="grid gap-4">
          <Field label="E-mailadres" type="email" placeholder="naam@voorbeeld.be" autoComplete="off" />
          <Field label="Wachtwoord" type="password" hint="Minstens 8 tekens." autoComplete="off" />
          <Field label="Geboortedatum" defaultValue="32/13/2000" error="Vul een bestaande datum in." />
          <div className="flex items-center justify-between gap-4">
            <div><p className="font-medium">Meldingen van de chat</p><p className="text-sm text-muted">Een melding bij elk nieuw bericht.</p></div>
            <Switch checked={on} onChange={setOn} label="Meldingen van de chat" />
          </div>
        </div>
      </Card>

      <div>
        <h2 className="mb-2 px-1 text-lg font-semibold">Lijst</h2>
        <List>
          <ListRow lead={<Avatar name="Lars Peeters" status="active" />} title="Lars" text="Boksen · conditie" trail={<Badge tone="accent">Actief</Badge>} onClick={() => {}} />
          <ListRow lead={<Avatar name="Maxim Buyl" status="away" />} title="Maxim" text="Wielrennen" trail={<Badge>Afwezig</Badge>} onClick={() => {}} />
          <ListRow lead={<span className="grid h-11 w-11 place-items-center rounded-full bg-sunken text-muted"><CalendarDays size={20} /></span>} title="Za 28 nov · 10:00" text="Boksen met Lars · Grote zaal" trail={<Badge tone="warn">Wacht op bevestiging</Badge>} />
        </List>
      </div>

      <Card>
        <CardHead title="Cijfers, labels en meldingen" />
        <div className="grid grid-cols-3 gap-2">
          <Stat value="18" label="sessies" /><Stat value="€ 50" label="per uur" /><Stat value="4" label="weken reeks" />
        </div>
        <div className="mt-4"><Progress value={1340} max={1500} label="Level 6" note="1340 / 1500 XP" /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>Neutraal</Badge><Badge tone="accent">Bevestigd</Badge><Badge tone="warn">Wacht</Badge><Badge tone="danger">Geannuleerd</Badge>
        </div>
        <div className="mt-4 grid gap-2">
          <Notice>Je eerste sessie is gratis.</Notice>
          <Notice tone="warn">Je coach moet deze sessie nog bevestigen.</Notice>
          <Notice tone="danger">Dit uur is net door iemand anders geboekt.</Notice>
        </div>
      </Card>

      <Card>
        <CardHead title="Venster" hint="Op de telefoon schuift het van onder omhoog." action={<Button variant="secondary" size="sm" onClick={() => setSheet(true)}>Open venster</Button>} />
        <Empty icon={<Inbox size={22} />} title="Nog geen sessies" text="Zo ziet een leeg scherm eruit: één zin en één knop." action={<Button size="sm">Boek je eerste sessie</Button>} />
      </Card>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Sessie bevestigen"
        footer={<div className="flex gap-2"><Button variant="secondary" block onClick={() => setSheet(false)}>Terug</Button><Button block onClick={() => setSheet(false)}>Bevestigen</Button></div>}>
        <p className="text-2xl font-semibold tracking-tight">Boksen met Lars</p>
        <p className="mt-1 text-muted">Zaterdag 28 november · 10:00 – 11:00</p>
        <p className="mt-1 text-muted">Grote zaal, Hoogstraat 40, Hofstade</p>
        <div className="mt-4"><Notice>Je eerste sessie is gratis.</Notice></div>
      </Sheet>
    </Page>
  );
}
