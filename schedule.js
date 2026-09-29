// Weekly booking board, fed by the LEVEL-UP Google Calendar and the bookings
// in Supabase. Players book 1-hour sessions within the trainers' open hours.

const { TRAINERS, esc, dateKey, startOfWeek } = LevelUp;

const weekBoard = document.getElementById("weekBoard");
const weekLabel = document.getElementById("weekLabel");
const weekPrev = document.getElementById("weekPrev");
const weekNext = document.getElementById("weekNext");
const trainerFilter = document.getElementById("trainerFilter");
const bookingDialog = document.getElementById("bookingDialog");
const bookingContent = document.getElementById("bookingContent");
const questList = document.getElementById("questList");

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n) => String(n).padStart(2, "0");
const timeText = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
let weekOffset = 0;
let activeTrainer = "all";
let pendingSlot = null;

function weekDays(offset) {
  const monday = startOfWeek(offset);
  return DAY_NAMES.map((name, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return { name, date, key: dateKey(date) };
  });
}

// Rows to show this week: every open hour and group session, or 09–18 when empty
function boardHours(days, trainers) {
  const hours = new Set();
  days.forEach((day) => {
    trainers.forEach((t) => LevelUp.trainerHours(t.id, day.key).forEach((h) => hours.add(h)));
    LevelUp.groupSessions(day.key).forEach((g) => hours.add(g.start.getHours()));
  });
  if (!hours.size) return Array.from({ length: 9 }, (_, i) => 9 + i);
  const list = [...hours];
  const min = Math.min(...list);
  const max = Math.max(...list);
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

// ---------- Trainer filter ----------
function renderFilter() {
  const tabs = [{ id: "all", short: "All trainers" }, ...TRAINERS];
  trainerFilter.innerHTML = tabs.map((t) => `
    <button type="button" role="tab" data-trainer="${t.id}" aria-selected="${t.id === activeTrainer}"
      ${t.color ? `style="--c:${t.color}"` : ""}>
      ${t.color ? `<span class="dot" aria-hidden="true"></span>` : ""}${esc(t.short)}
    </button>`).join("");
}

trainerFilter.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-trainer]");
  if (!tab) return;
  activeTrainer = tab.dataset.trainer;
  renderFilter();
  renderBoard();
});

// ---------- Board ----------
function slotState(trainer, key, hour, now) {
  const booking = LevelUp.findBooking(trainer.id, key, hour);
  const blocker = LevelUp.slotBlocker(key, hour, now);
  if (booking?.mine) return { state: blocker === "past" ? "done" : "mine", booking };
  if (booking) return { state: "taken", booking };
  return { state: blocker ? "past" : "free", booking: null };
}

