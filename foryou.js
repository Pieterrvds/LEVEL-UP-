// LEVEL-UP: your own start screen ("For you").
// On a phone it is a page of its own, to the left of the home page (the first one in the bar at the bottom), and
// where a logged-in member lands. A visitor sees there what an account gives.
// On a computer it is the first tab of your account (profile.html), so one click on your name in the header.
// On it: your level with the mascot, your next step, your streak with the weekly check-in, your race on the high
// scores, what you have almost earned, group classes picked for you and what is new in the club.
//
// Every text goes through T(): the Dutch comes from i18n-nl.js, and a name or a number lands in the right place of
// the sentence. That is why the whole screen is marked data-no-i18n (the page translator leaves it alone).

(() => {
  const { esc } = LevelUp;
  const PHONE = window.matchMedia("(max-width: 760px)");
  const STILL = window.matchMedia("(prefers-reduced-motion: reduce)");
  const T = (s, ...args) => {
    let out = window.t ? window.t(s) : s;
    args.forEach((v, i) => { out = out.split(`{${i}}`).join(v); });
    return out;
  };
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const home = Boolean(document.getElementById("fyHome"));          // index.html: only on a phone
  const link = (hash) => (home ? `#${hash}` : `index.html#${hash}`); // a section of the home page
  const tabLink = (tab) => `href="profile.html#${tab}" data-fy-tab="${tab}"`; // a tab of your account

  let host = null;
  let built = false;
  let loadedFor = null;
  let busy = false;
  let mascot = null;
  const parts = {};   // the cards that are drawn again when their content changes
  const lastHtml = {};

  // ---------- Dates ----------
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysUntil = (d) => Math.round((dayStart(d) - dayStart(new Date())) / 864e5);
  const dayWord = (d) => {
    const n = daysUntil(d);
    if (n === 0) return T("today");
    if (n === 1) return T("tomorrow");
    return n < 7 ? d.toLocaleDateString("en-GB", { weekday: "long" }) : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };
  const inWord = (d) => {
    const n = daysUntil(d);
    return n === 0 ? T("today") : n === 1 ? T("tomorrow") : T("in {0} days", n);
  };
  const time = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  // ---------- Hello: your name, level and XP, with the mascot on his rings ----------
  function buildHello() {
    const el = document.createElement("section");
    el.className = "fy-card fy-hello";
    el.innerHTML = `
      <p class="fy-k">${T("For you")}</p>
      <h2 class="fy-hi"></h2>
      <div class="fy-rank"><span class="rank-badge"></span></div>
      <div class="fy-bar" role="progressbar" aria-valuemin="0"><i></i></div>
      <p class="fy-xp"><span data-fy-xp></span><span data-fy-left></span></p>
      <div class="fy-mascot" role="img" aria-label="${esc(T("The mascot on his rings: tap him for a rep"))}"><canvas></canvas></div>`;
    return el;
  }
  function updateHello(player) {
    const el = parts.hello;
    const p = LevelUp.progress(player.xp);
    const first = String(player.name || "").trim().split(/\s+/)[0] || "";
    el.querySelector(".fy-hi").innerHTML = `${T("Hey {0}", `<span>${esc(first)}</span>`)} 👋`;
    const badge = el.querySelector(".rank-badge");
    badge.dataset.tier = String(LevelUp.RANKS.indexOf(p.rank));
    badge.textContent = `LVL ${p.level} · ${p.rank.title}`;
    const bar = el.querySelector(".fy-bar");
    bar.setAttribute("aria-valuemax", p.needed);
    bar.setAttribute("aria-valuenow", p.into);
    bar.setAttribute("aria-label", T("XP to next level"));
    bar.firstElementChild.style.setProperty("--w", `${p.pct.toFixed(1)}%`);
    el.querySelector("[data-fy-xp]").innerHTML = `<b>${num(p.into)}</b> / ${num(p.needed)} XP`;
    el.querySelector("[data-fy-left]").innerHTML = T("{0} XP to LVL {1}", `<b>${num(p.toNext)}</b>`, p.level + 1);
  }

  // The mascot is the gymnast of the celebrations (levelup-celebrate.js), drawn on a small canvas: he hangs on his
  // rings, does a rep when you tap him and a muscle-up when you check in. Without the file the corner stays empty.
  async function startMascot() {
    const box = parts.hello.querySelector(".fy-mascot");
    const cv = box.querySelector("canvas");
    try {
      const lib = await LevelUp.loadCelebrate();
      const sim = lib._createSim({ type: "rank", accent: LevelUp.themeAccent() || "#C6FF3D", glow: "#ffd23f", short: false, hold: 999 }, 10, 10);
      let ctx = null, w = 0, h = 0, raf = 0;
      const HANG = 0.7, REP = 1.2, TOP = 2.1;
      const fit = () => {
        const r = box.getBoundingClientRect();
        if (!r.width || !r.height || (r.width === w && r.height === h)) return Boolean(ctx);
        w = r.width; h = r.height;
        const q = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = Math.round(w * q); cv.height = Math.round(h * q);
        ctx = cv.getContext("2d");
        ctx.setTransform(q, 0, 0, q, 0, 0);
        sim.resize(w, h, 1);
        sim.s = Math.min(w / 190, h / 440); sim.ox = w / 2; sim.top = -22 * sim.s;
        sim.draw(ctx);
        return true;
      };
      const move = (from, to, ms, then) => {
        cancelAnimationFrame(raf);
        if (!fit()) return;
        if (STILL.matches) { sim.t = HANG; sim.R = null; sim.draw(ctx); return; }
        const t0 = performance.now();
        const step = (now) => {
          const u = Math.min(1, (now - t0) / ms), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          sim.t = from + (to - from) * e; sim.R = null; sim.draw(ctx);
          if (u < 1) raf = requestAnimationFrame(step); else if (then) then();
        };
        raf = requestAnimationFrame(step);
      };
      sim.t = HANG;
      mascot = {
        fit,
        rep: () => move(HANG, REP, 260, () => move(REP, HANG, 340)),
        cheer: () => move(HANG, TOP, 900, () => setTimeout(() => move(TOP, HANG, 700), 650))
      };
      box.addEventListener("click", () => mascot.rep());
      window.addEventListener("resize", fit);
      if (fit() && !STILL.matches) { sim.t = 0.02; move(0.02, HANG, 650, () => setTimeout(mascot.rep, 500)); }
    } catch (err) {
      box.hidden = true;
      parts.hello.classList.add("no-mascot");
    }
  }

  // ---------- Your next step: the first session or class that is coming, or a push to plan one ----------
  function nextHtml(player) {
    const now = new Date();
    const head = (when) => `<p class="fy-k">${T("Your next step")}${when ? ` <small>${esc(when)}</small>` : ""}</p>`;
    // a coach first sees who is waiting for an answer
    if (LevelUp.isTrainer()) {
      const requests = LevelUp.getCoachBookings().filter((b) => b.status === "pending" && LevelUp.slotStart(b.date, b.hour) > now);
      if (requests.length) {
        const first = requests[0];
        return `${head("")}
          <div class="fy-next"><span class="fy-ico" aria-hidden="true">📥</span>
            <div><b>${requests.length === 1 ? T("1 request is waiting for your answer") : T("{0} requests are waiting for your answer", requests.length)}</b>
            <span>${esc(first.name || "")} · ${esc(dayWord(LevelUp.slotStart(first.date, first.hour)))} · ${String(first.hour).padStart(2, "0")}:00</span></div></div>
          <div class="fy-acts"><a class="btn btn-small btn-primary" ${tabLink("coach")}>${T("Answer ▸")}</a></div>`;
      }
    }
    const sessions = LevelUp.playerBookings()
      .filter((b) => ["awaiting_payment", "pending", "confirmed"].includes(b.status) && LevelUp.slotStart(b.date, b.hour) > now)
      .map((b) => ({ at: LevelUp.slotStart(b.date, b.hour), booking: b }));
    const classes = (player.classes || [])
      .filter((c) => c.status === "scheduled" && c.start > now && ["booked", "awaiting_payment", "waitlist"].includes(c.mine?.status))
      .map((c) => ({ at: c.start, cls: c }));
    const coaching = LevelUp.isTrainer()
      ? LevelUp.getCoachBookings().filter((b) => b.status === "confirmed" && LevelUp.slotStart(b.date, b.hour) > now)
          .map((b) => ({ at: LevelUp.slotStart(b.date, b.hour), coach: b }))
      : [];
    const next = [...sessions, ...classes, ...coaching].sort((a, b) => a.at - b.at)[0];

    if (!next) {
      const free = LevelUp.availableVouchers(player).length;
      const intro = player.introEligible && !LevelUp.isTrainer();
      return `${head("")}
        <div class="fy-next"><span class="fy-ico" aria-hidden="true">${free ? "🎁" : "📅"}</span>
          <div><b>${free ? T("A free session is waiting for you") : T("Nothing planned yet")}</b>
          <span>${free ? T("Pick an hour with a coach: this one is on us.")
            : intro ? T("Pick an hour with a coach. Your first session is {0}.", esc(LevelUp.euro(LevelUp.getPricing().introPrice)))
            : T("Pick an hour with a coach or join a group class.")} <strong class="fy-plus">+${LevelUp.SESSION_XP} XP</strong></span></div></div>
        <div class="fy-acts">
          <a class="btn btn-small btn-primary" href="${link("schedule")}">${T("▶ Book a session")}</a>
          <a class="btn btn-small btn-ghost" href="${link("team")}">${T("Meet the coaches")}</a>
        </div>`;
    }
    if (next.coach) {
      const b = next.coach;
      return `${head(inWord(next.at))}
        <div class="fy-next"><span class="fy-ico" aria-hidden="true">🏋️</span>
          <div><b>${esc(dayWord(next.at))} · ${time(next.at)}</b>
          <span>${T("You coach {0}", `<span>${esc(b.name || T("a player"))}</span>`)} · ${T("1 hour")}</span></div></div>
        <div class="fy-acts"><a class="btn btn-small btn-primary" ${tabLink("coach")}>${T("Open your coach tab")}</a></div>`;
    }
    if (next.cls) {
      const c = next.cls;
      const t = LevelUp.trainerById(c.trainerId);
      const state = c.mine.status === "waitlist" ? T("You're #{0} on the waitlist", c.mine.waitPos)
        : c.mine.status === "awaiting_payment" ? T("Not paid yet") : "";
      return `${head(inWord(next.at))}
        <div class="fy-next" style="--c:${esc(t?.color || "")}">
          ${t?.img ? `<img src="${esc(t.img)}" alt="">` : `<span class="fy-ico" aria-hidden="true">👥</span>`}
          <div><b>${esc(dayWord(next.at))} · ${esc(c.time)}</b>
          <span>${t ? T("{0} · with {1}", `👥 ${esc(c.title)}`, esc(t.short)) : `👥 ${esc(c.title)}`} · <strong class="fy-plus">+${c.xp} XP</strong>${state ? ` · ${esc(state)}` : ""}</span></div></div>
        <div class="fy-acts">
          <button type="button" class="btn btn-small btn-primary" data-fy-class="${esc(c.id)}">${T("View class")}</button>
          ${c.chatId && c.chatOpen && c.mine.status !== "waitlist" ? `<a class="btn btn-small btn-ghost" href="chat.html?t=${encodeURIComponent(c.chatId)}">💬 ${T("Group chat")}</a>` : ""}
        </div>`;
    }
    const b = next.booking;
    const t = LevelUp.trainerById(b.trainerId);
    const state = b.status === "pending" ? T("Waiting for confirmation") : b.status === "awaiting_payment" ? T("Not paid yet") : "";
    return `${head(inWord(next.at))}
      <div class="fy-next" style="--c:${esc(t?.color || "")}">
        ${t?.img ? `<img src="${esc(t.img)}" alt="">` : `<span class="fy-ico" aria-hidden="true">📅</span>`}
        <div><b>${esc(dayWord(next.at))} · ${String(b.hour).padStart(2, "0")}:00</b>
        <span>${T(b.kind === "duo" ? "Duo session with {0}" : "1:1 with {0}", esc(t?.short || ""))} · ${T("1 hour")} · <strong class="fy-plus">+${LevelUp.SESSION_XP} XP</strong>${state ? ` · ${esc(state)}` : ""}</span></div></div>
      <div class="fy-acts">
        <a class="btn btn-small btn-primary" ${tabLink("overview")}>${T("View session")}</a>
        ${t && t.linked !== false && player.trainerId !== t.id ? `<button type="button" class="btn btn-small btn-ghost" data-chat-trainer="${esc(t.id)}">💬 ${T("Chat with {0}", esc(t.short))}</button>` : ""}
      </div>`;
  }

  // ---------- Your streak, with the weekly check-in ----------
  function streakHtml(player) {
    const s = player.streak;
    const c = player.checkin; // null: the server doesn't know the check-in yet
    const weeks = s.weeks;
    // five weeks in a row as dashes; this week is dashed until it counts
    const filled = Math.min(weeks, s.thisWeek ? 5 : 4);
    const dashes = Array.from({ length: 5 }, (_, i) => i < filled ? "on" : i === filled && !s.thisWeek ? "now" : "").map((k) => `<i class="${k}"></i>`).join("");
    let note;
    if (s.thisWeek) note = weeks <= 1 ? T("Week 1 is in. Come back next week and your streak starts to grow.") : T("Nice! Your streak is at {0}.", `<b>${weeks} ${T("weeks")}</b>`);
    else if (s.planned) note = T("Your session this week keeps your streak going.");
    else if (weeks >= 1) note = T(c ? "Train or check in {0} and your streak grows to {1}." : "Train {0} and your streak grows to {1}.", `<b>${new Date().getDay() === 0 ? T("today") : T("before Sunday")}</b>`, `${weeks + 1} ${T("weeks")}`);
    else note = T(c ? "Train or check in this week to start your streak." : "Train this week to start your streak.");
    const next = c?.done ? LevelUp.startOfWeek(1) : null;
    return `
      <p class="fy-k">${T("Your streak")}</p>
      <p class="fy-big"><span aria-hidden="true">🔥</span> ${weeks} <small>${weeks === 1 ? T("week") : T("weeks")}</small></p>
      <div class="fy-week" aria-hidden="true">${dashes}</div>
      <p class="fy-note">${note}</p>
      ${c ? `<div class="fy-acts">${c.done
        ? `<button type="button" class="btn btn-small fy-checked" disabled>${T("Checked in ✓")}</button>`
        : `<button type="button" class="btn btn-small btn-primary" data-fy-checkin>${T("Check in")} · +${c.xp} XP</button>`}</div>
        ${c.done ? `<p class="fy-note fy-again">${T("Next check-in from {0}", esc(next.toLocaleDateString("en-GB", { weekday: "long" })))}</p>` : ""}` : ""}`;
  }

  // ---------- Your race: you between the players just above and below you on the high scores ----------
  function raceHtml(player, data) {
    if (!data) return `<p class="fy-k">${T("Your race")}</p><p class="fy-note">${T("Loading…")}</p>`;
    const rows = data.race || [];
    const list = `<ol class="fy-race">${rows.map((r) => `
      <li class="${r.isMe ? "me" : ""}"><span>${r.place}</span><b>${r.isMe ? T("You") : esc(r.name)}</b><em>${num(r.xp)}</em></li>`).join("")}</ol>`;
    const more = `<a class="text-link fy-more" href="${link("scores")}">${T("High scores ▸")}</a>`;
    if (!data.ranked) {
      return `<p class="fy-k">${T("High scores")}</p>${rows.length ? list : ""}
        <p class="fy-note">${LevelUp.isTrainer() ? T("Coaches aren't ranked: this is the top 3 right now.")
          : `${T("You're hidden from the high scores.")} <a class="text-link" ${tabLink("me")}>${T("Change this in your settings")}</a>`}</p>${more}`;
    }
    const i = rows.findIndex((r) => r.isMe);
    const me = rows[i], above = rows[i - 1], below = rows[i + 1];
    let note = T("You're the first on the board. Keep going!");
    if (above) note = above.xp > me.xp ? T("{0} to go and you pass {1}.", `<b>${num(above.xp - me.xp)} XP</b>`, `<span>${esc(above.name)}</span>`)
      : T("You're level with {0}: your next XP puts you ahead.", `<span>${esc(above.name)}</span>`);
    else if (below) note = T("You're in the lead, {0} ahead of {1}.", `<b>${num(me.xp - below.xp)} XP</b>`, `<span>${esc(below.name)}</span>`);
    return `<p class="fy-k">${T("Your race")}</p>${list}<p class="fy-note">${note}</p>${more}`;
  }

  // ---------- Almost there: the rewards and achievements you are closest to ----------
  function goals(player, data) {
    const out = [];
    const r = player.rewards;
    const open = LevelUp.availableVouchers(player).length;
    const stamped = r.count % r.every;
    if (open) out.push({ icon: "🎁", title: open === 1 ? T("A free session is ready") : T("{0} free sessions are ready", open), note: T("Book it on the schedule"), have: 1, need: 1, gold: true, href: `href="${link("schedule")}"`, side: T("Book ▸") });
    out.push({ icon: "🎁", title: T("Free session"), note: r.every - stamped === 1 ? T("1 more session to go") : T("{0} more sessions to go", r.every - stamped),
      have: stamped, need: r.every, gold: true, href: tabLink("rewards") });
    const p = LevelUp.progress(player.xp);
    if (p.nextRank) {
      const from = LevelUp.xpForLevel(p.rank.level), to = LevelUp.xpForLevel(p.nextRank.level);
      out.push({ icon: "⬆", title: T("Rank: {0}", esc(p.nextRank.title)), note: T("LVL {0} · {1} XP to go", p.nextRank.level, num(to - player.xp)),
        have: player.xp - from, need: to - from, side: `LVL ${p.nextRank.level}`, href: tabLink("rewards") });
    }
    const inv = player.inventory || {};
    const own = (...ids) => ids.filter((id) => inv[id] > 0).length;
    const done = LevelUp.playerBookings().filter((b) => b.status === "completed").length;
    const progress = {
      stats_saved: [player.bodyStats.length ? 1 : 0, 1, tabLink("body")],
      checkins_4: [player.checkin ? player.checkin.weeks : new Set(player.bodyStats.map((b) => LevelUp.dateKey(LevelUp.startOfWeek(0, LevelUp.parseDate(b.date))))).size, 4, ""],
      first_session: [Math.max(done, player.sessionsBooked), 1, `href="${link("schedule")}"`],
      sessions_5: [Math.max(done, player.sessionsBooked), 5, `href="${link("schedule")}"`],
      full_party: [data ? data.trainersDone : 0, 3, `href="${link("team")}"`],
      first_loot: [player.purchases.length ? 1 : 0, 1, `href="shop.html"`],
      full_drip: [own("tshirt", "hoodie"), 2, `href="shop.html"`],
      home_gym: [own("parallettes", "bands"), 2, `href="shop.html"`]
    };
    LevelUp.ACHIEVEMENTS.filter((a) => !player.achievements[a.id] && progress[a.id]).forEach((a) => {
      const [have, need, href] = progress[a.id];
      out.push({ icon: "🏅", title: T("Achievement: {0}", esc(T(a.title))), note: `${esc(T(a.desc))} · +${a.xp} XP`, have: Math.min(have, need), need, href, ach: true });
    });
    // the closest first; a member who is just starting sees the first steps
    return out.map((g, i) => ({ ...g, pct: g.need ? g.have / g.need : 0, i }))
      .sort((a, b) => b.pct - a.pct || a.i - b.i).slice(0, 3);
  }
  function goalsHtml(player, data) {
    const list = goals(player, data);
    const close = list.some((g) => g.pct >= 0.5);
    return `<p class="fy-k">${close ? T("Almost there") : T("Your next goals")}</p>
      ${list.map((g) => {
        const inner = `
          <span class="fy-ico" aria-hidden="true">${g.icon}</span>
          <div><b>${g.title}</b><span class="fy-note">${g.note}</span><div class="fy-bar ${g.gold ? "gold" : ""}"><i style="--w:${Math.round(g.pct * 100)}%"></i></div></div>
          <em>${g.side || `${num(g.have)} / ${num(g.need)}`}</em>`;
        return g.href ? `<a class="fy-goal" ${g.href}>${inner}</a>` : `<div class="fy-goal">${inner}</div>`;
      }).join("")}`;
  }

  // ---------- Picked for you: group classes that fit you (your coach, a class you did before, few places left) ----------
  function picksHtml(player) {
    const now = new Date();
    const mine = player.classes || [];
    const myCoaches = new Set(LevelUp.playerBookings().filter((b) => ["completed", "confirmed"].includes(b.status)).map((b) => b.trainerId));
    const key = (title) => String(title || "").trim().replace(/\s+/g, " ").toLowerCase();
    const didBefore = new Set(mine.filter((c) => c.mine?.status === "attended").map((c) => key(c.title)));
    const list = (LevelUp.getClasses() || [])
      .filter((c) => c.status === "scheduled" && c.start > now && !c.mine && c.trainerId !== player.trainerId)
      .map((c) => {
        const left = Math.max(0, c.capacity - c.taken);
        const tag = didBefore.has(key(c.title)) ? T("You did this one before") : myCoaches.has(c.trainerId) ? T("With your coach")
          : left === 0 ? T("Full · waitlist") : left <= 3 ? (left === 1 ? T("Last place") : T("{0} places left", left)) : T("{0} places free", left);
        const score = (didBefore.has(key(c.title)) ? 4 : 0) + (myCoaches.has(c.trainerId) ? 3 : 0) + (left === 0 ? -5 : left <= 3 ? 1 : 0) - daysUntil(c.start) / 7;
        return { c, tag, score };
      })
      .sort((a, b) => b.score - a.score || a.c.start - b.c.start);
    // one card per kind of class, so the row shows what there is to choose from
    const seen = new Set();
    const picks = list.filter((x) => !seen.has(key(x.c.title)) && seen.add(key(x.c.title))).slice(0, 4).sort((a, b) => a.c.start - b.c.start);
    if (picks.length) {
      return `<p class="fy-k">${T("Picked for you")}${picks.length > 1 ? ` <small class="fy-swipe">${T("swipe ▸")}</small>` : ""}</p>
        <div class="fy-row">${picks.map(({ c, tag }) => {
          const t = LevelUp.trainerById(c.trainerId);
          return `
          <article class="fy-class" style="--img:url('${esc(LevelUp.classPhoto(c.title))}')">
            <span class="fy-tag">${esc(tag)}</span>
            <h3>${esc(c.title)}</h3>
            <p>${t ? T("{0} · {1} · with {2}", esc(dayWord(c.start)), esc(c.time), esc(t.short)) : `${esc(dayWord(c.start))} · ${esc(c.time)}`}</p>
            <div class="fy-join"><button type="button" class="btn btn-small btn-primary" data-fy-class="${esc(c.id)}">${LevelUp.classFull(c) ? T("Join the waitlist") : T("Sign me up")}</button>
              <span class="xp-chip">+${c.xp} XP</span><span class="fy-price">${c.price > 0 ? esc(LevelUp.euro(c.price)) : T("Free")}</span></div>
          </article>`;
        }).join("")}</div>`;
    }
    // no group class planned: the coaches, each with their calendar one tap away
    const coaches = LevelUp.TRAINERS.filter((t) => t.id !== player.trainerId).slice(0, 4);
    return `<p class="fy-k">${T("Picked for you")}${coaches.length > 1 ? ` <small class="fy-swipe">${T("swipe ▸")}</small>` : ""}</p>
      <div class="fy-row">${coaches.map((t) => `
        <article class="fy-class fy-coach" style="--img:url('${esc(t.img)}')">
          ${myCoaches.has(t.id) ? `<span class="fy-tag">${T("Your coach")}</span>` : ""}
          <h3>${esc(t.short)}</h3>
          <p>${esc(T(t.role || "Personal trainer"))}</p>
          <div class="fy-join"><a class="btn btn-small btn-primary" href="profile.html?trainer=${encodeURIComponent(t.id)}#book">${T("Book {0}", esc(t.short))} ▸</a>
            <span class="xp-chip">+${LevelUp.SESSION_XP} XP</span></div>
        </article>`).join("")}</div>`;
  }

  // ---------- From the club: the latest posts (photos with a text, hearts and comments) and the latest news ----------
  function clubHtml(player, data) {
    const posts = (data?.photos || []).slice(0, 6);
    const news = (LevelUp.getNews() || [])[0];
    const newsHtml = news ? `
      <button type="button" class="fy-news" data-fy-news>${/^[A-Za-z0-9]/.test(news.title || "") ? `<span aria-hidden="true">📣</span>` : ""}<span><b>${esc(T(news.title || ""))}</b><span>${esc(T(news.body || ""))}</span></span></button>` : "";
    const empty = !posts.length ? `
      <div class="fy-empty"><p class="fy-note">${T("No posts yet. Be the first to show how you train.")}</p></div>` : "";
    return `<p class="fy-k">${T("From the club")}<button type="button" class="btn btn-small btn-ghost fy-post-new" data-fy-post>＋ ${T("New post")}</button></p>
      ${newsHtml}${empty}
      <div class="fy-posts">${posts.map((ph, i) => LevelUpPosts.cardHtml(ph, { owner: true, remove: ph.mine ? "mine" : "", size: postSize(ph, i, posts) })).join("")}</div>`;
  }
  // A computer shows the posts as a grid of big and small ones, at most three next to each other. Which post is big
  // looks random but follows from the post itself, so it doesn't jump around every time the screen draws again.
  // (A phone ignores it: there the posts stand under each other, all as wide as the screen.)
  function postSize(post, i, all) {
    const hash = (id) => [...String(id)].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const big = (p) => hash(p.id) % 3 === 0;
    if (!all.some(big)) return i === (hash(all[0].id) % Math.min(all.length, 3)) ? "l" : "s"; // never all the same size
    return big(post) ? "l" : "s";
  }
  // The posts on this screen, for posts.js
  const postStore = {
    find: (id) => (LevelUp.getForYou()?.photos || []).find((ph) => ph.id === id),
    put(fresh) {
      const data = LevelUp.getForYou();
      if (!data) return;
      data.photos = data.photos.map((ph) => (ph.id === fresh.id ? { ...ph, ...fresh, urls: fresh.urls || ph.urls, comments: fresh.comments || [], ownerTrainerId: fresh.ownerTrainerId || ph.ownerTrainerId } : ph));
      draw(true);
    },
    removed() { draw(true); },
    askRemove: () => "Remove this post from your page?"
  };

  // ---------- Drawing ----------
  function build() {
    host.setAttribute("data-no-i18n", "");
    host.innerHTML = "";
    parts.hello = buildHello();
    host.appendChild(parts.hello);
    const card = (name, cls = "") => {
      const el = document.createElement("section");
      el.className = `fy-card ${cls}`.trim();
      parts[name] = el;
      return el;
    };
    host.appendChild(card("next"));
    const duo = document.createElement("div");
    duo.className = "fy-duo";
    duo.append(card("streak"), card("race"));
    host.appendChild(duo);
    host.append(card("goals"), card("picks", "fy-wide"), card("club", "fy-club"));
    built = true;
    startMascot();
  }
  const set = (name, html, now = false) => {
    if (lastHtml[name] === html) return; // unchanged: the card (and a swipe row halfway) stays as it is
    // someone is writing a comment: the posts stay as they are until it is sent (or they tapped something themselves)
    if (name === "club" && !now && parts.club.querySelector(".mp-comment-form input:focus, .mp-comment-form input:not(:placeholder-shown)")) return;
    lastHtml[name] = html;
    parts[name].innerHTML = html;
  };
  const shown = () => host && !host.hidden && (!home || PHONE.matches); // a phone: also while another page is on screen (it slides in under a finger)

  // A visitor on the phone page: what an account gives, and the way in
  function guestHtml() {
    const row = (icon, title, text) => `<li><span class="fy-ico" aria-hidden="true">${icon}</span><div><b>${title}</b><span class="fy-note">${text}</span></div></li>`;
    return `
      <section class="fy-card fy-guest">
        <p class="fy-k">${T("For you")}</p>
        <h2 class="fy-hi">${T("Your own start screen")}</h2>
        <p class="fy-note">${T("Create your free player and this page becomes yours.")}</p>
        <ul class="fy-perks">
          ${row("📅", T("Your next step"), T("Your next session or group class, one tap away."))}
          ${row("🔥", T("Your streak"), T("Check in every week: +25 XP and your streak grows."))}
          ${row("🏆", T("Your race"), T("See who is just ahead of you on the high scores."))}
          ${row("🎁", T("Almost there"), T("Free sessions and achievements you are close to."))}
        </ul>
        <div class="fy-acts">
          <button type="button" class="btn btn-small btn-primary" data-auth-open="signup">${T("Create your player")}</button>
          <button type="button" class="btn btn-small btn-ghost" data-auth-open="login">${T("Log in")}</button>
        </div>
      </section>`;
  }

  function draw(now = false) {
    if (!host) return;
    const player = LevelUp.getPlayer();
    if (!player || !LevelUp.isReady()) {
      if (LevelUp.isReady()) {
        loadedFor = null;
        if (home && shown()) { // a visitor: the page says what an account gives
          built = false; mascot = null;
          Object.keys(lastHtml).forEach((k) => delete lastHtml[k]);
          host.setAttribute("data-no-i18n", "");
          if (lastHtml.guest !== "1") { lastHtml.guest = "1"; host.innerHTML = guestHtml(); }
        }
      }
      return;
    }
    if (!shown()) return; // on a computer, and on the other phone pages, nothing is built here
    if (!built) { delete lastHtml.guest; build(); }
    if (loadedFor !== player.id) {
      loadedFor = player.id;
      LevelUp.loadForYou().then(draw);
      if (!LevelUp.getClassKinds().length) LevelUp.loadClassKinds().then(draw);
    }
    const data = LevelUp.getForYou();
    updateHello(player);
    set("next", nextHtml(player));
    set("streak", streakHtml(player));
    set("race", raceHtml(player, data));
    set("goals", goalsHtml(player, data));
    set("picks", picksHtml(player));
    set("club", clubHtml(player, data), now === true);
    mascot?.fit();
  }

  // ---------- What you can tap ----------
  async function checkIn(button) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      const r = await LevelUp.checkIn();
      mascot?.cheer();
      if (!r.xp) LevelUp.toast({ title: T("Already checked in"), text: T("You can check in again on Monday."), icon: "✓", tone: "gold" });
    } catch (err) {
      LevelUp.toast({ title: T("Check-in failed"), text: err.message, icon: "!", tone: "gold" });
      button.disabled = false;
    } finally {
      busy = false;
      draw();
    }
  }
  function onClick(event) {
    const check = event.target.closest("[data-fy-checkin]");
    if (check) { checkIn(check); return; }
    if (event.target.closest("[data-fy-post]")) { LevelUpPosts.compose(); return; }
    if (event.target.closest("[data-post]")) { LevelUpPosts.handleClick(event, postStore); return; }
    const cls = event.target.closest("[data-fy-class]");
    if (cls) {
      if (window.LevelUpSchedule?.openClass && LevelUp.classById(cls.dataset.fyClass)) window.LevelUpSchedule.openClass(cls.dataset.fyClass);
      else location.href = "index.html#schedule";
      return;
    }
    if (event.target.closest("[data-fy-news]")) { LevelUp.openNews(); return; }
    const tab = event.target.closest("[data-fy-tab]");
    if (tab && window.LevelUpProfile?.openTab) { event.preventDefault(); window.LevelUpProfile.openTab(tab.dataset.fyTab); }
  }

  function mount(el) {
    if (!el || host === el) return;
    host = el;
    host.classList.add("fy");
    host.addEventListener("click", onClick);
    host.addEventListener("submit", (event) => LevelUpPosts.handleSubmit(event, postStore));
    draw();
  }

  document.addEventListener("levelup:change", () => draw());
  document.addEventListener("levelup:view", () => draw()); // the phone page comes into view
  PHONE.addEventListener?.("change", () => draw());
  if (home) mount(document.getElementById("fyHome"));
  window.LevelUpForYou = { mount, draw };
})();
