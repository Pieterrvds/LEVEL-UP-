// Home page behaviour. Shared HUD, login and XP logic lives in game.js.

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ===== Rotating class name in the hero =====
const classRotator = document.getElementById("classRotator");
const classes = ["CROSSFIT", "CALISTHENICS", "HIIT", "MUAY THAI", "TRIATHLON", "CYCLING"];
let classIndex = 0;

setInterval(() => {
  classRotator.classList.add("swap");
  setTimeout(() => {
    classIndex = (classIndex + 1) % classes.length;
    classRotator.textContent = classes[classIndex];
    classRotator.classList.remove("swap");
  }, prefersReducedMotion ? 0 : 250);
}, 2200);

// ===== Active nav link =====
const navLinks = document.querySelectorAll('#nav a[href^="#"]');
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    navLinks.forEach(link => {
      link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`);
    });
  });
}, { rootMargin: "-45% 0px -50% 0px" });

document.querySelectorAll("main section[id]").forEach(section => sectionObserver.observe(section));

// ===== Reveal on scroll =====
const revealTargets = document.querySelectorAll(
  ".section-title, .section-intro, .quest-steps li, .class-grid, .team-grid, .contact-form, .xp-board, .high-scores"
);
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("in");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

revealTargets.forEach(el => {
  el.classList.add("reveal");
  revealObserver.observe(el);
});

// ===== "Select class" buttons pre-fill the contact form =====
const subjectSelect = document.getElementById("subject");
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-subject]");
  if (button) subjectSelect.value = button.dataset.subject;
});

// ===== Level 2: the trainings =====
// First one card per kind of group training (from the server: made when a class with a new name is planned),
// then the personal trainings below. Filters: group / personal, and per trainer. A tap on a card opens a
// window with more about that training; the button on the card goes straight to booking.
(function trainings() {
  const grid = document.getElementById("classGrid");
  const filters = document.getElementById("classFilters");
  const toggle = document.getElementById("classToggle");
  const empty = document.getElementById("classEmpty");
  if (!grid) return;
  const { esc, euro } = LevelUp;
  const tr = (text) => (window.t ? window.t(text) : text);
  const state = { kind: "all", trainer: "all", open: false };

  // The personal trainings: 1:1 with a coach. stats = strength, endurance, technique (out of 5).
  const PERSONAL = [
    { id: "crossfit", title: "CrossFit", badge: "All-round", img: "img/jimsgroepstraining.jpg", stats: [4, 4, 3], trainer: "pieter",
      about: "Strength, conditioning and skills in one session: barbells, kettlebells, gymnastics and short, hard workouts. Every exercise is scaled to your level.",
      points: ["Get fit all-round: stronger, fitter and more agile", "Learn the lifts with good technique", "Every session is different"] },
    { id: "calisthenics", title: "Calisthenics", badge: "Skill", img: "img/calipersonal.jpg", stats: [4, 2, 5], trainer: "pieter",
      about: "Training with your own body weight: pull-ups, dips, handstands and step by step towards skills like the muscle-up or the front lever.",
      points: ["Build strength and body control", "Clear steps towards your first skill", "Little equipment needed, so you can keep practising at home"] },
    { id: "hiit", title: "HIIT", badge: "Intervals", img: "img/HIIT.JPG", stats: [2, 5, 2], trainer: "pieter",
      about: "Short bursts of hard work with short breaks in between. A lot of result in little time, at a pace that fits you.",
      points: ["Better condition and fat burning", "Done in under an hour", "No experience needed"] },
    { id: "muaythai", title: "Muay Thai", badge: "Combat", img: "img/muaythay.jpg", stats: [3, 4, 5], trainer: "pieter",
      about: "Thai boxing on the pads: punches, kicks, knees and elbows. Technique first, then combinations and conditioning rounds.",
      points: ["Learn to punch and kick the right way", "A full-body workout that clears your head", "No sparring needed"] },
    { id: "triathlon", title: "Triathlon", badge: "Endurance", img: "img/filipironmancoach.jpg", pos: "20%", stats: [2, 5, 3], trainer: "filip",
      about: "Swimming, cycling and running with an Ironman finisher: technique, a plan that builds up and the strength work that keeps you injury-free.",
      points: ["From your first quarter to the full distance", "A training plan around your week", "Tips on gear, food and race day"] },
    { id: "cycling", title: "Cycling", badge: "Endurance", img: "img/teammembermaximtrui.jpg", pos: "30%", stats: [3, 5, 2], trainer: "maxim",
      about: "Faster and longer on the bike: intervals, climbing, position on the bike and the strength training cyclists often skip.",
      points: ["More power in the legs", "Structure in your rides", "For road, gravel and your first sportive"] }
  ];
  // A kind of group training without a photo or text of its own gets one that fits its name (game.js)
  const { GROUP_LOOKS, GROUP_DEFAULT } = LevelUp;

  const coach = (id) => LevelUp.trainerById(id);
  const names = (ids) => ids.map((id) => coach(id)?.short).filter(Boolean);
  const faces = (ids) => ids.map((id) => coach(id)).filter(Boolean).map((t) => `<img data-coach="${esc(t.id)}" src="${esc(t.img)}" alt="" loading="lazy">`).join("");
  const when = (c) => `${c.day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${c.time}`;

  // Everything that can be on a card: the group trainings first
  function items() {
    const upcoming = (LevelUp.getClasses() || []).filter((c) => c.status === "scheduled" && c.start > new Date());
    const key = (title) => String(title || "").trim().replace(/\s+/g, " ").toLowerCase();
    const groups = (LevelUp.getClassKinds() || []).map((k) => {
      const look = GROUP_LOOKS.find(([re]) => re.test(k.title));
      const sessions = upcoming.filter((c) => key(c.title) === k.key).sort((a, b) => a.start - b.start);
      const trainers = [...new Set([...sessions.map((c) => c.trainerId), ...(k.trainers || [])])].filter((id) => coach(id));
      return { id: `g:${k.key}`, group: true, title: k.title, badge: "Group", img: k.photoUrl || look?.[1] || GROUP_DEFAULT[0],
        pos: k.photoUrl ? "" : look?.[3] || "", about: k.description || look?.[2] || GROUP_DEFAULT[1], ownText: Boolean(k.description), trainers, sessions };
    });
    return [...groups, ...PERSONAL.map((p) => ({ ...p, trainers: [p.trainer] }))];
  }
  const shown = (list) => list.filter((x) => (state.kind === "all" || (state.kind === "group") === Boolean(x.group))
    && (state.trainer === "all" || x.trainers.includes(state.trainer)));

  function card(x) {
    const who = names(x.trainers);
    const next = x.sessions?.[0];
    return `
      <article class="class-card ${x.group ? "class-card-kind" : ""}" data-training="${esc(x.id)}" tabindex="0" role="button" aria-haspopup="dialog" aria-label="${esc(x.title)}: ${esc(tr("more info"))}">
        <div class="class-media" style="--img:url('${esc(x.img)}')${x.pos ? `; --pos:${x.pos}` : ""}">${x.group ? `<span class="class-flag">👥 Group class</span>` : ""}</div>
        <div class="class-body">
          <div class="class-head"><h3 ${x.group ? "data-no-i18n" : ""}>${esc(x.title)}</h3><span class="badge">${esc(x.badge)}</span></div>
          ${x.group ? `<p class="class-next">${next
              ? `<b>Next</b> <span>${esc(when(next))}</span> <span class="class-places">${next.taken}/${next.capacity}</span>`
              : `<span>New dates coming soon</span>`}</p>`
            : `<ul class="class-stats">${["STR", "END", "TEC"].map((label, i) => `<li><span>${label}</span><i class="pips" style="--v:${x.stats[i]}" aria-label="${x.stats[i]} of 5"></i></li>`).join("")}</ul>`}
          ${who.length ? `<div class="class-coach"><span class="coach-faces">${faces(x.trainers)}</span><span>Coached by <strong data-no-i18n>${esc(who.join(", ").replace(/, ([^,]*)$/, " & $1"))}</strong></span></div>` : ""}
          <div class="class-actions">
            ${x.group
              ? `<button type="button" class="btn btn-small btn-primary" data-training-open="${esc(x.id)}">${next ? "Sign up ▶" : "More info ▶"}</button>`
              : `<a href="#schedule" class="btn btn-small btn-primary" data-book-trainer="${esc(x.trainer)}">Book this training ▶</a>`}
            <span class="class-more" aria-hidden="true">More info ›</span>
          </div>
        </div>
      </article>`;
  }

  function renderFilters(list) {
    const withTraining = LevelUp.TRAINERS.filter((t) => list.some((x) => x.trainers.includes(t.id)));
    if (state.trainer !== "all" && !withTraining.some((t) => t.id === state.trainer)) state.trainer = "all";
    const tab = (group, id, label, extra = "") => `<button type="button" role="tab" data-class-${group}="${esc(id)}" aria-selected="${state[group] === id}">${extra}${label}</button>`;
    filters.innerHTML = `
      <div class="filter-tabs" role="tablist" aria-label="Kind of training">
        ${tab("kind", "all", "All")}${tab("kind", "group", "👥 Group classes")}${tab("kind", "personal", "Personal training")}
      </div>
      <div class="filter-tabs class-filter-trainers" role="tablist" aria-label="Trainer">
        ${tab("trainer", "all", "All trainers")}${withTraining.map((t) => tab("trainer", t.id, `<span data-no-i18n>${esc(t.short)}</span>`, `<img src="${esc(t.img)}" alt="">`)).join("")}
      </div>`;
  }

  let lastHtml = "";
  function render() {
    const list = items();
    renderFilters(list);
    const cards = shown(list);
    const html = cards.map(card).join("");
    if (html !== lastHtml) { lastHtml = html; grid.innerHTML = html; } // only when something changed: the swipe row keeps its place
    empty.hidden = cards.length > 0;
    grid.classList.toggle("collapsed", !state.open);
    toggle.hidden = cards.length <= 3;
    toggle.setAttribute("aria-expanded", String(state.open));
    toggle.textContent = state.open ? "Show fewer trainings ▲" : `See all ${cards.length} trainings ▼`;
    if (dialog?.open && current) fill(current); // an open window follows (places taken, your own sign-up)
  }

  filters.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-class-kind], [data-class-trainer]");
    if (!btn) return;
    if (btn.dataset.classKind) state.kind = btn.dataset.classKind; else state.trainer = btn.dataset.classTrainer;
    grid.scrollLeft = 0;
    render();
  });
  toggle.addEventListener("click", () => {
    state.open = !state.open;
    render();
    if (!state.open) document.getElementById("programs").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ----- The window with more about one training -----
  let dialog = null;
  let current = null;
  function fill(id) {
    const x = items().find((it) => it.id === id);
    if (!x) { dialog.close(); return; }
    const who = x.trainers.map(coach).filter(Boolean);
    const pricing = LevelUp.getPricing();
    const price = !x.group && LevelUp.priceFor(x.trainer);
    const first = x.sessions?.[0];
    dialog.querySelector("#trainingContent").innerHTML = `
      <div class="training-photo" style="--img:url('${esc(x.img)}')${x.pos ? `; --pos:${x.pos}` : ""}"></div>
      <div class="training-body">
        <p class="section-kicker">${x.group ? "👥 Group class" : "Personal training · 1:1"}</p>
        <h2 id="trainingTitle" ${x.group ? "data-no-i18n" : ""}>${esc(x.title)}</h2>
        <p class="training-about" ${x.ownText ? "data-no-i18n" : ""}>${esc(x.about)}</p>
        ${x.points ? `<ul class="training-points">${x.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${x.stats ? `<ul class="class-stats training-stats">${[["STR", "Strength"], ["END", "Endurance"], ["TEC", "Technique"]].map(([, label], i) => `<li><span>${label}</span><i class="pips" style="--v:${x.stats[i]}" aria-label="${x.stats[i]} of 5"></i></li>`).join("")}</ul>` : ""}
        <ul class="training-facts">
          ${x.group
            ? `${first ? `<li><b>${first.minutes} min</b><span>per class</span></li><li><b>${first.price > 0 ? euro(first.price) : "Free"}</b><span>per person</span></li><li><b>+${first.xp} XP</b><span>each time you're there</span></li>` : `<li><b>+50 XP</b><span>each time you're there</span></li>`}`
            : `<li><b>60 min</b><span>1:1 with your coach</span></li>${price ? `<li><b>${euro(price)}</b><span>per session</span></li>` : ""}${pricing?.introPrice ? `<li><b>${euro(pricing.introPrice)}</b><span>your first session</span></li>` : ""}<li><b>+75 XP</b><span>per session</span></li>`}
        </ul>
        ${who.length ? `<div class="training-coaches">${who.map((t) => `
          <button type="button" class="training-coach" data-profile-trainer="${esc(t.id)}">
            <img src="${esc(t.img)}" alt=""><span><b data-no-i18n>${esc(t.name)}</b><small>${esc(t.role || "Personal trainer")}</small></span><i aria-hidden="true">›</i>
          </button>`).join("")}</div>` : ""}
        ${x.group ? `
          <h3 class="training-sub">Coming up</h3>
          ${x.sessions.length ? `<ul class="training-dates">${x.sessions.slice(0, 5).map((c) => `
            <li><span><b>${esc(when(c))}</b><small>${c.taken}/${c.capacity} · ${esc(c.location)}</small></span>
              <button type="button" class="btn btn-small ${c.mine ? "btn-ghost" : "btn-primary"}" data-training-class="${esc(c.id)}">${c.mine ? "You're in ✓" : c.taken >= c.capacity ? "Waitlist ▶" : "Sign up ▶"}</button></li>`).join("")}</ul>`
            : `<p class="muted">No date planned right now. New dates show here and on the schedule, and you get a notification.</p>`}`
          : `<div class="btn-row"><a href="#schedule" class="btn btn-primary" data-book-trainer="${esc(x.trainer)}" data-training-close>Book this training ▶</a></div>`}
      </div>`;
  }
  function open(id) {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "auth-dialog training-dialog";
      dialog.setAttribute("aria-labelledby", "trainingTitle");
      dialog.innerHTML = `<button type="button" class="dialog-close" data-close aria-label="Close">✕</button><div id="trainingContent"></div>`;
      document.body.appendChild(dialog);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog || event.target.closest("[data-close], [data-training-close]")) { dialog.close(); return; }
        const cls = event.target.closest("[data-training-class]");
        if (cls) { dialog.close(); window.LevelUpSchedule?.openClass(cls.dataset.trainingClass); }
      });
      dialog.addEventListener("close", () => { current = null; });
    }
    current = id;
    fill(id);
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  // a tap anywhere on a card opens the window; the booking button and the coach faces keep their own job
  grid.addEventListener("click", (event) => {
    const more = event.target.closest("[data-training-open]");
    if (!more && event.target.closest("a, button, img[data-coach]")) return;
    const el = more || event.target.closest("[data-training]");
    if (el) open(el.dataset.trainingOpen || el.dataset.training);
  });
  grid.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-training]")) { event.preventDefault(); open(event.target.dataset.training); }
  });

  document.addEventListener("levelup:change", render);
  render();
})();

