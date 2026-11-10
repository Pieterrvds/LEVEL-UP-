/* PREVIEW: the new "How it works" demo. Six short scenes on a loop (profile, coach, booking, training, high scores,
   shop) with one XP bar that follows along. Only howto-preview.html loads this file.
   How it stays light: every movement is a transform or an opacity (Web Animations + CSS transitions), the loop
   stops when the demo is off screen or the tab is hidden, and with "reduce motion" nothing plays by itself. */
(function howItWorks2() {
  const root = document.getElementById("hx");
  if (!root) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const one = (s) => root.querySelector(s);
  const all = (s) => [...root.querySelectorAll(s)];
  const screen = one(".hx-screen"), bar = one("[data-hx-bar]"), lvl = one("[data-hx-lvl]"), num = one("[data-hx-num]");
  const tapEl = one(".hx-tap"), flyEl = one(".hx-fly"), burst = one(".hx-levelup");
  const scenes = all(".hx-scene"), steps = all("[data-hx-step]");
  const DUR = [1500, 1500, 1700, 2300, 2200, 2000];          // how long each scene shows (ms): 11.2 s for one loop
  const XP_START = [0, 50, 50, 50, 175, 175];                 // the demo player's XP when a scene starts …
  const XP_END = [50, 50, 50, 175, 175, 210];                 // … and when it ends
  let timers = [], anims = [], scene = 1, level = 1, onScreen = false;

  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const run = (el, frames, opts) => { const a = el.animate(frames, opts); anims.push(a); return a; };
  const centre = (el) => { const s = screen.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width, h: r.height }; };

  // ---------- the XP bar ----------
  function setXp(xp, instant) {
    const p = LevelUp.progress(xp);
    const write = () => { lvl.textContent = p.level; num.textContent = `${p.into} / ${p.needed} XP`; bar.style.transform = `scaleX(${(p.pct / 100).toFixed(3)})`; };
    const jump = (fn) => { bar.classList.add("jump"); fn(); void bar.offsetWidth; bar.classList.remove("jump"); };
    if (p.level > level && !instant) {
      // level up: fill the bar to the end, then start the next level from zero
      bar.style.transform = "scaleX(1)";
      at(400, () => {
        root.classList.add("up");
        jump(() => { bar.style.transform = "scaleX(0)"; });
        write();
        run(burst, [{ opacity: 0, transform: "scale(0.5)" }, { opacity: 1, transform: "scale(1.1)", offset: 0.2 }, { opacity: 1, transform: "none", offset: 0.36 }, { opacity: 1, transform: "none", offset: 0.8 }, { opacity: 0, transform: "scale(1.05)" }], { duration: 780, easing: "ease-out" });
        at(700, () => root.classList.remove("up"));
      });
    } else if (instant || p.level < level) jump(write);
    else write();
    level = p.level;
  }

  // ---------- the finger and the flying XP ----------
  function tap(el) {
    const c = centre(el);
    run(tapEl, [{ transform: `translate3d(${c.x}px, ${c.y}px, 0) scale(0.4)`, opacity: 0 }, { transform: `translate3d(${c.x}px, ${c.y}px, 0) scale(1)`, opacity: 1, offset: 0.35 }, { transform: `translate3d(${c.x}px, ${c.y}px, 0) scale(1.6)`, opacity: 0 }], { duration: 420, easing: "ease-out" });
  }
  // a chip leaves its place, arcs to the bar and lands there: the bar takes the hit and fills
  function fly(chip, xp) {
    const a = centre(chip), b = centre(bar.parentElement);
    flyEl.textContent = chip.textContent;
    flyEl.className = `hx-fly ${chip.className.replace("hx-pop", "").replace("show", "")}`;
    const w = a.w, h = a.h;
    const from = `translate3d(${a.x - w / 2}px, ${a.y - h / 2}px, 0)`, to = `translate3d(${b.x - w / 2}px, ${b.y - h / 2}px, 0)`;
    const mid = `translate3d(${(a.x + b.x) / 2 - w / 2 + 26}px, ${a.y - h / 2 - 22}px, 0)`;
    chip.style.opacity = "0.25";
    const anim = run(flyEl, [{ transform: `${from} scale(1)`, opacity: 1 }, { transform: `${mid} scale(1.15)`, opacity: 1, offset: 0.38 }, { transform: `${to} scale(0.4)`, opacity: 0.9 }], { duration: 480, easing: "cubic-bezier(0.45, 0, 0.75, 0.5)" });
    anim.onfinish = () => {
      root.classList.remove("hit"); void root.offsetWidth; root.classList.add("hit");
      setXp(xp);
    };
  }

  // ---------- the scenes ----------
  const el = {
    chip1: one('[data-s="1"] .hx-chip'),
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
    1: () => { at(520, () => el.chip1.classList.add("show")); at(880, () => fly(el.chip1, 50)); },
    2: () => { at(680, () => tap(coach())); at(790, () => coach().classList.add("picked")); },
    3: () => { at(620, () => tap(el.slot)); at(730, () => el.slot.classList.add("picked")); at(960, () => el.ticket.classList.add("show")); },
    4: () => { at(300, () => fly(el.gain1, 125)); at(1560, () => fly(el.gain2, 175)); },
    5: () => {
      at(420, () => { el.meScore.textContent = "175"; run(el.meScore, [{ transform: "scale(1.6)" }, { transform: "none" }], { duration: 380, easing: "ease-out" }); });
      at(700, () => board(AFTER, "175"));
      at(1150, () => el.up.classList.add("show"));
      at(1500, () => el.heart.classList.add("show"));
    },
    6: () => { at(560, () => tap(el.buy)); at(670, () => { el.buy.classList.add("done"); el.buy.textContent = "✓"; }); at(820, () => el.chip6.classList.add("show")); at(1150, () => fly(el.chip6, 210)); }
  };

  function stop() {
    timers.forEach(clearTimeout); timers = [];
    anims.forEach((a) => { a.onfinish = null; a.cancel(); }); anims = [];
    root.classList.remove("playing", "up", "hit");
  }
  function play(n, auto = true) {
    stop();
    const prev = scene;
    scene = n;
    root.dataset.scene = String(n);
    root.style.setProperty("--hx-dur", `${DUR[n - 1]}ms`);
    reset(n);
    scenes.forEach((s) => { const k = Number(s.dataset.s); s.classList.toggle("on", k === n); s.classList.toggle("out", k === prev && k !== n); });
    steps.forEach((b) => { const now = Number(b.dataset.hxStep) === n; if (now) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); b.parentElement.classList.toggle("now", now); });
    setXp(XP_START[n - 1], true);
    if (!auto || reduce) { finish(n); return; }
    SCRIPT[n]();
    void root.offsetWidth; // restart the line under the step
    root.classList.add("playing");
    at(DUR[n - 1], () => play((n % DUR.length) + 1));
  }
  const resume = () => { if (onScreen && !document.hidden) play(scene); else stop(); };

  root.addEventListener("click", (event) => {
    const step = event.target.closest("[data-hx-step]");
    if (step) play(Number(step.dataset.hxStep), onScreen);
  });
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; resume(); }, { threshold: 0.25 }).observe(root);
  document.addEventListener("visibilitychange", resume);
  document.addEventListener("levelup:change", drawCoaches); // a coach's own photo once the team is loaded
  drawCoaches();
  play(1, false);
})();
