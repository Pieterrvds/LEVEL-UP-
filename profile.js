// LEVEL-UP player profile page.

const root = document.getElementById("profileRoot");
const { esc, ITEMS, ACHIEVEMENTS, RANKS } = LevelUp;

const state = { hoursOpen: false, achOpen: false, healthEdit: false, historyOpen: false, tab: "overview", tabFromLink: false }; // open/closed blocks stay that way between renders

const formatDate = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const euro = (n) => `€${Number(n).toFixed(2)}`;

function renderLoggedOut() {
  root.innerHTML = `
    <section class="no-save pixel-frame">
      <span class="pixel-heart" aria-hidden="true"></span>
      <p class="section-kicker">Not logged in</p>
      <h1 class="section-title">Player profile</h1>
      <p>Log in to see your level, XP, sessions, body stats, achievements and gear. New here? Create your profile and start at LVL 1.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-auth-open="signup">Create your profile</button>
        <button type="button" class="btn btn-ghost" data-auth-open="login">Log in</button>
      </div>
    </section>`;
}

function renderHeader(player, p) {
  const since = formatDate(player.createdAt);
  return `
    <section class="player-header pixel-frame">
      <div class="avatar-edit">
        ${LevelUp.avatarHtml(player, "xl")}
        <label class="avatar-edit-btn" title="${player.avatarUrl ? "Change your photo" : "Add your photo"}">
          <span aria-hidden="true">📷</span><span class="sr-only">${player.avatarUrl ? "Change your profile photo" : "Add a profile photo"}</span>
          <input type="file" accept="image/*" data-avatar-input hidden>
        </label>
      </div>
      <div class="player-header-info">
        <p class="section-kicker">Player · since ${since}</p>
        <h1 class="player-header-name">${esc(player.name)}</h1>
        <p class="player-header-rank"><span class="rank-badge" data-tier="${RANKS.indexOf(p.rank)}">${p.rank.title}</span> LVL ${p.level}</p>
        <div class="xp-bar big" role="progressbar" aria-valuemin="0" aria-valuemax="${p.needed}" aria-valuenow="${p.into}" aria-label="XP to next level">
          <i style="width:${p.pct.toFixed(1)}%"></i>
        </div>
        <p class="xp-caption"><span>${p.into} / ${p.needed} XP</span><span>${p.toNext} XP to LVL ${p.level + 1}${p.nextRank ? ` · ${p.nextRank.title} at LVL ${p.nextRank.level}` : ""}</span></p>
      </div>
      <div class="player-header-level" aria-hidden="true">
        <span>LVL</span>
        <strong>${p.level}</strong>
      </div>
    </section>`;
}

function renderSummary(player) {
  const unlocked = ACHIEVEMENTS.filter((a) => player.achievements[a.id]).length;
  return `
    <section class="summary-tiles">
      <div class="tile"><span class="tile-label">Total XP</span><span class="tile-value">${player.xp.toLocaleString("en-US")}</span></div>
      <div class="tile"><span class="tile-label">Rank</span><span class="tile-value">${esc(LevelUp.progress(player.xp).rank.title)}</span><span class="tile-note">LVL ${LevelUp.progress(player.xp).level}</span></div>
      <div class="tile"><span class="tile-label">Sessions</span><span class="tile-value">${LevelUp.playerBookings().filter((b) => b.status === "completed").length}</span><span class="tile-note">completed</span></div>
      <div class="tile"><span class="tile-label">Achievements</span><span class="tile-value">${unlocked}/${ACHIEVEMENTS.length}</span></div>
    </section>`;
}

const STATUS = {
  pending: { label: "Waiting for confirmation", cls: "pending" },
  confirmed: { label: "Confirmed", cls: "confirmed" },
  declined: { label: "Declined", cls: "declined" },
  completed: { label: "Completed", cls: "completed" },
  late_cancel: { label: "Late cancel · charged", cls: "declined" },
  no_show: { label: "No-show · charged", cls: "declined" },
  expired: { label: "Expired", cls: "declined" },
  awaiting_payment: { label: "Not paid yet", cls: "pending" },
  cancelled: { label: "Cancelled", cls: "declined" }
};
const CHARGED = ["late_cancel", "no_show"];
const fmtDeadline = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const statusChip = (status) => `<span class="status-chip ${STATUS[status]?.cls || ""}">${STATUS[status]?.label || status}</span>`;

function renderSessions() {
  const now = new Date();
  const bookings = LevelUp.playerBookings();
  const upcoming = bookings.filter((b) => ["awaiting_payment", "pending", "confirmed"].includes(b.status) && LevelUp.slotStart(b.date, b.hour) > now);
  const history = bookings
    .filter((b) => !upcoming.includes(b))
    .sort((a, b) => LevelUp.slotStart(b.date, b.hour) - LevelUp.slotStart(a.date, a.hour));
  const toPay = history.filter(LevelUp.canPayOnline).length;

  const row = (b) => {
    const trainer = LevelUp.trainerById(b.trainerId);
    const open = upcoming.includes(b);
    const past = LevelUp.slotStart(b.date, b.hour) <= now;
    let side = "";
    const pay = (LevelUp.canPayOnline(b) ? `<button type="button" class="btn btn-small btn-primary" data-pay-booking="${b.id}">Pay online</button>` : "")
      + (b.status === "awaiting_payment" ? `<button type="button" class="btn btn-small btn-ghost" data-pay-hq="${b.id}">Pay at HQ instead</button>` : "");
    if (open) side = `${pay}<button type="button" class="btn btn-small btn-ghost" data-cancel-booking="${b.id}">${["pending", "awaiting_payment"].includes(b.status) ? "Withdraw" : "Cancel"}</button>`;
    else if (b.status === "completed") side = `${pay}<span class="log-xp">+${b.xp} XP</span>`;
    else side = pay;
    let note = "";
    if (b.status === "confirmed" && past) note = "Waiting for your trainer to reward the session";
    else if (b.status === "confirmed" && open) note = LevelUp.isLateCancel(b)
      ? "Cancelling now is charged in full"
      : `Free cancellation until ${fmtDeadline(b.freeCancelUntil || LevelUp.slotStart(b.date, b.hour) - LevelUp.FREE_CANCEL_HOURS * 3600e3)}`;
    else if (CHARGED.includes(b.status)) note = "Charged in full";
    else if (b.status === "expired") note = b.payMethod === "online" && b.payStatus === "unpaid" ? "Payment not completed · no costs" : "Not confirmed in time · no costs";
    else if (b.status === "awaiting_payment") note = "Finish the payment to send the request";
    const payText = LevelUp.payLabel(b);
    if (payText && !["awaiting_payment"].includes(b.status)) note = note ? `${note} · ${payText}` : payText;
    const price = ["declined", "expired"].includes(b.status) ? "" : ` · ${esc(LevelUp.priceLabel(b))}`;
    return `
      <li class="session-row" style="--c:${trainer.color}">
        <img src="${trainer.img}" alt="">
        <div>
          <p class="session-trainer">${esc(trainer.name)} ${statusChip(b.status)}</p>
          <p class="muted">${LevelUp.formatSlot(b.date, b.hour)}${price}${note ? ` · ${note}` : ""}</p>
        </div>
        <div class="session-actions">${side}</div>
      </li>`;
  };

  return `
    <section class="panel panel-wide">
      <div class="panel-head">
        <h2>My sessions</h2>
        <a href="index.html#schedule" class="btn btn-small btn-primary">Book a trainer</a>
      </div>
      ${upcoming.length
        ? `<ul class="session-list">${upcoming.map(row).join("")}</ul>`
        : `<p class="muted">No upcoming sessions. Book an hour with one of our trainers.</p>`}
      ${history.length ? `
        <button type="button" class="btn btn-ghost btn-small history-btn" id="historyBtn" aria-controls="sessionHistory" aria-expanded="${Boolean(state.historyOpen)}">
          ${state.historyOpen ? "Hide history ▲" : `History · ${history.length} past session${history.length === 1 ? "" : "s"}${toPay ? ` · ${toPay} to pay` : ""} ▼`}</button>
        <ul class="session-list" id="sessionHistory" ${state.historyOpen ? "" : "hidden"}>${history.map(row).join("")}</ul>` : ""}
    </section>`;
}

