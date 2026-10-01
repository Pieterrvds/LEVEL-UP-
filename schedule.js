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
// ?trainer=pieter (e.g. from a business card QR code) opens the schedule on that trainer
let activeTrainer = new URLSearchParams(location.search).get("trainer") || "all";
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
  // Phones show the round photo; bigger screens the colour dot and name
  trainerFilter.innerHTML = tabs.map((t) => `
    <button type="button" role="tab" data-trainer="${t.id}" aria-selected="${t.id === activeTrainer}"
      ${t.color ? `style="--c:${t.color}"` : ""}>
      <span class="filter-face" aria-hidden="true">${t.img ? `<img src="${t.img}" alt="">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M3 20c.6-3.6 3-5.4 6-5.4s5.4 1.8 6 5.4M15 14.6c2.6 0 4.6 1.4 5.2 4.4"/></svg>`}</span>
      ${t.color ? `<span class="dot" aria-hidden="true"></span>` : ""}<span class="filter-name">${esc(t.id === "all" ? "All" : t.short)}</span><span class="filter-name-long">${esc(t.short)}</span>
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
  if (booking?.mine) {
    if (booking.status === "completed" || blocker === "past") return { state: "done", booking };
    return { state: ["pending", "awaiting_payment"].includes(booking.status) ? "requested" : "mine", booking };
  }
  if (booking) return { state: "taken", booking };
  return { state: blocker ? "past" : "free", booking: null };
}

function renderBoard() {
  if (!LevelUp.isReady()) {
    weekBoard.innerHTML = `<p class="board-message">Loading the schedule…</p>`;
    if (weekList) weekList.innerHTML = `<p class="list-empty">Loading the schedule…</p>`;
    return;
  }
  const days = weekDays(weekOffset);
  if (activeTrainer !== "all" && !TRAINERS.some((t) => t.id === activeTrainer)) activeTrainer = "all";
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

  let anyOpen = false; // phones hide days without anything still bookable
  const dayColumns = days.map((day) => {
    let itemCount = 0;
    let openCount = 0;
    const groups = activeTrainer === "all" ? LevelUp.groupSessions(day.key) : [];
    const cells = hours.map((hour) => {
      const group = groups.filter((g) => g.start.getHours() === hour).map((g) => {
        itemCount++;
        openCount++;
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
          if (state !== "past") openCount++;
          const label = { free: `Book ${t.short}`, requested: "Requested…", mine: "Confirmed ✓", done: "Done ✓", taken: "Booked", past: "Closed" }[state];
          return `
            <button type="button" class="slot ${state === "requested" ? "mine requested" : state}" style="--c:${t.color}"
              data-trainer="${t.id}" data-date="${day.key}" data-hour="${hour}"
              ${["free", "mine", "requested"].includes(state) ? "" : "disabled"}
              aria-label="${esc(t.name)}, ${day.name} ${pad(hour)}:00, ${label}">
              <span class="slot-time">${pad(hour)}:00</span>
              <span class="slot-name">${esc(t.short)}</span>
              <span class="slot-state">${state === "free" ? `+${LevelUp.SESSION_XP} XP` : label}</span>
            </button>`;
        }).join("");

      const content = group + trainerSlots;
      return `<div class="board-cell ${content ? "" : "empty"}">${content}</div>`;
    }).join("");

    if (openCount) anyOpen = true;
    return `
      <div class="board-col ${day.key === todayKey ? "today" : ""} ${itemCount ? "" : "closed"} ${itemCount && !openCount ? "all-past" : ""}">
        <div class="board-head">
          <span class="board-day">${day.name}</span>
          <span class="board-date">${day.date.getDate()}</span>
        </div>
        ${cells}
        <p class="board-closed-note">No sessions this day</p>
      </div>`;
  }).join("");

  renderWeekList(days, trainers, now, todayKey);
  weekBoard.innerHTML = hourColumn + dayColumns
    + (anyOpen ? "" : `<p class="board-week-empty">No open hours left this week.${weekOffset < LevelUp.BOOKING_WEEKS_AHEAD - 1 ? " Tap ▶ for next week." : ""}</p>`);
  weekBoard.classList.toggle("signed-in", Boolean(player));
}