// ===== Phones: XP table and map open on request (always open on bigger screens) =====
function foldToggle(buttonId, targetId, openText, closedText) {
  const button = document.getElementById(buttonId);
  const target = document.getElementById(targetId);
  if (!button || !target) return;
  button.addEventListener("click", () => {
    const open = target.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? openText : closedText;
  });
}
foldToggle("xpToggle", "levels", "Hide the XP table ▲", "How does XP work? ▼");
foldToggle("mapToggle", "hqMap", "📍 Hide map", "📍 Show map");
foldToggle("formToggle", "contactForm", "✉ Hide the form ▲", "✉ Send us a message ▼");

// ===== Level 1: the XP table comes alive =====
// When the table shows (scrolled into view, or opened on a phone) its rows slide in one after the other, the
// numbers count up from zero and the ranks light up from Rookie to Legend (CSS, .xp-board.play). After that one
// row at a time gives off its XP, as long as the table is on screen. Nothing of this with "reduce motion".
(function xpTable() {
  const board = document.getElementById("levels");
  if (!board) return;
  const rows = [...board.querySelectorAll(".xp-rules li")];
  const chips = rows.map((li, i) => {
    li.style.setProperty("--i", i);
    const chip = li.querySelector(".xp-chip");
    const plain = /^\+(\d+)$/.exec(chip.textContent.trim());          // "+50": a number that can count up
    chip.dataset.gain = plain ? `+${plain[1]} XP` : "★";               // what floats up from the chip on its turn
    if (plain) chip.setAttribute("data-no-i18n", "");
    return { chip, to: plain ? Number(plain[1]) : null, i };
  });
  board.querySelectorAll(".rank-strip li").forEach((li, i) => li.style.setProperty("--i", i));
  if (prefersReducedMotion) return;
  let timer = 0, raf = 0, turn = 0, visible = false;
  const settle = () => chips.forEach(({ chip, to }) => { if (to != null) chip.textContent = `+${to}`; });
  function countUp() {
    const t0 = performance.now();
    const step = (now) => {
      let busy = false;
      chips.forEach(({ chip, to, i }) => {
        if (to == null) return;
        const u = Math.min(1, Math.max(0, (now - t0 - i * 70 - 160) / 650));
        chip.textContent = `+${Math.round(to * (1 - Math.pow(1 - u, 3)))}`;
        if (u < 1) busy = true;
      });
      raf = busy ? requestAnimationFrame(step) : 0;
    };
    raf = requestAnimationFrame(step);
  }
  function pulse() {
    rows.forEach((li) => li.classList.remove("hit"));
    const li = rows[turn++ % rows.length];
    void li.offsetWidth;
    li.classList.add("hit");
    timer = setTimeout(pulse, 1700);
  }
  function stop() {
    clearTimeout(timer); cancelAnimationFrame(raf); timer = raf = 0;
    rows.forEach((li) => li.classList.remove("hit"));
    settle();
  }
  function start() {
    stop();
    turn = 0;
    board.classList.remove("play"); void board.offsetWidth; board.classList.add("play");
    countUp();
    timer = setTimeout(pulse, 2000);
  }
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting === visible) return;
    visible = entry.isIntersecting;
    if (visible && !document.hidden) start(); else stop();
  }, { threshold: 0.2 }).observe(board);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (visible && !timer) timer = setTimeout(pulse, 800); });
})();