function renderBoard() {
  if (!LevelUp.isReady()) {
    weekBoard.innerHTML = `<p class="board-message">Loading the schedule…</p>`;
    return;
  }
  const days = weekDays(weekOffset);
  const trainers = TRAINERS.filter((t) => activeTrainer === "all" || t.id === activeTrainer);
  const hours = boardHours(days, trainers);
  const player = LevelUp.getPlayer();
  const now = new Date();
  const todayKey = dateKey(now);

  const fmt = (d, opts) => d.toLocaleDateString("en-GB", opts);
  weekLabel.innerHTML = `
    <span>${weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : `In ${weekOffset} weeks`}</span>
    ${fmt(days[0].date, { day: "numeric", month: "short" })} – ${fmt(days[6].date, { day: "numeric", month: "short", year: "numeric" })}`;
  weekPrev.disabled = weekOffset === 0;
  weekNext.disabled = weekOffset >= LevelUp.BOOKING_WEEKS_AHEAD - 1;

  const hourColumn = `
    <div class="board-col board-hours" aria-hidden="true">
      <div class="board-head"></div>
      ${hours.map((h) => `<div class="board-hour">${pad(h)}:00</div>`).join("")}
    </div>`;

  const dayColumns = days.map((day) => {
    let itemCount = 0;
    const groups = activeTrainer === "all" ? LevelUp.groupSessions(day.key) : [];
    const cells = hours.map((hour) => {
      const group = groups.filter((g) => g.start.getHours() === hour).map((g) => {
        itemCount++;
        return `
          <div class="slot group" title="${esc(g.title)}">
            <span class="slot-time">${timeText(g.start)}</span>
            <span class="slot-name">${esc(g.title)}</span>
            <span class="slot-state">Group · ${timeText(g.start)}${g.location ? ` · ${esc(g.location)}` : ""}</span>
          </div>`;
      }).join("");

      const trainerSlots = trainers
        .filter((t) => LevelUp.trainerHours(t.id, day.key).includes(hour))
        .map((t) => {
          itemCount++;
          const { state } = slotState(t, day.key, hour, now);
          const label = { free: `Book ${t.short}`, mine: "Your session", done: "Done ✓", taken: "Booked", past: "Closed" }[state];
          return `
            <button type="button" class="slot ${state}" style="--c:${t.color}"
              data-trainer="${t.id}" data-date="${day.key}" data-hour="${hour}"
              ${state === "free" || state === "mine" ? "" : "disabled"}
              aria-label="${esc(t.name)}, ${day.name} ${pad(hour)}:00, ${label}">
              <span class="slot-time">${pad(hour)}:00</span>
              <span class="slot-name">${esc(t.short)}</span>
              <span class="slot-state">${state === "free" ? `+${LevelUp.SESSION_XP} XP` : label}</span>
            </button>`;
        }).join("");

      const content = group + trainerSlots;
      return `<div class="board-cell ${content ? "" : "empty"}">${content}</div>`;
    }).join("");

    return `
      <div class="board-col ${day.key === todayKey ? "today" : ""} ${itemCount ? "" : "closed"}">
        <div class="board-head">
          <span class="board-day">${day.name}</span>
          <span class="board-date">${day.date.getDate()}</span>
        </div>
        ${cells}
        <p class="board-closed-note">No sessions this day</p>
      </div>`;
  }).join("");

  weekBoard.innerHTML = hourColumn + dayColumns;
  weekBoard.classList.toggle("signed-in", Boolean(player));
}

weekPrev.addEventListener("click", () => { weekOffset = Math.max(0, weekOffset - 1); renderBoard(); });
weekNext.addEventListener("click", () => { weekOffset = Math.min(LevelUp.BOOKING_WEEKS_AHEAD - 1, weekOffset + 1); renderBoard(); });

// ---------- Quest board in the header: next open sessions ----------
function nextOpenSlots(limit) {
  const now = new Date();
  const found = [];
  for (let i = 0; i < LevelUp.BOOKING_WEEKS_AHEAD * 7 && found.length < limit * 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dateKey(d);
    TRAINERS.forEach((t) => {
      LevelUp.trainerHours(t.id, key).forEach((hour) => {
        if (!LevelUp.slotBlocker(key, hour, now) && !LevelUp.findBooking(t.id, key, hour)) {
          found.push({ trainer: t, key, hour, time: LevelUp.slotStart(key, hour) });
        }
      });
    });
  }
  // Spread the list over trainers: first slot of each trainer, then the rest
  found.sort((a, b) => a.time - b.time);
  const firsts = TRAINERS.map((t) => found.find((f) => f.trainer === t)).filter(Boolean);
  const rest = found.filter((f) => !firsts.includes(f));
  return [...firsts, ...rest].slice(0, limit).sort((a, b) => a.time - b.time);
}

