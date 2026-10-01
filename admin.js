// LEVEL-UP admin dashboard: members, bookings and trainers at a glance.
// Only accounts listed in ADMIN_EMAILS (game.js) can open it.

const root = document.getElementById("adminRoot");
const { esc, TRAINERS, RANKS } = LevelUp;

// Chart colours for the dark surface. Trainers use their own chartColor
// (validated pair); single-series charts use one green.
const SINGLE = "#3fa34d";
const CHART = { grid: "#1f3026", axis: "#3a5242" };

const state = {
  query: "",
  sort: "joined",
  bookingView: "upcoming",
  bookingTrainer: "all",
  tables: {}, // chart key -> showing table view
  fin: { mode: "month", offset: 0, statementMonth: null }
};
let data = null;
const tips = new Map();

const euro = (n) => `€${n.toFixed(2)}`;
const fmtDate = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const isUpcoming = (b) => ["awaiting_payment", "pending", "confirmed"].includes(b.status) && LevelUp.slotStart(b.date, b.hour) > new Date();
const STATUS_LABEL = { awaiting_payment: "Not paid yet", cancelled: "Cancelled", pending: "Pending", confirmed: "Confirmed", declined: "Declined", completed: "Completed", late_cancel: "Late cancel · charged", no_show: "No-show · charged", expired: "Expired" };
const STATUS_CLASS = { late_cancel: "declined", no_show: "declined", expired: "declined", cancelled: "declined", awaiting_payment: "pending" };
// Sessions the player still has to pay (at the HQ, or online later)
const toCollect = (b) => !["pack", "reward"].includes(b.payMethod) && b.payStatus === "unpaid" && ["pending", "confirmed", "completed", "no_show", "late_cancel"].includes(b.status);
const BILLABLE = ["completed", "no_show", "late_cancel"];
// Confirmed sessions from their day on that nobody rewarded or marked as no-show yet
const toSettle = (b) => b.status === "confirmed" && b.date <= LevelUp.dateKey();
const slotLabel = (b) => {
  const d = LevelUp.parseDate(b.date);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${String(b.hour).padStart(2, "0")}:00`;
};

// ---------- Data ----------
async function loadData() {
  const { players, bookings, applications, unlinkedTrainers, pricing, packs, vouchers, hours } = await LevelUp.adminData();
  const rows = players.map((p) => {
    const own = bookings.filter((b) => b.email === p.email);
    return {
      ...p,
      prog: LevelUp.progress(p.xp),
      sessions: own.filter((b) => b.status === "completed").length,
      upcoming: own.filter(isUpcoming).length,
      spent: p.purchases.reduce((sum, o) => sum + o.total, 0),
      lastSeen: p.lastLogin || p.createdAt
    };
  });
  return {
    applications,
    unlinkedTrainers,
    pricing,
    packs,
    vouchers,
    hours,
    rawBookings: bookings,
    players: rows,
    members: rows.filter((p) => !p.admin),
    active: bookings.filter((b) => ["pending", "confirmed", "completed"].includes(b.status)),
    bookings: [...bookings].sort((a, b) => LevelUp.slotStart(a.date, a.hour) - LevelUp.slotStart(b.date, b.hour))
  };
}

// ---------- Gate ----------
function renderGate(kind) {
  root.innerHTML = kind === "login" ? `
    <section class="no-save pixel-frame">
      <p class="section-kicker">Game master console</p>
      <h1 class="section-title">Admin dashboard</h1>
      <p>Log in with the admin account to see members, bookings and trainers.</p>
      <div class="btn-row"><button type="button" class="btn btn-primary" data-auth-open="login">Log in</button></div>
    </section>` : `
    <section class="no-save pixel-frame">
      <p class="section-kicker">Access denied</p>
      <h1 class="section-title">Admins only</h1>
      <p>This page is for the LEVEL-UP game master. Head back to your own profile.</p>
      <div class="btn-row"><a href="profile.html" class="btn btn-primary">My profile</a></div>
    </section>`;
}

// ---------- Layout ----------
let loading = null;

async function render() {
  if (!LevelUp.isReady()) {
    root.innerHTML = `<p class="board-message">Loading the console…</p>`;
    return;
  }
  const player = LevelUp.getPlayer();
  if (!player) return renderGate("login");
  if (!LevelUp.isAdmin()) return renderGate("denied");

  if (!data) root.innerHTML = `<p class="board-message">Loading members and bookings…</p>`;
  // Only one load at a time; the latest change wins
  const current = (loading = loadData());
  try {
    const fresh = await current;
    if (current !== loading) return;
    data = fresh;
  } catch (err) {
    root.innerHTML = `<section class="no-save pixel-frame"><p class="section-kicker">Server error</p><h1 class="section-title">Can't load data</h1><p>${esc(err.message)}</p></section>`;
    return;
  }
  root.innerHTML = `
    <header class="admin-head">
      <div>
        <p class="section-kicker">Game master console</p>
        <h1 class="section-title">Admin dashboard</h1>
        <p class="muted">Members, bookings and trainers at a glance.</p>
      </div>
      <p class="data-note"><strong>Live data</strong> from the LEVEL-UP server. Schedule: ${LevelUp.calendarStatus() === "ok" ? "open hours come from the Google Calendar." : "the Google Calendar couldn't be read, so the fallback hours are used."}</p>
    </header>

    ${LevelUp.getPricing().onlinePayments ? "" : `
    <section class="panel admin-panel todo-panel">
      <div class="panel-head"><h2>To do: online payments</h2><span class="status-chip pending">Not active</span></div>
      <p>Everyone pays at the headquarters for now. To switch on Mollie (Bancontact, card, Payconiq):</p>
      <ol>
        <li>Create a Mollie account and copy the <strong>test key</strong> (<code>test_…</code>) under Developers → API keys.</li>
        <li>Supabase → Edge Functions → Secrets: set <code>MOLLIE_API_KEY</code> to that key.</li>
        <li>SQL Editor: <code>update public.app_config set value = 'on' where key = 'online_payments';</code></li>
        <li>Book a test session and choose "Paid" on Mollie's test page, then swap the secret for your <strong>live key</strong>.</li>
      </ol>
      <p class="muted small">This reminder disappears once online payments are on. Full guide: README → Payments.</p>
    </section>`}

    <section class="panel admin-panel applications" id="applications"></section>

    <section class="kpi-row" id="kpis" aria-label="Key numbers"></section>

    <section class="panel admin-panel finances" id="finances"></section>

    <section class="panel admin-panel" id="packsPanel"></section>

    <section class="panel admin-panel" id="rewardsPanel"></section>

    <section class="chart-grid">
      ${chartCard("weekly", "Sessions per week", "Last 4 weeks and the next 4, by trainer", true)}
      ${chartCard("trainers", "Sessions by trainer", "All-time sessions, including sessions from before the online schedule")}
      ${chartCard("growth", "Members", "Total members over time")}
      ${chartCard("ranks", "Members by rank", "Where your players are on the ladder")}
    </section>

    <section class="panel admin-panel">
      <div class="panel-head"><h2>Trainers</h2><span class="muted">Occupancy = booked hours of all open hours in the next ${LevelUp.BOOKING_WEEKS_AHEAD} weeks</span></div>
      <div class="trainer-admin-grid" id="trainerCards"></div>
    </section>

    <section class="panel admin-panel" id="hoursPanel"></section>

    <section class="panel admin-panel">
      <div class="panel-head">
        <h2>Bookings</h2>
        <div class="admin-filters">
          <div class="filter-tabs" role="tablist" aria-label="Booking period">
            ${["upcoming", "past", "all"].map((v) => `<button type="button" role="tab" data-booking-view="${v}" aria-selected="${state.bookingView === v}">${v}</button>`).join("")}
          </div>
          <div class="filter-tabs" role="tablist" aria-label="Trainer">
            ${[{ id: "all", short: "All" }, ...TRAINERS].map((t) => `<button type="button" role="tab" data-booking-trainer="${t.id}" aria-selected="${state.bookingTrainer === t.id}">${t.color ? `<span class="dot" style="--c:${t.chartColor}" aria-hidden="true"></span>` : ""}${esc(t.short)}</button>`).join("")}
          </div>
        </div>
      </div>
      <div id="bookingTable"></div>
    </section>

    <section class="panel admin-panel">
      <div class="panel-head">
        <h2>Members</h2>
        <div class="admin-filters">
          <label class="search-field"><span class="sr-only">Search members</span>
            <input type="search" id="memberSearch" placeholder="Search name or email…" value="${esc(state.query)}">
          </label>
          <label class="sort-field"><span>Sort</span>
            <select id="memberSort">
              ${[["joined", "Newest"], ["xp", "Most XP"], ["sessions", "Most sessions"], ["spent", "Most spent"], ["name", "Name"]]
                .map(([v, l]) => `<option value="${v}" ${state.sort === v ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
      <div id="memberTable"></div>
    </section>

    <dialog class="auth-dialog member-dialog" id="memberDialog" aria-labelledby="memberTitle">
      <button type="button" class="dialog-close" data-close aria-label="Close">✕</button>
      <div id="memberContent"></div>
    </dialog>`;

  renderApplications();
  if (location.hash === "#applications" && !render.scrolled) {
    render.scrolled = true;
    document.getElementById("applications").scrollIntoView({ block: "start" });
  }
  renderKpis();
  renderFinances();
  renderPacks();
  renderRewards();
  renderCharts();
  renderTrainerCards();
  renderHours();
  renderBookings();
  renderMembers();
}

function chartCard(key, title, subtitle, legend = false) {
  return `
    <figure class="chart-card">
      <div class="chart-card-head">
        <figcaption>
          <h3>${title}</h3>
          <p class="muted">${subtitle}</p>
        </figcaption>
        <button type="button" class="chart-toggle" data-toggle="${key}" aria-pressed="${Boolean(state.tables[key])}">${state.tables[key] ? "Chart" : "Table"}</button>
      </div>
      ${legend ? `<ul class="chart-legend">${TRAINERS.map((t) => `<li><span class="swatch" style="--c:${t.chartColor}"></span>${esc(t.short)}</li>`).join("")}</ul>` : ""}
      <div class="chart-body" data-chart="${key}"></div>
    </figure>`;
}

// ---------- Trainer applications ----------
function renderApplications() {
  const el = document.getElementById("applications");
  const pending = data.applications.filter((a) => a.status === "pending");
  const reviewed = data.applications.filter((a) => a.status !== "pending").slice(0, 5);
  const options = [
    `<option value="">New trainer card</option>`,
    ...data.unlinkedTrainers.map((id) => `<option value="${esc(id)}">Link to ${esc(LevelUp.trainerById(id)?.name || id)}'s card</option>`)
  ].join("");
  const suggested = (a) => data.unlinkedTrainers.find((id) => {
    const t = LevelUp.trainerById(id);
    return t && a.name.toLowerCase().includes(t.short.toLowerCase());
  });

  el.innerHTML = `
    <div class="panel-head">
      <h2>Trainer applications ${pending.length ? `<span class="count-chip">${pending.length}</span>` : ""}</h2>
      <span class="muted">People who signed up as personal trainer</span>
    </div>
    ${pending.length ? `<ul class="application-list">${pending.map((a) => `
      <li class="application-item">
        <div>
          <p class="coach-who">${esc(a.name)} <span class="muted small">· ${esc(a.email)}</span></p>
          <p><strong>${esc(a.role || "Personal trainer")}</strong>${a.specialties ? ` · ${esc(a.specialties)}` : ""}</p>
          ${a.bio ? `<p class="muted">${esc(a.bio)}</p>` : ""}
          <p class="muted small">Applied ${fmtDate(a.createdAt)}</p>
        </div>
        <div class="application-actions">
          <label class="sr-only" for="card-${a.id}">Trainer card</label>
          <select id="card-${a.id}" data-card-for="${a.id}">${options.replace(`value="${suggested(a) || "__none__"}"`, `value="${suggested(a)}" selected`)}</select>
          <button type="button" class="btn btn-small btn-primary" data-review="approve" data-id="${a.id}">Approve</button>
          <button type="button" class="btn btn-small btn-ghost" data-review="reject" data-id="${a.id}">Reject</button>
        </div>
      </li>`).join("")}</ul>` : `<p class="muted">No open applications. New trainer sign-ups appear here and you get an email.</p>`}
    ${reviewed.length ? `<h3 class="panel-sub">Recently reviewed</h3><ul class="detail-list">${reviewed.map((a) => `
      <li><span>${esc(a.name)} · ${esc(a.role || "Personal trainer")} <span class="status-chip ${a.status === "approved" ? "confirmed" : "declined"}">${a.status}</span></span><span class="muted small">${a.reviewedAt ? fmtDate(a.reviewedAt) : ""}${a.trainerId ? ` · card: ${esc(a.trainerId)}` : ""}</span></li>`).join("")}</ul>` : ""}`;
}

