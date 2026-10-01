// LEVEL-UP opening hours editor, shared by the admin dashboard (every trainer) and a
// trainer's own Coach panel (their own card). Weekly blocks, extra hours or a closed
// day on one date, and a 2-week preview. Booked or requested hours are locked; the
// database enforces the same rule (save_trainer_hours / delete_trainer_hours).
//
//   LevelUpHours.render(el, { key, trainers, bookings, intro })
//     key:      remembers the chosen tab and the block being edited between renders
//     trainers: trainer ids to show as tabs (one id = no tabs)
//     bookings: bookings to check the lock against (admin: all, trainer: their own)

window.LevelUpHours = (() => {
  const { esc } = LevelUp;
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const STATUS = { awaiting_payment: "not paid yet", pending: "request", confirmed: "confirmed" };
  const hh = (h) => `${String(h).padStart(2, "0")}:00`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const hourOptions = (from, to, selected) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .map((h) => `<option value="${h}" ${h === selected ? "selected" : ""}>${hh(h)}</option>`).join("");
  const slotLabel = (b) => `${LevelUp.parseDate(b.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${hh(b.hour)}`;
  const isUpcoming = (b) => ["awaiting_payment", "pending", "confirmed"].includes(b.status) && LevelUp.slotStart(b.date, b.hour) > new Date();

  const views = {};   // key -> { el, opts, trainerId, editId }
  const rows = () => LevelUp.getOpeningHours() || [];

  // Is this booking's hour open? (mirrors _hours_cover in schema.sql)
  function covers(list, b) {
    const dow = LevelUp.parseDate(b.date).getDay();
    const inside = (r) => b.hour >= r.start && b.hour < r.end;
    return list.some((r) => r.trainerId === b.trainerId && r.kind === "open" && (r.weekday === dow || r.date === b.date) && inside(r))
      && !list.some((r) => r.trainerId === b.trainerId && r.kind === "closed" && r.date === b.date && inside(r));
  }
  // Sessions that would lose their hours if `after` replaced the current hours
  const lostBookings = (view, trainerId, after) => view.opts.bookings()
    .filter((b) => b.trainerId === trainerId && isUpcoming(b) && covers(rows(), b) && !covers(after, b));
  const bookingList = (list) => list.slice(0, 5).map((b) => `• ${slotLabel(b)} with ${b.name} (${STATUS[b.status]})`).join("\n")
    + (list.length > 5 ? `\n• and ${list.length - 5} more` : "");
  const lockedMessage = (list) => `These hours are already booked or requested, so they can't be removed:\n${bookingList(list)}\n\nCancel or move those sessions first.`;

  function render(el, opts) {
    if (!el) return;
    const view = views[opts.key] || (views[opts.key] = { trainerId: null, editId: null });
    Object.assign(view, { el, opts });
    el.classList.add("hours-editor");
    el.dataset.hoursKey = opts.key;
    if (!LevelUp.getOpeningHours()) {
      el.innerHTML = `<p class="muted">The opening hours can't be loaded right now. Refresh the page; if it keeps happening, run the latest <code>supabase/schema.sql</code>.</p>`;
      return;
    }
    const ids = opts.trainers;
    if (!ids.includes(view.trainerId)) view.trainerId = ids[0];
    const trainerId = view.trainerId;
    const t = LevelUp.trainerById(trainerId);
    const mine = rows().filter((r) => r.trainerId === trainerId);
    const weekly = mine.filter((r) => r.weekday !== null);
    const dated = mine.filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
    const editing = mine.find((r) => r.id === view.editId) || null;
    if (!editing) view.editId = null;
    const type = editing ? (editing.date ? editing.kind : "weekly") : "weekly";
    const today = LevelUp.dateKey();
    const wholeDay = (r) => r.start === 0 && r.end === 24;

    // What players can book in the next 14 days; booked hours marked
    const preview = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const key = LevelUp.dateKey(d);
      const hrs = LevelUp.trainerHours(trainerId, key);
      const booked = (h) => opts.bookings().some((b) => b.trainerId === trainerId && b.date === key && b.hour === h && isUpcoming(b));
      if (hrs.length) preview.push(`<li><strong>${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</strong> ${hrs.map((h) => booked(h) ? `<mark title="Booked or requested">🔒 ${hh(h)}</mark>` : hh(h)).join(" · ")}</li>`);
    }

    el.innerHTML = `
      ${opts.intro || ""}
      ${ids.length > 1 ? `<div class="filter-tabs" role="tablist" aria-label="Trainer">
        ${ids.map((id) => { const x = LevelUp.trainerById(id); return `<button type="button" role="tab" data-hours-trainer="${id}" aria-selected="${id === trainerId}"><span class="dot" style="--c:${x.chartColor}" aria-hidden="true"></span>${esc(x.short)}</button>`; }).join("")}
      </div>` : ""}

      <h3 class="panel-sub">Every week</h3>
      <div class="week-hours">
        ${WEEK_ORDER.map((d) => {
          const blocks = weekly.filter((r) => r.weekday === d).sort((a, b) => a.start - b.start);
          return `<div class="week-hours-day${blocks.length ? "" : " empty"}">
            <span class="week-hours-name">${DAY_NAMES[d].slice(0, 3)}</span>
            ${blocks.map((r) => {
              const locked = lostBookings(view, trainerId, rows().filter((x) => x.id !== r.id));
              return `<span class="hours-chip${r.id === view.editId ? " editing" : ""}${locked.length ? " locked" : ""}" style="--c:${t.chartColor}">
                <button type="button" class="hours-chip-edit" data-hours-edit="${r.id}" title="${locked.length ? `Booked: ${esc(locked.map(slotLabel).join(", "))}` : "Change or move"}">${locked.length ? "🔒 " : ""}${hh(r.start)}–${hh(r.end)}</button>
                ${locked.length ? `<span class="hours-chip-lock" title="${plural(locked.length, "booking")} in these hours">${locked.length}</span>`
                  : `<button type="button" class="hours-chip-del" data-hours-delete="${r.id}" aria-label="Delete ${DAY_NAMES[d]} ${hh(r.start)}–${hh(r.end)}">✕</button>`}
              </span>`;
            }).join("") || `<span class="muted small">closed</span>`}
          </div>`;
        }).join("")}
      </div>

      <h3 class="panel-sub">Extra hours and days off</h3>
      ${dated.length ? `<ul class="hours-dates">${dated.map((r) => `
        <li class="${r.kind}">
          <span><strong>${LevelUp.parseDate(r.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</strong>
            · ${r.kind === "closed" ? (wholeDay(r) ? "Closed all day" : `Closed ${hh(r.start)}–${hh(r.end)}`) : `Extra ${hh(r.start)}–${hh(r.end)}`}
            ${r.note ? `<span class="muted small">· ${esc(r.note)}</span>` : ""}${r.date < today ? ` <span class="muted small">(past)</span>` : ""}</span>
          <span class="hours-date-actions">
            <button type="button" class="btn btn-small btn-ghost" data-hours-edit="${r.id}">Change</button>
            <button type="button" class="btn btn-small btn-ghost" data-hours-delete="${r.id}">Delete</button>
          </span>
        </li>`).join("")}</ul>` : `<p class="muted small">None. Add a holiday, a day off or one-time extra hours below.</p>`}

      <form class="hours-form" data-hours-form>
        <p class="hours-form-title">${editing ? "Change hours" : ids.length > 1 ? `Add hours for ${esc(t.short)}` : "Add hours"}</p>
        <div class="hours-form-grid">
          <label>Type
            <select name="type">
              <option value="weekly" ${type === "weekly" ? "selected" : ""}>Every week</option>
              <option value="open" ${type === "open" ? "selected" : ""}>Extra hours on one date</option>
              <option value="closed" ${type === "closed" ? "selected" : ""}>Closed on one date</option>
            </select>
          </label>
          <label data-for="weekly">Day
            <select name="weekday">${WEEK_ORDER.map((d) => `<option value="${d}" ${editing?.weekday === d ? "selected" : ""}>${DAY_NAMES[d]}</option>`).join("")}</select>
          </label>
          <label data-for="date">Date
            <input type="date" name="date" min="${today}" value="${editing?.date || ""}">
          </label>
          <label data-for="closed" class="check-label"><input type="checkbox" name="allDay" ${!editing || wholeDay(editing) ? "checked" : ""}> Whole day</label>
          <label data-for="time">From
            <select name="start">${hourOptions(0, 23, editing && !wholeDay(editing) ? editing.start : 17)}</select>
          </label>
          <label data-for="time">To
            <select name="end">${hourOptions(1, 24, editing && !wholeDay(editing) ? editing.end : 20)}</select>
          </label>
          <label data-for="date" class="wide">Note (only you${ids.length > 1 ? " and the trainer" : " and the admin"} see it)
            <input type="text" name="note" maxlength="80" placeholder="e.g. holiday, competition" value="${esc(editing?.note || "")}">
          </label>
        </div>
        <p class="form-error hours-error" role="alert"></p>
        <div class="btn-row">
          <button type="submit" class="btn btn-small btn-primary">${editing ? "Save changes" : "Add"}</button>
          ${editing ? `<button type="button" class="btn btn-small btn-ghost" data-hours-cancel>Cancel</button>
            <button type="button" class="btn btn-small btn-danger" data-hours-delete="${editing.id}">Delete</button>` : ""}
        </div>
      </form>

      <h3 class="panel-sub">Bookable in the next 2 weeks</h3>
      ${preview.length ? `<ul class="hours-preview">${preview.join("")}</ul>` : `<p class="muted small">No open hours in the next 2 weeks.</p>`}
      <p class="muted small">🔒 Hours with a booking or request are locked: you can make them longer, but not remove, shorten or move them away from a booked hour, and you can't close that date. Cancel or move the session first.</p>`;
    syncForm(el);
  }

  // Show only the fields that fit the chosen type
  function syncForm(el) {
    const form = el.querySelector("[data-hours-form]");
    if (!form) return;
    const type = form.elements.type.value;
    const allDay = type === "closed" && form.elements.allDay.checked;
    form.querySelectorAll("[data-for]").forEach((f) => {
      const k = f.dataset.for;
      f.hidden = (k === "weekly" && type !== "weekly") || (k === "date" && type === "weekly")
        || (k === "closed" && type !== "closed") || (k === "time" && allDay);
    });
  }

  const rerender = (view) => render(view.el, view.opts);
  const viewOf = (target) => views[target.closest("[data-hours-key]")?.dataset.hoursKey];

  async function submit(view, form) {
    const f = form.elements;
    const type = f.type.value;
    const allDay = type === "closed" && f.allDay.checked;
    const entry = {
      id: view.editId,
      trainerId: view.trainerId,
      weekday: type === "weekly" ? Number(f.weekday.value) : null,
      date: type === "weekly" ? null : f.date.value,
      start: allDay ? 0 : Number(f.start.value),
      end: allDay ? 24 : Number(f.end.value),
      kind: type === "closed" ? "closed" : "open",
      note: type === "weekly" ? "" : f.note.value.trim()
    };
    const error = form.querySelector(".hours-error");
    if (entry.date === "") { error.textContent = "Pick a date."; return; }
    if (entry.end <= entry.start) { error.textContent = "The end time must be after the start time."; return; }
    const after = [...rows().filter((r) => r.id !== view.editId), { ...entry, id: entry.id || "new" }];
    const lost = lostBookings(view, view.trainerId, after);
    if (lost.length) { error.textContent = lockedMessage(lost).replace(/\n+/g, " "); return; }
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      await LevelUp.saveOpeningHours(entry);
      view.editId = null;
      LevelUp.toast({ title: "Hours saved", text: `${LevelUp.trainerById(view.trainerId).short}: the schedule is updated`, icon: "🕒", tone: "green" });
      rerender(view);
    } catch (err) {
      error.textContent = err.message;
      form.querySelector('button[type="submit"]').disabled = false;
    }
  }

  document.addEventListener("click", (event) => {
    const view = viewOf(event.target);
    if (!view) return;
    const tab = event.target.closest("[data-hours-trainer]");
    if (tab) { view.trainerId = tab.dataset.hoursTrainer; view.editId = null; rerender(view); return; }
    const edit = event.target.closest("[data-hours-edit]");
    if (edit) {
      view.editId = edit.dataset.hoursEdit;
      rerender(view);
      view.el.querySelector("[data-hours-form]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    if (event.target.closest("[data-hours-cancel]")) { view.editId = null; rerender(view); return; }
    const del = event.target.closest("[data-hours-delete]");
    if (del) {
      const r = rows().find((x) => x.id === del.dataset.hoursDelete);
      if (!r) return;
      const what = r.weekday !== null ? `every ${DAY_NAMES[r.weekday]} ${hh(r.start)}–${hh(r.end)}` : `${r.kind === "closed" ? "closed" : "extra hours"} on ${r.date}`;
      const lost = lostBookings(view, r.trainerId, rows().filter((x) => x.id !== r.id));
      if (lost.length) { alert(lockedMessage(lost)); return; }
      if (!confirm(`Delete ${what}?`)) return;
      del.disabled = true;
      LevelUp.deleteOpeningHours(r.id)
        .then(() => { if (view.editId === r.id) view.editId = null; rerender(view); })
        .catch((err) => { del.disabled = false; alert(err.message); });
    }
  });
  document.addEventListener("change", (event) => {
    const view = viewOf(event.target);
    if (view && event.target.closest("[data-hours-form]")) syncForm(view.el);
  });
  document.addEventListener("submit", (event) => {
    const view = viewOf(event.target);
    if (!view || !event.target.matches("[data-hours-form]")) return;
    event.preventDefault();
    submit(view, event.target);
  });

  // For the team planner: sessions that would lose their hours, and the message to show
  const lost = (bookings, trainerId, after) => bookings
    .filter((b) => b.trainerId === trainerId && isUpcoming(b) && covers(rows(), b) && !covers(after, b));

  return { render, lost, lockedMessage, isUpcoming, slotLabel };
})();