// Trainer application: status, or a form to apply
function renderApplication(player) {
  if (player.trainerId) return "";
  const app = player.application;
  const form = (title) => `
    <form class="apply-form" id="applyForm">
      ${title ? `<p class="muted small-text">${title}</p>` : ""}
      <div class="field-row">
        <label>Coaching title<input name="role" maxlength="60" placeholder="e.g. Cycling coach" value="${esc(app?.role || "")}"></label>
        <label>What do you coach?<input name="specialties" maxlength="200" placeholder="e.g. Road cycling, endurance" value="${esc(app?.specialties || "")}"></label>
      </div>
      <label>About you (optional)<textarea name="bio" rows="3" maxlength="600">${esc(app?.bio || "")}</textarea></label>
      <p class="form-error" role="alert"></p>
      <button type="submit" class="btn btn-small btn-primary">Send application ▶</button>
    </form>`;

  if (app?.status === "pending") {
    return `
      <section class="panel panel-wide application-panel pending">
        <div class="panel-head"><h2>Trainer application</h2><span class="status-chip pending">Pending review</span></div>
        <p>Thanks for applying as <strong>${esc(app.role || "personal trainer")}</strong>. Pieter reviews your application and you'll get an email. Until then you can use LEVEL-UP as a player.</p>
      </section>`;
  }
  if (app?.status === "rejected") {
    return `
      <section class="panel panel-wide application-panel">
        <div class="panel-head"><h2>Trainer application</h2><span class="status-chip declined">Not approved</span></div>
        ${form("Your last application wasn't approved. You can update it and apply again.")}
      </section>`;
  }
  return `
    <details class="panel panel-wide application-panel">
      <summary><h2>Are you a personal trainer?</h2><span class="muted">Apply to coach on LEVEL-UP ▾</span></summary>
      ${form("")}
    </details>`;
}

// Session packs: credits for 1:1 sessions, active once LEVEL-UP has the payment
// Loyalty card (a free 1:1 every N completed sessions) and the rank rewards
function renderRewards(player) {
  const r = player.rewards;
  const stamped = r.count % r.every;
  const toGo = r.every - stamped;
  const open = LevelUp.availableVouchers(player);
  const done = r.vouchers.filter((v) => !LevelUp.voucherOpen(v));
  const xp = player.xp;
  const source = (v) => LevelUp.REWARD_SOURCES[v.source];
  const ranks = [
    { title: "Warrior", level: 8, gift: "Bragging rights" },
    { title: "Champion", level: 12, gift: "Free 1:1 session", id: "champion" },
    { title: "Legend", level: 16, gift: "Free 1:1 session + LEVEL-UP hoodie", id: "legend" }
  ];
  return `
    <section class="panel panel-wide" id="rewards">
      <div class="panel-head">
        <h2>Rewards</h2>
        <span class="xp-chip ${open.length ? "gold" : ""}">${open.length ? `🎁 ${open.length} free session${open.length === 1 ? "" : "s"}` : `${toGo} to your next free session`}</span>
      </div>
      ${open.length ? `<ul class="voucher-list">${open.map((v) => `
        <li class="voucher">
          <span class="voucher-icon" aria-hidden="true">🎁</span>
          <span><strong>Free 1:1 session</strong><small>${source(v).icon} ${source(v).title} · use by ${LevelUp.shortDate(v.expiresAt)}</small></span>
          <a class="btn btn-small btn-primary" href="index.html#schedule">Book it ▶</a>
        </li>`).join("")}</ul>` : ""}
      <div class="rewards-layout">
        <div>
          <h3 class="panel-sub first">Loyalty card</h3>
          <ol class="stamp-card" aria-label="${stamped} of ${r.every} sessions">
            ${Array.from({ length: r.every }, (_, i) => `<li class="${i < stamped ? "on" : ""}">${i === r.every - 1 ? "🎁" : ""}</li>`).join("")}
          </ol>
          <p class="stamp-note"><strong>${stamped}/${r.every}</strong> · ${toGo === 1 ? "1 more session" : `${toGo} more sessions`} to your next free session</p>
        </div>
        <div>
          <h3 class="panel-sub first">Rank rewards</h3>
          <ul class="rank-rewards">${ranks.map((k) => {
            const need = 50 * k.level * (k.level - 1);
            const got = k.id && r.vouchers.some((v) => v.source === k.id);
            const reached = xp >= need || got;
            return `<li class="${reached ? "reached" : ""}"><b>${k.title}</b><span>${esc(k.gift)}</span>
              <small>${reached ? "✓ Reached" : `LVL ${k.level} · ${(need - xp).toLocaleString("en-US")} XP to go`}</small></li>`;
          }).join("")}</ul>
        </div>
      </div>
      ${done.length ? `<h3 class="panel-sub">Earlier rewards</h3><ul class="detail-list">${done.map((v) => `
        <li><span>${source(v).icon} ${source(v).title}${v.hoodie ? " · hoodie" : ""}</span><span class="muted small">${v.bookingId ? "Used" : "Expired"} · earned ${LevelUp.shortDate(v.earnedAt)}</span></li>`).join("")}</ul>` : ""}
      <details class="info-more">
        <summary>ⓘ How it works</summary>
        <p>Every ${r.every} completed sessions earn a free 1:1 session, and so do the Champion and Legend ranks.
        Book it like a normal session and choose "Use a free session" in the booking window, within ${r.validMonths} months.
        A declined request or a cancellation in time gives it back; a late cancellation or no-show uses it up.</p>
      </details>
    </section>`;
}