// ---------- Finances ----------
// Clients pay the venue (you) per session; trainers get their fee per completed
// session. The owner's own sessions keep the full price.
const money = LevelUp.euro;

// Selected finance period: this/previous week or month, or all time
function periodRange(mode, offset) {
  const today = LevelUp.parseDate(LevelUp.dateKey());
  if (mode === "week") {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: LevelUp.dateKey(monday), to: LevelUp.dateKey(sunday), label: `Week ${isoWeek(monday)} · ${fmtShort(monday)} – ${fmtShort(sunday)} ${sunday.getFullYear()}` };
  }
  if (mode === "month") {
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return LevelUpStatements.monthRange(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}`);
  }
  return { from: "0000-01-01", to: "9999-12-31", label: "All time" };
}
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
const inRange = (key, r) => key >= r.from && key <= r.to;
const packDay = (pk) => pk.paidAt ? LevelUp.dateKey(new Date(pk.paidAt)) : "";

// Money in a period: charged sessions by session date, packs by payment date
function periodTotals(r) {
  const owner = data.pricing.ownerTrainerId;
  const done = data.rawBookings.filter((b) => BILLABLE.includes(b.status) && inRange(b.date, r));
  const revenue = done.reduce((s, b) => s + b.price, 0);
  const fees = done.filter((b) => b.trainerId !== owner).reduce((s, b) => s + b.trainerFee, 0);
  const packs = data.packs.filter((pk) => pk.status === "paid" && inRange(packDay(pk), r)).reduce((s, pk) => s + pk.price, 0);
  const free = done.filter((b) => b.priceType === "reward").length;
  return { ...r, done, sessions: done.length, free, revenue, fees, share: revenue - fees, packs };
}

// Per trainer: the period's sessions, plus what is owed right now (all time)
function financeRows(r) {
  const { pricing, rawBookings } = data;
  const trainerIds = [...new Set([...TRAINERS.map((t) => t.id), ...rawBookings.map((b) => b.trainerId)])];
  return trainerIds.map((id) => {
    const own = rawBookings.filter((b) => b.trainerId === id);
    const all = own.filter((b) => BILLABLE.includes(b.status));
    const done = all.filter((b) => inRange(b.date, r));
    const isOwner = id === pricing.ownerTrainerId;
    const earnedAll = all.reduce((s, b) => s + b.trainerFee, 0);
    const paidAll = isOwner ? earnedAll : all.filter((b) => b.payoutAt).reduce((s, b) => s + b.trainerFee, 0);
    const payouts = all.map((b) => b.payoutAt).filter(Boolean).sort();
    const upcoming = own.filter(isUpcoming);
    return {
      id,
      trainer: LevelUp.trainerById(id),
      isOwner,
      sessions: done.length,
      revenue: done.reduce((s, b) => s + b.price, 0),
      earned: done.reduce((s, b) => s + b.trainerFee, 0),
      owed: earnedAll - paidAll,
      unpaidSessions: isOwner ? 0 : all.filter((b) => !b.payoutAt).length,
      expected: upcoming.filter((b) => b.status === "confirmed").reduce((s, b) => s + b.trainerFee, 0),
      pipeline: upcoming.reduce((s, b) => s + b.price, 0),
      lastPayout: payouts[payouts.length - 1] || null
    };
  }).filter((x) => x.trainer || x.sessions);
}

// Rows of the overview table: the 12 weeks/months up to the selected one (all time: every month)
function overviewRows() {
  const { mode, offset } = state.fin;
  const first = [...data.rawBookings.map((b) => b.date), ...data.packs.map(packDay)].filter(Boolean).sort()[0] || LevelUp.dateKey();
  // no rows before LEVEL-UP's first booking (the selected period always shows)
  const keep = (rows) => rows.filter((o, i) => i === 0 || o.to >= first);
  if (mode === "week") return keep(Array.from({ length: 12 }, (_, i) => periodTotals(periodRange("week", offset - i))));
  let count = 12;
  if (mode === "all") {
    const today = new Date();
    count = first ? Math.max(1, (today.getFullYear() - +first.slice(0, 4)) * 12 + today.getMonth() + 1 - +first.slice(5, 7) + 1) : 1;
  }
  return keep(Array.from({ length: count }, (_, i) => periodTotals(periodRange("month", (mode === "month" ? offset : 0) - i))));
}

function renderFinances() {
  const el = document.getElementById("finances");
  const { pricing } = data;
  const { mode, offset } = state.fin;
  const period = periodTotals(periodRange(mode, offset));
  const rows = financeRows(period);
  const owed = rows.reduce((s, r) => s + r.owed, 0);
  const pipeline = rows.reduce((s, r) => s + r.pipeline, 0);
  const paidPacks = data.packs.filter((pk) => pk.status === "paid");
  const unusedCredits = paidPacks.reduce((n, pk) => n + pk.remaining, 0);
  const collect = data.rawBookings.filter(toCollect);
  const refundsOpen = data.rawBookings.filter((b) => b.refundStatus === "manual");
  const overview = overviewRows();
  const months = LevelUpStatements.recentMonths(13);
  const statementMonth = state.fin.statementMonth || (mode === "month" ? period.from.slice(0, 7) : months[0]);
  const tile = (label, value, note, cls = "") => `
    <div class="kpi ${cls}"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span><span class="kpi-note">${note}</span></div>`;

  el.innerHTML = `
    <div class="panel-head">
      <h2>Finances</h2>
      <span class="muted">${money(pricing.price)} per session · trainer gets ${money(pricing.fee)} · you keep ${money(pricing.price - pricing.fee)} (and the full ${money(pricing.price)} for your own sessions)</span>
    </div>

    <div class="period-bar">
      <div class="filter-tabs" role="tablist" aria-label="Period">
        ${[["week", "Week"], ["month", "Month"], ["all", "All time"]].map(([v, l]) => `<button type="button" role="tab" data-fin-mode="${v}" aria-selected="${mode === v}">${l}</button>`).join("")}
      </div>
      <div class="period-nav">
        ${mode === "all" ? "" : `<button type="button" class="week-btn" data-fin-step="-1" aria-label="Previous ${mode}">◀</button>`}
        <strong class="period-label">${esc(period.label)}</strong>
        ${mode === "all" ? "" : `<button type="button" class="week-btn" data-fin-step="1" aria-label="Next ${mode}" ${offset >= 0 ? "disabled" : ""}>▶</button>`}
        ${mode !== "all" && offset !== 0 ? `<button type="button" class="link-btn" data-fin-now>Back to this ${mode}</button>` : ""}
      </div>
      <button type="button" class="btn btn-small btn-ghost" data-export="sessions">Download sessions (CSV)</button>
    </div>

    <div class="finance-kpis">
      ${tile("Session revenue", money(period.revenue), `${plural(period.sessions, "charged session")}${period.free ? ` · ${period.free} free (reward)` : ""}`)}
      ${tile("Trainer fees", money(period.fees), "Earned by the trainers")}
      ${tile("Your share", money(period.share), "Venue share + your own sessions", "good")}
      ${tile("Packs sold", money(period.packs), "Paid up front (their sessions count at pack price)")}
    </div>
    <p class="kpi-caption">Right now</p>
    <div class="finance-kpis">
      ${tile("Owed to trainers", money(owed), owed ? "Pay out below" : "All trainers are paid", owed ? "warn" : "")}
      ${tile("To collect", money(collect.reduce((s, b) => s + b.price, 0)), collect.length ? `${plural(collect.length, "session")} not paid yet (HQ)` : "Everything is paid", collect.length ? "warn" : "")}
      ${tile("Booked ahead", money(pipeline), "Pending + confirmed upcoming sessions")}
      ${tile("Unused credits", String(unusedCredits), `${plural(paidPacks.length, "pack")} sold in total`)}
    </div>

    <div class="table-wrap">
      <table class="data-table finance-table">
        <thead><tr><th>Trainer</th><th class="num">Sessions</th><th class="num">Revenue</th><th class="num">Trainer earned</th><th class="num">Owed now</th><th class="num">Expected</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td><span class="dot" style="--c:${r.trainer?.chartColor || "#888"}" aria-hidden="true"></span>${esc(r.trainer?.name || r.id)}${r.isOwner ? ` <span class="muted small">· owner</span>` : ""}</td>
            <td class="num">${r.sessions}</td>
            <td class="num">${money(r.revenue)}</td>
            <td class="num">${r.isOwner ? `<span class="muted">you</span>` : money(r.earned)}</td>
            <td class="num ${r.owed ? "owed" : ""}">${r.isOwner ? "–" : money(r.owed)}</td>
            <td class="num">${r.isOwner ? "–" : money(r.expected)}</td>
            <td class="finance-action">${!r.isOwner && r.owed
              ? `<button type="button" class="btn btn-small btn-primary" data-payout="${esc(r.id)}">Mark ${money(r.owed)} paid</button>`
              : r.lastPayout ? `<span class="muted small">Last paid ${fmtDate(r.lastPayout)}</span>` : ""}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="muted small">Sessions, revenue and trainer earned are for ${esc(period.label.toLowerCase() === "all time" ? "all time" : period.label)}; "Owed now" and "Expected" are always the current totals.</p>
    ${(() => {
      const open = data.rawBookings.filter(toSettle);
      return (refundsOpen.length ? `<p class="settle-note">⚠ ${plural(refundsOpen.length, "payment")} made at the HQ must be given back by hand (${money(refundsOpen.reduce((s, b) => s + b.price, 0))}). Press "Refunded" in Bookings once done.</p>` : "")
        + (open.length ? `<p class="settle-note">⚠ ${plural(open.length, "confirmed session")} still to settle (reward or no-show). Trainers have ${LevelUp.REWARD_WINDOW_DAYS} days; you can settle any time under Bookings → past.</p>` : "");
    })()}

    <div class="fin-sub-head">
      <h3 class="panel-sub">Overview per ${mode === "week" ? "week" : "month"}</h3>
      <button type="button" class="btn btn-small btn-ghost" data-export="overview">Download overview (CSV)</button>
    </div>
    <div class="table-wrap">
      <table class="data-table overview-table">
        <thead><tr><th>${mode === "week" ? "Week" : "Month"}</th><th class="num">Sessions</th><th class="num">Revenue</th><th class="num">Trainer fees</th><th class="num">Your share</th><th class="num">Packs sold</th></tr></thead>
        <tbody>${overview.map((o, i) => `
          <tr class="${i === 0 && mode !== "all" ? "current" : ""}">
            <td class="nowrap">${esc(mode === "week" ? o.label.split(" · ")[0] + " · " + o.label.split(" · ")[1] : o.label)}</td>
            <td class="num">${o.sessions || `<span class="muted">0</span>`}</td>
            <td class="num">${money(o.revenue)}</td>
            <td class="num">${money(o.fees)}</td>
            <td class="num">${money(o.share)}</td>
            <td class="num">${money(o.packs)}</td>
          </tr>`).join("")}
          <tr class="total-row">
            <td>Total</td>
            <td class="num">${overview.reduce((s, o) => s + o.sessions, 0)}</td>
            <td class="num">${money(overview.reduce((s, o) => s + o.revenue, 0))}</td>
            <td class="num">${money(overview.reduce((s, o) => s + o.fees, 0))}</td>
            <td class="num">${money(overview.reduce((s, o) => s + o.share, 0))}</td>
            <td class="num">${money(overview.reduce((s, o) => s + o.packs, 0))}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="fin-sub-head">
      <h3 class="panel-sub">Monthly statements per trainer</h3>
      <label class="sort-field"><span>Month</span>
        <select id="statementMonth">${months.map((m) => `<option value="${m}" ${m === statementMonth ? "selected" : ""}>${esc(LevelUpStatements.monthRange(m).label)}</option>`).join("")}</select>
      </label>
    </div>
    <p class="muted small">A list of every charged session and the total fee, as the basis for the trainer's invoice to you. Trainers can download their own statement in their profile too.</p>
    <ul class="statement-list">${rows.filter((r) => !r.isOwner).map((r) => {
      const st = LevelUpStatements.build(r.id, statementMonth, data.rawBookings);
      return `<li>
        <span><span class="dot" style="--c:${r.trainer?.chartColor || "#888"}" aria-hidden="true"></span><strong>${esc(r.trainer?.name || r.id)}</strong>
          <span class="muted small">${plural(st.rows.length, "session")} · ${money(st.total)}${st.open ? ` · ${money(st.open)} still to pay` : st.rows.length ? " · all paid out" : ""}</span></span>
        <span class="statement-actions">
          <button type="button" class="btn btn-small btn-primary" data-statement="pdf" data-trainer="${esc(r.id)}">PDF</button>
          <button type="button" class="btn btn-small btn-ghost" data-statement="csv" data-trainer="${esc(r.id)}">CSV</button>
        </span>
      </li>`;
    }).join("")}</ul>

    <details class="price-editor">
      <summary>Prices per trainer</summary>
      <p class="muted small">Leave a field empty to use the default (${money(pricing.price)} per session, trainer gets ${money(pricing.fee)}). First session ${money(pricing.introPrice)}, duo ${money(pricing.duoPrice)} (trainer ${money(pricing.duoFee)}) and packs are the same for every trainer. New prices only apply to new bookings.</p>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Trainer</th><th>Price per session</th><th>Trainer gets</th><th></th></tr></thead>
        <tbody>${TRAINERS.map((t) => {
          const own = pricing.trainers[t.id] || {};
          const isOwner = t.id === pricing.ownerTrainerId;
          return `<tr data-price-row="${esc(t.id)}">
            <td class="nowrap"><span class="dot" style="--c:${t.chartColor}" aria-hidden="true"></span>${esc(t.name)}</td>
            <td><input type="number" min="0" max="500" step="1" class="price-input" name="price" value="${own.price ?? ""}" placeholder="${pricing.price}" aria-label="Price for ${esc(t.short)}"></td>
            <td>${isOwner ? `<span class="muted">you keep it all</span>` : `<input type="number" min="0" max="500" step="1" class="price-input" name="fee" value="${own.fee ?? ""}" placeholder="${pricing.fee}" aria-label="Fee for ${esc(t.short)}">`}</td>
            <td><button type="button" class="btn btn-small btn-ghost" data-save-price="${esc(t.id)}">Save</button></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    </details>
    <p class="muted small">A session counts once it is rewarded, marked as no-show or cancelled late by the client (those two are charged in full). First sessions (${money(pricing.introPrice)}) still pay the trainer their full fee; the difference comes out of your share. Pack sessions count at their pack price per session. "Expected" is the trainer fee of confirmed upcoming sessions. "Mark paid" records that you paid the trainer yourself (bank transfer or cash).</p>`;
}

// ---------- Session packs ----------
function renderPacks() {
  const el = document.getElementById("packsPanel");
  const requested = data.packs.filter((pk) => pk.status === "requested");
  const paid = data.packs.filter((pk) => pk.status === "paid");
  el.innerHTML = `
    <div class="panel-head">
      <h2>Session packs ${requested.length ? `<span class="count-chip">${requested.length}</span>` : ""}</h2>
      <span class="muted">${LevelUp.getPricing().packs.map((o) => `${o.size} for ${money(o.price)}`).join(" · ")}</span>
    </div>
    ${requested.length ? `<ul class="application-list">${requested.map((pk) => `
      <li class="application-item">
        <div>
          <p class="coach-who">${esc(pk.name)} <span class="muted small">· ${esc(pk.email)}</span></p>
          <p><strong>${pk.size}-session pack · ${money(pk.price)}</strong> <span class="status-chip pending">${pk.payMethod === "online" ? "Paying online" : "Pays at the HQ"}</span></p>
          <p class="muted small">Requested ${fmtDate(pk.createdAt)}. ${pk.payMethod === "online" ? "Activates automatically once the online payment is in." : "Mark it as paid once you have the money."}</p>
        </div>
        <div class="application-actions">
          <button type="button" class="btn btn-small btn-primary" data-pack-paid="${pk.id}">Mark paid</button>
          <button type="button" class="btn btn-small btn-ghost" data-pack-cancel="${pk.id}">Cancel</button>
        </div>
      </li>`).join("")}</ul>` : `<p class="muted">No pack requests waiting. Players request packs in their profile; you get an email.</p>`}
    ${paid.length ? `<h3 class="panel-sub">Active and used packs</h3><ul class="detail-list">${paid.map((pk) => `
      <li><span>${esc(pk.name)} · ${pk.size}-session pack · ${money(pk.price)}</span><span class="muted small">Paid ${fmtDate(pk.paidAt)} · ${pk.used}/${pk.size} used · ${pk.remaining} left</span></li>`).join("")}</ul>` : ""}`;
}

// Free sessions earned by members (loyalty card + Champion / Legend) and Legend hoodies to hand out
function renderRewards() {
  const el = document.getElementById("rewardsPanel");
  const source = (v) => `${LevelUp.REWARD_SOURCES[v.source].icon} ${LevelUp.REWARD_SOURCES[v.source].title}${v.source === "loyalty" ? ` #${v.seq}` : ""}`;
  const hoodies = data.vouchers.filter((v) => v.hoodie && !v.hoodieGivenAt);
  const open = data.vouchers.filter(LevelUp.voucherOpen);
  const used = data.vouchers.filter((v) => v.bookingId);
  const expired = data.vouchers.filter((v) => !v.bookingId && !LevelUp.voucherOpen(v));
  el.innerHTML = `
    <div class="panel-head">
      <h2>Rewards ${hoodies.length ? `<span class="count-chip">${hoodies.length}</span>` : ""}</h2>
      <span class="muted">Free 1:1 every ${LevelUp.LOYALTY_SESSIONS} sessions · Champion · Legend (+ hoodie)</span>
    </div>
    ${hoodies.length ? `<h3 class="panel-sub">Hoodies to hand out</h3><ul class="application-list">${hoodies.map((v) => `
      <li class="application-item">
        <div>
          <p class="coach-who">${esc(v.name)} <span class="muted small">· ${esc(v.email)}</span></p>
          <p><strong>★ Reached Legend</strong> on ${fmtDate(v.earnedAt)}: give them a LEVEL-UP hoodie at the desk.</p>
        </div>
        <div class="application-actions"><button type="button" class="btn btn-small btn-primary" data-hoodie="${v.id}">Hoodie given</button></div>
      </li>`).join("")}</ul>` : ""}
    ${open.length ? `<h3 class="panel-sub">Free sessions waiting to be booked</h3><ul class="detail-list">${open.map((v) => `
      <li><span>${esc(v.name)} · ${source(v)}</span><span class="muted small">Earned ${fmtDate(v.earnedAt)} · use by ${fmtDate(v.expiresAt)}</span></li>`).join("")}</ul>`
      : `<p class="muted">No open free sessions. Members earn one every ${LevelUp.LOYALTY_SESSIONS} completed sessions and at the Champion and Legend ranks.</p>`}
    <p class="muted small">${plural(used.length, "free session")} booked · ${plural(expired.length, "voucher")} expired unused. A free session costs you the trainer's fee (shown in the finances).</p>`;
}

// ---------- KPI tiles ----------
function renderKpis() {
  const { members, bookings, players } = data;
  const now = new Date();
  const weekAgo = new Date(now - 7 * 864e5);
  const newMembers = members.filter((m) => new Date(m.createdAt) >= weekAgo).length;
  const upcoming = bookings.filter(isUpcoming);
  const next = upcoming[0];
  const thisWeekStart = LevelUp.startOfWeek(0);
  const nextWeekStart = LevelUp.startOfWeek(1);
  const requests = bookings.filter((b) => b.status === "pending" && isUpcoming(b)).length;
  const thisWeek = data.active.filter((b) => {
    const t = LevelUp.slotStart(b.date, b.hour);
    return t >= thisWeekStart && t < nextWeekStart;
  }).length;
  const orders = players.flatMap((p) => p.purchases);
  const revenue = orders.reduce((sum, o) => sum + o.total, 0);
  const healthDone = members.filter((m) => m.healthForm?.valid).length;
  const healthRisk = members.filter((m) => m.healthForm?.valid && m.healthForm.hasRisk).length;
  const avgLevel = members.length ? members.reduce((sum, m) => sum + m.prog.level, 0) / members.length : 0;

  const tile = (label, value, note, good) => `
    <div class="kpi">
      <span class="kpi-label">${label}</span>
      <span class="kpi-value">${value}</span>
      <span class="kpi-note ${good ? "good" : ""}">${note}</span>
    </div>`;

  document.getElementById("kpis").innerHTML = [
    tile("Members", members.length, newMembers ? `▲ ${newMembers} new this week` : "No new members this week", newMembers > 0),
    tile("Upcoming sessions", upcoming.length, requests ? `⚠ ${plural(requests, "request")} waiting for a trainer` : next ? `Next: ${slotLabel(next)} · ${esc(LevelUp.trainerById(next.trainerId).short)}` : "Nothing booked yet", false),
    tile("Sessions this week", thisWeek, `${plural(data.active.filter((b) => b.status === "completed").length, "completed session")} in total`),
    tile("Shop revenue", euro(revenue), plural(orders.length, "order")),
    tile("Health checks", `${healthDone}/${members.length}`, healthRisk ? `⚠ ${plural(healthRisk, "member")} with health info` : "Filled in before the first booking"),
    tile("Average level", avgLevel ? avgLevel.toFixed(1) : "–", members.length ? `${plural(members.length, "member")}` : "No members yet")
  ].join("");
}

// ---------- Chart helpers ----------
function niceStep(max) {
  if (max <= 5) return 1;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function scaleMax(value) {
  const step = niceStep(Math.max(1, value));
  return { max: Math.max(step, Math.ceil(value / step) * step), step };
}

// Column with a 4px rounded data-end and a square base
function colPath(x, y, w, h, rounded) {
  if (h <= 0) return "";
  const r = rounded ? Math.min(4, h, w / 2) : 0;
  return `M${x},${y + h}V${y + r}${r ? `Q${x},${y} ${x + r},${y}` : ""}H${x + w - r}${r ? `Q${x + w},${y} ${x + w},${y + r}` : ""}V${y + h}Z`;
}

// Horizontal bar with a rounded data-end on the right
function barPath(x, y, w, h) {
  if (w <= 0) return "";
  const r = Math.min(4, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

function gridAndTicks(m, width, h, max, step) {
  let out = "";
  for (let t = 0; t <= max; t += step) {
    const y = m.top + h - (t / max) * h;
    out += `<line x1="${m.left}" x2="${width - m.right}" y1="${y}" y2="${y}" stroke="${t === 0 ? CHART.axis : CHART.grid}" stroke-width="1"/>`;
    out += `<text x="${m.left - 8}" y="${y + 4}" text-anchor="end" class="tick">${t.toLocaleString("en-US")}</text>`;
  }
  return out;
}

// Stacked (or single-series) column chart
function columnChart({ key, width, labels, series, marker, label }) {
  const height = 250;
  const m = { top: 26, right: 12, bottom: 36, left: 36 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0));
  const { max, step } = scaleMax(Math.max(...totals));
  const band = w / labels.length;
  const barW = Math.min(24, band * 0.55);

  let svg = gridAndTicks(m, width, h, max, step);
  if (marker !== undefined) {
    const x = m.left + band * marker;
    svg += `<line x1="${x}" x2="${x}" y1="${m.top - 14}" y2="${m.top + h}" stroke="${CHART.axis}" stroke-width="1"/>`;
    svg += `<text x="${x + 6}" y="${m.top - 6}" class="tick">today</text>`;
  }

  labels.forEach((lab, i) => {
    const cx = m.left + band * i + band / 2;
    const segs = series.map((s) => ({ s, v: s.values[i] })).filter((seg) => seg.v > 0);
    let base = m.top + h;
    segs.forEach((seg, j) => {
      const segH = (seg.v / max) * h;
      const gap = j > 0 ? 2 : 0; // 2px surface gap between stacked segments
      svg += `<path d="${colPath(cx - barW / 2, base - segH, barW, segH - gap, j === segs.length - 1)}" fill="${seg.s.color}" class="mark"/>`;
      base -= segH;
    });
    if (totals[i] > 0) svg += `<text x="${cx}" y="${base - 7}" text-anchor="middle" class="val">${totals[i]}</text>`;
    svg += `<text x="${cx}" y="${height - 12}" text-anchor="middle" class="xlab ${lab.strong ? "strong" : ""}">${esc(band < 52 ? lab.short : lab.text)}</text>`;

    const tipKey = `${key}:${i}`;
    tips.set(tipKey, {
      title: lab.full || lab.text,
      rows: series.map((s) => ({ name: s.name, color: s.color, value: s.values[i] })),
      total: series.length > 1 ? totals[i] : null
    });
    svg += `<rect class="hit" x="${m.left + band * i}" y="${m.top}" width="${band}" height="${h}" fill="transparent" tabindex="0" data-tip="${tipKey}" aria-label="${esc(lab.full || lab.text)}: ${totals[i]}"/>`;
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${svg}</svg>`;
}

function barChart({ key, width, rows, label }) {
  const rowH = 52;
  const m = { top: 8, right: 112, bottom: 8, left: 76 };
  const height = m.top + m.bottom + rows.length * rowH;
  const w = width - m.left - m.right;
  const max = Math.max(1, ...rows.map((r) => r.value));
  let svg = `<line x1="${m.left}" x2="${m.left}" y1="${m.top}" y2="${height - m.bottom}" stroke="${CHART.axis}" stroke-width="1"/>`;

  rows.forEach((r, i) => {
    const y = m.top + i * rowH + (rowH - 22) / 2;
    const bw = (r.value / max) * w;
    svg += `<text x="${m.left - 10}" y="${y + 15}" text-anchor="end" class="ylab">${esc(r.label)}</text>`;
    svg += `<path d="${barPath(m.left, y, bw, 22)}" fill="${r.color}" class="mark"/>`;
    svg += `<text x="${m.left + bw + 8}" y="${y + 15}" class="val">${esc(r.valueLabel)}</text>`;
    const tipKey = `${key}:${i}`;
    tips.set(tipKey, { title: r.label, rows: r.tipRows, total: null });
    svg += `<rect class="hit" x="0" y="${m.top + i * rowH}" width="${width}" height="${rowH}" fill="transparent" tabindex="0" data-tip="${tipKey}" aria-label="${esc(r.label)}: ${esc(r.valueLabel)}"/>`;
  });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${svg}</svg>`;
}

function lineChart({ key, width, points, label }) {
  const height = 250;
  const m = { top: 26, right: 40, bottom: 36, left: 36 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;
  const { max, step } = scaleMax(Math.max(...points.map((p) => p.value)));
  const x = (i) => m.left + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v) => m.top + h - (v / max) * h;

  let svg = gridAndTicks(m, width, h, max, step);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join("");
  svg += `<path d="${line}L${x(points.length - 1)},${m.top + h}L${x(0)},${m.top + h}Z" fill="${SINGLE}" opacity="0.1"/>`;
  svg += `<path d="${line}" fill="none" stroke="${SINGLE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;

  const last = points[points.length - 1];
  svg += `<circle cx="${x(points.length - 1)}" cy="${y(last.value)}" r="4" fill="${SINGLE}" stroke="var(--panel)" stroke-width="2"/>`;
  svg += `<text x="${x(points.length - 1) + 8}" y="${y(last.value) + 4}" class="val">${last.value}</text>`;

  // x labels: first, middle, last
  const idx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  idx.forEach((i) => {
    const anchor = i === 0 ? "start" : i === points.length - 1 ? "end" : "middle";
    svg += `<text x="${x(i)}" y="${height - 12}" text-anchor="${anchor}" class="xlab">${fmtShort(points[i].date)}</text>`;
  });

  // crosshair
  svg += `<line class="xhair" x1="0" x2="0" y1="${m.top}" y2="${m.top + h}" stroke="${CHART.axis}" stroke-width="1" visibility="hidden"/>`;
  svg += `<circle class="xdot" r="4" fill="${SINGLE}" stroke="var(--panel)" stroke-width="2" visibility="hidden"/>`;
  points.forEach((p, i) => tips.set(`${key}:${i}`, {
    title: p.date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    rows: [{ name: "Members", color: SINGLE, value: p.value }],
    total: null,
    x: x(i),
    y: y(p.value)
  }));
  svg += `<rect class="line-hit" x="${m.left}" y="${m.top}" width="${w}" height="${h}" fill="transparent" tabindex="0"
    data-line="${key}" data-count="${points.length}" data-left="${m.left}" data-w="${w}" aria-label="${esc(label)}. Use arrow keys to move."/>`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${svg}</svg>`;
}

function tableView(head, rows) {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>`;
}

const emptyChart = (text) => `<div class="chart-empty"><span class="pixel-heart" aria-hidden="true"></span><p>${text}</p></div>`;

// ---------- Charts ----------
function weeklyData() {
  const weeks = [];
  for (let offset = -4; offset < LevelUp.BOOKING_WEEKS_AHEAD; offset++) {
    const start = LevelUp.startOfWeek(offset);
    const end = LevelUp.startOfWeek(offset + 1);
    weeks.push({ offset, start, end });
  }
  const series = TRAINERS.map((t) => ({
    name: t.short,
    color: t.chartColor,
    values: weeks.map((wk) => data.bookings.filter((b) => {
      const time = LevelUp.slotStart(b.date, b.hour);
      return b.status !== "declined" && b.trainerId === t.id && time >= wk.start && time < wk.end;
    }).length)
  }));
  const labels = weeks.map((wk) => ({
    text: wk.offset === 0 ? "This wk" : fmtShort(wk.start),
    short: wk.offset === 0 ? "Now" : `${wk.start.getDate()}/${wk.start.getMonth() + 1}`,
    full: `Week of ${fmtShort(wk.start)}${wk.offset === 0 ? " (this week)" : ""}`,
    strong: wk.offset === 0
  }));
  return { weeks, series, labels };
}

function renderCharts() {
  tips.clear();
  document.querySelectorAll("[data-chart]").forEach((body) => {
    const key = body.dataset.chart;
    const width = Math.max(260, body.clientWidth);
    const showTable = state.tables[key];

    if (key === "weekly") {
      const { series, labels } = weeklyData();
      body.innerHTML = showTable
        ? tableView(["Week", ...series.map((s) => esc(s.name)), "Total"], labels.map((l, i) => [l.full, ...series.map((s) => s.values[i]), series.reduce((sum, s) => sum + s.values[i], 0)]))
        : columnChart({ key, width, labels, series, marker: 4, label: "Sessions per week by trainer" });
    }

    if (key === "trainers") {
      const rows = TRAINERS.map((t) => {
        const s = LevelUp.trainerStats(t.id);
        return {
          label: t.short,
          value: s.sessions,
          color: t.chartColor,
          valueLabel: `${plural(s.sessions, "session")}`,
          tipRows: [
            { name: "Sessions", color: t.chartColor, value: s.sessions },
            { name: "Players", color: t.chartColor, value: s.clients },
            { name: "Level", color: t.chartColor, value: s.level }
          ],
          stats: s
        };
      });
      body.innerHTML = showTable
        ? tableView(["Trainer", "Sessions", "Players", "Level"], rows.map((r) => [esc(r.label), r.stats.sessions, r.stats.clients, `LVL ${r.stats.level} · ${r.stats.rank.title}`]))
        : barChart({ key, width, rows, label: "Sessions by trainer" });
    }

    if (key === "growth") {
      const joined = data.members.map((m) => new Date(m.createdAt)).sort((a, b) => a - b);
      if (!joined.length) {
        body.innerHTML = emptyChart("No members yet. The line starts with the first sign-up.");
        return;
      }
      const first = new Date(joined[0].getFullYear(), joined[0].getMonth(), joined[0].getDate());
      const today = new Date();
      const points = [];
      for (let d = new Date(first); d <= today; d.setDate(d.getDate() + 1)) {
        const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
        points.push({ date: new Date(d), value: joined.filter((j) => j < endOfDay).length });
      }
      if (points.length === 1) points.unshift({ date: new Date(first.getTime() - 864e5), value: 0 });
      body.innerHTML = showTable
        ? tableView(["Date", "Members"], points.filter((p, i) => i === 0 || p.value !== points[i - 1].value).map((p) => [fmtDate(p.date), p.value]))
        : lineChart({ key, width, points, label: "Total members over time" });
    }

    if (key === "ranks") {
      const counts = RANKS.map((r) => data.members.filter((m) => m.prog.rank.title === r.title).length);
      const labels = RANKS.map((r) => ({ text: r.title, short: `L${r.level}`, full: `${r.title} (LVL ${r.level}+)` }));
      body.innerHTML = showTable
        ? tableView(["Rank", "From level", "Members"], RANKS.map((r, i) => [r.title, r.level, counts[i]]))
        : columnChart({ key, width, labels, series: [{ name: "Members", color: SINGLE, values: counts }], label: "Members by rank" });
    }
  });
}

// ---------- Tooltip ----------
const tip = document.createElement("div");
tip.className = "chart-tip";
tip.setAttribute("role", "tooltip");
tip.hidden = true;
document.body.appendChild(tip);

function showTip(key, clientX, clientY) {
  const d = tips.get(key);
  if (!d) return;
  tip.replaceChildren();
  const title = document.createElement("p");
  title.className = "tip-title";
  title.textContent = d.title;
  tip.appendChild(title);
  d.rows.forEach((row) => {
    const line = document.createElement("p");
    line.className = "tip-row";
    const k = document.createElement("span");
    k.className = "tip-key";
    k.style.background = row.color;
    const v = document.createElement("strong");
    v.textContent = row.value.toLocaleString("en-US");
    const n = document.createElement("span");
    n.textContent = row.name;
    line.append(k, v, n);
    tip.appendChild(line);
  });
  if (d.total !== null) {
    const total = document.createElement("p");
    total.className = "tip-total";
    total.textContent = `Total ${d.total}`;
    tip.appendChild(total);
  }
  tip.hidden = false;
  const box = tip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - box.width - 8, clientX + 14);
  const top = clientY - box.height - 12 < 8 ? clientY + 16 : clientY - box.height - 12;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${top}px`;
}

function hideTip() {
  tip.hidden = true;
  root.querySelectorAll(".mark.hover").forEach((m) => m.classList.remove("hover"));
}

function lineHover(hit, index) {
  const svg = hit.ownerSVGElement;
  const d = tips.get(`${hit.dataset.line}:${index}`);
  if (!d) return;
  hit.dataset.index = index;
  const xh = svg.querySelector(".xhair");
  const xd = svg.querySelector(".xdot");
  xh.setAttribute("x1", d.x); xh.setAttribute("x2", d.x); xh.setAttribute("visibility", "visible");
  xd.setAttribute("cx", d.x); xd.setAttribute("cy", d.y); xd.setAttribute("visibility", "visible");
  const rect = svg.getBoundingClientRect();
  showTip(`${hit.dataset.line}:${index}`, rect.left + d.x, rect.top + d.y);
}

function lineOut(hit) {
  const svg = hit.ownerSVGElement;
  svg.querySelector(".xhair")?.setAttribute("visibility", "hidden");
  svg.querySelector(".xdot")?.setAttribute("visibility", "hidden");
  hideTip();
}

root.addEventListener("pointermove", (event) => {
  const hit = event.target.closest?.(".hit, .line-hit");
  if (!hit) return;
  if (hit.classList.contains("line-hit")) {
    const rect = hit.getBoundingClientRect();
    const count = Number(hit.dataset.count);
    const index = Math.round(((event.clientX - rect.left) / rect.width) * (count - 1));
    lineHover(hit, Math.max(0, Math.min(count - 1, index)));
  } else {
    showTip(hit.dataset.tip, event.clientX, event.clientY);
  }
});

root.addEventListener("pointerout", (event) => {
  const hit = event.target.closest?.(".hit, .line-hit");
  if (!hit) return;
  if (hit.classList.contains("line-hit")) lineOut(hit);
  else hideTip();
});

root.addEventListener("focusin", (event) => {
  const hit = event.target.closest?.(".hit, .line-hit");
  if (!hit) return;
  if (hit.classList.contains("line-hit")) {
    lineHover(hit, Number(hit.dataset.count) - 1);
  } else {
    const rect = hit.getBoundingClientRect();
    showTip(hit.dataset.tip, rect.left + rect.width / 2, rect.top + 20);
  }
});

root.addEventListener("focusout", (event) => {
  const hit = event.target.closest?.(".hit, .line-hit");
  if (hit?.classList.contains("line-hit")) lineOut(hit);
  else if (hit) hideTip();
});

root.addEventListener("keydown", (event) => {
  const hit = event.target.closest?.(".line-hit");
  if (!hit || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const count = Number(hit.dataset.count);
  const current = Number(hit.dataset.index ?? count - 1);
  lineHover(hit, Math.max(0, Math.min(count - 1, current + (event.key === "ArrowRight" ? 1 : -1))));
});

// ---------- Trainers ----------
function occupancy(trainer) {
  const now = new Date();
  let open = 0;
  let booked = 0;
  for (let d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d < LevelUp.startOfWeek(LevelUp.BOOKING_WEEKS_AHEAD); d.setDate(d.getDate() + 1)) {
    const key = LevelUp.dateKey(d);
    LevelUp.trainerHours(trainer.id, key).forEach((hour) => {
      if (LevelUp.slotStart(key, hour) <= now) return;
      open++;
      if (LevelUp.findBooking(trainer.id, key, hour)) booked++;
    });
  }
  return { open, booked, pct: open ? (booked / open) * 100 : 0 };
}

function renderTrainerCards() {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  document.getElementById("trainerCards").innerHTML = TRAINERS.map((t) => {
    const s = LevelUp.trainerStats(t.id);
    const occ = occupancy(t);
    const own = data.bookings.filter((b) => b.trainerId === t.id);
    const next = own.find(isUpcoming);
    const hours = LevelUp.weeklyHoursText(t.id) || "no weekly hours";
    return `
      <article class="trainer-admin" style="--c:${t.chartColor}">
        <div class="trainer-admin-head">
          <img src="${t.img}" alt="">
          <div>
            <h3>${esc(t.name)}</h3>
            <p class="muted">${esc(t.role)} · ${hours}</p>
            <span class="rank-badge" data-tier="${RANKS.indexOf(s.rank)}">LVL ${s.level} · ${s.rank.title}</span>
          </div>
        </div>
        <div class="trainer-admin-stats">
          <div><span class="kpi-label">Sessions</span><strong>${s.sessions}</strong></div>
          <div><span class="kpi-label">Players</span><strong>${s.clients}</strong></div>
          <div><span class="kpi-label">Upcoming</span><strong>${own.filter(isUpcoming).length}</strong></div>
        </div>
        <div class="meter-row">
          <span class="kpi-label">Occupancy</span>
          <span class="meter" aria-hidden="true"><i style="width:${occ.pct.toFixed(1)}%"></i></span>
          <span class="meter-value">${occ.booked}/${occ.open} h · ${Math.round(occ.pct)}%</span>
        </div>
        <p class="muted trainer-next">${next ? `Next: ${slotLabel(next)} with ${esc(next.name)}` : "No upcoming sessions"}</p>
      </article>`;
  }).join("");
}

// ---------- Opening hours (shared editor in hours-editor.js) ----------
function renderHours() {
  const el = document.getElementById("hoursPanel");
  const head = (extra = "") => `<div class="panel-head"><h2>Opening hours</h2><span class="muted">When players can book each trainer. Trainers can also change their own hours in their profile.</span>${extra}</div>`;
  // Desktop: the team planner with every trainer; small screens (or "List view"): the list editor
  if (window.innerWidth >= 900 && !state.hoursList) {
    LevelUpPlanner.render(el, {
      bookings: () => data.bookings,
      intro: head(),
      onList: () => { state.hoursList = true; renderHours(); }
    });
    return;
  }
  LevelUpHours.render(el, {
    key: "admin",
    trainers: TRAINERS.map((t) => t.id),
    bookings: () => data.bookings,
    intro: head(window.innerWidth >= 900 ? `<button type="button" class="btn btn-small btn-ghost" data-hours-planner>Planner view</button>` : "")
  });
}

// ---------- Bookings table ----------
function renderBookings() {
  let list = data.bookings;
  if (state.bookingView === "upcoming") list = list.filter(isUpcoming);
  if (state.bookingView === "past") list = list.filter((b) => !isUpcoming(b)).reverse();
  if (state.bookingTrainer !== "all") list = list.filter((b) => b.trainerId === state.bookingTrainer);

  const el = document.getElementById("bookingTable");
  if (!list.length) {
    el.innerHTML = `<p class="muted">No ${state.bookingView === "all" ? "" : `${state.bookingView} `}bookings${state.bookingTrainer !== "all" ? ` for ${esc(LevelUp.trainerById(state.bookingTrainer).short)}` : ""}.</p>`;
    return;
  }
  el.innerHTML = tableView(
    ["When", "Trainer", "Player", "Status", "Price", "Payment", "Note", ""],
    list.map((b) => {
      const t = LevelUp.trainerById(b.trainerId);
      return [
        `<span class="nowrap">${slotLabel(b)}</span>`,
        `<span class="nowrap"><span class="dot" style="--c:${t.chartColor}" aria-hidden="true"></span>${esc(t.short)}</span>`,
        `<button type="button" class="link-btn" data-member="${esc(b.email)}">${esc(b.name)}</button><br><a class="muted small" href="mailto:${esc(b.email)}">${esc(b.email)}</a>${LevelUp.healthFlagHtml(b.health)}`,
        `<span class="status-chip ${STATUS_CLASS[b.status] || b.status}">${STATUS_LABEL[b.status] || b.status}</span>`,
        `<span class="nowrap">${esc(LevelUp.priceLabel(b))}</span>`,
        `<span class="nowrap">${esc(LevelUp.payLabel(b) || (b.payMethod === "pack" ? "Pack credit" : b.payMethod === "reward" ? "Free session 🎁" : "–"))}</span>`,
        b.note ? esc(b.note) : `<span class="muted">–</span>`,
        `<span class="admin-actions">${[
          b.status === "pending" && isUpcoming(b) ? `<button type="button" class="btn btn-small btn-primary" data-admin-respond="confirm" data-id="${b.id}">Confirm</button><button type="button" class="btn btn-small btn-ghost" data-admin-respond="decline" data-id="${b.id}">Decline</button>` : "",
          toCollect(b) || b.status === "awaiting_payment" ? `<button type="button" class="btn btn-small btn-ghost" data-paid-hq="${b.id}">Paid at HQ</button>` : "",
          b.refundStatus === "manual" ? `<button type="button" class="btn btn-small btn-ghost" data-refunded="${b.id}">Refunded</button>` : "",
          toSettle(b) ? `<button type="button" class="btn btn-small btn-primary" data-admin-reward="${b.id}">Reward</button>` : "",
          toSettle(b) && LevelUp.hasStarted(b) ? `<button type="button" class="btn btn-small btn-ghost" data-admin-noshow="${b.id}">No-show</button>` : "",
          isUpcoming(b) ? `<button type="button" class="btn btn-small btn-ghost" data-admin-cancel="${b.id}">Cancel</button>` : ""
        ].join("")}</span>`
      ];
    })
  );
}

// ---------- Members table ----------
function renderMembers() {
  const q = state.query.trim().toLowerCase();
  const sorters = {
    joined: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    xp: (a, b) => b.xp - a.xp,
    sessions: (a, b) => b.sessions - a.sessions,
    spent: (a, b) => b.spent - a.spent,
    name: (a, b) => a.name.localeCompare(b.name)
  };
  const list = data.players
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.includes(q))
    .sort(sorters[state.sort]);

  const el = document.getElementById("memberTable");
  if (!list.length) {
    el.innerHTML = `<p class="muted">${data.players.length ? "No members match your search." : "No members yet."}</p>`;
    return;
  }
  el.innerHTML = tableView(
    ["Player", "Level", "XP", "Sessions", "Spent", "Joined", "Last login", ""],
    list.map((p) => [
      `<span class="member-cell">${LevelUp.avatarHtml(p)}<span><strong>${esc(p.name)}</strong>${p.admin ? ` <span class="admin-tag">Admin</span>` : ""}<br><span class="muted small">${esc(p.email)}</span></span></span>`,
      `<span class="nowrap">LVL ${p.prog.level} · ${p.prog.rank.title}</span>`,
      `<span class="num">${p.xp.toLocaleString("en-US")}</span>`,
      `<span class="num">${p.sessions}${p.upcoming ? ` <span class="muted small">(${p.upcoming} upcoming)</span>` : ""}</span>`,
      `<span class="num">${euro(p.spent)}</span>`,
      `<span class="nowrap">${fmtDate(p.createdAt)}</span>`,
      `<span class="nowrap">${fmtDate(p.lastSeen)}</span>`,
      `<button type="button" class="btn btn-small btn-ghost" data-member="${esc(p.email)}">View</button>`
    ])
  );
}

// ---------- Member detail ----------
function openMember(email) {
  const p = data.players.find((x) => x.email === email);
  if (!p) return;
  const own = data.bookings.filter((b) => b.email === email);
  const upcoming = own.filter(isUpcoming);
  const past = own.filter((b) => !isUpcoming(b)).reverse();
  const stats = p.bodyStats[0];
  const unlocked = LevelUp.ACHIEVEMENTS.filter((a) => p.achievements[a.id]);
  const bookingItem = (b) => {
    const t = LevelUp.trainerById(b.trainerId);
    return `<li><span><span class="dot" style="--c:${t.chartColor}" aria-hidden="true"></span>${slotLabel(b)} · ${esc(t.short)}</span>${b.note ? `<span class="muted small">“${esc(b.note)}”</span>` : ""}</li>`;
  };

  document.getElementById("memberContent").innerHTML = `
    <div class="member-head">
      ${LevelUp.avatarHtml(p, "xl")}
      <div>
        <p class="section-kicker">${p.admin ? "Admin" : "Player"} · joined ${fmtDate(p.createdAt)}</p>
        <h2 class="auth-title" id="memberTitle">${esc(p.name)}</h2>
        <p><a class="text-link" href="mailto:${esc(p.email)}">${esc(p.email)}</a></p>
      </div>
    </div>
    <div class="xp-bar"><i style="width:${p.prog.pct.toFixed(1)}%"></i></div>
    <p class="xp-caption"><span>LVL ${p.prog.level} · ${p.prog.rank.title}</span><span>${p.xp.toLocaleString("en-US")} XP · ${p.prog.toNext} to LVL ${p.prog.level + 1}</span></p>

    <div class="member-grid">
      <div class="tile"><span class="tile-label">Sessions</span><span class="tile-value">${own.length}</span></div>
      <div class="tile"><span class="tile-label">Health check</span><span class="tile-value">${!p.healthForm?.valid ? "–" : p.healthForm.hasRisk ? "⚠" : "✓"}</span></div>
      <div class="tile"><span class="tile-label">Spent</span><span class="tile-value">${euro(p.spent)}</span></div>
      <div class="tile"><span class="tile-label">Achievements</span><span class="tile-value">${unlocked.length}/${LevelUp.ACHIEVEMENTS.length}</span></div>
    </div>

    <h3 class="panel-sub">Upcoming sessions</h3>
    ${upcoming.length ? `<ul class="detail-list">${upcoming.map(bookingItem).join("")}</ul>` : `<p class="muted">None.</p>`}
    ${past.length ? `<h3 class="panel-sub">Past sessions</h3><ul class="detail-list">${past.slice(0, 8).map(bookingItem).join("")}</ul>` : ""}

    <h3 class="panel-sub">Body stats</h3>
    ${stats ? `<p>${stats.weight} kg · ${stats.height} cm · ${stats.age} y · BMI ${stats.bmi} · target ${stats.target.toLocaleString("en-US")} kcal · goal: ${esc(stats.goal)} <span class="muted small">(${fmtDate(stats.date)}, ${p.bodyStats.length} ${p.bodyStats.length === 1 ? "entry" : "entries"})</span></p>` : `<p class="muted">Not saved yet.</p>`}

    <h3 class="panel-sub">Achievements</h3>
    ${unlocked.length ? `<p class="badge-row">${unlocked.map((a) => `<span class="badge-chip">${a.icon} ${esc(a.title)}</span>`).join("")}</p>` : `<p class="muted">None yet.</p>`}

    ${p.purchases.length ? `<h3 class="panel-sub">Orders</h3><ul class="detail-list">${p.purchases.map((o) => `<li><span>${fmtDate(o.date)} · ${euro(o.total)}</span><span class="muted small">${o.items.map((i) => `${i.qty}× ${esc(i.name)}${i.size ? ` (${i.size})` : ""}`).join(", ")}</span></li>`).join("")}</ul>` : ""}

    ${p.healthForm?.hasRisk ? LevelUp.healthFlagHtml(p.healthForm) : ""}`;
  document.getElementById("memberDialog").showModal();
}

// ---------- Events ----------
root.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle]");
  if (toggle) {
    state.tables[toggle.dataset.toggle] = !state.tables[toggle.dataset.toggle];
    toggle.setAttribute("aria-pressed", String(state.tables[toggle.dataset.toggle]));
    toggle.textContent = state.tables[toggle.dataset.toggle] ? "Chart" : "Table";
    renderCharts();
    return;
  }
  const view = event.target.closest("[data-booking-view]");
  if (view) {
    state.bookingView = view.dataset.bookingView;
    root.querySelectorAll("[data-booking-view]").forEach((b) => b.setAttribute("aria-selected", String(b === view)));
    renderBookings();
    return;
  }
  const trainer = event.target.closest("[data-booking-trainer]");
  if (trainer) {
    state.bookingTrainer = trainer.dataset.bookingTrainer;
    root.querySelectorAll("[data-booking-trainer]").forEach((b) => b.setAttribute("aria-selected", String(b === trainer)));
    renderBookings();
    return;
  }
  const review = event.target.closest("[data-review]");
  if (review) {
    const approve = review.dataset.review === "approve";
    const card = root.querySelector(`[data-card-for="${review.dataset.id}"]`)?.value || null;
    const app = data.applications.find((a) => a.id === review.dataset.id);
    const what = approve ? (card ? `link ${app.name} to ${LevelUp.trainerById(card)?.name}'s trainer card` : `create a new trainer card for ${app.name}`) : `reject ${app.name}'s application`;
    if (!confirm(`Are you sure you want to ${what}? They get an email.`)) return;
    review.disabled = true;
    LevelUp.reviewApplication(review.dataset.id, approve, card).catch((err) => { review.disabled = false; alert(err.message); });
    return;
  }
  const payout = event.target.closest("[data-payout]");
  if (payout) {
    const row = financeRows().find((r) => r.id === payout.dataset.payout);
    if (!row || !confirm(`Did you pay ${row.trainer?.name || row.id} ${money(row.owed)} for ${plural(row.unpaidSessions, "session")}? This marks them as paid out.`)) return;
    payout.disabled = true;
    LevelUp.markPayout(row.id)
      .then((res) => LevelUp.toast({ title: "Payout recorded", text: `${money(res.amount)} paid to ${row.trainer?.short || row.id}.`, icon: "€" }))
      .catch((err) => { payout.disabled = false; alert(err.message); });
    return;
  }
  const respond = event.target.closest("[data-admin-respond]");
  const reward = event.target.closest("[data-admin-reward]");
  if (respond || reward) {
    const btn = respond || reward;
    btn.disabled = true;
    const action = reward ? LevelUp.rewardSession(btn.dataset.adminReward) : LevelUp.respondBooking(btn.dataset.id, btn.dataset.adminRespond === "confirm");
    action.catch((err) => { btn.disabled = false; alert(err.message); });
    return;
  }
  if (event.target.closest("[data-hours-planner]")) {
    state.hoursList = false;
    renderHours();
    return;
  }
  const finMode = event.target.closest("[data-fin-mode]");
  const finStep = event.target.closest("[data-fin-step]");
  if (finMode || finStep || event.target.closest("[data-fin-now]")) {
    if (finMode) state.fin = { ...state.fin, mode: finMode.dataset.finMode, offset: 0 };
    else if (finStep) state.fin.offset = Math.min(0, state.fin.offset + Number(finStep.dataset.finStep));
    else state.fin.offset = 0;
    state.fin.statementMonth = null;
    renderFinances();
    return;
  }
  const exportBtn = event.target.closest("[data-export]");
  if (exportBtn) {
    const period = periodTotals(periodRange(state.fin.mode, state.fin.offset));
    const tag = state.fin.mode === "all" ? "all-time" : period.from + "_" + period.to;
    if (exportBtn.dataset.export === "sessions") {
      LevelUpStatements.sessionsCsv(`level-up-sessions-${tag}.csv`,
        [...period.done].sort((a, b) => (a.date + a.hour).localeCompare(b.date + b.hour)), data.pricing.ownerTrainerId);
    } else {
      LevelUpStatements.overviewCsv(`level-up-overview-per-${state.fin.mode === "week" ? "week" : "month"}.csv`,
        overviewRows().map((o) => ({ ...o, label: o.label })));
    }
    return;
  }
  const statementBtn = event.target.closest("[data-statement]");
  if (statementBtn) {
    const month = document.getElementById("statementMonth").value;
    const st = LevelUpStatements.build(statementBtn.dataset.trainer, month, data.rawBookings);
    if (statementBtn.dataset.statement === "pdf") LevelUpStatements.statementPdf(st);
    else LevelUpStatements.statementCsv(st);
    return;
  }
  const paidHq = event.target.closest("[data-paid-hq]");
  const refunded = event.target.closest("[data-refunded]");
  if (paidHq || refunded) {
    const btn = paidHq || refunded;
    const b = data.bookings.find((x) => x.id === btn.dataset[paidHq ? "paidHq" : "refunded"]);
    if (!b || !confirm(paidHq
      ? `Did ${b.name} pay ${money(b.price)} at the headquarters for ${slotLabel(b)}?`
      : `Did you give ${b.name} their ${money(b.price)} back?`)) return;
    btn.disabled = true;
    (paidHq ? LevelUp.markPaidInPerson(b.id) : LevelUp.markRefunded(b.id)).catch((err) => { btn.disabled = false; alert(err.message); });
    return;
  }
  const hoodie = event.target.closest("[data-hoodie]");
  if (hoodie) {
    const v = data.vouchers.find((x) => x.id === hoodie.dataset.hoodie);
    if (!v || !confirm(`Did you give ${v.name} their Legend hoodie?`)) return;
    hoodie.disabled = true;
    LevelUp.markHoodieGiven(v.id).then(() => render()).catch((err) => { hoodie.disabled = false; alert(err.message); });
    return;
  }
  const packPaid = event.target.closest("[data-pack-paid]");
  const packCancel = event.target.closest("[data-pack-cancel]");
  if (packPaid || packCancel) {
    const pk = data.packs.find((x) => x.id === (packPaid || packCancel).dataset[packPaid ? "packPaid" : "packCancel"]);
    const btn = packPaid || packCancel;
    if (!pk || !confirm(packPaid
      ? `Did ${pk.name} pay ${money(pk.price)}? Their ${pk.size} credits become active and they get an email.`
      : `Cancel ${pk.name}'s request for a ${pk.size}-session pack?`)) return;
    btn.disabled = true;
    (packPaid ? LevelUp.markPackPaid(pk.id) : LevelUp.cancelPackRequest(pk.id))
      .then(() => { if (packCancel) render(); })
      .catch((err) => { btn.disabled = false; alert(err.message); });
    return;
  }
  const savePrice = event.target.closest("[data-save-price]");
  if (savePrice) {
    const row = savePrice.closest("tr");
    const num = (name) => { const v = row.querySelector(`[name=${name}]`)?.value.trim(); return v ? Number(v) : null; };
    savePrice.disabled = true;
    LevelUp.setTrainerPricing(savePrice.dataset.savePrice, num("price"), num("fee"))
      .then(() => LevelUp.toast({ title: "Price saved", text: `${LevelUp.trainerById(savePrice.dataset.savePrice).short}: applies to new bookings`, icon: "€", tone: "green" }))
      .catch((err) => { savePrice.disabled = false; alert(err.message); });
    return;
  }
  const noShow = event.target.closest("[data-admin-noshow]");
  if (noShow) {
    const b = data.bookings.find((x) => x.id === noShow.dataset.adminNoshow);
    if (!b || !confirm(`Mark ${b.name} as no-show on ${slotLabel(b)}? The session is charged in full (${money(b.price)}), the trainer keeps ${money(b.trainerFee)} and ${b.name} gets an email.`)) return;
    noShow.disabled = true;
    LevelUp.markNoShow(b.id).catch((err) => { noShow.disabled = false; alert(err.message); });
    return;
  }
  const cancel = event.target.closest("[data-admin-cancel]");
  if (cancel) {
    const b = data.bookings.find((x) => x.id === cancel.dataset.adminCancel);
    if (!b || !confirm(`Cancel ${b.name}'s session with ${LevelUp.trainerById(b.trainerId).short} on ${slotLabel(b)}? They get an email.`)) return;
    cancel.disabled = true;
    LevelUp.cancelBooking(b.id).catch((err) => {
      cancel.disabled = false;
      alert(err.message);
    });
    return;
  }
  const member = event.target.closest("[data-member]");
  if (member) {
    openMember(member.dataset.member);
    return;
  }
  const dialog = document.getElementById("memberDialog");
  if (dialog && (event.target === dialog || event.target.closest("[data-close]"))) dialog.close();
});

root.addEventListener("input", (event) => {
  if (event.target.id === "memberSearch") {
    state.query = event.target.value;
    renderMembers();
  }
});

root.addEventListener("change", (event) => {
  if (event.target.id === "memberSort") {
    state.sort = event.target.value;
    renderMembers();
  }
  if (event.target.id === "statementMonth") {
    state.fin.statementMonth = event.target.value;
    renderFinances();
  }
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (data) renderCharts(); }, 150);
});

document.addEventListener("levelup:change", render);
render();
