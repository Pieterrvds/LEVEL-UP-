// LEVEL-UP team planner (admin, desktop): every trainer's opening hours in one week view.
//   Every week:    drag in an empty spot to add hours for the selected trainer, drag a bar to
//                  move it, drag its top/bottom edge to change the times, click it to edit,
//                  delete or copy it to other days.
//   A real week:   the actual dates with days off, extra hours and the sessions already booked;
//                  drag to add extra hours or close a few hours / a whole day.
// Booked or requested hours stay locked (checked here and in the database).

window.LevelUpPlanner = (() => {
  const { esc, TRAINERS } = LevelUp;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DOW = [1, 2, 3, 4, 5, 6, 0]; // column -> weekday (0 = Sunday)
  const LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const ROW = 34; // px per hour
  const hh = (h) => `${String(h).padStart(2, "0")}:00`;
  const rows = () => LevelUp.getOpeningHours() || [];

  const state = { mode: "weekly", week: 0, active: null, hidden: new Set(), popover: null };
  let host = null;
  let opts = null;

  // ---------- helpers ----------
  const visibleTrainers = () => TRAINERS.filter((t) => !state.hidden.has(t.id));
  // Lanes per day: only the trainers that have something that day share the column
  const lane = (trainerId, present) => {
    const index = present.indexOf(trainerId);
    return index < 0 ? { index: 0, count: 1 } : { index, count: present.length };
  };
  function presentOn(dow, key) {
    return visibleTrainers().filter((t) => rows().some((r) => r.trainerId === t.id
      && ((r.kind === "open" && r.weekday === dow) || (state.mode !== "weekly" && r.date === key)))).map((t) => t.id);
  }
  function weekDates() {
    const monday = LevelUp.startOfWeek(state.week);
    return DOW.map((_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  }
  function hourRange() {
    let min = 7, max = 22;
    rows().forEach((r) => { if (!(r.kind === "closed" && r.start === 0 && r.end === 24)) { min = Math.min(min, r.start); max = Math.max(max, r.end); } });
    return { from: Math.max(0, min - 1), to: Math.min(24, max + 1) };
  }
  function check(trainerId, after) {
    const lost = LevelUpHours.lost(opts.bookings(), trainerId, after);
    if (lost.length) { alert(LevelUpHours.lockedMessage(lost)); return false; }
    return true;
  }
  async function save(entry) {
    try {
      await LevelUp.saveOpeningHours(entry);
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    }
  }

  // ---------- render ----------
  function render(el, options) {
    host = el;
    opts = options;
    if (!state.active || !TRAINERS.some((t) => t.id === state.active)) state.active = TRAINERS[0]?.id;
    if (!LevelUp.getOpeningHours()) { el.innerHTML = `${opts.intro}<p class="muted">The opening hours can't be loaded right now.</p>`; return; }
    const range = hourRange();
    const dates = weekDates();
    const todayKey = LevelUp.dateKey();
    const weekly = state.mode === "weekly";
    const fmt = (d, o) => d.toLocaleDateString("en-GB", o);

    const columns = DOW.map((dow, col) => {
      const date = dates[col];
      const key = LevelUp.dateKey(date);
      const present = presentOn(dow, key);
      const bars = visibleTrainers().filter((t) => present.includes(t.id)).map((t) => {
        const { index, count } = lane(t.id, present);
        const pos = (r) => `top:${(r.start - range.from) * ROW}px;height:${(r.end - r.start) * ROW - 2}px;left:calc(${(index / count) * 100}% + 2px);width:calc(${100 / count}% - 4px)`;
        const own = rows().filter((r) => r.trainerId === t.id);
        let html = own.filter((r) => r.kind === "open" && r.weekday === dow).map((r) => {
          const locked = LevelUpHours.lost(opts.bookings(), t.id, rows().filter((x) => x.id !== r.id)).length;
          return `<div class="pl-bar${locked ? " locked" : ""}" data-id="${r.id}" style="--c:${t.chartColor || t.color};${pos(r)}" title="${esc(t.short)} · ${hh(r.start)}–${hh(r.end)}${locked ? " · booked hours are locked" : ""}">
            ${weekly ? `<span class="pl-grip top" data-grip="top"></span>` : ""}
            <span class="pl-bar-label"><b>${esc(t.short)}</b> ${hh(r.start)}–${hh(r.end)}${locked ? " 🔒" : ""}</span>
            ${weekly ? `<span class="pl-grip bottom" data-grip="bottom"></span>` : ""}
          </div>`;
        }).join("");
        if (!weekly) {
          html += own.filter((r) => r.date === key).map((r) => `
            <div class="pl-bar ${r.kind === "closed" ? "closed" : "extra"}" data-id="${r.id}" style="--c:${t.chartColor || t.color};${pos({ start: Math.max(r.start, range.from), end: Math.min(r.end, range.to) })}"
              title="${esc(t.short)} · ${r.kind === "closed" ? "closed" : "extra hours"} ${hh(r.start)}–${hh(r.end)}${r.note ? ` · ${esc(r.note)}` : ""}">
              <span class="pl-bar-label"><b>${esc(t.short)}</b> ${r.kind === "closed" ? "closed" : "extra"}${r.note ? ` · ${esc(r.note)}` : ""}</span>
            </div>`).join("");
          html += opts.bookings().filter((b) => b.trainerId === t.id && b.date === key && LevelUpHours.isUpcoming(b)).map((b) => `
            <div class="pl-booking" style="--c:${t.chartColor || t.color};top:${(b.hour - range.from) * ROW + 4}px;left:calc(${(index / count) * 100}% + 6px);width:calc(${100 / count}% - 12px)"
              title="${esc(b.name)} · ${hh(b.hour)} · ${b.status}">🔒 ${esc(b.name)}</div>`).join("");
        }
        return html;
      }).join("");
      return `
        <div class="pl-col${!weekly && key === todayKey ? " today" : ""}" data-col="${col}" data-dow="${dow}" data-date="${key}" data-lanes="${present.join(",")}" style="height:${(range.to - range.from) * ROW}px">
          ${Array.from({ length: range.to - range.from }, (_, i) => `<span class="pl-line" style="top:${i * ROW}px"></span>`).join("")}
          ${bars}
        </div>`;
    }).join("");

    el.innerHTML = `
      ${opts.intro}
      <div class="pl-toolbar">
        <div class="pl-trainers" role="group" aria-label="Trainers">
          ${TRAINERS.map((t) => `
            <span class="pl-trainer${state.active === t.id ? " active" : ""}${state.hidden.has(t.id) ? " off" : ""}" style="--c:${t.chartColor || t.color}">
              <input type="checkbox" data-pl-show="${t.id}" ${state.hidden.has(t.id) ? "" : "checked"} aria-label="Show ${esc(t.short)}">
              <button type="button" data-pl-active="${t.id}" title="Draw hours for ${esc(t.short)}"><img src="${t.img}" alt="">${esc(t.short)}</button>
            </span>`).join("")}
        </div>
        <div class="pl-modes">
          <div class="filter-tabs" role="tablist">
            <button type="button" role="tab" data-pl-mode="weekly" aria-selected="${weekly}">Every week</button>
            <button type="button" role="tab" data-pl-mode="dated" aria-selected="${!weekly}">Specific week</button>
          </div>
          ${weekly ? "" : `
            <div class="pl-weeknav">
              <button type="button" class="week-btn" data-pl-week="-1" ${state.week <= 0 ? "disabled" : ""} aria-label="Previous week">◀</button>
              <strong>${fmt(dates[0], { day: "numeric", month: "short" })} – ${fmt(dates[6], { day: "numeric", month: "short", year: "numeric" })}</strong>
              <button type="button" class="week-btn" data-pl-week="1" aria-label="Next week">▶</button>
            </div>`}
          <button type="button" class="btn btn-small btn-ghost" data-pl-list>List view</button>
        </div>
      </div>
      <p class="pl-help muted">${weekly
        ? `Drag in an empty spot to add hours for <strong style="color:${LevelUp.trainerById(state.active)?.chartColor}">${esc(LevelUp.trainerById(state.active)?.short || "")}</strong> (pick another trainer above). Drag a bar to move it, drag its top or bottom edge to change the times, click it to edit, delete or copy it.`
        : `The real week: weekly hours, <span class="pl-key extra">extra hours</span>, <span class="pl-key closed">closed</span> and 🔒 booked sessions. Drag to add extra hours or close hours for <strong style="color:${LevelUp.trainerById(state.active)?.chartColor}">${esc(LevelUp.trainerById(state.active)?.short || "")}</strong>; click a bar to change it.`}</p>
      <div class="pl-grid" style="--row:${ROW}px">
        <div class="pl-head pl-corner"></div>
        ${DOW.map((dow, col) => `<div class="pl-head${!weekly && LevelUp.dateKey(dates[col]) === todayKey ? " today" : ""}">${DAYS[col]}${weekly ? "" : ` <span>${dates[col].getDate()}/${dates[col].getMonth() + 1}</span>`}</div>`).join("")}
        <div class="pl-hours" style="height:${(range.to - range.from) * ROW}px">
          ${Array.from({ length: range.to - range.from }, (_, i) => `<span style="top:${i * ROW}px">${hh(range.from + i)}</span>`).join("")}
        </div>
        ${columns}
      </div>
      <div class="pl-popover" hidden></div>`;
    el.dataset.plFrom = range.from;
    el.dataset.plTo = range.to;
  }

  const rerender = () => host && opts && render(host, opts);

  // ---------- popover (edit / delete / copy, or a new block in a specific week) ----------
  function openPopover(html, x, y) {
    const pop = host.querySelector(".pl-popover");
    pop.innerHTML = `<button type="button" class="dialog-close" data-pl-close aria-label="Close">✕</button>${html}`;
    pop.hidden = false;
    const box = host.getBoundingClientRect();
    pop.style.left = `${Math.min(Math.max(8, x - box.left), box.width - 330)}px`;
    pop.style.top = `${y - box.top + 8}px`;
  }
  const closePopover = () => { const pop = host?.querySelector(".pl-popover"); if (pop) pop.hidden = true; };
  const hourOptions = (from, to, sel) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => `<option value="${h}" ${h === sel ? "selected" : ""}>${hh(h)}</option>`).join("");

  function editWeekly(r, x, y) {
    const t = LevelUp.trainerById(r.trainerId);
    openPopover(`
      <form class="pl-form" data-pl-form="weekly" data-id="${r.id}">
        <p class="pl-form-title" style="color:${t.chartColor}">${esc(t.name)}</p>
        <div class="pl-form-row">
          <label>Day<select name="weekday">${DOW.map((d) => `<option value="${d}" ${d === r.weekday ? "selected" : ""}>${LONG[d]}</option>`).join("")}</select></label>
          <label>From<select name="start">${hourOptions(0, 23, r.start)}</select></label>
          <label>To<select name="end">${hourOptions(1, 24, r.end)}</select></label>
        </div>
        <fieldset class="pl-copy"><legend>Copy these hours to</legend>
          ${DOW.filter((d) => d !== r.weekday).map((d) => `<label><input type="checkbox" name="copy" value="${d}"> ${LONG[d].slice(0, 3)}</label>`).join("")}
        </fieldset>
        <div class="btn-row">
          <button type="submit" class="btn btn-small btn-primary">Save</button>
          <button type="button" class="btn btn-small btn-danger" data-pl-delete="${r.id}">Delete</button>
        </div>
      </form>`, x, y);
  }

  function editDated(r, x, y) {
    const t = LevelUp.trainerById(r.trainerId);
    const whole = r.start === 0 && r.end === 24;
    openPopover(`
      <form class="pl-form" data-pl-form="dated" ${r.id ? `data-id="${r.id}"` : ""} data-date="${r.date}">
        <p class="pl-form-title" style="color:${t.chartColor}">${esc(t.name)} · ${LevelUp.parseDate(r.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</p>
        <div class="pl-form-row">
          <label>Type<select name="kind"><option value="open" ${r.kind === "open" ? "selected" : ""}>Extra hours</option><option value="closed" ${r.kind === "closed" ? "selected" : ""}>Closed</option></select></label>
          <label>From<select name="start">${hourOptions(0, 23, whole ? 0 : r.start)}</select></label>
          <label>To<select name="end">${hourOptions(1, 24, whole ? 24 : r.end)}</select></label>
        </div>
        <label class="pl-note">Note (only you and the trainer see it)<input type="text" name="note" maxlength="80" value="${esc(r.note || "")}"></label>
        <div class="btn-row">
          <button type="submit" class="btn btn-small btn-primary">Save</button>
          ${r.id ? `<button type="button" class="btn btn-small btn-danger" data-pl-delete="${r.id}">Delete</button>` : ""}
        </div>
      </form>`, x, y);
  }

  async function submitForm(form) {
    const f = form.elements;
    const id = form.dataset.id || null;
    const old = rows().find((r) => r.id === id);
    if (form.dataset.plForm === "weekly") {
      const entry = { id, trainerId: old.trainerId, weekday: Number(f.weekday.value), start: Number(f.start.value), end: Number(f.end.value) };
      if (entry.end <= entry.start) { alert("The end time must be after the start time."); return; }
      if (!check(entry.trainerId, [...rows().filter((r) => r.id !== id), entry])) return;
      const copies = [...form.querySelectorAll("[name=copy]:checked")].map((c) => Number(c.value));
      closePopover();
      if (await save(entry)) {
        for (const d of copies) await save({ trainerId: entry.trainerId, weekday: d, start: entry.start, end: entry.end });
        LevelUp.toast({ title: "Hours saved", text: copies.length ? `Also copied to ${copies.length} other day${copies.length === 1 ? "" : "s"}` : "The schedule is updated", icon: "🕒", tone: "green" });
      }
    } else {
      const trainerId = old?.trainerId || form.dataset.trainer;
      const entry = { id, trainerId, date: form.dataset.date, kind: f.kind.value, start: Number(f.start.value), end: Number(f.end.value), note: f.note.value.trim() };
      if (entry.end <= entry.start) { alert("The end time must be after the start time."); return; }
      if (!check(trainerId, [...rows().filter((r) => r.id !== id), entry])) return;
      closePopover();
      if (await save(entry)) LevelUp.toast({ title: entry.kind === "closed" ? "Closed" : "Extra hours saved", text: "The schedule is updated", icon: "🕒", tone: "green" });
    }
  }

  async function remove(id) {
    const r = rows().find((x) => x.id === id);
    if (!r) return;
    if (!check(r.trainerId, rows().filter((x) => x.id !== id))) return;
    if (!confirm(`Delete ${r.weekday !== null ? `every ${LONG[r.weekday]} ${hh(r.start)}–${hh(r.end)}` : `${r.kind === "closed" ? "closed" : "extra hours"} on ${r.date}`} for ${LevelUp.trainerById(r.trainerId)?.short}?`)) return;
    closePopover();
    try { await LevelUp.deleteOpeningHours(id); } catch (err) { alert(err.message); }
  }

  // ---------- dragging ----------
  let drag = null;
  const hourAt = (col, clientY) => {
    const rect = col.getBoundingClientRect();
    return Number(host.dataset.plFrom) + (clientY - rect.top) / ROW;
  };
  const colAt = (x, y) => document.elementFromPoint(x, y)?.closest(".pl-col");

  function onPointerDown(event) {
    if (!host?.contains(event.target) || event.button !== 0) return;
    const bar = event.target.closest(".pl-bar");
    const col = event.target.closest(".pl-col");
    if (!col) return;
    closePopover();
    event.preventDefault();
    const weeklyBarInRealWeek = bar && state.mode !== "weekly" && !rows().find((x) => x.id === bar.dataset.id)?.date;
    if (bar && !weeklyBarInRealWeek) {
      const r = rows().find((x) => x.id === bar.dataset.id);
      if (!r) return;
      // the top and bottom 9 px of a bar resize it (forgiving, the visible grip is small)
      const rect = bar.getBoundingClientRect();
      const edge = state.mode !== "weekly" ? null
        : event.clientY >= rect.bottom - 9 ? "bottom" : event.clientY <= rect.top + 9 ? "top" : null;
      drag = { type: edge || "move", r, bar, x0: event.clientX, y0: event.clientY, col0: Number(col.dataset.col), moved: false };
    } else {
      // empty spot: new hours for the selected trainer; a weekly bar in a real week: close (part of) it
      const barRow = weeklyBarInRealWeek ? rows().find((x) => x.id === bar.dataset.id) : null;
      const trainerId = barRow?.trainerId || state.active;
      const h = Math.floor(hourAt(col, event.clientY));
      const ghost = document.createElement("div");
      ghost.className = `pl-ghost${barRow ? " closing" : ""}`;
      const t = LevelUp.trainerById(trainerId);
      const { index, count } = lane(trainerId, (col.dataset.lanes || "").split(",").filter(Boolean));
      ghost.style.cssText = `--c:${t?.chartColor};left:calc(${(index / count) * 100}% + 2px);width:calc(${100 / count}% - 4px)`;
      col.appendChild(ghost);
      drag = { type: "new", col, h0: h, h1: h + 1, ghost, moved: false, trainerId, barRow, y0: event.clientY, x0: event.clientX };
      drawGhost();
    }
  }
  function drawGhost() {
    const from = Number(host.dataset.plFrom);
    const a = Math.min(drag.h0, drag.h1 - 1), b = Math.max(drag.h0 + 1, drag.h1);
    drag.ghost.style.top = `${(a - from) * ROW}px`;
    drag.ghost.style.height = `${(b - a) * ROW - 2}px`;
    drag.ghost.textContent = `${hh(a)}–${hh(b)}`;
    drag.range = [a, b];
  }
  function onPointerMove(event) {
    if (!drag) return;
    if (Math.abs(event.clientY - (drag.y0 ?? event.clientY)) > 4 || Math.abs(event.clientX - (drag.x0 ?? event.clientX)) > 4) drag.moved = true;
    if (drag.type === "new") {
      const h = hourAt(drag.col, event.clientY);
      drag.h1 = h >= drag.h0 ? Math.ceil(h) : Math.floor(h);
      if (drag.h1 === drag.h0) drag.h1 = drag.h0 + 1;
      drawGhost();
      return;
    }
    if (state.mode !== "weekly") return;
    const dh = Math.round((event.clientY - drag.y0) / ROW);
    const { r } = drag;
    let start = r.start, end = r.end, dow = r.weekday;
    if (drag.type === "move") {
      const len = r.end - r.start;
      start = Math.max(0, Math.min(24 - len, r.start + dh));
      end = start + len;
      const col = colAt(event.clientX, event.clientY);
      if (col) dow = Number(col.dataset.dow);
    } else if (drag.type === "top") start = Math.max(0, Math.min(r.end - 1, r.start + dh));
    else end = Math.min(24, Math.max(r.start + 1, r.end + dh));
    drag.next = { start, end, weekday: dow };
    const from = Number(host.dataset.plFrom);
    drag.bar.style.top = `${(start - from) * ROW}px`;
    drag.bar.style.height = `${(end - start) * ROW - 2}px`;
    drag.bar.classList.add("dragging");
    const label = drag.bar.querySelector(".pl-bar-label");
    if (label) label.innerHTML = `<b>${esc(LevelUp.trainerById(r.trainerId).short)}</b> ${dow !== r.weekday ? `${DAYS[DOW.indexOf(dow)]} ` : ""}${hh(start)}–${hh(end)}`;
  }
  async function onPointerUp(event) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.type === "new") {
      d.ghost.remove();
      let [start, end] = d.range;
      const t = LevelUp.trainerById(d.trainerId);
      if (d.barRow) {
        // a click (no drag) on a weekly bar in a real week closes that whole block for the day
        if (!d.moved) [start, end] = [d.barRow.start, d.barRow.end];
        editDated({ id: null, trainerId: d.trainerId, date: d.col.dataset.date, kind: "closed", start, end, note: "" }, event.clientX, event.clientY);
        host.querySelector("[data-pl-form]").dataset.trainer = d.trainerId;
        return;
      }
      if (state.mode === "weekly") {
        if (await save({ trainerId: d.trainerId, weekday: Number(d.col.dataset.dow), start, end })) {
          LevelUp.toast({ title: "Hours added", text: `${t.short}: every ${LONG[Number(d.col.dataset.dow)]} ${hh(start)}–${hh(end)}`, icon: "🕒", tone: "green" });
        }
      } else {
        editDated({ id: null, trainerId: d.trainerId, date: d.col.dataset.date, kind: "open", start, end, note: "" }, event.clientX, event.clientY);
        host.querySelector("[data-pl-form]").dataset.trainer = d.trainerId;
      }
      return;
    }
    const { r } = d;
    if (!d.moved) {
      if (r.weekday !== null && state.mode === "weekly") editWeekly(r, event.clientX, event.clientY);
      else if (r.date) editDated(r, event.clientX, event.clientY);
      return;
    }
    if (!d.next || (d.next.start === r.start && d.next.end === r.end && d.next.weekday === r.weekday)) { rerender(); return; }
    const entry = { id: r.id, trainerId: r.trainerId, weekday: d.next.weekday, start: d.next.start, end: d.next.end };
    if (!check(r.trainerId, [...rows().filter((x) => x.id !== r.id), entry])) { rerender(); return; }
    if (!(await save(entry))) rerender();
  }

  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);

  document.addEventListener("click", (event) => {
    if (!host?.contains(event.target)) return;
    const t = event.target;
    if (t.closest("[data-pl-close]")) { closePopover(); return; }
    const active = t.closest("[data-pl-active]");
    if (active) { state.active = active.dataset.plActive; state.hidden.delete(state.active); rerender(); return; }
    const mode = t.closest("[data-pl-mode]");
    if (mode) { state.mode = mode.dataset.plMode; rerender(); return; }
    const week = t.closest("[data-pl-week]");
    if (week) { state.week = Math.max(0, state.week + Number(week.dataset.plWeek)); rerender(); return; }
    const del = t.closest("[data-pl-delete]");
    if (del) { remove(del.dataset.plDelete); return; }
    if (t.closest("[data-pl-list]")) { opts.onList?.(); }
  });
  document.addEventListener("change", (event) => {
    const show = event.target.closest("[data-pl-show]");
    if (!show || !host?.contains(show)) return;
    if (show.checked) state.hidden.delete(show.dataset.plShow); else state.hidden.add(show.dataset.plShow);
    rerender();
  });
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-pl-form]");
    if (!form || !host?.contains(form)) return;
    event.preventDefault();
    submitForm(form);
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePopover(); });

  return { render };
})();