// ---------- Phones: the week as a list, per day one row per trainer with time buttons ----------
const weekList = document.getElementById("weekList");
function renderWeekList(days, trainers, now, todayKey) {
  if (!weekList) return;
  const tomorrowKey = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const html = days.map((day) => {
    const groups = (activeTrainer === "all" ? LevelUp.groupSessions(day.key) : []).filter((g) => g.end > now);
    const rows = trainers.map((t) => {
      const chips = LevelUp.trainerHours(t.id, day.key).map((hour) => {
        const { state } = slotState(t, day.key, hour, now);
        if (state === "past") return "";
        const label = { free: `Book ${t.short}`, requested: "Requested", mine: "Confirmed", done: "Done", taken: "Booked" }[state];
        return `<button type="button" class="time-chip ${state}" style="--c:${t.color}"
            data-trainer="${t.id}" data-date="${day.key}" data-hour="${hour}"
            ${["free", "mine", "requested"].includes(state) ? "" : "disabled"}
            aria-label="${esc(t.name)}, ${day.name} ${pad(hour)}:00, ${label}">${pad(hour)}:00</button>`;
      }).join("");
      return chips ? `
        <div class="list-row" style="--c:${t.color}">
          <span class="list-trainer"><img src="${t.img}" alt=""><b>${esc(t.short)}</b></span>
          <div class="list-times">${chips}</div>
        </div>` : "";
    }).join("");
    const groupRows = groups.map((g) => `
      <div class="list-row list-group">
        <span class="list-trainer"><span class="list-group-icon" aria-hidden="true">👥</span><b>Group</b></span>
        <p class="list-group-text"><b>${timeText(g.start)}</b> ${esc(g.title)}${g.location ? ` · ${esc(g.location)}` : ""}</p>
      </div>`).join("");
    if (!rows && !groupRows) return "";
    const when = day.key === todayKey ? "Today" : day.key === tomorrowKey ? "Tomorrow" : "";
    return `
      <div class="list-day${day.key === todayKey ? " today" : ""}">
        <h3 class="list-day-head">${day.date.toLocaleDateString("en-GB", { weekday: "long" })} <span>${day.date.getDate()} ${day.date.toLocaleDateString("en-GB", { month: "short" })}</span>${when ? `<em>${when}</em>` : ""}</h3>
        ${groupRows}${rows}
      </div>`;
  }).join("");
  weekList.innerHTML = html || `<p class="list-empty">No open hours left this week.${weekOffset < LevelUp.BOOKING_WEEKS_AHEAD - 1 ? " Tap ▶ for next week." : ""}</p>`;
}