function renderPacks(player) {
  const euro = LevelUp.euro;
  const credits = LevelUp.packCredits();
  const open = LevelUp.openPackRequest();
  const history = player.packs.filter((pk) => pk.status !== "cancelled");
  const options = LevelUp.getPricing().packs;
  const single = LevelUp.getPricing().price;
  const online = LevelUp.getPricing().onlinePayments;
  return `
    <section class="panel panel-wide" id="packs">
      <div class="panel-head">
        <h2>Session packs</h2>
        <span class="xp-chip">${credits} credit${credits === 1 ? "" : "s"} left</span>
      </div>
      ${open ? `
        <div class="pack-open">
          <p><strong>${open.size}-session pack · ${euro(open.price)}</strong> <span class="status-chip pending">Waiting for payment</span></p>
          <div class="btn-row">
            ${online ? `<button type="button" class="btn btn-small btn-primary" data-pack-pay="${open.id}">Pay ${LevelUp.euro(open.price)} online</button>` : ""}
            <button type="button" class="btn btn-small btn-ghost" data-pack-cancel="${open.id}">Cancel request</button>
          </div>
        </div>` : `
        ${online ? `<div class="pack-pay" role="radiogroup" aria-label="Payment">
          <label><input type="radio" name="packPay" value="online" checked> Pay online now <em class="pay-tag">Recommended</em></label>
          <label><input type="radio" name="packPay" value="in_person"> Pay at the headquarters</label>
        </div>` : ""}
        <div class="pack-options">${options.map((o) => `
          <button type="button" class="pack-option" data-pack-size="${o.size}">
            <span class="price-tag">${o.size} sessions</span>
            <strong>${euro(o.price)}</strong>
            <span>${euro(o.price / o.size)} per session · save ${euro(single * o.size - o.price)}</span>
          </button>`).join("")}
        </div>`}
      <p class="form-error" role="alert" id="packError"></p>
      ${history.some((pk) => pk.status === "paid") ? `<h3 class="panel-sub">My packs</h3><ul class="detail-list">${history.filter((pk) => pk.status === "paid").map((pk) => `
        <li><span>${pk.size}-session pack · ${euro(pk.price)}</span><span class="muted small">${pk.used}/${pk.size} used · ${pk.remaining} left</span></li>`).join("")}</ul>` : ""}
    </section>`;
}

// What the trainer earned: rewarded sessions count, confirmed ones are expected
function renderEarnings() {
  const e = LevelUp.getCoachEarnings();
  if (!e) return "";
  const eur = LevelUp.euro;
  if (e.isOwner) {
    return `
      <div class="earnings">
        <div class="tile"><span class="tile-label">Earned</span><span class="tile-value">${eur(e.earned)}</span><span class="tile-note">${e.sessions} session${e.sessions === 1 ? "" : "s"} · you keep the full ${eur(e.price)}</span></div>
        <div class="tile"><span class="tile-label">Expected</span><span class="tile-value">${eur(e.expected)}</span><span class="tile-note">Confirmed, not yet held</span></div>
      </div>`;
  }
  return `
    <div class="earnings">
      <div class="tile"><span class="tile-label">Earned</span><span class="tile-value">${eur(e.earned)}</span><span class="tile-note">${e.sessions} session${e.sessions === 1 ? "" : "s"} × ${eur(e.fee)}${e.charged ? ` · incl. ${e.charged} no-show/late cancel` : ""}</span></div>
      <div class="tile highlight"><span class="tile-label">To receive</span><span class="tile-value">${eur(e.owed)}</span><span class="tile-note">From LEVEL-UP</span></div>
      <div class="tile"><span class="tile-label">Paid out</span><span class="tile-value">${eur(e.paid)}</span><span class="tile-note">${e.lastPayout ? `Last on ${formatDate(e.lastPayout)}` : "No payouts yet"}</span></div>
      <div class="tile"><span class="tile-label">Expected</span><span class="tile-value">${eur(e.expected)}</span><span class="tile-note">Confirmed sessions</span></div>
    </div>
    <div class="statement-box">
      <p><strong>Monthly statement</strong> <span class="muted small-text">every charged session and your total, as the basis for your invoice to LEVEL-UP</span></p>
      <div class="statement-controls">
        <label class="sr-only" for="statementMonth">Month</label>
        <select id="statementMonth">${LevelUpStatements.recentMonths(13).map((m) => `<option value="${m}">${esc(LevelUpStatements.monthRange(m).label)}</option>`).join("")}</select>
        <button type="button" class="btn btn-small btn-primary" data-my-statement="pdf">PDF</button>
        <button type="button" class="btn btn-small btn-ghost" data-my-statement="csv">CSV</button>
      </div>
      <p class="form-error" role="alert" id="statementError"></p>
    </div>
`;
}

