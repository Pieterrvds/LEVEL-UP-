// LEVEL-UP week plan: one real week with, per day, the hours players can book 1:1 (and what is given in them)
// and the group classes. A "+" on a day, or "Plan something", asks what to plan and hands the choice back.
// Used by a coach in the profile ("My hours": their own week) and by the admin (Team: every trainer).
//
//   LevelUpWeek.render(el, { key, trainers, weeks, title, help, bookings, classes, onClass, onSolo, onPlan })
//     key:      remembers the week and the chosen trainer between renders
//     trainers: trainer ids to show (more than one = the team: names, colours and a trainer filter)
//     weeks:    how many weeks ahead the arrows go
//     bookings: () => 1:1 bookings ({ trainerId, date, hour, status }), classes: () => group classes
//     onClass(id), onSolo(trainerId): a tap on a class or on 1:1 hours
//     onPlan(what, { date, trainerId }): what = "weekly" | "open" | "closed" | "class"

window.LevelUpWeek = (() => {
  const { esc } = LevelUp;
  const views = {};
  const hh = (h) => `${String(h).padStart(2, "0")}:00`;
  const fmt = (x, o) => x.toLocaleDateString("en-GB", o);
  const BUSY = ["pending", "confirmed", "awaiting_payment"];

  // The open hours of a day as blocks: [9, 10, 11, 17] -> 09:00–12:00 and 17:00–18:00, split where what is given changes
  function blocks(trainerId, key) {
    const out = [];
    LevelUp.trainerHours(trainerId, key).forEach((h) => {
      const activity = LevelUp.hourActivity?.(trainerId, key, h) || "";
      const last = out[out.length - 1];
      if (last && last.end === h && last.activity === activity) last.end = h + 1;
      else out.push({ start: h, end: h + 1, activity });
    });
    return out;
  }
  // (also takes rows of opening hours: they carry start, end and activity too)
  const blocksHtml = (list) => list.map((b) =>
    `<span class="nw">${hh(b.start)}–${hh(b.end)}</span>${b.activity ? ` <i data-no-i18n>${esc(b.activity)}</i>` : ""}`).join(" · ");

  function html(view) {
    const { opts } = view;
    const team = opts.trainers.length > 1;
    const ids = team && view.filter !== "all" ? opts.trainers.filter((id) => id === view.filter) : opts.trainers;
    const monday = LevelUp.startOfWeek(view.week);
    const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
    const today = LevelUp.dateKey();
    const hours = LevelUp.getOpeningHours() || [];
    const busy = opts.bookings().filter((b) => BUSY.includes(b.status));
    const classes = (opts.classes() || []).filter((c) => c.status === "scheduled" && ids.includes(c.trainerId));
    const who = (t) => team ? `<span class="mw-who" data-no-i18n>${esc(t.short)}</span>` : "";
    const WAIT = `<span class="mw-wait" title="Waiting for approval">⏳</span>`;
    let waiting = false; // something in this week is a new kind of training that the admin still has to approve
    const row = (day) => {
      const key = LevelUp.dateKey(day);
      const past = key < today;
      const items = [];
      if (classes.some((c) => c.date === key && c.pending)) waiting = true;
      ids.forEach((id) => {
        const t = LevelUp.trainerById(id);
        const open = blocks(id, key);
        const booked = busy.filter((b) => b.trainerId === id && b.date === key).length;
        const closed = hours.filter((r) => r.trainerId === id && r.kind === "closed" && r.date === key);
        const off = closed.some((r) => r.start === 0 && r.end === 24) || (!open.length && closed.length > 0);
        const item = (cls, inner) => `
          <button type="button" class="mw-item ${cls}" data-week-solo="${id}" style="--c:${t.chartColor || t.color}"><span class="mw-kind">1:1</span>${who(t)}${inner}</button>`;
        if (open.length) items.push(item("solo", `${booked ? `<small>${booked} booked</small>` : ""}<span class="mw-text">${blocksHtml(open)}</span>`));
        else if (booked) items.push(item("solo", `<small>${booked} booked</small>`)); // a session outside the hours of today's roster
        else if (off) items.push(item("off", `<span class="mw-text">Day off</span>`));
        // hours of a new kind of training: players don't see them until the admin approves
        const wait = hours.filter((r) => r.trainerId === id && r.kind === "open" && r.pending && (r.date === key || (r.weekday === day.getDay() && !r.date)));
        if (wait.length) { waiting = true; items.push(item("solo wait", `${WAIT}<span class="mw-text">${blocksHtml(wait)}</span>`)); }
      });
      classes.filter((c) => c.date === key).sort((a, b) => a.time.localeCompare(b.time)).forEach((c) => {
        const t = LevelUp.trainerById(c.trainerId);
        items.push(`
          <button type="button" class="mw-item group${c.pending ? " wait" : ""}" data-week-class="${c.id}" style="--c:${t?.chartColor || t?.color || "#888"}">
            <span class="mw-kind">Group</span><b class="mw-time">${c.time}</b>${t ? who(t) : ""}${c.pending ? WAIT : ""}<small>${c.taken}/${c.capacity}</small><span class="mw-text" data-no-i18n>${esc(c.title)}</span>
          </button>`);
      });
      return `
        <li class="mw-day${key === today ? " today" : ""}${past ? " past" : ""}" data-week-day="${key}">
          <div class="mw-date"><b>${fmt(day, { weekday: "short" })}</b><span>${fmt(day, { day: "numeric", month: "short" })}</span></div>
          <div class="mw-body">${items.join("") || `<p class="mw-none">Nothing planned</p>`}</div>
          ${past ? "" : `<button type="button" class="mw-add" data-week-add="${key}" aria-label="Add">＋</button>`}
        </li>`;
    };
    const rows = days.map(row).join("");
    return `
      <div class="mw-head">
        <h3 class="panel-sub">${opts.title || "My week"}</h3>
        <div class="mw-nav">
          <button type="button" class="week-btn" data-week-nav="-1" ${view.week <= 0 ? "disabled" : ""} aria-label="Previous week">◀</button>
          <strong>${view.week === 0 ? "This week" : view.week === 1 ? "Next week" : `${fmt(days[0], { day: "numeric", month: "short" })} – ${fmt(days[6], { day: "numeric", month: "short" })}`}</strong>
          <button type="button" class="week-btn" data-week-nav="1" ${view.week >= opts.weeks ? "disabled" : ""} aria-label="Next week">▶</button>
        </div>
        <button type="button" class="btn btn-small btn-primary mw-plan" data-week-add="">＋ Plan something</button>
      </div>
      ${team ? `<div class="mw-filter" role="group" aria-label="Trainer">
        <button type="button" data-week-filter="all" aria-pressed="${view.filter === "all"}">All</button>
        ${opts.trainers.map((id) => { const t = LevelUp.trainerById(id); return `<button type="button" data-week-filter="${id}" aria-pressed="${view.filter === id}"><span class="dot" style="--c:${t.chartColor || t.color}" aria-hidden="true"></span>${esc(t.short)}</button>`; }).join("")}
      </div>` : ""}
      <p class="muted small-text mw-help">${opts.help || "What players can book with you. Tap ＋ on a day to add something, tap a group class to see who is coming."}</p>
      <ul class="mw-days${team ? " mw-team" : ""}">${rows}</ul>
      ${waiting ? `<p class="muted small-text mw-wait-note">⏳ <span>${team ? "A new kind of training that waits for your approval: players don't see it yet." : "A new kind of training: players see it once the admin has approved it."}</span></p>` : ""}`;
  }

  function paint(view) {
    if (!view.el?.isConnected) return;
    view.week = Math.min(view.opts.weeks, Math.max(0, view.week));
    view.el.innerHTML = html(view);
  }

  function render(el, opts) {
    if (!el) return;
    const view = views[opts.key] || (views[opts.key] = { week: 0, filter: "all" });
    Object.assign(view, { el, opts: { weeks: 4, ...opts } });
    if (view.filter !== "all" && !opts.trainers.includes(view.filter)) view.filter = "all";
    el.classList.add("my-week");
    el.dataset.weekKey = opts.key;
    paint(view);
  }
  const refresh = (key) => { if (views[key]) paint(views[key]); };

  // ---------- "Plan something": for whom (the team only), and what: 1:1 or group ----------
  let dialog = null;
  let planning = null; // { view, date, trainerId }
  function planHtml() {
    const { view, date, trainerId } = planning;
    const ids = view.opts.trainers;
    const team = ids.length > 1;
    const day = date ? LevelUp.parseDate(date) : null;
    const option = (what, icon, label, note) => `
      <button type="button" class="plan-option" data-plan="${what}"><i aria-hidden="true">${icon}</i><span><b>${label}</b><small>${note}</small></span></button>`;
    return `
      <button type="button" class="dialog-close" data-close aria-label="Close">✕</button>
      <h2 id="planTitle">What do you want to plan?</h2>
      ${day ? `<p class="plan-day">${fmt(day, { weekday: "long", day: "numeric", month: "long" })}</p>` : ""}
      ${team ? `<p class="plan-group"><span>Trainer</span></p>
        <div class="mw-filter plan-who" role="group" aria-label="Trainer">${ids.map((id) => { const t = LevelUp.trainerById(id); return `<button type="button" data-plan-trainer="${id}" aria-pressed="${trainerId === id}"><span class="dot" style="--c:${t.chartColor || t.color}" aria-hidden="true"></span>${esc(t.short)}</button>`; }).join("")}</div>` : ""}
      <p class="plan-group"><span class="kind-tag">1:1</span> <span>Personal training</span></p>
      ${option("weekly", "🔁", "Fixed hours, every week", team ? "The hours players can book this trainer each week, and what is given in them" : day ? `Players can book you every ${fmt(day, { weekday: "long" })}` : "The hours players can book you each week")}
      ${option("open", "➕", "Extra hours on one day", team ? "Open up one date, on top of the fixed hours" : "Open up one date, on top of your fixed hours")}
      ${option("closed", "🌴", "Day off", "Close one date, or a few hours of it")}
      <p class="plan-group"><span class="kind-tag">Group</span> <span>Group training</span></p>
      ${option("class", "👥", "Group class", team ? "Boxing, dance, yoga …: once or every week, players sign up" : "Once or every week: players sign up, you see who is coming")}
      <p class="form-error" role="alert"></p>`;
  }
  function openPlan(view, date) {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "auth-dialog plan-dialog";
      dialog.setAttribute("aria-labelledby", "planTitle");
      document.body.appendChild(dialog);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog || event.target.closest("[data-close]")) { dialog.close(); return; }
        const pickTrainer = event.target.closest("[data-plan-trainer]");
        if (pickTrainer) { planning.trainerId = pickTrainer.dataset.planTrainer; dialog.innerHTML = planHtml(); return; }
        const pick = event.target.closest("[data-plan]");
        if (!pick) return;
        if (!planning.trainerId) { dialog.querySelector(".form-error").textContent = "Pick a trainer first."; return; }
        dialog.close();
        planning.view.opts.onPlan?.(pick.dataset.plan, { date: planning.date, trainerId: planning.trainerId });
      });
    }
    const ids = view.opts.trainers;
    planning = { view, date, trainerId: ids.length === 1 ? ids[0] : view.filter !== "all" ? view.filter : null };
    dialog.innerHTML = planHtml();
    if (!dialog.open) dialog.showModal();
  }

  document.addEventListener("click", (event) => {
    const host = event.target.closest("[data-week-key]");
    const view = host && views[host.dataset.weekKey];
    if (!view) return;
    const nav = event.target.closest("[data-week-nav]");
    if (nav) { view.week += Number(nav.dataset.weekNav); paint(view); return; }
    const filter = event.target.closest("[data-week-filter]");
    if (filter) { view.filter = filter.dataset.weekFilter; paint(view); return; }
    const cls = event.target.closest("[data-week-class]");
    if (cls) { view.opts.onClass?.(cls.dataset.weekClass); return; }
    const add = event.target.closest("[data-week-add]");
    if (add) { openPlan(view, add.dataset.weekAdd); return; }
    const solo = event.target.closest("[data-week-solo]");
    if (solo) view.opts.onSolo?.(solo.dataset.weekSolo);
  });

  return { render, refresh, blocks };
})();