function renderQuestBoard() {
  if (!questList) return;
  document.getElementById("partyFaces").innerHTML = TRAINERS.map((t) =>
    `<img src="${t.img}" alt="" style="--c:${t.color}">`).join("");
  document.getElementById("partyText").textContent = `${TRAINERS.length} trainers ready to coach you`;

  if (!LevelUp.isReady()) return;
  const open = nextOpenSlots(3);
  if (!open.length) {
    questList.innerHTML = `<li class="quest-empty">No open sessions right now. Check the full schedule or ask us on WhatsApp.</li>`;
    return;
  }
  questList.innerHTML = open.map((q) => `
    <li>
      <button type="button" class="quest-item" style="--c:${q.trainer.color}"
        data-quest-trainer="${q.trainer.id}" data-date="${q.key}" data-hour="${q.hour}">
        <img src="${q.trainer.img}" alt="">
        <span class="quest-info">
          <span class="quest-when">${q.time.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${pad(q.hour)}:00</span>
          <span class="quest-who">1:1 with ${esc(q.trainer.short)}</span>
        </span>
        <span class="xp-chip">+${LevelUp.SESSION_XP} XP</span>
      </button>
    </li>`).join("");
}

questList?.addEventListener("click", (event) => {
  const item = event.target.closest("[data-quest-trainer]");
  if (!item) return;
  openSlot({ trainerId: item.dataset.questTrainer, date: item.dataset.date, hour: Number(item.dataset.hour) });
});

// ---------- Booking dialog ----------
function openSlot(slot) {
  pendingSlot = slot;
  renderBookingDialog();
  if (!bookingDialog.open) bookingDialog.showModal();
}

weekBoard.addEventListener("click", (event) => {
  const slot = event.target.closest("button.slot");
  if (!slot || slot.disabled) return;
  openSlot({ trainerId: slot.dataset.trainer, date: slot.dataset.date, hour: Number(slot.dataset.hour) });
});

function renderBookingDialog(message = "") {
  if (!pendingSlot) return;
  const { trainerId, date, hour } = pendingSlot;
  const trainer = LevelUp.trainerById(trainerId);
  const player = LevelUp.getPlayer();
  const booking = LevelUp.findBooking(trainerId, date, hour);
  const when = LevelUp.formatSlot(date, hour);
  const stats = LevelUp.trainerStats(trainerId);

  const trainerCard = `
    <div class="booking-trainer" style="--c:${trainer.color}">
      <img src="${trainer.img}" alt="">
      <div>
        <p class="booking-trainer-name">${esc(trainer.name)}</p>
        <p class="muted">${esc(trainer.role)} · LVL ${stats.level} ${stats.rank.title}</p>
      </div>
    </div>
    <p class="booking-when">${when}</p>`;

  // Your own booking: offer to cancel
  if (booking?.mine) {
    const own = LevelUp.playerBookings().find((b) => b.id === booking.id);
    bookingContent.innerHTML = `
      <p class="section-kicker">Your session</p>
      <h2 class="auth-title" id="bookingTitle">You're booked!</h2>
      ${trainerCard}
      ${own?.note ? `<p class="booking-note-view">“${esc(own.note)}”</p>` : ""}
      <p class="form-error" role="alert">${esc(message)}</p>
      <div class="btn-row">
        <a class="btn btn-ghost btn-small" href="${LevelUp.googleCalendarLink(pendingSlot)}" target="_blank" rel="noopener">Add to Google Calendar</a>
        <button type="button" class="btn btn-small btn-danger" id="cancelBooking">Cancel session (−${own?.xp ?? LevelUp.SESSION_XP} XP)</button>
      </div>`;
    const cancel = document.getElementById("cancelBooking");
    cancel.addEventListener("click", async () => {
      cancel.disabled = true;
      cancel.textContent = "Cancelling…";
      try {
        await LevelUp.cancelBooking(booking.id);
        bookingDialog.close();
      } catch (err) {
        renderBookingDialog(err.message);
      }
    });
    return;
  }

  bookingContent.innerHTML = `
    <p class="section-kicker">New quest</p>
    <h2 class="auth-title" id="bookingTitle">Book this session</h2>
    ${trainerCard}
    ${player ? `
      <form class="auth-form" id="bookingForm">
        <label>Note for your trainer (optional)
          <textarea name="note" rows="3" maxlength="300" placeholder="Your goal, experience level or preferred location…"></textarea>
        </label>
        <p class="form-error" role="alert">${esc(message)}</p>
        <div class="booking-reward"><span class="xp-chip">+${LevelUp.SESSION_XP} XP</span><span>for you, and XP for ${esc(trainer.short)} too</span></div>
        <button type="submit" class="btn btn-primary btn-block">Confirm booking ▶</button>
      </form>
      <p class="auth-note">${esc(trainer.short)} gets notified and contacts you about the location and payment.</p>` : `
      <div class="booking-login">
        <p>Log in or create your player to book this session and earn <strong>+${LevelUp.SESSION_XP} XP</strong>.</p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary btn-small" data-auth-open="signup">New player</button>
          <button type="button" class="btn btn-ghost btn-small" data-auth-open="login">Log in</button>
        </div>
      </div>`}`;

  document.getElementById("bookingForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Booking…";
    try {
      await LevelUp.bookSession({ ...pendingSlot, note: event.target.elements.note.value.trim() });
      showBooked();
    } catch (err) {
      renderBookingDialog(err.message);
    }
  });
}