// Trainers: answer requests, see upcoming sessions and reward today's sessions
function renderCoachPanel() {
  if (!LevelUp.isTrainer()) return "";
  const now = new Date();
  const today = LevelUp.dateKey();
  const all = LevelUp.getCoachBookings();
  const requests = all.filter((b) => b.status === "pending" && LevelUp.slotStart(b.date, b.hour) > now);
  const toSettle = all.filter((b) => LevelUp.canSettle(b));
  const upcoming = all.filter((b) => b.status === "confirmed" && b.date > today);
  const missed = all.filter((b) => b.status === "confirmed" && b.date < today && !LevelUp.canSettle(b));
  const settledToday = all.filter((b) => b.date === today && ["completed", "no_show", "late_cancel"].includes(b.status));

  const row = (b, actions = "") => `
    <li class="session-row coach-row">
      ${LevelUp.avatarHtml({ name: b.name, avatar: b.avatar })}
      <div>
        <p class="session-trainer">${esc(b.name)} ${statusChip(b.status)}</p>
        ${LevelUp.healthFlagHtml(b.health)}
        <p class="muted">${LevelUp.formatSlot(b.date, b.hour)}${b.kind === "duo" ? ` · duo with ${esc(b.partner)}` : ""}${LevelUp.payLabel(b) ? ` · ${esc(LevelUp.payLabel(b))}` : b.payMethod === "pack" ? " · pack credit" : b.payMethod === "reward" ? " · free session 🎁" : ""} · <a class="text-link" href="mailto:${esc(b.email)}">${esc(b.email)}</a>${b.note ? ` · “${esc(b.note)}”` : ""}</p>
        <p class="form-error" role="alert"></p>
      </div>
      <div class="coach-actions">${actions}</div>
    </li>`;

  return `
    <section class="panel panel-wide coach-panel" id="coach">
      <div class="panel-head">
        <h2>Coach panel</h2>
        <span class="muted">${esc(LevelUp.trainerById(LevelUp.getPlayer().trainerId).name)}</span>
      </div>
      ${renderEarnings()}
      ${LevelUp.pushCalloutHtml("Turn on notifications to hear about new requests right away.")}
      <h3 class="panel-sub">Requests ${requests.length ? `<span class="count-chip">${requests.length}</span>` : ""}</h3>
      ${requests.length ? `<ul class="session-list">${requests.map((b) => row(b, `
          <button type="button" class="btn btn-small btn-primary" data-coach="confirm" data-id="${b.id}">Confirm</button>
          <button type="button" class="btn btn-small btn-ghost" data-coach="decline" data-id="${b.id}">Decline</button>`)).join("")}</ul>`
        : `<p class="muted">No open requests.</p>`}
      <h3 class="panel-sub">To settle ${toSettle.length ? `<span class="count-chip">${toSettle.length}</span>` : ""}</h3>
      ${toSettle.length ? `
        <ul class="session-list">${toSettle.map((b) => row(b, `
          <button type="button" class="btn btn-small btn-primary" data-coach="reward" data-id="${b.id}">Reward +${b.xp} XP</button>
          ${LevelUp.hasStarted(b) ? `<button type="button" class="btn btn-small btn-ghost" data-coach="noshow" data-id="${b.id}">No-show</button>` : ""}`)).join("")}</ul>`
        : `<p class="muted">Nothing to settle.</p>`}
      ${settledToday.length ? `<h3 class="panel-sub">Settled today</h3><ul class="session-list">${settledToday.map((b) => row(b, b.status === "completed" ? `<span class="log-xp">Rewarded</span>` : "")).join("")}</ul>` : ""}
      ${upcoming.length ? `<h3 class="panel-sub">Upcoming</h3><ul class="session-list">${upcoming.map((b) => row(b)).join("")}</ul>` : ""}
      <details class="my-hours" id="myHoursBox" ${state.hoursOpen ? "open" : ""}>
        <summary><span class="panel-sub">My opening hours</span> <span class="muted small-text">${esc(LevelUp.weeklyHoursText(LevelUp.getPlayer().trainerId) || "no weekly hours yet: players can't book you")}</span></summary>
        <div id="myHours"></div>
      </details>
      ${missed.length ? `<h3 class="panel-sub">Past the ${LevelUp.REWARD_WINDOW_DAYS}-day window</h3><p class="muted small-text">Ask Pieter to settle these in the admin dashboard.</p><ul class="session-list">${missed.map((b) => row(b)).join("")}</ul>` : ""}
    </section>`;
}

// Trainer's own opening hours: the week planner on desktop, the list editor on small screens
function renderMyHours() {
  const el = document.getElementById("myHours");
  if (!el) return;
  const intro = (extra = "") => `<div class="my-hours-intro">${extra}</div>`;
  const trainerId = LevelUp.getPlayer().trainerId;
  if (window.innerWidth >= 900 && !state.hoursList) {
    LevelUpPlanner.render(el, {
      trainers: [trainerId],
      bookings: () => LevelUp.getCoachBookings(),
      intro: intro(),
      onList: () => { state.hoursList = true; renderMyHours(); }
    });
    return;
  }
  LevelUpHours.render(el, {
    key: "profile",
    trainers: [trainerId],
    bookings: () => LevelUp.getCoachBookings(),
    intro: intro(window.innerWidth >= 900 ? `<button type="button" class="btn btn-small btn-ghost" data-my-planner>Week planner</button>` : "")
  });
  el.querySelector("[data-my-planner]")?.addEventListener("click", () => { state.hoursList = false; renderMyHours(); });
}

const MEAL_PLANS = {
  lose: ["Scrambled egg whites & avocado", "Grilled chicken salad", "Greek yogurt & berries", "Salmon & quinoa"],
  maintain: ["Oatmeal with peanut butter", "Brown rice & tuna", "Greek yogurt with nuts", "Grilled chicken wrap"],
  gain: ["Egg omelette with toast", "Salmon with pasta", "Protein shake with oats", "Steak with potatoes"]
};
let statsMessage = "";

// Weight over time: one line, hover or focus a point for its value (the table below has every value)
function weightChart(entries) {
  const points = entries.slice(0, 12).reverse();
  if (points.length < 2) {
    return `<p class="muted chart-hint">Do your next weekly check-in to start your progress line.</p>`;
  }
  const w = 560, h = 180, m = { top: 20, right: 44, bottom: 28, left: 40 };
  const weights = points.map((p) => p.weight);
  let min = Math.floor(Math.min(...weights) - 1);
  let max = Math.ceil(Math.max(...weights) + 1);
  const x = (i) => m.left + (i / (points.length - 1)) * (w - m.left - m.right);
  const y = (v) => m.top + (1 - (v - min) / (max - min)) * (h - m.top - m.bottom);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.weight)}`).join("");
  const grid = [min, (min + max) / 2, max].map((v) => `
    <line x1="${m.left}" x2="${w - m.right}" y1="${y(v)}" y2="${y(v)}" stroke="#1f3026"/>
    <text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end" class="tick">${Math.round(v)}</text>`).join("");
  const last = points[points.length - 1];
  const fmt = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `
    <svg class="weight-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Weight over time, from ${points[0].weight} to ${last.weight} kg">
      ${grid}
      <path d="${line}L${x(points.length - 1)},${h - m.bottom}L${x(0)},${h - m.bottom}Z" fill="#3fa34d" opacity="0.1"/>
      <path d="${line}" fill="none" stroke="#3fa34d" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.map((p, i) => `
        <g class="pt" tabindex="0" aria-label="${fmt(p.date)}: ${p.weight} kg">
          <circle cx="${x(i)}" cy="${y(p.weight)}" r="12" fill="transparent"/>
          <circle cx="${x(i)}" cy="${y(p.weight)}" r="4" fill="#3fa34d" stroke="var(--panel)" stroke-width="2"/>
          <title>${fmt(p.date)}: ${p.weight} kg</title>
        </g>`).join("")}
      <text x="${x(points.length - 1) + 8}" y="${y(last.weight) + 4}" class="val">${last.weight}</text>
      <text x="${m.left}" y="${h - 8}" class="tick">${fmt(points[0].date)}</text>
      <text x="${w - m.right}" y="${h - 8}" text-anchor="end" class="tick">${fmt(last.date)}</text>
    </svg>`;
}

