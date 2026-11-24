// The building blocks of LEVEL-UP movement. Every screen is made of these; a screen never styles a button, card
// or field itself. A new block is added here first (and shown on the "Stijl" page), then used.
import { useEffect, useId, useRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ---------- Button ---------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  icon?: ReactNode;
};
const BUTTON = {
  primary: "bg-brand text-white hover:bg-ink active:bg-ink",
  secondary: "bg-surface text-ink border border-line hover:bg-sunken",
  ghost: "text-ink hover:bg-sunken",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white",
};
const BUTTON_SIZE = { sm: "h-9 px-4 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-13 px-6 text-base" };
export function Button({ variant = "primary", size = "md", block, icon, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} {...rest}
      className={cx("inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors",
        "disabled:opacity-45 disabled:pointer-events-none", BUTTON[variant], BUTTON_SIZE[size], block && "w-full", className)}>
      {icon}{children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <section className={cx("rounded-card bg-surface border border-line shadow-card", pad && "p-5", className)}>{children}</section>;
}
export function CardHead({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      {action}
    </header>
  );
}

/* ---------- Field ---------- */
type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string };
export function Field({ label, hint, error, className, id, ...rest }: FieldProps) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div className={className}>
      <label htmlFor={fid} className="mb-1.5 block text-sm font-medium">{label}</label>
      <input id={fid} {...rest} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${fid}-note` : undefined}
        className={cx("h-12 w-full rounded-field border bg-surface px-4 text-base text-ink placeholder:text-faint",
          "focus:outline-2 focus:outline-offset-0 focus:outline-accent-ink", error ? "border-danger" : "border-line")} />
      {(error || hint) && <p id={`${fid}-note`} className={cx("mt-1.5 text-sm", error ? "text-danger" : "text-muted")}>{error || hint}</p>}
    </div>
  );
}

/* ---------- Tabs: one row that only slides sideways ---------- */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="slide-x gap-1 rounded-full bg-sunken p-1">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}
          className={cx("h-9 flex-1 shrink-0 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors",
            t.id === value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")}>
          {t.label}{t.count ? <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-xs text-accent-ink">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ---------- Chip: one choice out of a few (an hour, a day, a filter) ---------- */
export function Chip({ selected, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button type="button" aria-pressed={selected} {...rest}
      className={cx("h-11 min-w-16 shrink-0 rounded-field border px-3 text-[15px] font-semibold transition-colors disabled:opacity-40 disabled:line-through",
        selected ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink hover:border-ink", className)}>
      {children}
    </button>
  );
}

/* ---------- Badge ---------- */
const BADGE = { neutral: "bg-sunken text-muted", accent: "bg-accent-soft text-accent-ink", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" };
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={cx("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap", BADGE[tone])}>{children}</span>;
}

/* ---------- Avatar (with the coach's light: green = takes bookings, grey = away) ---------- */
export function Avatar({ name, src, size = 44, status }: { name: string; src?: string; size?: number; status?: "active" | "away" }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {src
        ? <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
        : <span className="grid h-full w-full place-items-center rounded-full bg-accent-soft font-semibold text-accent-ink" style={{ fontSize: size * 0.36 }}>{initials}</span>}
      {status && <span title={status === "active" ? "Actief" : "Afwezig"}
        className={cx("absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-surface", status === "active" ? "bg-accent" : "bg-faint")} />}
    </span>
  );
}

/* ---------- ListRow ---------- */
type RowProps = { lead?: ReactNode; title: string; text?: string; trail?: ReactNode; onClick?: () => void; chevron?: boolean };
export function ListRow({ lead, title, text, trail, onClick, chevron }: RowProps) {
  const body = (
    <>
      {lead}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold">{title}</span>
        {text && <span className="block truncate text-sm text-muted">{text}</span>}
      </span>
      {trail}
      {(chevron ?? Boolean(onClick)) && <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />}
    </>
  );
  const cls = "flex min-h-16 w-full items-center gap-3 px-5 py-3";
  return onClick
    ? <button type="button" onClick={onClick} className={cx(cls, "transition-colors hover:bg-canvas")}>{body}</button>
    : <div className={cls}>{body}</div>;
}
/** Rows under each other inside one card, with a hairline between them */
export function List({ children }: { children: ReactNode }) {
  return <Card pad={false} className="divide-y divide-line overflow-hidden">{children}</Card>;
}

/* ---------- Progress ---------- */
export function Progress({ value, max, label, note }: { value: number; max: number; label?: string; note?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      {(label || note) && <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm"><span className="font-semibold">{label}</span><span className="text-muted">{note}</span></div>}
      <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className="h-2 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------- Stat: one number that matters ---------- */
export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-field bg-sunken px-4 py-3">
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}

/* ---------- Switch ---------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-line")}>
      <span className={cx("absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-card transition-transform", checked && "translate-x-5")} />
    </button>
  );
}

/* ---------- Notice: one line that tells you something ---------- */
const NOTICE = { info: "bg-accent-soft text-accent-ink", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" };
export function Notice({ tone = "info", children }: { tone?: keyof typeof NOTICE; children: ReactNode }) {
  return <p role={tone === "danger" ? "alert" : "status"} className={cx("rounded-field px-4 py-3 text-sm font-medium", NOTICE[tone])}>{children}</p>;
}

/* ---------- Empty ---------- */
export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-10 text-center">
      {icon && <span className="mb-1 grid h-12 w-12 place-items-center rounded-full bg-sunken text-muted">{icon}</span>}
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ---------- Sheet: a window. On a phone it comes up from the bottom, on a computer it sits in the middle ---------- */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-0 mt-auto w-full max-w-none rounded-t-card bg-surface shadow-float sm:m-auto sm:max-w-md sm:rounded-card">
      <div className="flex max-h-[85dvh] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-sunken"><X size={20} /></button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</footer>}
      </div>
    </dialog>
  );
}

/* ---------- Page: the title of a screen and its content, at a calm width ---------- */
export function Page({ title, text, action, children }: { title: string; text?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-8 sm:px-8 sm:pt-10">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-semibold sm:text-4xl">{title}</h1>
          {text && <p className="mt-1.5 text-muted">{text}</p>}
        </div>
        {action}
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">{children}</div>
    </div>
  );
}