weekList?.addEventListener("click", (event) => {
  const chip = event.target.closest(".time-chip");
  if (!chip || chip.disabled) return;
  openSlot({ trainerId: chip.dataset.trainer, date: chip.dataset.date, hour: Number(chip.dataset.hour) });
});

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
    <p class="booking-when">${when}</p>
    ${booking?.mine ? "" : player
      ? `<p class="booking-price">1 hour with ${esc(trainer.short)}</p>`
      : `<p class="booking-price"><strong>${LevelUp.euro(LevelUp.priceFor(trainerId))}</strong> · 1 hour, 1:1 with ${esc(trainer.short)} · your first session only <strong>${LevelUp.euro(LevelUp.getPricing().introPrice)}</strong></p>`}`;

  // Your own booking: offer to cancel
  if (booking?.mine) {
    const own = LevelUp.playerBookings().find((b) => b.id === booking.id);
    bookingContent.innerHTML = `
      <p class="section-kicker">Your session</p>
      <h2 class="auth-title" id="bookingTitle">${booking.status === "awaiting_payment" ? "Waiting for payment" : booking.status === "pending" ? "Waiting for confirmation" : "Confirmed ✓"}</h2>
      ${trainerCard}
      <p class="status-line">${booking.status === "awaiting_payment"
        ? `<span class="status-chip pending">Not paid</span> Finish the payment to send the request to ${esc(trainer.short)}. The hour is held for a few minutes.`
        : booking.status === "pending"
        ? `<span class="status-chip pending">Pending</span> ${esc(trainer.short)} still has to confirm this session.`
        : `<span class="status-chip confirmed">Confirmed</span> ${esc(trainer.short)} will reward your +${own?.xp ?? LevelUp.SESSION_XP} XP after the session.`}</p>
      ${own ? `<p class="booking-price">${own.kind === "duo" ? "Duo session" : "1:1 session"} · <strong>${esc(LevelUp.priceLabel(own))}</strong>${LevelUp.payLabel(own) ? ` · ${esc(LevelUp.payLabel(own))}` : ""}</p>` : ""}
      ${own && LevelUp.canPayOnline(own) ? `<button type="button" class="btn btn-primary btn-block" id="payNow">Pay ${LevelUp.euro(own.price)} online ▶</button>` : ""}
      ${own?.note ? `<p class="booking-note-view">“${esc(own.note)}”</p>` : ""}
      ${own && LevelUp.isLateCancel(own) ? `<p class="booking-warning">Starts in less than ${LevelUp.FREE_CANCEL_HOURS} hours: cancelling now is charged in full (${LevelUp.euro(own.price)}).</p>` : ""}
      <p class="form-error" role="alert">${esc(message)}</p>
      <div class="btn-row">
        <a class="btn btn-ghost btn-small" href="${LevelUp.googleCalendarLink(pendingSlot)}" target="_blank" rel="noopener">Add to Google Calendar</a>
        <button type="button" class="btn btn-small btn-danger" id="cancelBooking">${["pending", "awaiting_payment"].includes(booking.status) ? "Withdraw request" : "Cancel session"}</button>
      </div>`;
    document.getElementById("payNow")?.addEventListener("click", async (event) => {
      event.target.disabled = true;
      event.target.textContent = "To the payment page…";
      try { await LevelUp.startPayment("booking", own.id); } catch (err) { renderBookingDialog(err.message); }
    });
    const cancel = document.getElementById("cancelBooking");
    cancel.addEventListener("click", async () => {
      if (own && LevelUp.isLateCancel(own) && !confirm(`Cancelling now is charged in full (${LevelUp.euro(own.price)}). Cancel anyway?`)) return;
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
        ${bookingOptions(trainerId)}
        <label class="partner-field" hidden>Who do you train with?
          <input type="text" name="partner" maxlength="40" placeholder="Name of your training buddy">
        </label>
        ${paymentOptions(trainerId)}
        <label>Note for your trainer (optional)
          <textarea name="note" rows="3" maxlength="300" placeholder="Your goal, experience level or preferred location…"></textarea>
        </label>
        <p class="form-error" role="alert">${esc(message)}</p>
        <div class="booking-reward"><span class="xp-chip">+${LevelUp.SESSION_XP} XP</span><span>after the session, rewarded by ${esc(trainer.short)}</span></div>
        <button type="submit" class="btn btn-primary btn-block" id="bookSubmit">Send booking request ▶</button>
      </form>
      <p class="auth-note">${esc(trainer.short)} gets a notification and confirms or declines. Free cancellation up to ${LevelUp.FREE_CANCEL_HOURS} hours before; later cancellations and no-shows are charged in full.</p>` : `
      <div class="booking-login">
        <p>Log in or create your player to book this session and earn <strong>+${LevelUp.SESSION_XP} XP</strong>.</p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary btn-small" data-auth-open="signup">New player</button>
          <button type="button" class="btn btn-ghost btn-small" data-auth-open="login">Log in</button>
        </div>
      </div>`}`;

  updateSubmitLabel();
  document.getElementById("bookingForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Booking…";
    try {
      const form = event.target.elements;
      const pay = needsPayment(pendingSlot.trainerId, form.kind.value) ? (form.pay?.value || "in_person") : "in_person";
      const booked = await LevelUp.bookSession({ ...pendingSlot, note: form.note.value.trim(), kind: form.kind.value, partner: form.partner.value, pay });
      if (booked.status === "awaiting_payment") {
        submit.textContent = "To the payment page…";
        try {
          await LevelUp.startPayment("booking", booked.id);
        } catch (err) {
          showPaymentFailed(booked, err.message);
        }
        return;
      }
      showBooked(booked);
    } catch (err) {
      renderBookingDialog(err.message);
    }
  });
}

// 1:1 or duo, with the price this player pays (pack credit, first-session price or the normal price)
function bookingOptions(trainerId) {
  const solo = LevelUp.quote(trainerId, "solo");
  const duo = LevelUp.quote(trainerId, "duo");
  const euro = LevelUp.euro;
  const soloText = {
    pack: `1 pack credit <small>${solo.credits} left</small>`,
    intro: `${euro(solo.price)} <small>first session, normally ${euro(solo.normal)}</small>`,
    standard: euro(solo.price)
  }[solo.type];
  return `
    <fieldset class="kind-picker">
      <legend>Session</legend>
      <label class="kind-option"><input type="radio" name="kind" value="solo" checked>
        <span><strong>1:1</strong><span class="kind-price">${soloText}</span></span></label>
      <label class="kind-option"><input type="radio" name="kind" value="duo">
        <span><strong>Duo</strong><span class="kind-price">${euro(duo.price)} <small>for the two of you</small></span></span></label>
    </fieldset>
    ${solo.type === "standard" && LevelUp.getPricing().packs.length ? `<p class="kind-tip">Training often? <a href="profile.html#packs">Session packs</a> from ${euro(Math.min(...LevelUp.getPricing().packs.map((p) => p.price / p.size)))} per session.</p>` : ""}`;
}

// Pack credits cover 1:1 sessions; everything else is paid online (preferred) or at the HQ
const needsPayment = (trainerId, kind) => kind === "duo" || LevelUp.quote(trainerId, "solo").type !== "pack";

function paymentOptions(trainerId) {
  const online = LevelUp.getPricing().onlinePayments;
  return `
    <fieldset class="pay-picker" ${needsPayment(trainerId, "solo") ? "" : "hidden"}>
      <legend>Payment</legend>
      ${online ? `
        <label class="pay-option"><input type="radio" name="pay" value="online" checked>
          <span><strong>Pay online now</strong> <em class="pay-tag">Recommended</em><small>Bancontact, card or Payconiq · your request goes to the trainer right after paying · money back automatically if it doesn't go ahead</small></span></label>
        <label class="pay-option"><input type="radio" name="pay" value="in_person">
          <span><strong>Pay at the headquarters</strong><small>${esc(LevelUp.HQ_ADDRESS)} · pay on the day</small></span></label>`
      : `<p class="pay-note">You pay at the headquarters (${esc(LevelUp.HQ_ADDRESS)}). Online payment is coming soon.</p>
         <input type="hidden" name="pay" value="in_person">`}
    </fieldset>`;
}

function updateSubmitLabel() {
  const form = document.getElementById("bookingForm");
  if (!form || !pendingSlot) return;
  const kind = form.elements.kind.value;
  const pays = needsPayment(pendingSlot.trainerId, kind);
  form.querySelector(".pay-picker").hidden = !pays;
  const q = LevelUp.quote(pendingSlot.trainerId, kind);
  document.getElementById("bookSubmit").textContent = pays && form.elements.pay?.value === "online"
    ? `Pay ${LevelUp.euro(q.price)} & send request ▶`
    : "Send booking request ▶";
}

bookingDialog.addEventListener("change", (event) => {
  if (event.target.name === "kind") {
    const field = bookingDialog.querySelector(".partner-field");
    field.hidden = event.target.value !== "duo";
    field.querySelector("input").required = event.target.value === "duo";
  }
  if (["kind", "pay"].includes(event.target.name)) updateSubmitLabel();
});

// Online payment couldn't start: offer to pay at the HQ so the request still goes out
function showPaymentFailed(booked, message) {
  bookingContent.innerHTML = `
    <p class="section-kicker">Payment</p>
    <h2 class="auth-title" id="bookingTitle">Online payment didn't work</h2>
    <p class="booking-when">${LevelUp.formatSlot(booked.date, Number(booked.hour))}</p>
    <p class="form-error" role="alert">${esc(message)}</p>
    <p>Your hour is held for a few minutes. Pay at the headquarters (${esc(LevelUp.HQ_ADDRESS)}) instead and your request goes to the trainer right away.</p>
    <div class="btn-row">
      <button type="button" class="btn btn-primary" id="payHqInstead">Pay at the headquarters instead ▶</button>
      <button type="button" class="btn btn-ghost btn-small" id="retryOnline">Try online again</button>
    </div>`;
  document.getElementById("payHqInstead").addEventListener("click", async (event) => {
    event.target.disabled = true;
    try {
      const b = await LevelUp.payInPersonInstead(booked.id);
      showBooked(b);
    } catch (err) {
      event.target.disabled = false;
      bookingContent.querySelector(".form-error").textContent = err.message;
    }
  });
  document.getElementById("retryOnline").addEventListener("click", async (event) => {
    event.target.disabled = true;
    try { await LevelUp.startPayment("booking", booked.id); }
    catch (err) { event.target.disabled = false; bookingContent.querySelector(".form-error").textContent = err.message; }
  });
}

function showBooked(booked) {
  const trainer = LevelUp.trainerById(pendingSlot.trainerId);
  bookingContent.innerHTML = `
    <p class="section-kicker">Quest sent</p>
    <h2 class="auth-title" id="bookingTitle">Request sent!</h2>
    <p class="booking-when">${LevelUp.formatSlot(pendingSlot.date, pendingSlot.hour)}</p>
    <p><span class="status-chip pending">Pending</span> ${esc(trainer.name)} has been notified and will confirm or decline. You'll get an email and see the status in your profile.</p>
    <p class="booking-price">${booked?.priceType === "pack"
      ? "Paid with <strong>1 pack credit</strong>. A declined request gives it back."
      : `Price: <strong>${esc(LevelUp.priceLabel(booked || { price: LevelUp.priceFor(trainer.id) }))}</strong>. Pay at the headquarters (${esc(LevelUp.HQ_ADDRESS)})${LevelUp.getPricing().onlinePayments ? " or online from your profile" : ""}.`} Free cancellation up to ${LevelUp.FREE_CANCEL_HOURS} hours before.</p>
    <div class="booking-reward"><span class="xp-chip">+${LevelUp.SESSION_XP} XP</span><span>after the session, when ${esc(trainer.short)} rewards it</span></div>
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