// ===== Level 1: how it works, as a looping demo =====
// Six short scenes on a loop (profile, coach, booking, training, high scores, shop) with one XP bar that follows
// the real XP rules (LevelUp.progress), a mouse that clicks, and a mascot: the gymnast of the celebration
// (levelup-celebrate.js) hangs on his rings next to the scenes, does a rep when something good happens, and does
// his muscle-up with confetti and rays when the demo player levels up. A tap on a step jumps to that scene.
// How it stays light: the scenes move with transforms and opacity only (Web Animations + CSS transitions); the
// mascot's canvas is only redrawn while he moves (a hanging mascot is one still picture that sways with CSS);
// the loop stops when the demo is off screen or the tab is hidden; with "reduce motion" nothing plays by itself.
(function howItWorks() {
  const root = document.getElementById("howto");
  if (!root) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const one = (s) => root.querySelector(s);
  const all = (s) => [...root.querySelectorAll(s)];
  const screen = one(".hx-screen"), stage = one(".hx-stage"), bar = one("[data-hx-bar]"), lvl = one("[data-hx-lvl]"), num = one("[data-hx-num]");
  const tapEl = one(".hx-tap"), flyEl = one(".hx-fly"), burst = one(".hx-levelup");
  const scenes = all(".hx-scene"), steps = all("[data-hx-step]");
  const SLOW = 1.2;                                           // the pace: every moment below is stretched by this (1 = fastest)
  const DUR = [1600, 1500, 1700, 2600, 2200, 2100].map((ms) => Math.round(ms * SLOW)); // how long each scene shows: 14 s for one loop
  const XP_START = [0, 50, 50, 50, 175, 175];                 // the demo player's XP when a scene starts …
  const XP_END = [50, 50, 50, 175, 175, 210];                 // … and when it ends
  let timers = [], anims = [], scene = 1, level = 1, onScreen = false;
  let levelSwitch = null;                                     // a level-up that waits for the mascot's lock-out

  const at = (ms, fn) => timers.push(setTimeout(fn, ms * SLOW));
  const run = (el, frames, opts) => { const a = el.animate(frames, opts); anims.push(a); return a; };
  const centre = (el) => { const s = screen.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width, h: r.height }; };
  // the middle of el where it comes to rest: a scene that is still sliding in doesn't put the mouse off
  const restCentre = (el) => { let x = 0, y = 0; for (let n = el; n && n !== screen; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 }; };

  // ---------- the mascot ----------
  // The celebration's own drawing engine (its poses are a function of time: 0 = above the screen, 0.7 = hanging,
  // 0.8 to 2.12 = the muscle-up, 2.12 = locked out in support + the burst, 3.45 to 4.25 = down into the cross).
  // Here the time is ours: held still to hang, moved by hand for a rep, and run for real during the muscle-up
  // so the engine's own chalk, speed lines, confetti, shock waves and rays all happen.
  const mascot = (() => {
    const zone = one(".hx-mascot"), cv = one(".hx-cv");
    const HANG = 0.7, REP = 1.18, LOCK = 2.12, SUPPORT = 3.4, CROSS = 4.3;
    const RATE = 1.25 / SLOW;                                 // how fast the muscle-up runs (1 = as in the celebration)
    const END_POSE = [HANG, HANG, HANG, SUPPORT, CROSS, HANG]; // where he is when a scene is over
    let lib = null, sim = null, ctx = null, raf = 0, last = 0, stepping = false, queue = [], tween = null, onBurst = null;

    function size() {
      if (!sim) return;
      const s = stage.getBoundingClientRect(), z = zone.getBoundingClientRect();
      if (!s.width || !z.width) return;
      const q = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(s.width * q); cv.height = Math.round(s.height * q);
      ctx = LevelUp.dressMascot(cv.getContext("2d"));
      ctx.setTransform(q, 0, 0, q, 0, 0);
      sim.resize(s.width, s.height, 1);
      // the engine centres its scene on the canvas; here the gymnast gets his own zone. He needs about 250 units
      // of width (the cross) and 470 of height (from his head in support to his feet when he hangs).
      sim.s = Math.min(z.width / 250, z.height / 470);
      sim.ox = z.left - s.left + z.width / 2;
      sim.top = z.top - s.top + (z.height - 470 * sim.s) / 2 - 8 * sim.s;
      cv.style.transformOrigin = `${sim.ox}px 0px`;          // he sways around where his straps hang
    }
    const draw = () => { if (sim && ctx) sim.draw(ctx); };
    const clearFx = () => { ["conf", "chalk", "lines", "waves", "stars", "chev"].forEach((k) => { sim[k].length = 0; }); sim.flash = 0; sim.shake = 0; };
    function fresh(t) {
      sim = lib._createSim({ type: "rank", particles: "confetti", accent: LevelUp.themeAccent() || "#C6FF3D", glow: "#ffd23f", short: false, hold: 999, pixel: 0 }, 10, 10);
      sim.onBurst = () => { const fn = onBurst; onBurst = null; fn?.(); };
      size();
      sim.t = t;
    }
    function setPose(t) { sim.t = t; sim.R = null; draw(); }
    function halt() {
      cancelAnimationFrame(raf); raf = 0; last = 0;
      stepping = false; queue = []; tween = null; onBurst = null;
      cv.classList.add("idle");
    }
    const ease = (u) => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    function frame(ts) {
      raf = 0;
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      if (stepping) sim.step(dt * RATE);
      else {
        if (!tween && queue.length) { tween = { ...queue.shift(), at: 0 }; }
        if (tween) {
          tween.at += dt * 1000;
          const u = Math.min(1, tween.at / tween.ms);
          sim.t = tween.from + (tween.to - tween.from) * (tween.linear ? u : ease(u));
          sim.R = null;
          if (u >= 1) tween = null;
        }
      }
      draw();
      if (stepping || tween || queue.length) raf = requestAnimationFrame(frame);
      else { last = 0; cv.classList.add("idle"); }
    }
    const go = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
    const move = (from, to, ms, linear = false) => { queue.push({ from, to, ms: ms * SLOW, linear }); go(); };

    return {
      ready: false,
      async load() {
        try {
          lib = await LevelUp.loadCelebrate();
          if (!lib?._createSim) throw new Error("no engine");
          fresh(HANG);
          this.ready = true;
          root.classList.add("has-mascot");
          size(); draw();
          cv.classList.add("idle");
          new ResizeObserver(() => { size(); draw(); }).observe(stage);
        } catch (err) {
          root.classList.remove("has-mascot"); // the demo works without him: the scenes take the whole screen
        }
        return this.ready;
      },
      halt() { if (this.ready) halt(); },
      // a scene starts. animate: it plays (otherwise show how the scene ends); flow: the loop walked here by itself
      scene(n, animate, flow) {
        if (!this.ready) return;
        if (!animate) { halt(); clearFx(); setPose(END_POSE[n - 1]); return; }
        if (n === 1) { halt(); fresh(0); cv.classList.remove("idle"); move(0.02, HANG, 620, true); }   // he drops in on his rings
        else if (n === 2 || n === 3) { if (!flow) { halt(); clearFx(); setPose(HANG); } }
        else if (n === 4) {
          // the muscle-up, for real: the engine runs from the hang to the lock-out and fires its burst there
          halt(); fresh(HANG);
          sim.end = LOCK + 3.8;                               // (sets how long the confetti keeps raining and the stars keep twinkling)
          cv.classList.remove("idle");
          stepping = true; go();
        } else if (n === 5) {
          if (!(flow && stepping)) { halt(); clearFx(); cv.classList.remove("idle"); move(SUPPORT, CROSS, 700); } // (when it flows on from the training, he is already on his way down into the cross)
        } else if (n === 6) {
          // back down: out of the cross up to support, then down to the hang
          const moving = stepping;
          halt(); clearFx(); cv.classList.remove("idle");
          if (!flow && !moving) setPose(CROSS);
          move(CROSS, SUPPORT + 0.05, 380); move(LOCK, HANG, 620);
        }
      },
      // run fn at the moment he locks out (false: he is not doing a muscle-up, don't wait for him)
      whenLocked(fn) { if (!this.ready || !stepping) return false; if (sim.burst) fn(); else onBurst = fn; return true; },
      // a quick half pull-up: his way of saying "nice"
      rep() { if (!this.ready || stepping || tween || queue.length) return; cv.classList.remove("idle"); move(HANG, REP, 230); move(REP, HANG, 320); },
      peek: () => sim ? { t: +sim.t.toFixed(2), stepping, moving: Boolean(tween || queue.length), confetti: sim.conf.length, burst: sim.burst } : null
    };
  })();
  root._mascot = mascot.peek; // for a look from the outside (tests)

  // ---------- the XP bar ----------
  function setXp(xp, instant, wait = false) {
    const p = LevelUp.progress(xp);
    const write = () => { lvl.textContent = p.level; num.textContent = `${p.into} / ${p.needed} XP`; bar.style.transform = `scaleX(${(p.pct / 100).toFixed(3)})`; };
    const jump = (fn) => { bar.classList.add("jump"); fn(); void bar.offsetWidth; bar.classList.remove("jump"); };
    levelSwitch = null;
    if (p.level > level && !instant) {
      // level up: fill the bar to the end, then start the next level from zero (with the banner)
      bar.style.transform = "scaleX(1)";
      let done = false;
      const up = () => {
        if (done) return;
        done = true; levelSwitch = null;
        root.classList.add("up");
        jump(() => { bar.style.transform = "scaleX(0)"; });
        write();
        run(burst, [{ opacity: 0, transform: "scale(0.5)" }, { opacity: 1, transform: "scale(1.12)", offset: 0.18 }, { opacity: 1, transform: "none", offset: 0.34 }, { opacity: 1, transform: "none", offset: 0.82 }, { opacity: 0, transform: "scale(1.05)" }], { duration: (wait ? 1150 : 780) * SLOW, easing: "ease-out" });
        at(700, () => root.classList.remove("up"));
      };
      // with the mascot: the level changes at the moment he locks out and the confetti bursts
      if (wait && mascot.whenLocked(up)) { levelSwitch = up; at(1400, up); } // (a safety net: never wait longer than this)
      else at(400, up);
    } else if (instant || p.level < level) jump(write);
    else write();
    level = p.level;
  }

  // ---------- the finger and the flying XP ----------
  function tap(el) {
    const c = restCentre(el);
    run(tapEl, [{ transform: `translate3d(${c.x}px, ${c.y}px, 0) scale(0.4)`, opacity: 0 }, { transform: `translate3d(${c.x}px, ${c.y}px, 0) scale(1)`, opacity: 1, offset: 0.35 }, { transform: `translate3d(${c.x}px, ${c.y}px, 0) scale(1.6)`, opacity: 0 }], { duration: 420, easing: "ease-out" });
  }
  // ---------- the mouse ----------
  // A pointer that glides to what gets clicked and presses it (on a narrow screen it is a round touch dot, like a
  // finger). It moves with a CSS transition on its transform, so a new target halfway simply bends its path.
  const cursor = (() => {
    const node = one(".hx-cursor");
    let shown = false;
    const place = (x, y, ms) => { node.style.transitionDuration = `${ms}ms, 220ms`; node.style.transform = `translate3d(${x}px, ${y}px, 0)`; };
    // where it waits when there is nothing to click: the lower right corner of the scenes
    const corner = () => { const s = screen.getBoundingClientRect(), r = stage.getBoundingClientRect(); return [r.right - s.left - 34, r.bottom - s.top - 30]; };
    return {
      // glide to the middle of el in ms (it appears where it waited when it was hidden)
      to(el, ms) {
        if (!node || !el) return;
        if (!shown) { place(...corner(), 0); void node.offsetWidth; shown = true; node.classList.add("on"); }
        const c = restCentre(el);
        place(c.x, c.y, ms * SLOW);
      },
      // press: the pointer dips, the ring spreads from the spot
      click(el) { if (!node || !el) return; node.classList.add("press"); at(130, () => node.classList.remove("press")); tap(el); },
      hide() { if (!node) return; shown = false; node.classList.remove("on", "press"); },
      // out of the way, then gone (a scene without anything to click)
      leave() { if (!node || !shown) return; place(...corner(), 420 * SLOW); at(260, () => this.hide()); }
    };
  })();

  // a chip leaves its place, arcs to the bar and lands there: the bar takes the hit and fills
  function fly(chip, xp, wait = false) {
    const a = centre(chip), b = centre(bar.parentElement);
    flyEl.textContent = chip.textContent;
    flyEl.className = `hx-fly ${chip.className.replace("hx-pop", "").replace("show", "")}`;
    const w = a.w, h = a.h;
    const from = `translate3d(${a.x - w / 2}px, ${a.y - h / 2}px, 0)`, to = `translate3d(${b.x - w / 2}px, ${b.y - h / 2}px, 0)`;
    const mid = `translate3d(${(a.x + b.x) / 2 - w / 2 + 26}px, ${a.y - h / 2 - 22}px, 0)`;
    chip.style.opacity = "0.25";
    const anim = run(flyEl, [{ transform: `${from} scale(1)`, opacity: 1 }, { transform: `${mid} scale(1.15)`, opacity: 1, offset: 0.38 }, { transform: `${to} scale(0.4)`, opacity: 0.9 }], { duration: 480 * SLOW, easing: "cubic-bezier(0.45, 0, 0.75, 0.5)" });
    anim.onfinish = () => {
      root.classList.remove("hit"); void root.offsetWidth; root.classList.add("hit");
      setXp(xp, false, wait);
    };
  }

  // ---------- the scenes ----------
  const el = {
    avatar: one(".hx-avatar"), chip1: one('[data-s="1"] .hx-chip'),
    coaches: one("#hxCoaches"),
    slot: one('[data-s="3"] [data-pick]'), ticket: one(".hx-ticket"),
    gain1: one(".hx-gain.g1 .hx-chip"), gain2: one(".hx-gain.g2 .hx-chip"),
    rows: all(".hx-row"), me: one(".hx-row.me"), meScore: one(".hx-row.me em"), up: one(".hx-up"), heart: one(".hx-heart"),
    buy: one(".hx-buy"), chip6: one('[data-s="6"] .hx-chip')
  };
  // the high scores: who stands where (0 = first), before and after the climb
  const BEFORE = { lien: 0, sara: 1, wout: 2, me: 3 }, AFTER = { lien: 0, me: 1, sara: 2, wout: 3 };
  function board(order, score) {
    el.rows.forEach((r) => { const pos = order[r.dataset.who]; r.style.setProperty("--pos", pos); r.querySelector("i").textContent = pos + 1; });
    el.meScore.textContent = score;
  }
  function drawCoaches() {
    const html = LevelUp.TRAINERS.slice(0, 3).map((t, i) => `<span class="hx-coach" data-in style="--i:${i}"><img src="${LevelUp.esc(t.img)}" alt=""><b data-no-i18n>${LevelUp.esc(t.short)}</b></span>`).join("");
    if (el.coaches.dataset.html !== html) { el.coaches.dataset.html = html; el.coaches.innerHTML = html; }
  }
  const coach = () => el.coaches.querySelector(".hx-coach");

  // everything a scene changes, back to how it starts
  function reset(n) {
    if (n === 1) { el.chip1.classList.remove("show"); el.chip1.style.opacity = ""; }
    if (n === 2) all(".hx-coach").forEach((c) => c.classList.remove("picked"));
    if (n === 3) { el.slot.classList.remove("picked"); el.ticket.classList.remove("show"); }
    if (n === 4) [el.gain1, el.gain2].forEach((c) => { c.style.opacity = ""; });
    if (n === 5) {
      const box = el.me.parentElement; // back to the start without sliding there
      box.classList.add("jump"); board(BEFORE, "50"); void box.offsetWidth; box.classList.remove("jump");
      el.up.classList.remove("show"); el.heart.classList.remove("show");
    }
    if (n === 6) { el.buy.classList.remove("done"); el.buy.textContent = el.buy.dataset.label; el.chip6.classList.remove("show"); el.chip6.style.opacity = ""; }
  }
  // what a scene looks like when it is over (for a tap on a step while it doesn't play, and for "reduce motion")
  function finish(n) {
    if (n === 1) el.chip1.classList.add("show");
    if (n === 2) coach()?.classList.add("picked");
    if (n === 3) { el.slot.classList.add("picked"); el.ticket.classList.add("show"); }
    if (n === 5) { board(AFTER, "175"); el.up.classList.add("show"); el.heart.classList.add("show"); }
    if (n === 6) { el.buy.classList.add("done"); el.buy.textContent = "✓"; el.chip6.classList.add("show"); }
    setXp(XP_END[n - 1], true);
  }
  // what happens when, per scene (ms after the scene starts)
  const SCRIPT = {
    // (the mouse sets off first, so it arrives at the moment of the click)
    1: () => { at(60, () => cursor.to(el.avatar, 420)); at(500, () => cursor.click(el.avatar)); at(560, () => el.chip1.classList.add("show")); at(920, () => fly(el.chip1, 50)); at(1020, () => mascot.rep()); },
    2: () => { at(170, () => cursor.to(coach(), 480)); at(680, () => cursor.click(coach())); at(790, () => coach().classList.add("picked")); at(850, () => mascot.rep()); },
    3: () => { at(130, () => cursor.to(el.slot, 460)); at(620, () => cursor.click(el.slot)); at(730, () => el.slot.classList.add("picked")); at(960, () => el.ticket.classList.add("show")); at(1020, () => mascot.rep()); },
    // the session's XP lands while he pulls; the level changes when he locks out (about 1.4 s in)
    4: () => { at(40, () => cursor.leave()); at(300, () => fly(el.gain1, 125, true)); at(1780, () => fly(el.gain2, 175)); },
    5: () => {
      at(0, () => cursor.hide());
      at(420, () => { el.meScore.textContent = "175"; run(el.meScore, [{ transform: "scale(1.6)" }, { transform: "none" }], { duration: 380, easing: "ease-out" }); });
      at(700, () => board(AFTER, "175"));
      at(1150, () => el.up.classList.add("show"));
      at(1500, () => el.heart.classList.add("show"));
    },
    6: () => { at(60, () => cursor.to(el.buy, 470)); at(560, () => cursor.click(el.buy)); at(670, () => { el.buy.classList.add("done"); el.buy.textContent = "✓"; }); at(820, () => el.chip6.classList.add("show")); at(1180, () => fly(el.chip6, 210)); at(1300, () => mascot.rep()); }
  };

  function stop(keepMascot = false) {
    timers.forEach(clearTimeout); timers = [];
    anims.forEach((a) => { a.onfinish = null; a.cancel(); }); anims = [];
    levelSwitch = null;
    root.classList.remove("playing", "up", "hit");
    if (!keepMascot) { mascot.halt(); cursor.hide(); } // (a loop that walks on keeps its mouse where it is)
  }
  function play(n, auto = true) {
    const flow = auto && root.classList.contains("playing") && n === scene + 1; // the loop walking on by itself
    stop(flow);
    const prev = scene;
    scene = n;
    root.dataset.scene = String(n);
    root.style.setProperty("--hx-dur", `${DUR[n - 1]}ms`);
    reset(n);
    scenes.forEach((s) => { const k = Number(s.dataset.s); s.classList.toggle("on", k === n); s.classList.toggle("out", k === prev && k !== n); });
    steps.forEach((b) => { const now = Number(b.dataset.hxStep) === n; if (now) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); b.parentElement.classList.toggle("now", now); });
    setXp(XP_START[n - 1], true);
    const animate = auto && !reduce;
    mascot.scene(n, animate, flow);
    if (!animate) { cursor.hide(); finish(n); return; }
    SCRIPT[n]();
    void root.offsetWidth; // restart the line under the step
    root.classList.add("playing");
    timers.push(setTimeout(() => play((n % DUR.length) + 1), DUR[n - 1])); // (DUR is already stretched by SLOW)
  }
  const resume = () => { if (onScreen && !document.hidden) play(scene); else stop(); };

  root.addEventListener("click", (event) => {
    const step = event.target.closest("[data-hx-step]");
    if (step) play(Number(step.dataset.hxStep), onScreen);
  });
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    // the mascot's engine is fetched the first time the demo comes into view, then the loop starts again with him in it
    if (onScreen && !mascot.ready && !mascot.loading) { mascot.loading = true; mascot.load().then((ok) => { if (ok) resume(); }); }
    resume();
  }, { threshold: 0.25 }).observe(root);
  document.addEventListener("visibilitychange", resume);
  document.addEventListener("levelup:change", drawCoaches); // a coach's own photo once the team is loaded
  drawCoaches();
  play(1, false);
})();

