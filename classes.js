// LEVEL-UP group classes for trainers and the admin: plan classes (once or weekly), change them at any moment
// (name, trainer, date, time, places …), see who signed up, tick off who is there (they get their XP right away)
// and who paid at the class, then finish the class.
// The profile's Coach tab shows a trainer's own classes; the admin dashboard shows every class.

window.LevelUpClasses = (() => {
  const { esc, euro } = LevelUp;
  const PRESETS = ["CrossFit WOD", "HIIT", "Hyrox", "Bootcamp", "Calisthenics", "Mobility", "Social run club", "Spinning", "Muay Thai"];
  const STATUS = {
    booked: ["Signed up", "confirmed"], awaiting_payment: ["Paying online…", "pending"], waitlist: ["Waitlist", "pending"],
    attended: ["Present", "completed"], no_show: ["No-show", "declined"], late_cancel: ["Late sign-out", "declined"]
  };
  const states = new Map(); // one state per place (coach / admin), kept between re-renders of the page

  const dayText = (c) => c.day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const tomorrow = () => LevelUp.dateKey(new Date(Date.now() + 864e5));
  const chip = (s) => `<span class="status-chip ${STATUS[s]?.[1] || ""}">${STATUS[s]?.[0] || s}</span>`;

  function mount(el, { admin = false } = {}) {
    if (!el) return;
    const key = admin ? "admin" : "coach";
    if (!states.has(key)) states.set(key, { list: null, loadedAt: 0, open: null, roster: null, creating: false, editing: null, showPast: false, busy: false, error: "" });
    const st = states.get(key);
    const pricing = LevelUp.getPricing();
    const player = LevelUp.getPlayer();

    async function load() {
      try {
        st.list = await LevelUp.classManageList(admin ? 120 : 35);
        st.loadedAt = Date.now();
        if (st.open) st.roster = await LevelUp.classRoster(st.open).catch(() => null);
      } catch (err) {
        st.error = err.message;
        st.list = st.list || [];
      }
      paint();
    }

    function classCard(c) {
      const t = LevelUp.trainerById(c.trainerId);
      const started = LevelUp.classStarted(c);
      const open = st.open === c.id;
      const fill = Math.min(100, (c.taken / c.capacity) * 100).toFixed(0);
      const status = c.status === "cancelled" ? `<span class="status-chip declined">Cancelled</span>`
        : c.status === "done" ? `<span class="status-chip completed">Finished</span>`
        : c.canFinish ? `<span class="status-chip pending">To finish</span>` : "";
      return `
        <li class="gc-card ${open ? "open" : ""} ${c.status}" style="--c:${t?.color || "#7cff6b"}" data-gc="${c.id}">
          <div class="gc-top">
            <div class="gc-when"><b>${esc(dayText(c))}</b><span>${c.time}</span></div>
            <div class="gc-main">
              <p class="gc-title">${esc(c.title)} ${status}</p>
              <p class="muted small">${admin ? `${esc(t?.short || c.trainerId)} · ` : ""}${c.minutes} min · ${esc(c.location)}${c.price > 0 ? ` · ${euro(c.price)}` : " · free"}</p>
              <div class="gc-meter" style="--fill:${fill}%"><span class="gc-bar" aria-hidden="true"><i></i></span>
                <span><b>${c.taken}</b>/${c.capacity} signed up${c.waitlist ? ` · ${c.waitlist} waitlist` : ""}${c.status === "done" ? ` · ${c.present} present` : ""}${c.unpaid ? ` · <span class="gc-warn">${c.unpaid} to pay (${euro(c.unpaidTotal)})</span>` : ""}</span>
              </div>
              ${admin && c.refunds?.length ? `<p class="gc-refunds">⚠ Give back by hand: ${c.refunds.map((r) => `${esc(r.name)} ${euro(r.price)} <button type="button" class="link-btn" data-gc-refunded="${r.id}">Done</button>`).join(" · ")}</p>` : ""}
            </div>
            <div class="gc-actions">
              ${c.status !== "cancelled" ? `<button type="button" class="btn btn-small ${c.canFinish || (started && c.status === "scheduled") ? "btn-primary" : ""}" data-gc-roster="${c.id}" aria-expanded="${open}">${open ? "Close list ▲" : started ? "Tick off ▼" : "Who's coming ▼"}</button>` : ""}
              ${c.chatId && c.chatOpen ? `<a class="btn btn-small btn-ghost" href="chat.html?t=${encodeURIComponent(c.chatId)}">💬 Chat</a>` : ""}
              ${c.status === "scheduled" ? `<button type="button" class="btn btn-small btn-ghost" data-gc-edit="${c.id}" aria-expanded="${st.editing === c.id}">✎ Change</button>` : ""}
              ${c.status === "scheduled" && !started ? `<button type="button" class="btn btn-small btn-ghost" data-gc-cancel="${c.id}">Cancel</button>` : ""}
            </div>
          </div>
          ${st.editing === c.id ? formHtml(c) : ""}
          ${open ? rosterHtml(c) : ""}
        </li>`;
    }

    function rosterHtml(c) {
      const r = st.roster && st.roster.id === c.id ? st.roster : null;
      if (!r) return `<div class="gc-roster"><p class="muted">Loading the list…</p></div>`;
      const people = r.people.filter((p) => p.status !== "waitlist");
      const waiting = r.people.filter((p) => p.status === "waitlist");
      const canCheck = r.canCheck;
      const row = (p) => {
        const present = p.status === "attended";
        const pays = p.price > 0;
        return `
          <li class="gc-person ${present ? "present" : ""}">
            ${LevelUp.avatarHtml({ name: p.name, avatar: p.avatar })}
            <div class="gc-person-main">
              <p><b data-no-i18n>${esc(p.name)}</b> ${p.firstClass ? `<span class="gc-new">1st class</span>` : ""} ${chip(p.status)}</p>
              ${LevelUp.healthFlagHtml(p.health)}
            </div>
            ${pays ? `<button type="button" class="gc-pay ${p.payStatus === "paid" ? "paid" : ""}" data-gc-paid="${p.id}" data-paid="${p.payStatus === "paid"}"
                ${p.payMethod === "online" && p.payStatus === "paid" ? "disabled" : ""} aria-pressed="${p.payStatus === "paid"}">
                ${p.payStatus === "paid" ? (p.payMethod === "online" ? "Paid online ✓" : "Paid ✓") : `To pay ${euro(p.price)}`}</button>` : `<span class="gc-pay paid">Free</span>`}
            <button type="button" class="gc-check ${present ? "on" : ""}" data-gc-mark="${p.id}" data-present="${present}" aria-pressed="${present}"
              ${canCheck && ["booked", "attended", "no_show", "late_cancel", "awaiting_payment"].includes(p.status) ? "" : "disabled"}
              aria-label="${esc(p.name)} present">${present ? "✓" : ""}</button>
          </li>`;
      };
      const presentCount = people.filter((p) => p.status === "attended").length;
      return `
        <div class="gc-roster">
          ${!canCheck && c.status === "scheduled" ? `<p class="muted small">Ticking off opens 30 minutes before the start. Everyone you tick gets +${c.xp} XP right away.</p>` : ""}
          ${people.length ? `<ul class="gc-people">${people.map(row).join("")}</ul>` : `<p class="muted">Nobody signed up yet.</p>`}
          ${waiting.length ? `<p class="gc-sub">Waitlist</p><ul class="gc-people waiting">${waiting.map((p, i) => `
            <li class="gc-person">${LevelUp.avatarHtml({ name: p.name, avatar: p.avatar })}<div class="gc-person-main"><p><b data-no-i18n>${esc(p.name)}</b> <span class="muted">#${i + 1}</span></p></div>
              <button type="button" class="gc-check" data-gc-mark="${p.id}" data-present="false" ${canCheck ? "" : "disabled"} aria-label="${esc(p.name)} came anyway">＋</button></li>`).join("")}</ul>` : ""}
          <p class="form-error" role="alert">${esc(st.error)}</p>
          <div class="gc-roster-foot">
            <span class="muted small">${presentCount}/${people.length} present${r.unpaid ? ` · ${r.unpaid} still to pay (${euro(r.unpaidTotal)})` : ""}</span>
            <span class="btn-row">
              ${canCheck && people.some((p) => ["booked", "awaiting_payment"].includes(p.status)) ? `<button type="button" class="btn btn-small btn-ghost" data-gc-all="${c.id}">Everyone present</button>` : ""}
              ${c.status === "scheduled" && LevelUp.classStarted(c) ? `<button type="button" class="btn btn-small btn-primary" data-gc-finish="${c.id}">Finish class</button>` : ""}
            </span>
          </div>
          ${c.status === "scheduled" && LevelUp.classStarted(c) ? `<p class="muted small">Finish: whoever isn't ticked off counts as a no-show (charged, no XP) and your fee of ${euro(r.trainerFee)} counts as earned.</p>` : ""}
        </div>`;
    }

    // The form for a new class, or (with a class) to change that class
    function formHtml(c = null) {
      const mine = player?.trainerId;
      const trainers = LevelUp.TRAINERS.filter((t) => admin || t.id === mine);
      const picked = c ? c.trainerId : mine;
      const durations = [...new Set([45, 60, 75, 90, 120, c?.minutes || 60])].sort((a, b) => a - b);
      return `
        <form class="gc-form ${c ? "gc-edit" : ""}" id="gcForm-${key}" ${c ? `data-gc-edit-form="${c.id}"` : ""}>
          <div class="field-row">
            <label>Class<input name="title" list="gcPresets" maxlength="40" required placeholder="e.g. HIIT" value="${esc(c?.title || "")}"></label>
            ${admin ? `<label>Trainer<select name="trainerId">${trainers.map((t) => `<option value="${t.id}" ${t.id === picked ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>` : ""}
          </div>
          <datalist id="gcPresets">${PRESETS.map((p) => `<option value="${esc(p)}">`).join("")}</datalist>
          <div class="field-row four">
            <label>Date<input type="date" name="date" required value="${c ? c.date : tomorrow()}" min="${c && c.date < LevelUp.dateKey() ? c.date : LevelUp.dateKey()}"></label>
            <label>Start<input type="time" name="time" required value="${c ? c.time : "19:00"}" step="900"></label>
            <label>Duration<select name="minutes">${durations.map((m) => `<option value="${m}" ${m === (c?.minutes || 60) ? "selected" : ""}>${m} min</option>`).join("")}</select></label>
            <label>Places<input type="number" name="capacity" min="${c ? Math.max(2, c.taken) : 2}" max="60" value="${c ? c.capacity : pricing.classCapacity}" required></label>
          </div>
          <div class="field-row">
            ${c ? "" : `<label>Repeat<select name="repeatWeeks">${[[1, "Once"], [4, "Every week · 4 weeks"], [8, "Every week · 8 weeks"], [12, "Every week · 12 weeks"]].map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>`}
            <label>Location<input name="location" maxlength="80" value="${esc(c ? c.location : "Hoogstraat 40, Aalst")}"></label>
          </div>
          ${admin ? `<div class="field-row">
            <label>Price per player (€)<input type="number" name="price" min="0" max="500" step="0.5" value="${c ? c.price : pricing.classPrice}"></label>
            <label>Trainer fee per class (€)<input type="number" name="trainerFee" min="0" max="1000" step="1" value="${c ? Number(c.trainerFee) : pricing.classTrainerFee}"></label>
          </div>` : c ? "" : `<p class="muted small">Players pay ${euro(pricing.classPrice)} per class; you get ${euro(pricing.classTrainerFee)} per class you lead.</p>`}
          <label>Note for the players (optional)<input name="note" maxlength="300" placeholder="Bring a towel and water · level: everyone welcome" value="${esc(c?.note || "")}"></label>
          ${c ? `<p class="muted small">${c.taken ? `${c.taken} signed up: they get a message when the day, hour, place, name or trainer changes.` : "Nobody signed up yet."}${admin ? " A new price counts for who signs up from now on." : ""}</p>`
            : `<label class="gc-announce"><input type="checkbox" name="announce" checked> <span>📣 Tell all members: news behind the bell and a notification, with your note in it</span></label>
          <p class="muted small">Classes with the same name share one group chat (e.g. every "Hyrox" class uses the Hyrox chat).</p>`}
          <p class="form-error" role="alert">${esc(st.error)}</p>
          <div class="btn-row">
            <button type="submit" class="btn btn-primary">${c ? "Save changes" : "Plan class ▶"}</button>
            <button type="button" class="btn btn-ghost btn-small" ${c ? `data-gc-edit="${c.id}"` : "data-gc-new"}>Cancel</button>
          </div>
        </form>`;
    }

    function paint() {
      if (!el.isConnected) return;
      const list = st.list;
      const now = new Date();
      const toFinish = (list || []).filter((c) => c.canFinish);
      const upcoming = (list || []).filter((c) => c.status === "scheduled" && !c.canFinish && c.end > now);
      const rest = (list || []).filter((c) => !toFinish.includes(c) && !upcoming.includes(c)).reverse();
      // the admin keeps no archive: a finished or cancelled class only stays while money is still open on it
      const openMoney = admin ? rest.filter((c) => c.unpaid > 0 || c.refunds?.length) : [];
      const past = admin ? [] : rest;
      el.innerHTML = `
        <div class="panel-head gc-head">
          <h3 class="panel-sub first">Group classes ${toFinish.length ? `<span class="count-chip">${toFinish.length}</span>` : ""}</h3>
          ${st.creating ? "" : `<button type="button" class="btn btn-small btn-primary" data-gc-new>+ New class</button>`}
        </div>
        ${st.creating ? formHtml() : ""}
        ${list === null ? `<p class="muted">Loading classes…</p>` : `
          ${toFinish.length ? `<p class="gc-sub">To finish</p><ul class="gc-list">${toFinish.map(classCard).join("")}</ul>` : ""}
          ${upcoming.length ? `<p class="gc-sub">Upcoming</p><ul class="gc-list">${upcoming.map(classCard).join("")}</ul>`
            : st.creating ? "" : `<p class="muted">No group classes planned. Plan one: players see it on the schedule and sign up right away.</p>`}
          ${openMoney.length ? `<p class="gc-sub">Money still open</p><ul class="gc-list">${openMoney.map(classCard).join("")}</ul>` : ""}
          ${past.length ? `<button type="button" class="btn btn-ghost btn-small history-btn" data-gc-past aria-expanded="${st.showPast}">${st.showPast ? "Hide past classes ▲" : `Past classes · ${past.length} ▼`}</button>
            ${st.showPast ? `<ul class="gc-list">${past.map(classCard).join("")}</ul>` : ""}` : ""}`}`;
      el.querySelectorAll("form.gc-form").forEach((form) => form.addEventListener("submit", form.dataset.gcEditForm ? onEdit : onCreate));
    }

    async function onEdit(event) {
      event.preventDefault();
      const form = event.target;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      st.error = "";
      try {
        await LevelUp.classUpdate(form.dataset.gcEditForm, Object.fromEntries(new FormData(form)));
        LevelUp.toast({ title: "Class changed", text: "Who signed up got a message if the day, hour or place changed", icon: "✎", tone: "green" });
        st.editing = null;
        await load();
        LevelUp.refreshCoach();
      } catch (err) {
        st.error = err.message;
        btn.disabled = false;
        form.querySelector(".form-error").textContent = err.message;
      }
    }

    async function onCreate(event) {
      event.preventDefault();
      const form = event.target;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      st.error = "";
      try {
        const r = await LevelUp.classCreate({ ...Object.fromEntries(new FormData(form)), announce: form.elements.announce.checked });
        const n = r.created.length;
        LevelUp.toast({ title: n === 1 ? "Class planned" : `${n} classes planned`,
          text: r.skipped ? `${r.skipped} week${r.skipped === 1 ? "" : "s"} skipped (clash or too soon)`
            : r.announced != null ? `Everyone got the news · ${r.announced} notification${r.announced === 1 ? "" : "s"} sent` : "Players can sign up now", icon: "👥", tone: "green" });
        LevelUp.loadPricing();
        st.creating = false;
        await load();
      } catch (err) {
        st.error = err.message;
        btn.disabled = false;
        form.querySelector(".form-error").textContent = err.message;
      }
    }

    async function withRoster(promise) {
      if (st.busy) return;
      st.busy = true;
      st.error = "";
      try {
        st.roster = await promise;
        const i = st.list.findIndex((c) => c.id === st.roster.id);
        if (i >= 0) st.list[i] = { ...st.list[i], ...pick(st.roster) };
      } catch (err) {
        st.error = err.message;
      }
      st.busy = false;
      paint();
    }
    // the counts on the card follow the list
    const pick = (r) => ({ taken: Number(r.taken), waitlist: Number(r.waitlist), present: Number(r.present), unpaid: Number(r.unpaid),
      unpaidTotal: Number(r.unpaidTotal), status: r.status, canFinish: r.status === "scheduled" && LevelUp.classStarted({ start: new Date(r.startsAt) }) });

    el.onclick = async (event) => {
      const t = event.target.closest("button, a");
      if (!t || t.disabled) return;
      if (t.hasAttribute("data-gc-new")) { st.creating = !st.creating; st.editing = null; st.error = ""; paint(); return; }
      if (t.dataset.gcEdit) { st.editing = st.editing === t.dataset.gcEdit ? null : t.dataset.gcEdit; st.creating = false; st.error = ""; paint(); return; }
      if (t.hasAttribute("data-gc-past")) { st.showPast = !st.showPast; paint(); return; }
      if (t.dataset.gcRoster) {
        st.error = "";
        if (st.open === t.dataset.gcRoster) { st.open = null; st.roster = null; paint(); return; }
        st.open = t.dataset.gcRoster;
        st.roster = null;
        paint();
        await withRoster(LevelUp.classRoster(st.open));
        return;
      }
      if (t.dataset.gcMark) { await withRoster(LevelUp.classMark(t.dataset.gcMark, t.dataset.present !== "true")); return; }
      if (t.dataset.gcPaid) { await withRoster(LevelUp.classMarkPaid(t.dataset.gcPaid, t.dataset.paid !== "true")); return; }
      if (t.dataset.gcAll) {
        const todo = st.roster.people.filter((p) => ["booked", "awaiting_payment"].includes(p.status));
        st.busy = true;
        try { for (const p of todo) st.roster = await LevelUp.classMark(p.id, true); } catch (err) { st.error = err.message; }
        st.busy = false;
        await load();
        return;
      }
      if (t.dataset.gcFinish) {
        const r = st.roster;
        const missing = r ? r.people.filter((p) => ["booked", "awaiting_payment"].includes(p.status)).length : 0;
        if (!confirm(missing ? `${missing} ${missing === 1 ? "person isn't" : "people aren't"} ticked off: they count as no-show. Finish the class?` : "Finish the class?")) return;
        await withRoster(LevelUp.classFinish(t.dataset.gcFinish));
        LevelUp.toast({ title: "Class finished", text: "Your coaching XP is in", icon: "★", tone: "green" });
        await load();
        LevelUp.refreshCoach(); // earnings and XP on the page
        return;
      }
      if (t.dataset.gcCancel) {
        const c = st.list.find((x) => x.id === t.dataset.gcCancel);
        const reason = prompt(`Cancel ${c.title} on ${dayText(c)} ${c.time}? Everyone signed up gets a message and paid places are refunded.\n\nReason (optional, shown to the players):`, "");
        if (reason === null) return;
        const later = c.seriesId && st.list.some((x) => x.seriesId === c.seriesId && x.status === "scheduled" && x.start > c.start);
        const series = later && confirm("Also cancel the next classes of this weekly series?");
        try {
          const r = await LevelUp.classCancel(c.id, reason, series);
          LevelUp.toast({ title: r.cancelled === 1 ? "Class cancelled" : `${r.cancelled} classes cancelled`, text: "The players got a message", icon: "✕" });
        } catch (err) { alert(err.message); }
        await load();
        LevelUp.refreshCoach();
        return;
      }
      if (t.dataset.gcRefunded) {
        try { await LevelUp.classMarkRefunded(t.dataset.gcRefunded); } catch (err) { alert(err.message); }
        await load();
      }
    };

    paint();
    if (!st.list || Date.now() - st.loadedAt > 30000) load();
  }

  return { mount };
})();
