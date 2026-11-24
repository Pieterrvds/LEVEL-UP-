import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import AppShell from "./shell/AppShell";
import type { Role } from "./nav";
import Stijl from "./pages/Stijl";
import { StartKlant, StartCoach, StartAdmin } from "./pages/Voorbeeld";
import Later from "./pages/Later";

// Until logging in is built (step 1) the role is a choice on the "Stijl" page, kept on this device,
// so the navigation of a client, a coach and the admin can each be looked at.
const KEY = "lum.voorbeeldrol";
const stored = (): Role => {
  try { const v = localStorage.getItem(KEY); return v === "coach" || v === "admin" ? v : "klant"; } catch { return "klant"; }
};

export default function App() {
  const [role, setRole] = useState<Role>(stored);
  const pick = (r: Role) => { setRole(r); try { localStorage.setItem(KEY, r); } catch { /* private window: fine */ } };
  const Start = role === "coach" ? StartCoach : role === "admin" ? StartAdmin : StartKlant;
  return (
    <Routes>
      <Route element={<AppShell role={role} />}>
        <Route index element={<Start />} />
        <Route path="stijl" element={<Stijl role={role} onRole={pick} />} />
        <Route path="boeken" element={<Later title="Boeken" step="stap 2" text="Kies een training, een coach en een uur." />} />
        <Route path="agenda" element={<Later title="Agenda" step="stap 4" text="Je sessies en groepslessen per dag, en je uren." />} />
        <Route path="team" element={<Later title="Team" step="stap 7" text="Elke trainer met zijn lessen en uren." />} />
        <Route path="chat" element={<Later title="Chat" step="stap 6" text="Berichten met je coach of je klanten." />} />
        <Route path="profiel" element={<Later title="Profiel" step="stap 3" text="Je sessies, je vooruitgang en je instellingen." />} />
        <Route path="meer" element={<Later title="Meer" step="stap 7" text="Leden, betalingen, nieuws en instellingen." />} />
        <Route path="*" element={<Later title="Niet gevonden" text="Deze pagina bestaat niet." />} />
      </Route>
    </Routes>
  );
}