// ===== The swipe rows glide to the left in an endless loop: classes and team on phones, =====
// ===== the reviews on every screen where the cards don't fit next to each other =====
// Each row gets one copy of its cards at the end. When the first set has fully passed, the row jumps
// back by exactly one set, which looks the same, so it never ends. Touching a row pauses it (you can
// swipe freely, also backwards); it starts again 3 seconds after you let go.
(function loopRows() {
  const SPEED = 26; // pixels per second
  const phone = window.matchMedia("(max-width: 640px)");
  const rows = [["#classGrid", "phone"], ["#team .team-grid", "phone"], ["#reviewGrid", "overflow"]]
    .map(([s, mode]) => [document.querySelector(s), mode]).filter(([el]) => el);

  rows.forEach(([row, mode]) => {
    let originals = [];
    let clones = [];
    let period = 0;       // width of one set of cards (incl. the gap to the copies)
    let pos = 0;          // exact position; scrollLeft is rounded by the browser
    let pausedUntil = 0;
    let visible = false;
    let last = 0;

    const isClone = (node) => node.nodeType === 1 && node.dataset.loopClone === "1";
    const measure = () => { period = clones.length ? clones[0].offsetLeft - originals[0].offsetLeft : 0; };

    function build() {
      clones.forEach((c) => c.remove());
      clones = [];
      originals = [...row.children].filter((c) => !isClone(c));
      row.classList.remove("looping");
      // "overflow": only when the cards are wider than the row (measured without the copies)
      const wanted = mode === "overflow" ? row.scrollWidth > row.clientWidth + 4 : phone.matches;
      if (!wanted || originals.length < 2) { period = 0; row.scrollLeft = 0; return; }
      originals.forEach((card) => {
        const copy = card.cloneNode(true);
        copy.dataset.loopClone = "1";
        copy.setAttribute("aria-hidden", "true");
        copy.classList.remove("reveal");
        copy.classList.add("in");
        copy.removeAttribute("id");
        copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
        copy.querySelectorAll("a, button, input, [tabindex]").forEach((el) => el.setAttribute("tabindex", "-1"));
        row.appendChild(copy);
        clones.push(copy);
      });
      row.classList.add("looping");
      measure();
      pos = row.scrollLeft;
    }

    // keep the position inside the first set, in both directions
    function wrap() {
      if (!period) return;
      if (row.scrollLeft >= period) { row.scrollLeft -= period; pos -= period; }
      else if (row.scrollLeft <= 0 && pausedUntil > performance.now()) { row.scrollLeft += period; pos += period; }
    }

    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (period && visible && !document.hidden && now > pausedUntil && !prefersReducedMotion) {
        pos += SPEED * dt;
        if (pos >= period) pos -= period;
        row.scrollLeft = pos;
      }
      requestAnimationFrame(tick);
    }

    const pause = () => { pausedUntil = Infinity; };
    const resume = () => { pausedUntil = performance.now() + 3000; pos = row.scrollLeft; };
    row.addEventListener("touchstart", pause, { passive: true });
    row.addEventListener("touchend", resume, { passive: true });
    row.addEventListener("touchcancel", resume, { passive: true });
    row.addEventListener("pointerdown", pause);
    row.addEventListener("pointerup", resume);
    row.addEventListener("focusin", pause);
    row.addEventListener("focusout", resume);
    row.addEventListener("scroll", () => { if (pausedUntil > performance.now()) { wrap(); pos = row.scrollLeft; } }, { passive: true });
    row.addEventListener("levelup:hold", () => { pausedUntil = performance.now() + 6000; });

    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(row);
    // new trainer cards (from the server) or a resize: copy the cards again
    new MutationObserver((list) => {
      const real = list.some((m) => [...m.addedNodes, ...m.removedNodes].some((n) => n.nodeType === 1 && !isClone(n)));
      if (real) build();
    }).observe(row, { childList: true });
    phone.addEventListener("change", build);
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      measure();
      if (mode === "overflow") { clearTimeout(resizeTimer); resizeTimer = setTimeout(build, 200); } // fits now, or no longer
    });

    build();
    requestAnimationFrame((t) => { last = t; tick(t); });
  });
})();

