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
  tables: {} // chart key -> showing table view
};
let data = null;
const tips = new Map();

const euro = (n) => `€${n.toFixed(2)}`;
const fmtDate = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const isUpcoming = (b) => ["pending", "confirmed"].includes(b.status) && LevelUp.slotStart(b.date, b.hour) > new Date();
const STATUS_LABEL = { pending: "Pending", confirmed: "Confirmed", declined: "Declined", completed: "Completed" };
const slotLabel = (b) => {
  const d = LevelUp.parseDate(b.date);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${String(b.hour).padStart(2, "0")}:00`;
};

// ---------- Data ----------
async function loadData() {
  const { players, bookings, applications, unlinkedTrainers, pricing } = await LevelUp.adminData();
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
    rawBookings: bookings,
    players: rows,
    members: rows.filter((p) => !p.admin),
    active: bookings.filter((b) => b.status !== "declined"),
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

    <section class="panel admin-panel applications" id="applications"></section>

    <section class="kpi-row" id="kpis" aria-label="Key numbers"></section>

    <section class="panel admin-panel finances" id="finances"></section>

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
  renderCharts();
  renderTrainerCards();
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

function financeRows() {
  const { pricing, rawBookings } = data;
  const trainerIds = [...new Set([...TRAINERS.map((t) => t.id), ...rawBookings.map((b) => b.trainerId)])];
  return trainerIds.map((id) => {
    const own = rawBookings.filter((b) => b.trainerId === id);
    const done = own.filter((b) => b.status === "completed");
    const upcoming = own.filter(isUpcoming);
    const isOwner = id === pricing.ownerTrainerId;
    const earned = done.reduce((s, b) => s + b.trainerFee, 0);
    const paid = isOwner ? earned : done.filter((b) => b.payoutAt).reduce((s, b) => s + b.trainerFee, 0);
    const payouts = done.map((b) => b.payoutAt).filter(Boolean).sort();
    return {
      id,
      trainer: LevelUp.trainerById(id),
      isOwner,
      sessions: done.length,
      revenue: done.reduce((s, b) => s + b.price, 0),
      earned,
      paid,
      owed: earned - paid,
      unpaidSessions: isOwner ? 0 : done.filter((b) => !b.payoutAt).length,
      expected: upcoming.filter((b) => b.status === "confirmed").reduce((s, b) => s + b.trainerFee, 0),
      pipeline: upcoming.reduce((s, b) => s + b.price, 0),
      lastPayout: payouts[payouts.length - 1] || null
    };
  }).filter((r) => r.trainer || r.sessions);
}

function renderFinances() {
  const el = document.getElementById("finances");
  const { pricing } = data;
  const rows = financeRows();
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const trainerShare = rows.filter((r) => !r.isOwner).reduce((s, r) => s + r.earned, 0);
  const owed = rows.reduce((s, r) => s + r.owed, 0);
  const pipeline = rows.reduce((s, r) => s + r.pipeline, 0);
  const tile = (label, value, note, cls = "") => `
    <div class="kpi ${cls}"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span><span class="kpi-note">${note}</span></div>`;

  el.innerHTML = `
    <div class="panel-head">
      <h2>Finances</h2>
      <span class="muted">${money(pricing.price)} per session · trainer gets ${money(pricing.fee)} · you keep ${money(pricing.price - pricing.fee)} (and the full ${money(pricing.price)} for your own sessions)</span>
    </div>
    <div class="finance-kpis">
      ${tile("Session revenue", money(revenue), `${plural(rows.reduce((s, r) => s + r.sessions, 0), "completed session")}`)}
      ${tile("Your share", money(revenue - trainerShare), "Venue share + your own sessions", "good")}
      ${tile("Owed to trainers", money(owed), owed ? "Pay out below" : "All trainers are paid", owed ? "warn" : "")}
      ${tile("Booked ahead", money(pipeline), "Pending + confirmed upcoming sessions")}
    </div>
    <div class="table-wrap">
      <table class="data-table finance-table">
        <thead><tr><th>Trainer</th><th class="num">Sessions</th><th class="num">Revenue</th><th class="num">Trainer earned</th><th class="num">Paid out</th><th class="num">Owed</th><th class="num">Expected</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td><span class="dot" style="--c:${r.trainer?.chartColor || "#888"}" aria-hidden="true"></span>${esc(r.trainer?.name || r.id)}${r.isOwner ? ` <span class="muted small">· owner</span>` : ""}</td>
            <td class="num">${r.sessions}</td>
            <td class="num">${money(r.revenue)}</td>
            <td class="num">${r.isOwner ? `<span class="muted">you</span>` : money(r.earned)}</td>
            <td class="num">${r.isOwner ? "–" : money(r.paid)}</td>
            <td class="num ${r.owed ? "owed" : ""}">${r.isOwner ? "–" : money(r.owed)}</td>
            <td class="num">${r.isOwner ? "–" : money(r.expected)}</td>
            <td class="finance-action">${!r.isOwner && r.owed
              ? `<button type="button" class="btn btn-small btn-primary" data-payout="${esc(r.id)}">Mark ${money(r.owed)} paid</button>`
              : r.lastPayout ? `<span class="muted small">Last paid ${fmtDate(r.lastPayout)}</span>` : ""}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="muted small">A session counts once it is rewarded (completed). "Expected" is the trainer fee of confirmed upcoming sessions. Online payment comes later; for now "Mark paid" records that you paid the trainer yourself.</p>`;
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
  const workouts = players.reduce((sum, p) => sum + p.workouts.length, 0);
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
    tile("Workouts logged", workouts, "By members themselves"),
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
    const hours = Object.entries(t.availability).map(([d, [a, b]]) => `${days[d]} ${a}:00–${b}:00`).join(", ");
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
    ["When", "Trainer", "Player", "Status", "Note", ""],
    list.map((b) => {
      const t = LevelUp.trainerById(b.trainerId);
      return [
        `<span class="nowrap">${slotLabel(b)}</span>`,
        `<span class="nowrap"><span class="dot" style="--c:${t.chartColor}" aria-hidden="true"></span>${esc(t.short)}</span>`,
        `<button type="button" class="link-btn" data-member="${esc(b.email)}">${esc(b.name)}</button><br><a class="muted small" href="mailto:${esc(b.email)}">${esc(b.email)}</a>`,
        `<span class="status-chip ${b.status}">${STATUS_LABEL[b.status] || b.status}</span>`,
        b.note ? esc(b.note) : `<span class="muted">–</span>`,
        `<span class="admin-actions">${[
          b.status === "pending" && isUpcoming(b) ? `<button type="button" class="btn btn-small btn-primary" data-admin-respond="confirm" data-id="${b.id}">Confirm</button><button type="button" class="btn btn-small btn-ghost" data-admin-respond="decline" data-id="${b.id}">Decline</button>` : "",
          b.status === "confirmed" && b.date === LevelUp.dateKey() ? `<button type="button" class="btn btn-small btn-primary" data-admin-reward="${b.id}">Reward</button>` : "",
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
    ["Player", "Level", "XP", "Sessions", "Workouts", "Spent", "Joined", "Last login", ""],
    list.map((p) => [
      `<span class="member-cell">${LevelUp.avatarHtml(p)}<span><strong>${esc(p.name)}</strong>${p.admin ? ` <span class="admin-tag">Admin</span>` : ""}<br><span class="muted small">${esc(p.email)}</span></span></span>`,
      `<span class="nowrap">LVL ${p.prog.level} · ${p.prog.rank.title}</span>`,
      `<span class="num">${p.xp.toLocaleString("en-US")}</span>`,
      `<span class="num">${p.sessions}${p.upcoming ? ` <span class="muted small">(${p.upcoming} upcoming)</span>` : ""}</span>`,
      `<span class="num">${p.workouts.length}</span>`,
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
      <div class="tile"><span class="tile-label">Workouts</span><span class="tile-value">${p.workouts.length}</span></div>
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

    ${p.workouts.length ? `<h3 class="panel-sub">Recent workouts</h3><ul class="detail-list">${p.workouts.slice(0, 5).map((w) => `<li><span>${esc(w.type)} · ${w.minutes} min</span><span class="muted small">${fmtDate(w.date)}</span></li>`).join("")}</ul>` : ""}`;
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
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (data) renderCharts(); }, 150);
});

document.addEventListener("levelup:change", render);
render();
