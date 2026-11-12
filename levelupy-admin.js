/* LEVEL-UP admin · Levelupy: the assistant in the chat. Who has it, which model answers, the limits, what it
   knows about the gym, how much it is used and what it could not answer.
   Loaded on admin.html only (English, like the rest of the admin). admin.js calls LevelUpAssistantAdmin.mount(element)
   every time it draws the page; the data comes from admin_assistant in supabase/schema.sql. */
(function () {
  const esc = LevelUp.esc;
  // Prices per million tokens (Anthropic's list, November 2026): what a model reads, and what it writes
  const MODELS = [
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", note: "the best answers", inPrice: 4, outPrice: 20 },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", note: "quick and good, half the price", inPrice: 2, outPrice: 10 },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", note: "the fastest and by far the cheapest", inPrice: 0.1, outPrice: 0.5 }
  ];
  const MODES = [
    { id: "off", name: "Off", note: "Nobody sees Levelupy." },
    { id: "staff", name: "Trial: you and the coaches", note: "Only the admin and the coaches see him. Try him out first." },
    { id: "members", name: "On for all members", note: "Every member with an account has him in the chat and on the start screen." }
  ];
  const usd = (n) => `$${n < 10 ? n.toFixed(2) : Math.round(n)}`;
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  // what a month of answers cost, from the tokens (stored text is read at a tenth of the price)
  const cost = (row) => {
    const m = MODELS.find((x) => x.id === row.model) || MODELS[0];
    return (Number(row.tokensIn) * m.inPrice + Number(row.tokensCached) * m.inPrice * 0.1 + Number(row.tokensOut) * m.outPrice) / 1e6;
  };

  let box = null;
  let data = null;
  let error = "";
  let loading = false;
  const st = { saved: "", formError: "", busy: false };

  async function load() {
    if (loading) return;
    loading = true;
    try { data = await LevelUp.adminAssistant(); error = ""; }
    catch (err) { error = /could not find the function|schema cache/i.test(err.message) ? "Run supabase/schema.sql in the SQL Editor first: the database doesn't know Levelupy yet." : err.message; }
    loading = false;
    paint();
  }

  // ---------- His wardrobe: every look with the days he wears it (mascot-looks.js) ----------
  const DAY_MONTH = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  function when(look) {
    if (look.id === "cake") return "A member's birthday (Settings → Account)";
    if (look.id === "laurel") return "The day a member joined, every year";
    const runs = [];
    look.days.forEach((d) => { const last = runs[runs.length - 1]; if (last && d - last[1] < 1.5 * 864e5) last[1] = d; else runs.push([d, d]); });
    return runs.map(([a, b]) => (a === b ? DAY_MONTH(a) : a.getMonth() === b.getMonth() ? `${a.getDate()}–${DAY_MONTH(b)}` : `${DAY_MONTH(a)} – ${DAY_MONTH(b)}`)).join(", ") || "Not this year";
  }
  function wardrobeHtml() {
    const L = window.LevelUpLooks;
    if (!L) return `<section class="panel admin-panel" id="lvWardrobe"><div class="panel-head"><h2>His wardrobe</h2></div><p class="muted">Loading…</p></section>`;
    const year = new Date().getFullYear(), today = LevelUp.mascotLook();
    return `<section class="panel admin-panel" id="lvWardrobe">
      <div class="panel-head"><h2>His wardrobe <span class="count-chip">${Object.keys(L.LOOKS).length}</span></h2>${today ? `<span class="status-chip confirmed">Today: ${esc(today.name)}</span>` : ""}</div>
      <p class="muted small">What Levelupy wears on his head, by itself, through ${year}: on the loading screen, the start screen, in the chat and in the celebrations.
        Feast days go before seasons; a birthday goes before everything. To try one, add <code>?look=santa</code> (the name under the picture) to the address of the site.</p>
      <ul class="lv-looks">${L.calendar(year).map((look) => `<li class="${today?.id === look.id ? "now" : ""}"><canvas data-lv-look="${look.id}" width="132" height="150" aria-hidden="true"></canvas>
        <b>${esc(look.name)}</b><small>${esc(when(look))}</small><code>${look.id}</code></li>`).join("")}</ul>
    </section>`;
  }
  async function drawWardrobe() {
    if (!box?.querySelector("#lvWardrobe")) return;
    let lib;
    try { lib = await LevelUp.loadCelebrate(); } catch { return; }
    const L = window.LevelUpLooks, old = box?.querySelector("#lvWardrobe");
    if (!L || !old) return;
    if (!old.querySelector("canvas")) { old.outerHTML = wardrobeHtml(); } // his wardrobe came in after the first paint
    const accent = LevelUp.themeAccent() || "#5ee6a8", q = Math.min(window.devicePixelRatio || 1, 2), W = 132, H = 150;
    box.querySelectorAll("canvas[data-lv-look]").forEach((cv) => {
      const look = L.LOOKS[cv.dataset.lvLook];
      cv.width = W * q; cv.height = H * q;
      const ctx = cv.getContext("2d");
      ctx.setTransform(q, 0, 0, q, 0, 0);
      const sim = lib._createSim({ type: "rank", accent, glow: "transparent", short: false, hold: 999 }, W, H);
      sim.gripped = true; sim.burst = true; sim.t = 3.0; sim.step(0); // up in support, with a grin
      const up = Math.max(30, look.up + 3), down = Math.max(34, look.down + 3), wide = Math.max(32, look.side + 3);
      const R = sim.R, s = Math.min(H / (up + down), W / (wide * 2));
      sim.W = W; sim.H = H; sim.s = s; sim.ox = W / 2 - R.cx * s; sim.top = H / 2 - (R.rigY + R.sy - 35.5 + (down - up) / 2) * s;
      L.dress(ctx, () => look, () => ({ accent }));
      sim.draw(ctx);
    });
  }

  function paint() {
    if (!box) return;
    if (error) { box.innerHTML = `<section class="panel admin-panel"><div class="panel-head"><h2>Levelupy</h2></div><p class="form-error">${esc(error)}</p></section>${wardrobeHtml()}`; drawWardrobe(); return; }
    if (!data) { box.innerHTML = `<section class="panel admin-panel"><p class="muted">Loading…</p></section>`; return; }
    const month = new Date().toISOString().slice(0, 7);
    const thisMonth = data.spend.filter((s) => String(s.month).slice(0, 7) === month);
    const spent = thisMonth.reduce((n, s) => n + cost(s), 0);
    const answers = thisMonth.reduce((n, s) => n + Number(s.answers), 0);
    const mode = MODES.find((m) => m.id === data.mode) || MODES[0];
    // the last 30 days, also the ones without a question
    const byDay = new Map(data.days.map((d) => [String(d.day).slice(0, 10), Number(d.questions)]));
    const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10); return { day: d, questions: byDay.get(d) || 0 }; });
    const peak = Math.max(1, ...days.map((d) => d.questions));
    box.innerHTML = `
      <section class="panel admin-panel">
        <div class="panel-head"><h2>Levelupy <span class="count-chip">AI</span></h2><span class="status-chip ${data.mode === "off" ? "pending" : "confirmed"}">${esc(mode.name)}</span></div>
        <p class="muted">The mascot as an assistant in the chat. He answers questions about the app, the coaches and their hours, group classes,
          the shop, prices, and a member's own sessions and what is still to pay. He only reads: he never books, cancels or pays, and never
          sees the health questionnaire or body stats.</p>
        <div class="finance-kpis">
          <div class="kpi"><span class="kpi-label">Questions this month</span><span class="kpi-value">${num(data.month.questions)}</span><span class="kpi-note">of ${num(data.monthLimit)} at most · ${num(data.month.today)} today</span></div>
          <div class="kpi"><span class="kpi-label">Members who asked</span><span class="kpi-value">${num(data.month.members)}</span><span class="kpi-note">this month</span></div>
          <div class="kpi"><span class="kpi-label">Cost this month</span><span class="kpi-value">${usd(spent)}</span><span class="kpi-note">estimate from ${num(answers)} answers; the bill is on console.anthropic.com</span></div>
        </div>
        ${data.days.length ? `<div class="lv-days" aria-label="Questions per day, last 30 days">${days.map((d) => `<i style="--h:${Math.round(100 * Number(d.questions) / peak)}%" title="${esc(d.day)}: ${num(d.questions)}"></i>`).join("")}</div>
          <p class="muted small">Questions per day, the last 30 days.</p>` : ""}
      </section>

      <section class="panel admin-panel">
        <div class="panel-head"><h2>Settings</h2></div>
        <form class="lv-form" id="lvForm">
          <fieldset class="lv-modes">
            <legend>Who has Levelupy</legend>
            ${MODES.map((m) => `<label><input type="radio" name="mode" value="${m.id}" ${data.mode === m.id ? "checked" : ""}> <span><b>${esc(m.name)}</b><small>${esc(m.note)}</small></span></label>`).join("")}
          </fieldset>
          <label>Model that answers
            <select name="model">${MODELS.map((m) => `<option value="${m.id}" ${data.model === m.id ? "selected" : ""}>${esc(m.name)}: ${esc(m.note)} ($${m.inPrice} in / $${m.outPrice} out per million tokens)</option>`).join("")}</select>
          </label>
          <div class="lv-two">
            <label>Questions per member per day <input type="number" name="dailyLimit" min="1" max="200" value="${esc(String(data.dailyLimit))}" required></label>
            <label>Questions per month, everyone together <input type="number" name="monthLimit" min="10" max="100000" value="${esc(String(data.monthLimit))}" required></label>
          </div>
          <p class="muted small">The month limit is your budget: when it is reached Levelupy says he is back next month. A question costs roughly
            3 to 4 cents with Opus 5.5, about 2 cents with Sonnet 5.5 and a tenth of a cent with Haiku 5.5.</p>
          <label>What Levelupy knows about the gym
            <textarea name="knowledge" rows="14" maxlength="12000" spellcheck="false">${esc(data.knowledge)}</textarea>
          </label>
          <p class="muted small">Write it the way you would tell a new colleague: the gym, yourself, house rules, parking, what to bring. Prices, hours,
            coaches, classes and the shop come from the site itself, so leave those out. Members can ask about anything in this text.</p>
          ${st.formError ? `<p class="form-error">${esc(st.formError)}</p>` : ""}
          <div class="btn-row"><button type="submit" class="btn btn-primary" ${st.busy ? "disabled" : ""}>Save</button>${st.saved ? `<span class="muted small">${esc(st.saved)}</span>` : ""}</div>
        </form>
      </section>

      <section class="panel admin-panel">
        <div class="panel-head"><h2>What he could not answer ${data.gaps.length ? `<span class="count-chip">${data.gaps.length}</span>` : ""}</h2></div>
        <p class="muted small">Subjects in Levelupy's own words, without the member or the question itself. Add the answer to the text above and tick it off.</p>
        ${data.gaps.length ? `<ul class="lv-gaps">${data.gaps.map((g) => `<li><span>${esc(g.topic)}</span><small>${new Date(g.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small>
          <button type="button" class="btn btn-small btn-ghost" data-lv-gap="${g.id}">Done</button></li>`).join("")}</ul>` : `<p class="muted">Nothing open.</p>`}
      </section>

      <section class="panel admin-panel todo-panel">
        <div class="panel-head"><h2>Switching it on (once)</h2></div>
        <ol>
          <li>Make an account on <b>console.anthropic.com</b>, add a payment method and create an <b>API key</b>. A spending limit can be set there too.</li>
          <li>In Supabase: <b>Edge Functions → Secrets</b> → add <code>ANTHROPIC_API_KEY</code> with that key. It belongs only there: never in the website, a chat or an email.</li>
          <li>In Supabase: <b>Edge Functions → Deploy a new function → Via Editor</b>, name it <code>assistant</code>, paste the file <code>supabase/functions/assistant/index.ts</code>, and switch <b>Verify JWT</b> off.</li>
          <li>Keep "Trial: you and the coaches" on, open the chat and ask Levelupy a few things. Happy? Choose "On for all members".</li>
        </ol>
      </section>
      ${wardrobeHtml()}`;
    drawWardrobe();
  }

  document.addEventListener("submit", async (event) => {
    if (event.target.id !== "lvForm" || !box?.contains(event.target)) return;
    event.preventDefault();
    if (st.busy) return;
    const f = new FormData(event.target);
    st.busy = true; st.formError = ""; st.saved = "";
    const next = { mode: f.get("mode"), model: f.get("model"), dailyLimit: String(f.get("dailyLimit")), monthLimit: String(f.get("monthLimit")), knowledge: String(f.get("knowledge")).trim() };
    try {
      await LevelUp.adminAssistantSave(next);
      st.saved = `Saved at ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    } catch (err) { st.formError = err.message; Object.assign(data, { mode: next.mode, model: next.model, knowledge: next.knowledge }); }
    st.busy = false;
    await load();
  });
  document.addEventListener("click", async (event) => {
    const gap = event.target.closest("[data-lv-gap]");
    if (!gap || !box?.contains(gap)) return;
    gap.disabled = true;
    try { await LevelUp.adminAssistantGapDone(Number(gap.dataset.lvGap)); } catch (err) { alert(err.message); }
    await load();
  });

  window.LevelUpAssistantAdmin = {
    mount(el) {
      if (!el) return;
      box = el;
      paint();
      load();
    }
  };
})();
