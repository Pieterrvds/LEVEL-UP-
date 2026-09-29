// Weekly booking board: players book 1-hour sessions within the trainers' open hours.

const { TRAINERS, esc } = LevelUp;

const weekBoard = document.getElementById("weekBoard");
const weekLabel = document.getElementById("weekLabel");
const weekPrev = document.getElementById("weekPrev");
const weekNext = document.getElementById("weekNext");
const trainerFilter = document.getElementById("trainerFilter");
const bookingDialog = document.getElementById("bookingDialog");
const bookingContent = document.getElementById("bookingContent");

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
let weekOffset = 0;
let activeTrainer = "all";
let pendingSlot = null;

const dateKey = (date) => date.toLocaleDateString("en-CA"); // YYYY-MM-DD
const pad = (n) => String(n).padStart(2, "0");

function startOfWeek(offset) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  monday.setDate(monday.getDate() + offset * 7);
  return monday;
}

function weekDays(offset) {
  const monday = startOfWeek(offset);
  return DAY_NAMES.map((name, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return { name, date, key: dateKey(date) };
  });
}

// Hours to show: from the earliest to the latest open hour of any trainer
function boardHours() {
  const ranges = TRAINERS.flatMap((t) => Object.values(t.availability));
  const start = Math.min(...ranges.map((r) => r[0]));
  const end = Math.max(...ranges.map((r) => r[1]));
  return Array.from({ length: end - start }, (_, i) => start + i);
}

const availabilityText = (trainer) => {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return Object.entries(trainer.availability)
    .map(([day, [from, to]]) => `${names[day]} ${pad(from)}:00–${pad(to)}:00`)
    .join(" · ");
};

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
function renderBoard() {
  const days = weekDays(weekOffset);
  const hours = boardHours();
  const player = LevelUp.getPlayer();
  const now = new Date();
  const todayKey = dateKey(now);
  const trainers = TRAINERS.filter((t) => activeTrainer === "all" || t.id === activeTrainer);

  const first = days[0].date;
  const last = days[6].date;
  const fmt = (d, opts) => d.toLocaleDateString("en-GB", opts);
  weekLabel.innerHTML = `
    <span>${weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : `In ${weekOffset} weeks`}</span>
    ${fmt(first, { day: "numeric", month: "short" })} – ${fmt(last, { day: "numeric", month: "short", year: "numeric" })}`;
  weekPrev.disabled = weekOffset === 0;
  weekNext.disabled = weekOffset >= LevelUp.BOOKING_WEEKS_AHEAD - 1;

  const hourColumn = `
    <div class="board-col board-hours" aria-hidden="true">
      <div class="board-head"></div>
      ${hours.map((h) => `<div class="board-hour">${pad(h)}:00</div>`).join("")}
    </div>`;

  const dayColumns = days.map((day) => {
    let openCount = 0;
    const cells = hours.map((hour) => {
      const slots = trainers
        .filter((t) => LevelUp.trainerHours(t.id, day.key).includes(hour))
        .map((t) => {
          openCount++;
          const booking = LevelUp.findBooking(t.id, day.key, hour);
          const past = LevelUp.slotStart(day.key, hour) <= now;
          const mine = booking && player && booking.email === player.email;
          const state = mine ? "mine" : booking ? "taken" : past ? "past" : "free";
          const label = { free: `Book ${t.short}`, mine: "Your session", taken: "Booked", past: "Closed" }[state];
          return `
            <button type="button" class="slot ${state}" style="--c:${t.color}"
              data-trainer="${t.id}" data-date="${day.key}" data-hour="${hour}"
              ${state === "free" || state === "mine" ? "" : "disabled"}
              aria-label="${t.name}, ${day.name} ${pad(hour)}:00, ${label}">
              <span class="slot-time">${pad(hour)}:00</span>
              <span class="slot-name">${esc(t.short)}</span>
              <span class="slot-state">${state === "free" ? "+75 XP" : label}</span>
            </button>`;
        }).join("");
      return `<div class="board-cell ${slots ? "" : "empty"}">${slots}</div>`;
    }).join("");

    return `
      <div class="board-col ${day.key === todayKey ? "today" : ""} ${openCount ? "" : "closed"}">
        <div class="board-head">
          <span class="board-day">${day.name}</span>
          <span class="board-date">${day.date.getDate()}</span>
        </div>
        ${cells}
        <p class="board-closed-note">No trainers available</p>
      </div>`;
  }).join("");

  weekBoard.innerHTML = hourColumn + dayColumns;
}