// ---------- Reviews: approved reviews (hidden until there is one) ----------
// One row of cards; when they don't all fit next to each other it glides to the left like the trainings and
// the coaches (loopRows below). A review marked as an example says so, and doesn't count in the average.
const stars = (n) => `<span class="stars" aria-label="${n} out of 5 stars">${"★".repeat(n)}<i>${"★".repeat(5 - n)}</i></span>`;
let reviewsHtml = "";
function renderReviews() {
  const section = document.getElementById("reviews");
  if (!section || !LevelUp.isReady()) return;
  const list = LevelUp.getReviews();
  section.hidden = !list.length;
  if (!list.length) return;
  const esc = LevelUp.esc;
  const real = list.filter((r) => !r.sample);
  const avg = real.reduce((sum, r) => sum + Number(r.rating), 0) / (real.length || 1);
  document.getElementById("reviewSummary").innerHTML = real.length >= 3
    ? `${stars(Math.round(avg))}<b>${avg.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b><span>from ${real.length} players</span>` : "";
  const html = list.map((r) => `
    <figure class="review-card ${r.sample ? "sample" : ""}">
      <div class="review-top">${stars(Number(r.rating))}${r.sample ? `<span class="review-sample">Example</span>` : ""}</div>
      <blockquote data-no-i18n>“${esc(r.quote)}”</blockquote>
      <figcaption>
        <span class="review-face">${r.avatarUrl ? `<img src="${esc(r.avatarUrl)}" alt="" loading="lazy" decoding="async">` : esc(r.name.trim().charAt(0).toUpperCase())}</span>
        <span><b data-no-i18n>${esc(r.name)}</b><small>${r.sample ? "Example review" : "LEVEL-UP player"}</small></span>
      </figcaption>
    </figure>`).join("");
  if (html === reviewsHtml) return; // unchanged: the gliding row keeps its place
  reviewsHtml = html;
  document.getElementById("reviewGrid").innerHTML = html;
}
document.addEventListener("levelup:change", renderReviews);
LevelUp.ready.then(renderReviews);