function showBooked() {
  const trainer = LevelUp.trainerById(pendingSlot.trainerId);
  bookingContent.innerHTML = `
    <p class="section-kicker">Quest accepted</p>
    <h2 class="auth-title" id="bookingTitle">Session booked!</h2>
    <p class="booking-when">${LevelUp.formatSlot(pendingSlot.date, pendingSlot.hour)}</p>
    <p>${esc(trainer.name)} has been notified and will contact you about the location and payment. A confirmation is on its way to your email.</p>
    <div class="booking-reward"><span class="xp-chip">+${LevelUp.SESSION_XP} XP</span><span>added to your profile</span></div>
    <div class="btn-row">
      <a class="btn btn-small btn-primary" href="${LevelUp.googleCalendarLink(pendingSlot)}" target="_blank" rel="noopener">Add to Google Calendar</a>
      <a href="profile.html" class="btn btn-small">My sessions</a>
      <button type="button" class="btn btn-ghost btn-small" data-close-dialog>Back to schedule</button>
    </div>`;
  pendingSlot = null;
}

// When a guest logs in from the booking dialog, reopen the slot they picked
let reopenAfterLogin = false;

// Closing the login dialog without logging in forgets the pending slot
document.addEventListener("close", (event) => {
  if (event.target !== bookingDialog && event.target.returnValue !== "success" && !LevelUp.getPlayer()) reopenAfterLogin = false;
}, true);

bookingDialog.addEventListener("click", (event) => {
  if (event.target === bookingDialog || event.target.closest("[data-close], [data-close-dialog]")) {
    reopenAfterLogin = false;
    bookingDialog.close();
  } else if (event.target.closest("[data-auth-open]")) {
    reopenAfterLogin = true;
    bookingDialog.close(); // the login dialog opens next
  }
});

// ---------- Trainer stats on the team cards ----------
function availabilityText(trainer) {
  // Open hours in the next 4 weeks, grouped per weekday
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const perDay = new Map();
  const now = new Date();
  for (let i = 0; i < LevelUp.BOOKING_WEEKS_AHEAD * 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const hours = LevelUp.trainerHours(trainer.id, dateKey(d));
    if (hours.length && !perDay.has(d.getDay())) perDay.set(d.getDay(), [hours[0], hours[hours.length - 1] + 1]);
  }
  if (!perDay.size) return "Open hours coming soon";
  return [...perDay.entries()]
    .sort((a, b) => ((a[0] + 6) % 7) - ((b[0] + 6) % 7))
    .map(([day, [from, to]]) => `${names[day]} ${pad(from)}:00–${pad(to)}:00`)
    .join(" · ");
}

