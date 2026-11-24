// The frame around every screen: on a phone a slim bar on top and four buttons at the bottom,
// on a computer the same four in a column on the left.
import { NavLink, Outlet } from "react-router-dom";
import { Bell } from "lucide-react";
import { NAV } from "../nav";
import type { Role } from "../nav";

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="h-9 w-9" aria-hidden>
        <rect width="64" height="64" rx="16" className="fill-brand" />
        <path d="M20 34l12-12 12 12M20 46l12-12 12 12" fill="none" className="stroke-accent" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="leading-none">
        <span className="block text-[17px] font-bold tracking-tight">LEVEL-UP</span>
        <span className="block text-xs font-medium text-muted">movement</span>
      </span>
    </span>
  );
}

export default function AppShell({ role }: { role: Role }) {
  const items = NAV[role];
  return (
    <div className="min-h-dvh sm:pl-60">
      {/* computer: the column on the left */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface px-4 py-6 sm:flex">
        <div className="px-2"><Logo /></div>
        <nav aria-label="Hoofdmenu" className="mt-8 grid gap-1">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.to === "/"}
              className={({ isActive }) => `flex h-11 items-center gap-3 rounded-field px-3 font-medium transition-colors ${isActive ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-sunken hover:text-ink"}`}>
              <it.icon size={20} aria-hidden />{it.label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/stijl" className="mt-auto rounded-field px-3 py-2 text-sm text-faint hover:text-ink">Stijl en bouwstenen</NavLink>
      </aside>

      {/* phone: the bar on top */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur sm:hidden">
        <Logo />
        <button type="button" aria-label="Meldingen" className="grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-sunken"><Bell size={20} /></button>
      </header>

      <main className="pb-24 sm:pb-0"><Outlet /></main>

      {/* phone: four buttons at the bottom */}
      <nav aria-label="Hoofdmenu" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.to === "/"}
            className={({ isActive }) => `grid h-16 place-content-center justify-items-center gap-1 text-xs font-medium ${isActive ? "text-accent-ink" : "text-muted"}`}>
            {({ isActive }) => (<>
              <span className={`grid h-7 w-14 place-items-center rounded-full transition-colors ${isActive ? "bg-accent-soft" : ""}`}><it.icon size={20} aria-hidden /></span>
              {it.label}
            </>)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