// ---------- Q&A: answers use the live prices and rules ----------
function renderFaq() {
  const box = document.getElementById("faqList");
  if (!box || !LevelUp.isReady()) return;
  const pr = LevelUp.getPricing();
  const euro = (n) => LevelUp.euro(n).replace(/[.,]00$/, "");
  const packs = pr.packs.map((p) => `${p.size} sessions for ${euro(p.price)}`).join(" or ");
  const qa = [
    ["How do I book a session?",
      `Create your free profile, pick a trainer and a time in the <a href="#schedule" class="text-link">schedule</a> and send the request. Your trainer confirms it and you get a message. You can book up to ${LevelUp.BOOKING_WEEKS_AHEAD} weeks ahead and at least ${LevelUp.BOOKING_NOTICE_HOURS} hours before the start.`],
    ["What does it cost?",
      `Your first session is ${euro(pr.introPrice)}. After that a 1:1 hour is ${euro(pr.price)}, and a duo session is ${euro(pr.duoPrice)} for the two of you.${packs ? ` With a session pack it's cheaper: ${packs}.` : ""}`],
    ["I've never trained before. Is this for me?",
      "Yes. Sessions are one-on-one (or with one friend), so your trainer works at your level. Before your first session you fill in a short health check, so your trainer knows what to take into account."],
    ["How do group classes work?",
      `Group classes (HIIT, CrossFit WOD, bootcamp …) are on the <a href="#schedule" class="text-link">schedule</a> with the number of places left. Sign up for ${euro(pr.classPrice)} and pay online or at the class. Full? Join the waitlist: when a place opens up you're in automatically. Free sign-out up to ${pr.classCancelHours} hours before. You get a reminder before it starts, a class chat with everyone who signed up, and +${pr.classXp} XP when your trainer ticks you off as present.`],
    ["Can I cancel?",
      `Yes, for free up to ${LevelUp.FREE_CANCEL_HOURS} hours before the session, and a request that isn't confirmed yet can always be withdrawn. A confirmed session cancelled later is charged in full.`],
    ["How do I pay?",
      `${pr.onlinePayments ? "Online when you book (Bancontact, card…), or" : "For now"} at LEVEL-UP, ${LevelUp.HQ_ADDRESS || "Hoogstraat 40, 9308 Aalst"}. Session packs work the same way and are used automatically when you book.`],
    ["Can I train with a friend?",
      `Yes: choose "Duo" when you book. It's ${euro(pr.duoPrice)} for the two of you, for one hour.`],
    ["How do XP and levels work?",
      `Every completed session gives +${LevelUp.SESSION_XP} XP. XP brings you up in level and rank (Rookie to Legend) and onto the high scores. Every 20 sessions you get a free 1:1 session, and Champion and Legend come with a free session too.`],
    ["Is there an app?",
      `Yes. Open the site on your phone and choose <b>Menu → Get the app</b>: LEVEL-UP lands on your home screen, free and without an app store. Turn on notifications to hear when your trainer confirms.`],
    ["Who sees my health answers and body stats?",
      "Only you, your trainer and LEVEL-UP. They are used to train you safely and to show your progress."]
  ];
  box.innerHTML = qa.map(([q, a], i) => `
    <details class="faq-item"${i === 0 ? " open" : ""}>
      <summary>${q}</summary>
      <p>${a}</p>
    </details>`).join("");
}
document.addEventListener("levelup:change", renderFaq);
LevelUp.ready.then(renderFaq);

// ===== Sideways rows with ◀ ▶ buttons (the coaches): one card per click =====
document.querySelectorAll("[data-row-nav]").forEach((nav) => {
  const row = document.querySelector(nav.dataset.rowNav);
  if (!row) return;
  const [prev, next] = nav.querySelectorAll("[data-row-step]");
  const update = () => {
    prev.disabled = row.scrollLeft <= 4;
    next.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
    nav.hidden = row.scrollWidth <= row.clientWidth + 4; // everything fits: no buttons needed
  };
  nav.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-row-step]");
    if (!btn) return;
    const card = row.firstElementChild;
    const step = card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(row).columnGap || 24) : row.clientWidth * 0.8;
    row.scrollBy({ left: Number(btn.dataset.rowStep) * step, behavior: "smooth" });
  });
  row.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  new MutationObserver(update).observe(row, { childList: true }); // coach cards added later (schedule.js)
  update();
});