function renderTrainerStats() {
  document.querySelectorAll("[data-trainer-stats]").forEach((el) => {
    const trainer = LevelUp.trainerById(el.dataset.trainerStats);
    const s = LevelUp.trainerStats(trainer.id);
    el.innerHTML = `
      <div class="trainer-level">
        <span class="rank-badge" data-tier="${LevelUp.RANKS.indexOf(s.rank)}">LVL ${s.level} · ${s.rank.title}</span>
        <span class="muted">${s.sessions} session${s.sessions === 1 ? "" : "s"} · ${s.clients} player${s.clients === 1 ? "" : "s"}</span>
      </div>
      <div class="mini-xp wide" aria-hidden="true"><i style="width:${s.pct.toFixed(1)}%"></i></div>
      <p class="trainer-availability">🕒 ${LevelUp.isReady() ? availabilityText(trainer) : "Loading…"}</p>`;
  });
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-book-trainer]");
  if (!link) return;
  activeTrainer = link.dataset.bookTrainer;
  renderFilter();
  renderBoard();
});

// ---------- High scores ----------
function renderHighScores() {
  const list = document.getElementById("hsList");
  const foot = document.getElementById("hsFoot");
  if (!list) return;
  if (!LevelUp.isReady()) return;
  const rows = LevelUp.getLeaderboard();
  const player = LevelUp.getPlayer();
  const top = rows.filter((r) => r.place <= 10);
  const me = rows.find((r) => r.isMe);

  if (!top.length) {
    list.innerHTML = `<li class="hs-empty">No scores yet. Create your player and claim the #1 spot!</li>`;
  } else {
    const row = (r) => {
      const p = LevelUp.progress(r.xp);
      return `
        <li class="hs-row ${r.place <= 3 ? `podium p${r.place}` : ""} ${r.isMe ? "me" : ""}">
          <span class="hs-place">${r.place <= 3 ? ["", "1ST", "2ND", "3RD"][r.place] : `${r.place}TH`}</span>
          ${LevelUp.avatarHtml({ name: r.name, xp: r.xp })}
          <span class="hs-name">${esc(r.name)}${r.isMe ? ` <span class="hs-you">You</span>` : ""}</span>
          <span class="hs-rank"><span class="rank-badge" data-tier="${LevelUp.RANKS.indexOf(p.rank)}">${p.rank.title}</span></span>
          <span class="hs-level">LVL ${p.level}</span>
          <span class="hs-xp">${r.xp.toLocaleString("en-US")} XP</span>
        </li>`;
    };
    list.innerHTML = top.map(row).join("") + (me && me.place > 10 ? `<li class="hs-gap" aria-hidden="true">···</li>${row(me)}` : "");
  }

  if (!player) {
    foot.innerHTML = `<button type="button" class="link-btn" data-auth-open="signup">Create your player</button> to get on the board.`;
  } else if (player.trainerId) {
    foot.textContent = "You're a trainer: your level shows on your team card.";
  } else if (player.showOnLeaderboard === false) {
    foot.innerHTML = `You're hidden from the high scores. <a href="profile.html#account" class="text-link">Change this in your profile</a>.`;
  } else {
    foot.textContent = me ? `You're #${me.place}. Every session, check-in and workout moves you up.` : "";
  }
}

function renderAll() {
  renderHighScores();
  renderBoard();
  renderQuestBoard();
  renderTrainerStats();
}

document.addEventListener("levelup:change", () => {
  renderAll();
  if (reopenAfterLogin && LevelUp.getPlayer() && pendingSlot) {
    reopenAfterLogin = false;
    renderBookingDialog();
    bookingDialog.showModal();
  }
});

document.getElementById("noticeText").textContent = `Closed: book at least ${LevelUp.BOOKING_NOTICE_HOURS} hours ahead`;
renderFilter();
renderAll();
