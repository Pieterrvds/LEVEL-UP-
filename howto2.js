/* PREVIEW: the new "How it works" demo. Six short scenes on a loop (profile, coach, booking, training, high scores,
   shop) with one XP bar that follows along, and a mascot: the gymnast of the celebration (levelup-celebrate.js)
   hangs on his rings next to the scenes, does a rep when something good happens, and does his muscle-up with
   confetti and rays when the demo player levels up. Only howto-preview.html loads this file.
   How it stays light: the scenes move with transforms and opacity only (Web Animations + CSS transitions); the
   mascot's canvas is only redrawn while he moves (a hanging mascot is one still picture that sways with CSS);
   the loop stops when the demo is off screen or the tab is hidden; with "reduce motion" nothing plays by itself. */
(function howItWorks2() {
  const root = document.getElementById("hx");
  if (!root) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const one = (s) => root.querySelector(s);
  const all = (s) => [...root.querySelectorAll(s)];
  const screen = one(".hx-screen"), stage = one(".hx-stage"), bar = one("[data-hx-bar]"), lvl = one("[data-hx-lvl]"), num = one("[data-hx-num]");
  const tapEl = one(".hx-tap"), flyEl = one(".hx-fly"), burst = one(".hx-levelup");
  const scenes = all(".hx-scene"), steps = all("[data-hx-step]");
  const DUR = [1600, 1500, 1700, 2600, 2200, 2100];          // how long each scene shows (ms): 11.7 s for one loop
  const XP_START = [0, 50, 50, 50, 175, 175];                 // the demo player's XP when a scene starts …
  const XP_END = [50, 50, 50, 175, 175, 210];                 // … and when it ends
  let timers = [], anims = [], scene = 1, level = 1, onScreen = false;
  let levelSwitch = null;                                     // a level-up that waits for the mascot's lock-out

  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const run = (el, frames, opts) => { const a = el.animate(frames, opts); anims.push(a); return a; };
  const centre = (el) => { const s = screen.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width, h: r.height }; };

  // ---------- the mascot ----------
  // The celebration's own drawing engine (its poses are a function of time: 0 = above the screen, 0.7 = hanging,
  // 0.8 to 2.12 = the muscle-up, 2.12 = locked out in support + the burst, 3.45 to 4.25 = down into the cross).
  // Here the time is ours: held still to hang, moved by hand for a rep, and run for real during the muscle-up
  // so the engine's own chalk, speed lines, confetti, shock waves and rays all happen.
  const mascot = (() => {
    const zone = one(".hx-mascot"), cv = one(".hx-cv");
    const HANG = 0.7, REP = 1.18, LOCK = 2.12, SUPPORT = 3.4, CROSS = 4.3;
    const RATE = 1.25;                                        // how fast the muscle-up runs (1 = as in the celebration)
    const END_POSE = [HANG, HANG, HANG, SUPPORT, CROSS, HANG]; // where he is when a scene is over
    let lib = null, sim = null, ctx = null, raf = 0, last = 0, stepping = false, queue = [], tween = null, onBurst = null;

    function size() {
      if (!sim) return;
      const s = stage.getBoundingClientRect(), z = zone.getBoundingClientRect();
      if (!s.width || !z.width) return;
      const q = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(s.width * q); cv.height = Math.round(s.height * q);
      ctx = cv.getContext("2d");
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
    const move = (from, to, ms, linear = false) => { queue.push({ from, to, ms, linear }); go(); };

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
        run(burst, [{ opacity: 0, transform: "scale(0.5)" }, { opacity: 1, transform: "scale(1.12)", offset: 0.18 }, { opacity: 1, transform: "none", offset: 0.34 }, { opacity: 1, transform: "none", offset: 0.82 }, { opacity: 0, transform: "scale(1.05)" }], { duration: wait ? 1150 : 780, easing: "ease-out" });
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
    const c = centre(el);
    run(tapEl, [{ transform: `translate3d(${c.x}px, ${c.y}px, 0) scale(0.4)`, opacity: 0 }, { transform: `translate3d(${c.x}px, ${c.y}px, 0) scale(1)`, opacity: 1, offset: 0.35 }, { transform: `translate3d(${c.x}px, ${c.y}px, 0) scale(1.6)`, opacity: 0 }], { duration: 420, easing: "ease-out" });
  }
  // a chip leaves its place, arcs to the bar and lands there: the bar takes the hit and fills
  function fly(chip, xp, wait = false) {
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
      setXp(xp, false, wait);
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
    1: () => { at(560, () => el.chip1.classList.add("show")); at(920, () => fly(el.chip1, 50)); at(1020, () => mascot.rep()); },
    2: () => { at(680, () => tap(coach())); at(790, () => coach().classList.add("picked")); at(850, () => mascot.rep()); },
    3: () => { at(620, () => tap(el.slot)); at(730, () => el.slot.classList.add("picked")); at(960, () => el.ticket.classList.add("show")); at(1020, () => mascot.rep()); },
    // the session's XP lands while he pulls; the level changes when he locks out (about 1.1 s in)
    4: () => { at(300, () => fly(el.gain1, 125, true)); at(1780, () => fly(el.gain2, 175)); },
    5: () => {
      at(420, () => { el.meScore.textContent = "175"; run(el.meScore, [{ transform: "scale(1.6)" }, { transform: "none" }], { duration: 380, easing: "ease-out" }); });
      at(700, () => board(AFTER, "175"));
      at(1150, () => el.up.classList.add("show"));
      at(1500, () => el.heart.classList.add("show"));
    },
    6: () => { at(560, () => tap(el.buy)); at(670, () => { el.buy.classList.add("done"); el.buy.textContent = "✓"; }); at(820, () => el.chip6.classList.add("show")); at(1180, () => fly(el.chip6, 210)); at(1300, () => mascot.rep()); }
  };

  function stop(keepMascot = false) {
    timers.forEach(clearTimeout); timers = [];
    anims.forEach((a) => { a.onfinish = null; a.cancel(); }); anims = [];
    levelSwitch = null;
    root.classList.remove("playing", "up", "hit");
    if (!keepMascot) mascot.halt();
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
    if (!animate) { finish(n); return; }
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