weekPrev.addEventListener("click", () => { weekOffset = Math.max(0, weekOffset - 1); renderBoard(); });
weekNext.addEventListener("click", () => { weekOffset = Math.min(LevelUp.BOOKING_WEEKS_AHEAD - 1, weekOffset + 1); renderBoard(); });

// ---------- Booking dialog ----------
weekBoard.addEventListener("click", (event) => {
  const slot = event.target.closest(".slot");
  if (!slot || slot.disabled) return;
  pendingSlot = { trainerId: slot.dataset.trainer, date: slot.dataset.date, hour: Number(slot.dataset.hour) };
  renderBookingDialog();
  bookingDialog.showModal();
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
  if (booking && player && booking.email === player.email) {
    bookingContent.innerHTML = `
      <p class="section-kicker">Your session</p>
      <h2 class="auth-title" id="bookingTitle">You're booked!</h2>
      ${trainerCard}
      ${booking.note ? `<p class="booking-note-view">“${esc(booking.note)}”</p>` : ""}
      <p class="form-error" role="alert">${esc(message)}</p>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost btn-small" data-close-dialog>Keep it</button>
        <button type="button" class="btn btn-small btn-danger" id="cancelBooking">Cancel session (−${booking.xp} XP)</button>
      </div>`;
    document.getElementById("cancelBooking").addEventListener("click", () => {
      try {
        LevelUp.cancelBooking(booking.id);
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

  document.getElementById("bookingForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      LevelUp.bookSession({ ...pendingSlot, note: event.target.elements.note.value.trim() });
      showBooked();
    } catch (err) {
      renderBookingDialog(err.message);
    }
  });
}

function showBooked() {
  const { trainerId, date, hour } = pendingSlot;
  const trainer = LevelUp.trainerById(trainerId);
  bookingContent.innerHTML = `
    <p class="section-kicker">Quest accepted</p>
    <h2 class="auth-title" id="bookingTitle">Session booked!</h2>
    <p class="booking-when">${LevelUp.formatSlot(date, hour)}</p>
    <p>${esc(trainer.name)} has been notified and will contact you about the location and payment. A confirmation is on its way to your email.</p>
    <div class="booking-reward"><span class="xp-chip">+${LevelUp.SESSION_XP} XP</span><span>added to your profile</span></div>
    <div class="btn-row">
      <a href="profile.html" class="btn btn-small">View my sessions</a>
      <button type="button" class="btn btn-ghost btn-small" data-close-dialog>Back to schedule</button>
    </div>`;
  pendingSlot = null;
}

// When a guest logs in from the booking dialog, reopen the slot they picked
let reopenAfterLogin = false;

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
      <p class="trainer-availability">🕒 ${availabilityText(trainer)}</p>`;
  });
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-book-trainer]");
  if (!link) return;
  activeTrainer = link.dataset.bookTrainer;
  renderFilter();
  renderBoard();
});

document.addEventListener("levelup:change", () => {
  renderBoard();
  renderTrainerStats();
  if (reopenAfterLogin && LevelUp.getPlayer() && pendingSlot) {
    reopenAfterLogin = false;
    renderBookingDialog();
    bookingDialog.showModal();
  }
});

renderFilter();
renderBoard();
renderTrainerStats();