function statsForm(latest) {
  const v = latest || { sex: "male", activity: 1.55, goal: "maintain" };
  const next = LevelUp.nextCheckin();
  const reward = next
    ? `Next check-in XP on ${next.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`
    : `+${LevelUp.CHECKIN_XP} XP weekly check-in`;
  return `
    <form class="stats-form-inline" id="statsForm" novalidate>
      <div class="field-row four">
        <label>Weight (kg)<input name="weight" type="number" min="30" max="300" step="0.1" inputmode="decimal" value="${v.weight ?? ""}" required></label>
        <label>Height (cm)<input name="height" type="number" min="120" max="230" inputmode="numeric" value="${v.height ?? ""}" required></label>
        <label>Age<input name="age" type="number" min="14" max="100" inputmode="numeric" value="${v.age ?? ""}" required></label>
        <label>Sex<select name="sex">${["male", "female"].map((x) => `<option value="${x}" ${v.sex === x ? "selected" : ""}>${x === "male" ? "Male" : "Female"}</option>`).join("")}</select></label>
      </div>
      <div class="field-row">
        <label>Activity level<select name="activity">${LevelUp.ACTIVITY_LEVELS.map((a) => `<option value="${a.value}" ${Math.abs(Number(v.activity) - a.value) < 0.001 ? "selected" : ""}>${a.label}</option>`).join("")}</select></label>
        <label>Goal<select name="goal">${Object.entries(LevelUp.GOALS).map(([k, l]) => `<option value="${k}" ${v.goal === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <p class="form-error" role="alert"></p>
      <div class="stats-submit">
        <button type="submit" class="btn btn-primary">${latest ? "Save check-in ▶" : "Save my stats ▶"}</button>
        <span class="xp-chip ${next ? "muted-chip" : ""}">${reward}</span>
      </div>
    </form>`;
}

function renderBodyStats(player) {
  const entries = player.bodyStats;
  const [latest] = entries;
  if (!latest) {
    return `
      <section class="panel panel-wide" id="stats">
        <div class="panel-head"><h2>Body stats</h2><span class="xp-chip">+${25 + LevelUp.CHECKIN_XP} XP</span></div>
        <p class="muted">Set your stats to see your BMI, daily calories and protein target, and to track your progress week by week.</p>
        ${statsForm(null)}
      </section>`;
  }
  const first = entries[entries.length - 1];
  const change = latest.weight - first.weight;
  const since = new Date(first.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const cat = LevelUp.bmiCategory(latest.bmi);
  const meals = MEAL_PLANS[latest.goal] || MEAL_PLANS.maintain;
  const activity = LevelUp.ACTIVITY_LEVELS.find((a) => Math.abs(a.value - Number(latest.activity)) < 0.001);
  const fmtNum = (n) => Number(n).toLocaleString("en-US");

  return `
    <section class="panel panel-wide" id="stats">
      <div class="panel-head">
        <h2>Body stats</h2>
        <span class="muted">Goal: <strong>${LevelUp.GOALS[latest.goal] || "Maintain"}</strong>${activity ? ` · ${activity.label}` : ""}</span>
      </div>
      <div class="stats-layout">
        <div>
          <div class="result-tiles three">
            <div class="tile"><span class="tile-label">Weight</span><span class="tile-value">${latest.weight}<small>kg</small></span>
              <span class="tile-note">${entries.length > 1 ? `${change > 0 ? "+" : ""}${change.toFixed(1)} kg since ${since}` : "Starting point"}</span></div>
            <div class="tile"><span class="tile-label">BMI</span><span class="tile-value">${latest.bmi}</span><span class="tile-note ${cat.warn ? "warn" : ""}">${cat.label}</span></div>
            <div class="tile"><span class="tile-label">BMR</span><span class="tile-value">${fmtNum(latest.bmr)}<small>kcal</small></span><span class="tile-note">At rest</span></div>
            <div class="tile"><span class="tile-label">Maintenance</span><span class="tile-value">${fmtNum(latest.maintenance)}<small>kcal</small></span><span class="tile-note">Per day</span></div>
            <div class="tile highlight"><span class="tile-label">Daily target</span><span class="tile-value">${fmtNum(latest.target)}<small>kcal</small></span><span class="tile-note">For your goal</span></div>
            <div class="tile"><span class="tile-label">Protein</span><span class="tile-value">${latest.protein}<small>g</small></span><span class="tile-note">Per day</span></div>
          </div>
          <h3 class="panel-sub">Weight progress</h3>
          ${weightChart(entries)}
        </div>
        <div>
          <h3 class="panel-sub first">Weekly check-in</h3>
          ${statsForm(latest)}
          ${statsMessage ? `<p class="form-success">${esc(statsMessage)}</p>` : ""}
          <h3 class="panel-sub">Starter meal plan</h3>
          <ul class="meal-list">
            <li><b>Breakfast</b><span>${meals[0]}</span></li>
            <li><b>Lunch</b><span>${meals[1]}</span></li>
            <li><b>Snack</b><span>${meals[2]}</span></li>
            <li><b>Dinner</b><span>${meals[3]}</span></li>
          </ul>
        </div>
      </div>
    </section>`;
}

function renderAchievements(player) {
  return `
    <section class="panel panel-wide">
      <div class="panel-head">
        <h2>Achievements</h2>
        <span class="muted">${Object.keys(player.achievements).length} of ${ACHIEVEMENTS.length} unlocked</span>
      </div>
      <div class="bonus-grid ${state.achOpen ? "" : "collapsed"}" id="achGrid">
        ${[...ACHIEVEMENTS].sort((a, b) => Boolean(player.achievements[b.id]) - Boolean(player.achievements[a.id])).map((a) => {
          const unlocked = player.achievements[a.id];
          return `
            <div class="bonus-card ${unlocked ? "unlocked" : ""}">
              <span class="bonus-icon" aria-hidden="true">${unlocked ? a.icon : "?"}</span>
              <div>
                <h3>${a.title}</h3>
                <p>${a.desc}</p>
                <span class="bonus-xp">${unlocked ? `✓ ${formatDate(unlocked)}` : `+${a.xp} XP`}</span>
              </div>
            </div>`;
        }).join("")}
      </div>
      <button type="button" class="btn btn-ghost btn-block ach-more" id="achMore" aria-controls="achGrid" aria-expanded="${Boolean(state.achOpen)}">${state.achOpen ? "Show fewer ▲" : `See all ${ACHIEVEMENTS.length} achievements ▼`}</button>
    </section>`;
}

function renderInventory(player) {
  const owned = ITEMS.filter((item) => player.inventory[item.id]);
  return `
    <section class="panel panel-wide">
      <div class="panel-head">
        <h2>Inventory</h2>
        <a href="shop.html" class="btn btn-small">Item shop</a>
      </div>
      ${owned.length ? `
        <ul class="inventory">
          ${owned.map((item) => `
            <li class="rarity-${item.rarity}">
              ${item.img ? `<img src="${item.img}" alt="">` : `<span class="inv-placeholder" aria-hidden="true">≋</span>`}
              <span class="inv-name">${esc(item.name)}</span>
              <span class="inv-qty">×${player.inventory[item.id]}</span>
            </li>`).join("")}
        </ul>` : `<p class="muted">Your inventory is empty. Every item you buy earns XP and shows up here.</p>`}
      ${player.purchases.length ? `
        <h3 class="panel-sub">Orders</h3>
        <ul class="log-list">
          ${player.purchases.slice(0, 5).map((order) => `
            <li>
              <span>${order.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(", ")}</span>
              <span class="muted">${formatDate(order.date)} · ${euro(order.total)}</span>
              <span class="log-xp">+${LevelUp.orderXp(order.total)} XP</span>
            </li>`).join("")}
        </ul>` : ""}
    </section>`;
}

function renderRanks(player, p) {
  return `
    <section class="panel panel-wide">
      <div class="panel-head"><h2>Rank ladder</h2></div>
      <ol class="rank-ladder">
        ${RANKS.map((rank, i) => {
          const state = p.level >= rank.level ? (rank === p.rank ? "current" : "done") : "locked";
          return `
            <li class="${state}">
              <span class="rank-badge" data-tier="${i}">${rank.title}</span>
              <span class="muted">LVL ${rank.level}${rank.level > 1 ? ` · ${LevelUp.xpForLevel(rank.level).toLocaleString("en-US")} XP` : ""}</span>
              <span class="rank-state">${state === "current" ? "◀ You" : state === "done" ? "✓" : "🔒"}</span>
            </li>`;
        }).join("")}
      </ol>
      <h3 class="panel-sub">Recent XP</h3>
      ${player.xpLog.length ? `
        <ul class="log-list compact">
          ${player.xpLog.slice(0, 6).map((entry) => `
            <li><span>${esc(entry.reason)}</span><span class="log-xp">+${entry.amount}</span></li>`).join("")}
        </ul>` : `<p class="muted">No XP yet.</p>`}
    </section>`;
}

// The player's own health questionnaire: status, answers, update
function renderHealth(player) {
  const h = player.healthForm;
  const until = h ? new Date(new Date(h.acceptedAt).setFullYear(new Date(h.acceptedAt).getFullYear() + 1)) : null;
  return `
    <section class="panel panel-wide" id="health">
      <div class="panel-head">
        <h2>Health check</h2>
        ${h ? `<span class="status-chip ${h.valid ? "confirmed" : "pending"}">${h.valid ? "Up to date" : "Please confirm again"}</span>` : `<span class="status-chip pending">Not filled in</span>`}
      </div>
      ${h ? `
        <p class="muted small-text">Confirmed ${formatDate(h.acceptedAt)}${h.valid ? ` · valid until ${formatDate(until)}` : ""}</p>
        ${h.hasRisk ? `<ul class="health-summary">${LevelUp.healthYes(h).map((q) => `<li>⚠ ${esc(q)}</li>`).join("")}</ul>${h.notes ? `<p class="small-text">“${esc(h.notes)}”</p>` : ""}`
          : `<p class="small-text">✓ No health issues reported.</p>`}`
        : `<p class="muted">Not filled in yet.</p>`}
      <div id="healthEdit" ${state.healthEdit ? "" : "hidden"}>${state.healthEdit ? LevelUp.healthFormHtml() : ""}</div>
      ${state.healthEdit ? "" : `<button type="button" class="btn btn-small ${h?.valid ? "btn-ghost" : "btn-primary"}" id="healthEditBtn">${h ? "Update my answers" : "Fill in now"}</button>`}
    </section>`;
}

// Install LEVEL-UP as an app (or confirm it already is), and push notifications
function renderAppPanel() {
  const app = LevelUp.appInstallState();
  const push = LevelUp.getPushStatus();
  const pushText = {
    on: `<p><strong>Notifications are on ✓</strong> You hear about confirmed sessions, reminders, XP and rewards${LevelUp.isTrainer() ? ", and new requests from your clients" : ""}.</p>
      <button type="button" class="btn btn-small btn-ghost" data-push-off>Turn off</button>`,
    off: `<p>Get a message when your trainer confirms, the day before your session, and when you earn XP or a free session${LevelUp.isTrainer() ? ". Trainers also hear about new requests right away" : ""}.</p>
      <button type="button" class="btn btn-small btn-primary" data-push-on>🔔 Turn on notifications</button>`,
    "ios-install": `<p>On iPhone, notifications work in the LEVEL-UP app: add it to your home screen first, then turn them on here in the app.</p>`,
    denied: `<p>Notifications are blocked for LEVEL-UP. Allow them in your phone or browser settings (site settings → Notifications), then come back here.</p>`,
    unsupported: `<p>This browser can't show notifications. Try Chrome, Edge, Firefox or Safari on your phone.</p>`,
    unknown: `<p class="muted">Checking…</p>`
  }[push];
  return `
    <section class="panel panel-wide app-panel" id="app">
      <div class="panel-head">
        <h2>App &amp; notifications</h2>
        ${app.standalone ? `<span class="status-chip confirmed">App installed ✓</span>` : ""}
      </div>
      <div class="app-panel-body">
        <img src="img/app/icon-192.png" alt="" width="72" height="72">
        ${app.standalone
          ? `<p>You're using the app. Updates arrive by themselves: no app store needed.</p>`
          : `<p>Put LEVEL-UP on your home screen: it opens full screen like an app, so booking your trainer is one tap away. Free, no app store needed.</p>
             <button type="button" class="btn btn-primary" data-install-app>📲 ${app.canPrompt ? "Install the app" : "How to install"}</button>`}
      </div>
      <h3 class="panel-sub">Notifications</h3>
      <div class="push-setting push-${push}">${pushText}</div>
    </section>`;
}

function renderSettings() {
  return `
    <section class="panel panel-wide settings" id="account">
      <div>
        <h2>Account</h2>
        <p class="muted">Logged in as ${esc(LevelUp.getPlayer().email)}</p>
        <div class="photo-setting">
          ${LevelUp.avatarHtml(LevelUp.getPlayer())}
          <span>Profile photo</span>
          <label class="btn btn-small btn-ghost">${LevelUp.getPlayer().avatarUrl ? "Change" : "Upload photo"}<input type="file" accept="image/*" data-avatar-input hidden></label>
          ${LevelUp.getPlayer().avatarUrl ? `<button type="button" class="btn btn-small btn-ghost" data-avatar-remove>Remove</button>` : ""}
        </div>
        ${LevelUp.getPlayer().trainerId ? "" : `
        <label class="toggle">
          <input type="checkbox" id="leaderboardToggle" ${LevelUp.getPlayer().showOnLeaderboard !== false ? "checked" : ""}>
          <span>Show my player name and level on the <a href="index.html#highScores" class="text-link">high scores</a></span>
        </label>`}
        <label class="toggle">
          <input type="checkbox" id="carbonToggle" ${LevelUp.carbonOnly() ? "checked" : ""}>
          <span>Always use Carbon green (instead of my rank colour)</span>
        </label>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost btn-small" data-logout>Log out</button>
        <button type="button" class="btn btn-small btn-danger" id="deleteProfile">Delete profile</button>
      </div>
    </section>`;
}

function render() {
  const player = LevelUp.getPlayer();
  if (!LevelUp.isReady()) {
    root.innerHTML = `<p class="board-message">Loading your profile…</p>`;
    return;
  }
  if (!player) {
    renderLoggedOut();
    return;
  }
  const p = LevelUp.progress(player.xp);
  const tabs = profileTabs(player);
  if (!tabs.some((t) => t.id === state.tab)) state.tab = "overview";
  const { inTab } = LevelUp;
  root.innerHTML = `
    ${renderHeader(player, p)}
    ${LevelUp.pageTabsHtml(tabs, state.tab)}
    ${inTab("overview", renderSummary(player))}
    <div class="panel-grid">
      ${inTab("overview", renderSessions())}
      ${inTab("coach", renderCoachPanel())}
      ${inTab("rewards", renderRewards(player))}
      ${inTab("rewards", renderAchievements(player))}
      ${inTab("rewards", renderRanks(player, p))}
      ${inTab("shop", renderPacks(player))}
      ${inTab("shop", renderInventory(player))}
      ${inTab("me", renderBodyStats(player))}
      ${inTab("me", renderHealth(player))}
      ${inTab("me", renderApplication(player))}
      ${inTab("me", renderAppPanel())}
      ${inTab("me", renderSettings())}
    </div>`;
  // first render: open the tab the link points to (profile.html#packs, #rewards …)
  if (!state.tabFromLink) {
    state.tabFromLink = true;
    const fromLink = LevelUp.tabFromHash(root, tabs.map((t) => t.id));
    if (fromLink) {
      state.tab = fromLink;
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      LevelUp.showPageTab(root, state.tab);
      if (target && !target.matches("[data-page-tab]")) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    }
  }
  LevelUp.showPageTab(root, state.tab);
  bindEvents(player);
}

// Page tabs; the counters show what needs attention
function profileTabs(player) {
  const now = new Date();
  const coach = LevelUp.isTrainer() ? LevelUp.getCoachBookings() : [];
  const requests = coach.filter((b) => b.status === "pending" && LevelUp.slotStart(b.date, b.hour) > now).length;
  const toSettle = coach.filter((b) => LevelUp.canSettle(b)).length;
  const needsSetup = (!player.bodyStats.length ? 1 : 0) + (!LevelUp.healthValid() ? 1 : 0);
  return [
    { id: "overview", label: "Overview" },
    LevelUp.isTrainer() && { id: "coach", label: "Coach", badge: requests + toSettle },
    { id: "rewards", label: "Rewards", badge: LevelUp.availableVouchers(player).length ? `🎁 ${LevelUp.availableVouchers(player).length}` : 0 },
    { id: "shop", label: "Packs & shop" },
    { id: "me", label: "Me", badge: needsSetup ? "!" : 0 }
  ].filter(Boolean);
}

function bindEvents(player) {
  if (LevelUp.isTrainer()) {
    renderMyHours();
    document.getElementById("myHoursBox")?.addEventListener("toggle", (event) => { state.hoursOpen = event.target.open; });
  }

  document.getElementById("healthEditBtn")?.addEventListener("click", () => { state.healthEdit = true; render(); document.getElementById("health")?.scrollIntoView({ block: "start" }); });
  document.querySelector("#healthEdit [data-health-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      state.healthEdit = false;
      await LevelUp.saveHealthForm(form);
      LevelUp.toast({ title: "Health check saved", text: "Thanks! Your trainer can train you safely.", icon: "✓", tone: "green" });
    } catch (err) {
      state.healthEdit = true;
      form.querySelector(".form-error").textContent = err.message;
      form.querySelector('button[type="submit"]').disabled = false;
    }
  });

  root.querySelectorAll("[data-avatar-input]").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const label = input.closest("label");
    label?.classList.add("busy");
    try {
      await LevelUp.uploadAvatar(file);
      LevelUp.toast({ title: "Photo saved", text: "Your face is on the high scores now", icon: "📷", tone: "green" });
    } catch (err) {
      label?.classList.remove("busy");
      LevelUp.toast({ title: "Photo not saved", text: err.message, icon: "!" });
    }
  }));
  root.querySelector("[data-avatar-remove]")?.addEventListener("click", async (event) => {
    if (!confirm("Remove your profile photo?")) return;
    event.target.disabled = true;
    try { await LevelUp.removeAvatar(); } catch (err) { event.target.disabled = false; alert(err.message); }
  });

  root.querySelectorAll("[data-page-tab]").forEach((btn) => btn.addEventListener("click", () => {
    state.tab = btn.dataset.pageTab;
    LevelUp.showPageTab(root, state.tab);
    history.replaceState(null, "", `#${state.tab}`);
    LevelUp.scrollToTabs(root);
  }));

  document.getElementById("historyBtn")?.addEventListener("click", () => {
    state.historyOpen = !state.historyOpen;
    render();
    if (state.historyOpen) document.getElementById("sessionHistory")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.getElementById("achMore")?.addEventListener("click", (event) => {
    state.achOpen = !state.achOpen;
    document.getElementById("achGrid").classList.toggle("collapsed", !state.achOpen);
    event.target.setAttribute("aria-expanded", String(state.achOpen));
    event.target.textContent = state.achOpen ? "Show fewer ▲" : `See all ${ACHIEVEMENTS.length} achievements ▼`;
  });

  root.querySelectorAll("[data-coach]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        if (button.dataset.coach === "reward") await LevelUp.rewardSession(button.dataset.id);
        else if (button.dataset.coach === "noshow") {
          const b = LevelUp.getCoachBookings().find((x) => x.id === button.dataset.id);
          if (!confirm(`Mark ${b.name} as no-show? The session is charged in full (${LevelUp.euro(b.price)}) and they get an email.`)) { button.disabled = false; return; }
          await LevelUp.markNoShow(button.dataset.id);
        } else await LevelUp.respondBooking(button.dataset.id, button.dataset.coach === "confirm");
      } catch (err) {
        button.disabled = false;
        button.closest(".session-row").querySelector(".form-error").textContent = err.message;
      }
    });
  });

  const applyForm = document.getElementById("applyForm");
  applyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = applyForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await LevelUp.applyAsTrainer(Object.fromEntries(new FormData(applyForm)));
      LevelUp.toast({ title: "Application sent", text: "Pieter reviews it soon. You'll get an email.", icon: "✉", tone: "green" });
    } catch (err) {
      applyForm.querySelector(".form-error").textContent = err.message;
      submit.disabled = false;
    }
  });

  const statsFormEl = document.getElementById("statsForm");
  statsFormEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = statsFormEl.querySelector('button[type="submit"]');
    const error = statsFormEl.querySelector(".form-error");
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = "Saving…";
    try {
      const result = await LevelUp.saveBodyStats(Object.fromEntries(new FormData(statsFormEl)));
      statsMessage = result.xp ? `Check-in saved: +${result.xp} XP.` : "Stats updated. Check-in XP is once a week.";
      render();
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
      submit.textContent = "Try again";
    }
  });

  root.querySelectorAll("[data-pack-size]").forEach((button) => {
    button.addEventListener("click", async () => {
      const size = Number(button.dataset.packSize);
      const o = LevelUp.getPricing().packs.find((x) => x.size === size);
      const pay = root.querySelector("[name=packPay]:checked")?.value || "in_person";
      if (!confirm(pay === "online"
        ? `Buy a ${size}-session pack for ${LevelUp.euro(o.price)}? You go to the payment page; your credits are active right after paying.`
        : `Request a ${size}-session pack for ${LevelUp.euro(o.price)}? You pay at the headquarters; your credits become active once you've paid.`)) return;
      button.disabled = true;
      try {
        await LevelUp.requestPack(size, pay);
        if (pay !== "online") LevelUp.toast({ title: "Pack requested", text: "Pay at the headquarters to activate it", icon: "✉", tone: "green" });
      } catch (err) {
        button.disabled = false;
        document.getElementById("packError").textContent = err.message;
      }
    });
  });
  root.querySelector("[data-pack-pay]")?.addEventListener("click", async (event) => {
    event.target.disabled = true;
    event.target.textContent = "To the payment page…";
    try { await LevelUp.startPayment("pack", event.target.dataset.packPay); }
    catch (err) { event.target.disabled = false; document.getElementById("packError").textContent = err.message; }
  });
  root.querySelectorAll("[data-my-statement]").forEach((button) => {
    button.addEventListener("click", async () => {
      const month = document.getElementById("statementMonth").value;
      const range = LevelUpStatements.monthRange(month);
      const pdf = button.dataset.myStatement === "pdf";
      const win = pdf ? window.open("", "_blank") : null; // open now, or pop-up blockers stop it after loading
      button.disabled = true;
      try {
        const rows = await LevelUp.coachStatement(range.from, range.to);
        const st = LevelUpStatements.build(LevelUp.getPlayer().trainerId, month, rows);
        if (pdf) LevelUpStatements.statementPdf(st, win); else LevelUpStatements.statementCsv(st);
      } catch (err) {
        win?.close();
        document.getElementById("statementError").textContent = err.message;
      }
      button.disabled = false;
    });
  });
  root.querySelectorAll("[data-pay-hq]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await LevelUp.payInPersonInstead(button.dataset.payHq);
        LevelUp.toast({ title: "Request sent", text: "You pay at the headquarters", icon: "✓", tone: "green" });
      } catch (err) { button.disabled = false; alert(err.message); }
    });
  });
  root.querySelectorAll("[data-pay-booking]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "To the payment page…";
      try { await LevelUp.startPayment("booking", button.dataset.payBooking); }
      catch (err) { button.disabled = false; button.textContent = "Pay online"; alert(err.message); }
    });
  });
  root.querySelector("[data-pack-cancel]")?.addEventListener("click", async (event) => {
    if (!confirm("Cancel this pack request?")) return;
    event.target.disabled = true;
    try { await LevelUp.cancelPackRequest(event.target.dataset.packCancel); }
    catch (err) { event.target.disabled = false; document.getElementById("packError").textContent = err.message; }
  });

  root.querySelectorAll("[data-cancel-booking]").forEach((button) => {
    button.addEventListener("click", async () => {
      const b = LevelUp.playerBookings().find((x) => x.id === button.dataset.cancelBooking);
      const late = b && LevelUp.isLateCancel(b);
      if (!confirm(late
        ? `This session starts in less than ${LevelUp.FREE_CANCEL_HOURS} hours. Cancelling now is charged in full (${LevelUp.euro(b.price)}). Cancel anyway?`
        : "Cancel this session? It's free, and your trainer gets an email.")) return;
      button.disabled = true;
      try {
        await LevelUp.cancelBooking(button.dataset.cancelBooking);
      } catch (err) {
        button.disabled = false;
        alert(err.message);
      }
    });
  });

  document.getElementById("leaderboardToggle")?.addEventListener("change", async (event) => {
    event.target.disabled = true;
    try {
      await LevelUp.setLeaderboardVisibility(event.target.checked);
    } catch (err) {
      event.target.checked = !event.target.checked;
      alert(err.message);
    }
    event.target.disabled = false;
  });

  document.getElementById("carbonToggle")?.addEventListener("change", (event) => LevelUp.setCarbonOnly(event.target.checked));

  document.getElementById("deleteProfile").addEventListener("click", async () => {
    if (!confirm("Delete your account? Your level, XP, sessions and stats will be gone for good.")) return;
    try {
      await LevelUp.deleteProfile();
    } catch (err) {
      alert(err.message);
    }
  });
}

document.addEventListener("levelup:change", render);
render();