// ---------- Team: cards for trainers approved via the admin dashboard ----------
function renderDynamicTeam() {
  const grid = document.querySelector("#team .team-grid");
  const recruit = grid?.querySelector(".team-card-recruit");
  if (!grid || !recruit) return;
  TRAINERS.filter((t) => t.dynamic && !document.getElementById(`team-${t.id}`)).forEach((t) => {
    const card = document.createElement("article");
    card.className = "team-card";
    card.id = `team-${t.id}`;
    card.style.setProperty("--c", t.color);
    card.innerHTML = `
      <div class="team-photo team-photo-new" aria-hidden="true"><span>${esc(t.short.charAt(0).toUpperCase())}</span></div>
      <div class="team-body">
        <p class="team-role">${esc(t.role)}</p>
        <h3>${esc(t.name)}</h3>
        <p>${esc(t.bio || (t.specialties ? `Coaches ${t.specialties}.` : "New on the LEVEL-UP team."))}</p>
        <div class="trainer-stats" data-trainer-stats="${t.id}"></div>
        <div class="btn-row team-actions">
          <a href="#schedule" class="btn btn-small btn-primary" data-book-trainer="${t.id}">Book ${esc(t.short)}</a>
        </div>
      </div>`;
    grid.insertBefore(card, recruit);
  });
  document.getElementById("recruitTitle").textContent = `Player ${TRAINERS.length + 1}?`;
  document.getElementById("trainerCount").textContent = TRAINERS.length;
}

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
  renderDynamicTeam();
  renderHighScores();
  renderBoard();
  renderQuestBoard();
  renderTrainerStats();
}

document.addEventListener("levelup:change", () => {
  renderFilter();
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

// ---------- Price list (from the server's prices) ----------
function renderPriceList() {
  const el = document.getElementById("priceList");
  if (!el) return;
  const p = LevelUp.getPricing();
  const euro = LevelUp.euro;
  const best = [...p.packs].sort((a, b) => a.price / a.size - b.price / b.size)[0];
  el.innerHTML = [
    { tag: "First session", price: euro(p.introPrice), note: "Try any trainer, 1:1", featured: true },
    { tag: "1:1 session", price: euro(p.price), note: "1 hour with your trainer" },
    { tag: "Duo session", price: euro(p.duoPrice), note: "Train with a friend, 1 hour" },
    best && { tag: `${best.size}-session pack`, price: euro(best.price), note: `${euro(best.price / best.size)} per session` }
  ].filter(Boolean).map((c) => `
    <li class="price-card${c.featured ? " featured" : ""}"><span class="price-tag">${c.tag}</span><strong>${c.price}</strong><span>${c.note}</span></li>`).join("");
}
renderPriceList();
document.addEventListener("levelup:change", renderPriceList);
