/* LEVEL-UP admin · Gym room: how busy the room is, renting it out in the quiet hours, and the room's settings.
   Loaded on admin.html only (English, like the rest of the admin). admin.js calls LevelUpRoom.mount(element)
   every time it draws the page; the data comes from admin_room in supabase/schema.sql. */
(function () {
  const esc = LevelUp.esc;
  const euro = (n) => `€${Number(n).toFixed(2).replace(/\.00$/, "")}`;
  const pad = (n) => String(n).padStart(2, "0");
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const OPEN_FROM = 7, OPEN_TO = 22; // the hours the overview counts as "the room could be used"
  const dayLabel = (key) => new Date(`${key}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const span = (r) => `${pad(r.start)}:00–${pad(r.end)}:00`;
  const KIND = { shared: "Shares the room", full: "Whole room" };

  let box = null;
  let data = null;
  let error = "";
  let loading = false;
  const st = { formError: "", settingsError: "", busy: false, draft: null };

  async function load() {
    if (loading) return;
    loading = true;
    try { data = await LevelUp.adminRoom(8); error = ""; }
    catch (err) { error = err.message; }
    loading = false;
    paint();
  }

  // the standard price for what the form says now (the server uses the same rule when the field is empty)
  function standardPrice(kind, date, end) {
    if (kind === "shared") return data.prices.shared;
    const d = date ? new Date(`${date}T12:00:00`).getDay() : 1;
    return Number(end) > 17 || d === 0 || d === 6 ? data.prices.fullPeak : data.prices.full;
  }

  // ---------- how busy ----------
  function usagePanel() {
    const weeks = data.weeks;
    const cell = new Map(data.usage.map((u) => [`${u.dow}|${u.hour}`, u]));
    const hours = [];
    const first = Math.min(OPEN_FROM, ...data.usage.map((u) => u.hour)), last = Math.max(OPEN_TO - 1, ...data.usage.map((u) => u.hour));
    for (let h = first; h <= last; h++) hours.push(h);
    // an hour counts as used in a week when anything was on in the room
    const usedPerWeek = data.usage.reduce((sum, u) => sum + u.weeks, 0) / weeks;
    const openPerWeek = (OPEN_TO - OPEN_FROM) * 7;
    // quiet blocks: per day, stretches of at least 2 hours that were used in at most 1 week out of the 8
    const quiet = [];
    for (let d = 1; d <= 7; d++) {
      let from = null;
      for (let h = OPEN_FROM; h <= OPEN_TO; h++) {
        const busy = h === OPEN_TO || (cell.get(`${d}|${h}`)?.weeks || 0) > Math.max(1, Math.floor(weeks / 8));
        if (!busy && from === null) from = h;
        if (busy && from !== null) { if (h - from >= 2) quiet.push({ d, from, to: h, len: h - from }); from = null; }
      }
    }
    quiet.sort((a, b) => b.len - a.len || a.d - b.d);
    const tone = (u) => { const r = (u?.weeks || 0) / weeks; return r === 0 ? 0 : r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4; };
    return `
      <section class="panel admin-panel room-usage">
        <div class="panel-head"><h2>How busy is the room?</h2><span class="muted">${esc(dayLabel(data.from))} – ${esc(dayLabel(data.to))} · the last ${weeks} full weeks</span></div>
        <div class="kpi-row room-kpis">
          <div class="kpi"><span class="kpi-label">Used / week</span><span class="kpi-value">${usedPerWeek.toFixed(1)} h</span><span class="kpi-note">on average, of ${openPerWeek} h (${pad(OPEN_FROM)}:00–${OPEN_TO}:00, 7 days)</span></div>
          <div class="kpi"><span class="kpi-label">Empty / week</span><span class="kpi-value">${Math.max(0, openPerWeek - usedPerWeek).toFixed(1)} h</span><span class="kpi-note">${Math.round(Math.max(0, 1 - usedPerWeek / openPerWeek) * 100)}% of those hours</span></div>
          <div class="kpi"><span class="kpi-label">Places</span><span class="kpi-value">${data.places}</span><span class="kpi-note">1:1 sessions and renters together</span></div>
        </div>
        <div class="room-heat-wrap">
          <table class="room-heat">
            <caption class="sr-only">In how many of the last ${weeks} weeks the room was used, per weekday and hour</caption>
            <thead><tr><th scope="col"><span class="sr-only">Hour</span></th>${DAYS.map((d) => `<th scope="col">${d}</th>`).join("")}</tr></thead>
            <tbody>${hours.map((h) => `<tr><th scope="row">${pad(h)}:00</th>${DAYS.map((d, i) => {
              const u = cell.get(`${i + 1}|${h}`);
              const parts = u ? [u.sessions ? `${u.sessions} 1:1 session${u.sessions === 1 ? "" : "s"}` : "", u.classes ? `${u.classes} class hour${u.classes === 1 ? "" : "s"}` : "", u.rentals ? `${u.rentals} rental hour${u.rentals === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ") : "";
              return `<td class="h${tone(u)}" title="${d} ${pad(h)}:00 · ${u ? `used in ${u.weeks} of ${weeks} weeks (${parts})` : "never used"}">${u ? u.weeks : ""}</td>`;
            }).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
        <p class="muted small">The number = in how many of the last ${weeks} weeks something was on in the room that hour (a 1:1 session, a group class in the room or a rental). Darker = busier, empty = never. Only what is in the app counts.</p>
        ${quiet.length ? `<h3 class="panel-sub">Quiet blocks you could rent out</h3>
        <ul class="room-quiet">${quiet.slice(0, 6).map((q) => `<li><b>${DAYS[q.d - 1]} ${pad(q.from)}:00–${pad(q.to)}:00</b> <span class="muted">${q.len} h · about ${euro(q.len * data.prices.shared)} a week with one renter at ${euro(data.prices.shared)}/h</span></li>`).join("")}</ul>` : `<p class="muted">No quiet block of 2 hours or more in these weeks.</p>`}
      </section>`;
  }

  // ---------- add a rental ----------
  function formPanel() {
    const renters = [...new Set(data.rentals.map((r) => r.renter))].sort((a, b) => a.localeCompare(b));
    const hourOptions = (from, to, picked) => { let out = ""; for (let h = from; h <= to; h++) out += `<option value="${h}" ${h === picked ? "selected" : ""}>${pad(h)}:00</option>`; return out; };
    return `
      <section class="panel admin-panel">
        <div class="panel-head"><h2>Rent out the room</h2><span class="muted">You enter it; the renter books and pays with you, not in the app</span></div>
        <form class="room-form" id="roomForm">
          <div class="field-row">
            <label>Who rents<input name="renter" list="roomRenters" maxlength="60" required placeholder="e.g. Sarah (own PT clients)"></label>
            <label>Phone or email <small class="muted">(optional)</small><input name="contact" maxlength="80"></label>
          </div>
          <datalist id="roomRenters">${renters.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>
          <fieldset class="room-kind">
            <legend>What do they need?</legend>
            <label><input type="radio" name="kind" value="shared" checked> <span><b>A place in the room</b> <small class="muted">a personal trainer with one client: takes 1 of the ${data.places} places, your coaches can train next to them</small></span></label>
            <label><input type="radio" name="kind" value="full"> <span><b>The whole room</b> <small class="muted">yoga, dance, a team building: nobody else can book that hour</small></span></label>
          </fieldset>
          <div class="field-row four">
            <label>Date<input type="date" name="date" required value="${LevelUp.dateKey()}"></label>
            <label>From<select name="start">${hourOptions(6, 23, 9)}</select></label>
            <label>To<select name="end">${hourOptions(7, 24, 10)}</select></label>
            <label>Repeat<select name="repeatWeeks">${[[1, "Once"], [4, "Weekly · 4 weeks"], [8, "Weekly · 8 weeks"], [12, "Weekly · 12 weeks"], [26, "Weekly · 26 weeks"]].map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
          </div>
          <div class="field-row">
            <label>Price per hour (€)<input type="number" name="price" min="0" max="1000" step="0.5" value="${data.prices.shared}" data-room-price></label>
            <label>Note <small class="muted">(optional)</small><input name="note" maxlength="200" placeholder="e.g. brings own mats"></label>
          </div>
          <p class="muted small" data-room-total></p>
          <p class="form-error" role="alert">${esc(st.formError)}</p>
          <div class="btn-row"><button type="submit" class="btn btn-primary">Add rental ▶</button></div>
        </form>
      </section>`;
  }

  // ---------- the rentals ----------
  function listPanel() {
    const live = data.rentals.filter((r) => r.status === "booked");
    const coming = live.filter((r) => !r.past);
    // over: the last two months and everything that is not paid yet (older paid ones are in Finances)
    const recent = LevelUp.dateKey(new Date(Date.now() - 62 * 864e5));
    const done = live.filter((r) => r.past && (r.date >= recent || !r.paidAt)).reverse();
    // what is still to collect, per renter (rentals that are over and not paid)
    const open = new Map();
    done.filter((r) => !r.paidAt).forEach((r) => { const o = open.get(r.renter) || { total: 0, hours: 0, id: r.id }; o.total += Number(r.total); o.hours += Number(r.hours); open.set(r.renter, o); });
    const month = new Date().toISOString().slice(0, 7);
    const monthTotal = live.filter((r) => r.date.slice(0, 7) === month).reduce((sum, r) => sum + Number(r.total), 0);
    const row = (r) => `
      <li class="room-rental ${r.paidAt ? "paid" : ""}">
        <span class="room-when"><b>${esc(dayLabel(r.date))}</b> ${span(r)}</span>
        <span class="room-who"><b>${esc(r.renter)}</b> <span class="status-chip ${r.kind === "full" ? "pending" : "confirmed"}">${KIND[r.kind]}</span>${r.seriesId ? ` <span class="muted small">weekly</span>` : ""}
          ${r.contact || r.note ? `<small class="muted">${esc([r.contact, r.note].filter(Boolean).join(" · "))}</small>` : ""}</span>
        <span class="room-money"><b>${euro(r.total)}</b> <small class="muted">${r.hours} h × ${euro(r.price)}</small></span>
        <span class="room-acts">
          <button type="button" class="btn btn-small ${r.paidAt ? "btn-ghost" : "btn-primary"}" data-room-paid="${r.id}" data-on="${r.paidAt ? "0" : "1"}">${r.paidAt ? "Paid ✓" : "Mark paid"}</button>
          ${r.past ? "" : `<button type="button" class="btn btn-small btn-ghost" data-room-cancel="${r.id}" ${r.seriesId ? `data-series="1"` : ""}>Cancel</button>`}
        </span>
      </li>`;
    return `
      <section class="panel admin-panel">
        <div class="panel-head"><h2>Rentals</h2><span class="muted">${coming.length} coming · ${euro(monthTotal)} this month</span></div>
        ${open.size ? `<div class="room-open"><h3 class="panel-sub">Still to collect</h3>
          <ul class="detail-list">${[...open].map(([name, o]) => `<li><span><b>${esc(name)}</b> <span class="muted">· ${o.hours} h that are over</span></span>
            <span><b>${euro(o.total)}</b> <button type="button" class="btn btn-small btn-primary" data-room-paid-all="${o.id}">All paid</button></span></li>`).join("")}</ul></div>` : ""}
        ${coming.length ? `<ul class="room-rentals">${coming.map(row).join("")}</ul>` : `<p class="muted">No rentals planned. Add the first one above.</p>`}
        ${done.length ? `<details class="room-past"><summary>Rentals that are over (${done.length}, last 2 months and everything unpaid)</summary><ul class="room-rentals">${done.map(row).join("")}</ul></details>` : ""}
      </section>`;
  }

  // ---------- settings ----------
  function settingsPanel() {
    return `
      <section class="panel admin-panel">
        <div class="panel-head"><h2>Room settings</h2><span class="muted">Counts for new bookings and rentals</span></div>
        <form class="room-form" id="roomSettings">
          <div class="field-row four">
            <label>Places at once<input type="number" name="places" min="1" max="10" value="${data.places}" required></label>
            <label>Place, per hour (€)<input type="number" name="shared" min="0" max="1000" step="0.5" value="${data.prices.shared}" required></label>
            <label>Whole room, daytime (€)<input type="number" name="full" min="0" max="1000" step="0.5" value="${data.prices.full}" required></label>
            <label>Whole room, from 17:00 + weekend (€)<input type="number" name="fullPeak" min="0" max="1000" step="0.5" value="${data.prices.fullPeak}" required></label>
          </div>
          <p class="muted small"><b>Places at once</b> = how many 1:1 sessions fit in the room at the same hour, your own coaches and renters together. When they are all taken, players can't book another coach that hour. A group class in the room and a "whole room" rental always take all of it.</p>
          <p class="form-error" role="alert">${esc(st.settingsError)}</p>
          <div class="btn-row"><button type="submit" class="btn btn-small btn-primary">Save settings</button></div>
        </form>
      </section>`;
  }

  function paint() {
    if (!box?.isConnected) return;
    if (!data) { box.innerHTML = `<section class="panel admin-panel"><p class="${error ? "form-error" : "muted"}">${error ? esc(error) : "Loading the room…"}</p></section>`; return; }
    box.innerHTML = usagePanel() + formPanel() + listPanel() + settingsPanel();
    // what was being typed in the rental form survives a redraw (of this tab or of the whole admin page)
    if (st.draft) {
      const f = box.querySelector("#roomForm");
      Object.entries(st.draft.values).forEach(([k, v]) => { if (f.elements[k]) f.elements[k].value = v; });
      if (st.draft.ownPrice) f.elements.price.dataset.own = "1";
      else f.elements.price.value = standardPrice(f.elements.kind.value, f.elements.date.value, f.elements.end.value); // the standard price may have changed
    }
    showTotal();
  }

  // the line under the form: what this rental comes to
  function showTotal() {
    const f = box?.querySelector("#roomForm");
    if (!f) return;
    const hours = Number(f.elements.end.value) - Number(f.elements.start.value);
    const weeks = Number(f.elements.repeatWeeks.value);
    const price = Number(f.elements.price.value);
    const line = f.querySelector("[data-room-total]");
    line.textContent = hours > 0 ? `${hours} hour${hours === 1 ? "" : "s"} × ${euro(price)} = ${euro(hours * price)}${weeks > 1 ? ` a week · ${euro(hours * price * weeks)} for the ${weeks} weeks` : ""}` : "The end hour has to be after the start hour.";
  }

  document.addEventListener("input", (event) => {
    const f = event.target.closest?.("#roomForm");
    if (!f || !data) return;
    // the price follows the kind, the day and the hours until you type your own
    const priceField = f.elements.price;
    if (event.target === priceField) priceField.dataset.own = "1";
    else if (!priceField.dataset.own && ["kind", "date", "start", "end"].includes(event.target.name)) priceField.value = standardPrice(f.elements.kind.value, f.elements.date.value, f.elements.end.value);
    if (event.target.name === "start" && Number(f.elements.end.value) <= Number(f.elements.start.value)) f.elements.end.value = String(Math.min(24, Number(f.elements.start.value) + 1));
    st.draft = { values: Object.fromEntries(new FormData(f)), ownPrice: Boolean(priceField.dataset.own) };
    showTotal();
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form.id !== "roomForm" && form.id !== "roomSettings") return;
    event.preventDefault();
    if (st.busy) return;
    st.busy = true;
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    const values = Object.fromEntries(new FormData(form));
    try {
      if (form.id === "roomForm") {
        st.formError = "";
        const r = await LevelUp.adminRentalAdd(values);
        LevelUp.toast({ title: r.created === 1 ? "Rental added" : `${r.created} rentals added`, text: r.skipped ? `${r.skipped} week${r.skipped === 1 ? "" : "s"} skipped: the room was not free` : "The room is blocked for those hours", icon: "🔑", tone: "green" });
        st.draft = null;
      } else {
        st.settingsError = "";
        await LevelUp.adminRoomSettings(values);
        LevelUp.toast({ title: "Saved", text: "The room's settings are up to date.", icon: "✓", tone: "green" });
      }
      st.busy = false;
      await load();
    } catch (err) {
      st.busy = false;
      btn.disabled = false;
      if (form.id === "roomForm") st.formError = err.message; else st.settingsError = err.message;
      form.querySelector(".form-error").textContent = err.message;
    }
  });

  document.addEventListener("click", async (event) => {
    const paid = event.target.closest?.("[data-room-paid]"), all = event.target.closest?.("[data-room-paid-all]"), cancel = event.target.closest?.("[data-room-cancel]");
    const btn = paid || all || cancel;
    if (!btn || !box?.contains(btn) || st.busy) return;
    let series = false;
    if (cancel) {
      if (!confirm("Cancel this rental? The hours become free again.")) return;
      if (cancel.dataset.series) series = confirm("It is part of a weekly series.\n\nOK = also cancel every later week\nCancel = only this one");
    }
    st.busy = true;
    btn.disabled = true;
    try {
      if (paid) await LevelUp.adminRentalPaid(paid.dataset.roomPaid, paid.dataset.on === "1");
      else if (all) await LevelUp.adminRentalPaid(all.dataset.roomPaidAll, true, true);
      else {
        const n = await LevelUp.adminRentalCancel(cancel.dataset.roomCancel, series);
        LevelUp.toast({ title: n === 1 ? "Rental cancelled" : `${n} rentals cancelled`, text: "Those hours are free again", icon: "✕" });
      }
    } catch (err) {
      alert(err.message);
    }
    st.busy = false;
    await load();
  });

  window.LevelUpRoom = {
    mount(el) {
      if (!el) return;
      box = el;
      paint();
      load();
    }
  };
})();
