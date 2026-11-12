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
      <button type="button" class="fy-bubble" hidden aria-hidden="true" tabindex="-1"></button>
      <div class="fy-mascot" role="button" tabindex="0" aria-label="${esc(T("The mascot on his rings: tap him for a rep"))}"><canvas></canvas></div>`;
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

  // ---------- The mascot: Levelupy on his rings ----------
  // He is the gymnast of the celebrations (levelup-celebrate.js, used as it is), drawn on a small canvas. He hangs
  // and breathes, and every now and then he trains: a pull-up or two, a muscle-up, an L-sit, a straddle or an iron
  // cross, sweating while he works. A speech bubble pops up once in a while with an offer to help or a few words of
  // motivation. Tap him: the conversation with Levelupy opens (for who has it; else he does a rep). A check-in
  // gets a muscle-up. Without the file the corner stays empty; with "reduce motion" he just hangs.
  // How he moves: the engine has one timeline (t): 0.7 hang, 1.35 pulled up, 2.12 in support, 4.25 iron cross.
  // sim.step(0) works out his pose for a t; the legs (L-sit, straddle), the breathing and the blinking are put on
  // top of that pose here, and the sweat is drawn after him.
  const HELP_LINES = ["Can I help you?", "Questions about LEVEL-UP?", "Tap me, I'll show you around!", "Want to know when your coach is free?", "Need a hand finding something?"];
  const QUOTES = ["Every rep counts.", "Stronger than yesterday.", "Small steps, big levels.", "No excuses, just XP!", "You don't have to be the best, just better than last week.",
    "One session at a time.", "Sweat is just your muscles cheering.", "Showing up is half the workout.", "Level up!", "Your future self says thanks."];
  const PUFFS = ["Phew… one more!", "Feel that? That's progress.", "Your turn!", "That one was for you."];
  async function startMascot() {
    const hello = parts.hello;
    const box = hello.querySelector(".fy-mascot");
    const cv = box.querySelector("canvas");
    const bubble = hello.querySelector(".fy-bubble");
    try {
      const lib = await LevelUp.loadCelebrate();
      const sim = lib._createSim({ type: "rank", accent: LevelUp.themeAccent() || "#C6FF3D", glow: "transparent", short: false, hold: 999 }, 10, 10);
      sim.gripped = true; sim.burst = true; // his pose only: no chalk, no confetti, no rays
      let ctx = null, w = 0, h = 0, raf = 0, last = 0, base = 1;
      const HANG = 0.7, UP = 1.35, TOP = 2.12, HELD = 3.45, CROSS = 4.25;
      // the timeline, L-sit and straddle (0 to 1), how hard he works; and the clumsy side of him: one hand that lets
      // go (slip) or waves, a swing like a child on a swing, the trembling of a rep that will not go (all 0 to 1)
      const me = { t: 0.02, l: 0, s: 0, sweat: 0, slip: 0, wave: 0, swing: 0, shake: 0, side: 1 };
      const BLEND = ["l", "s", "slip", "wave", "swing", "shake"];
      let plan = [];                                          // the steps of the move he is doing
      let blinkAt = performance.now() + 2500, nextMove = 0, nextSay = 0, saidHelp = false;
      const drops = [];
      let nextDrop = 0, lastSide = 1, painted = 0;
      const fit = () => {
        const r = box.getBoundingClientRect();
        if (!r.width || !r.height) return Boolean(ctx);
        if (r.width === w && r.height === h) return Boolean(ctx);
        w = r.width; h = r.height;
        const q = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = Math.round(w * q); cv.height = Math.round(h * q);
        ctx = LevelUp.dressMascot(cv.getContext("2d"));
        ctx.setTransform(q, 0, 0, q, 0, 0);
        sim.resize(w, h, 1);
        base = Math.min(w / 190, h / 440);
        paint(performance.now());
        return true;
      };
      const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      // his pose at this moment, with what makes him look alive
      function paint(now) {
        if (!ctx) return;
        // in the iron cross his arms are wider than his corner: he steps back a little
        const wide = Math.max(0, Math.min(1, (me.t - HELD) / (CROSS - HELD)));
        sim.s = base * (1 - 0.17 * ease(wide)); sim.ox = w / 2; sim.top = -22 * base + 30 * base * ease(wide);
        sim.t = me.t; sim.step(0);
        const R = sim.R, sec = now / 1000, calm = !plan.length;
        R.legs.forEach((leg, i) => {
          const side = i ? 1 : -1;
          const sway = calm && !STILL.matches ? 0.035 * Math.sin(sec * 1.4 + i) : 0;
          const shake = me.sweat > 0.5 ? 0.012 * Math.sin(sec * 38 + i * 2) : 0;   // trembling in a hold
          const phi = leg.phi * (1 - me.l) * (1 - me.s) + side * (0.05 * me.l + 1.02 * me.s) + sway + shake;
          leg.psi = leg.psi * (1 - me.l) * (1 - me.s) + side * (0.05 * me.l + 1.02 * me.s) + sway + shake;
          leg.phi = phi;
          leg.len = leg.len * (1 - 0.86 * me.l) * (1 - 0.06 * me.s);                 // an L-sit: the legs point at you
        });
        R.hem = Math.sin((R.legs[0].phi + R.legs[1].phi) / 2) * 34;
        if (!STILL.matches) {
          if (calm) { R.rigY += 1.1 * Math.sin(sec * 2.1); R.headTilt += 0.04 * Math.sin(sec * 0.8); }
          if (now > blinkAt) { R.blink = 1; if (now > blinkAt + 130) blinkAt = now + 2200 + Math.random() * 3800; }
        }
        if (me.l > 0.5 || me.s > 0.5) R.moving = true;      // the face of someone who is working
        if (me.shake > 0.01) { R.rigY += 1.3 * me.shake * Math.sin(sec * 47); R.moving = true; R.happy = false; }
        if (me.slip > 0.01 || me.wave > 0.01 || me.swing > 0.01) {
          // The engine hangs him from two rings; here his body is moved and the hands are worked out again.
          // hw = a hand on its ring (in the picture), hl = the same hand seen from his chest.
          const SHOULDER = 30, ARM = 79;
          const free = me.side, grip = 1 - free, sF = free ? 1 : -1, sG = -sF, loose = Math.max(me.slip, me.wave);
          const G = R.hw[grip], was = { x: R.hl[free].x, y: R.hl[free].y };
          const sway = me.swing * Math.sin(sec * 2.7);
          // one hand: his body hangs under the hand that holds on, tilted, and it swings while he panics
          const roll = (R.roll || 0) - sG * (0.2 * me.slip + 0.07 * me.wave) + 0.09 * me.slip * Math.sin(sec * 5.6) + 0.06 * sway;
          const cr = Math.cos(roll), sr = Math.sin(roll);
          const under = G.x - sG * SHOULDER * cr; // his holding shoulder right under that hand
          const cx = R.cx + (under - R.cx) * (0.78 * me.slip + 0.2 * me.wave) + 6 * me.slip * Math.sin(sec * 2.9) + 12 * sway;
          let sy = R.sy;
          if (loose > 0.01) { // the arm that holds stays an arm long
            const len = Math.min(ARM, Math.hypot(G.x - (R.cx + sG * SHOULDER), G.y - R.sy)), dx = G.x - (cx + sG * SHOULDER * cr);
            sy = G.y + Math.sqrt(Math.max(0, len * len - dx * dx)) - sG * SHOULDER * sr;
          }
          R.cx = cx; R.sy = sy; R.roll = roll;
          const seen = (H) => { const dx = H.x - cx, dy = H.y - sy; return { x: dx * cr + dy * sr, y: -dx * sr + dy * cr }; };
          R.hl[grip] = seen(G);
          if (loose > 0.01) {
            // the free hand: flailing next to him (slip) or up beside his head, waving (wave)
            const flail = { x: sF * (47 + 11 * Math.sin(sec * 12.6)), y: -6 + 27 * Math.sin(sec * 10.1 + 1) };
            const hello = { x: sF * (45 + 8 * Math.sin(sec * 9.4)), y: -50 + 5 * Math.cos(sec * 9.4) };
            const to = me.slip >= me.wave ? flail : hello, k = ease(Math.min(1, loose));
            R.hl[free] = { x: was.x + (to.x - was.x) * k, y: was.y + (to.y - was.y) * k };
            R.hw[free].x += sF * 8 * loose * Math.sin(sec * 4.3); // the ring he let go of swings by itself
          } else R.hl[free] = seen(R.hw[free]);
          R.legs.forEach((leg, i) => {
            const kick = 0.3 * me.slip * Math.sin(sec * 9.2 + i * 2.6) + 0.2 * me.swing * Math.sin(sec * 2.7 - 0.7);
            leg.phi += kick; leg.psi += kick * 1.25 + 0.12 * me.slip * Math.sin(sec * 7.1 + i);
          });
          R.hem = Math.sin((R.legs[0].phi + R.legs[1].phi) / 2) * 34;
          if (me.slip > 0.35) { R.happy = false; R.moving = true; R.headTilt += sF * 0.13 * me.slip; }
          else if (me.wave > 0.35 || me.swing > 0.35) { R.happy = true; R.moving = false; }
        }
        sim.draw(ctx);
        // sweat: drops from his temples
        const s = sim.s, hx = sim.ox + R.cx * s, hy = sim.top + (R.rigY + R.sy - 35.5 + R.headDy) * s;
        if (me.sweat > 0 && !STILL.matches && drops.length < 5 && now > nextDrop) {
          const side = lastSide = -lastSide;
          drops.push({ x: hx + side * 15 * s, y: hy - (2 + Math.random() * 8) * s, vx: side * (30 + Math.random() * 26) * s, vy: -(34 + Math.random() * 26) * s, life: 0 });
          nextDrop = now + (520 - 300 * me.sweat) * (0.7 + Math.random() * 0.6);
        }
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i];
          if (d.life > 0.62) { drops.splice(i, 1); continue; }
          const r = 3.9 * s, a = Math.atan2(d.vy, d.vx) - Math.PI / 2;
          ctx.save();
          ctx.globalAlpha = Math.min(1, (0.62 - d.life) * 4);
          ctx.translate(d.x, d.y); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(0, -r * 2.1); ctx.quadraticCurveTo(r * 1.25, -r * 0.1, 0, r); ctx.quadraticCurveTo(-r * 1.25, -r * 0.1, 0, -r * 2.1);
          ctx.fillStyle = "#8fd8ff"; ctx.fill();
          ctx.lineWidth = Math.max(0.6, 0.7 * s); ctx.strokeStyle = "#2f7fb5"; ctx.stroke();
          ctx.beginPath(); ctx.arc(-r * 0.3, r * 0.1, r * 0.3, 0, 6.3); ctx.fillStyle = "#ffffff"; ctx.fill();
          ctx.restore();
        }
      }
      // A move is a list of steps: go to these values in this many ms (hold: stay, run: let the timeline run on)
      const step = (to, ms, sweat = 0) => ({ to, ms, sweat });
      const MOVES = {
        pullup: () => [step({ t: UP }, 460, 0.5), step({}, 200, 0.6), step({ t: HANG }, 520, 0.3)],
        pullups: () => [...MOVES.pullup(), step({}, 160, 0.3), ...MOVES.pullup(), step({}, 160, 0.4), step({ t: UP }, 520, 0.8), step({}, 260, 0.9), step({ t: HANG }, 600, 0.4)],
        muscleup: () => [step({ t: TOP }, 1150, 0.7), step({ run: 0.9 }, 900, 0.3), step({ t: 2.5, jump: true }, 0), step({ t: HANG }, 1000, 0.2)],
        lsit: () => [step({ t: TOP }, 1150, 0.6), step({ run: 0.5 }, 500, 0.3), step({ l: 1 }, 520, 0.8), step({}, 1900, 1), step({ l: 0 }, 480, 0.5), step({ t: 2.5, jump: true }, 0), step({ t: HANG }, 1000, 0.2)],
        straddle: () => [step({ t: TOP }, 1150, 0.6), step({ run: 0.5 }, 500, 0.3), step({ s: 1 }, 600, 0.8), step({}, 1700, 1), step({ s: 0 }, 520, 0.5), step({ t: 2.5, jump: true }, 0), step({ t: HANG }, 1000, 0.2)],
        cross: () => [step({ t: TOP }, 1150, 0.6), step({ run: 0.6 }, 600, 0.3), step({ t: HELD, jump: true }, 0), step({ t: CROSS }, 900, 0.9), step({ run: 1.7 }, 1700, 1), step({ t: HELD }, 950, 0.9), step({ t: 2.5, jump: true }, 0), step({ t: HANG }, 1000, 0.2)],
        drop: () => [step({ t: HANG }, 650, 0)],
        // the clumsy ones: a hand slips off, a rep that will not go, swinging like a child, a wave to you
        slip: () => { me.side = Math.random() < 0.5 ? 0 : 1; return [step({ slip: 1 }, 230, 1), step({}, 2100, 1), step({ slip: 0 }, 640, 0.6), step({}, 380, 0.3)]; },
        fail: () => [step({ t: 1.03 }, 560, 0.8), step({ shake: 1 }, 180, 1), step({}, 950, 1), step({ shake: 0, t: HANG }, 300, 0.5), step({}, 300, 0.3)],
        swing: () => [step({ swing: 1 }, 800, 0), step({}, 3400, 0.15), step({ swing: 0 }, 950, 0)],
        wave: () => { me.side = 1; return [step({ wave: 1 }, 430, 0), step({}, 1600, 0), step({ wave: 0 }, 430, 0)]; }
      };
      // what he says with a clumsy move: at once, and when he is back where he was
      const OOPS = { slip: [["Whoa!", "Oops!", "Aaah!"], ["Nobody saw that, right?", "That was on purpose. Really.", "One hand is enough. Almost.", "Chalk. I need more chalk."]],
        fail: [null, ["That one doesn't count.", "Heavy day. It happens to the best."]], swing: [["Wheee!"], ["This counts as cardio."]] };
      const pickMove = () => {
        const r = Math.random();
        return r < 0.22 ? "pullup" : r < 0.32 ? "pullups" : r < 0.46 ? "muscleup" : r < 0.56 ? "lsit" : r < 0.64 ? "straddle" : r < 0.7 ? "cross"
          : r < 0.83 ? "slip" : r < 0.91 ? "fail" : "swing";
      };
      let cur = null; // the step under way: { from, to, ms, at }
      function begin(name, then) {
        if (!fit()) return;
        if (STILL.matches) { me.t = HANG; me.l = 0; me.s = 0; paint(performance.now()); return; }
        plan = MOVES[name]();
        const oops = OOPS[name];
        if (oops?.[0]) say(oops[0], 120, { ms: 1700 });
        if (oops?.[1] && !then) then = () => say(oops[1], 250);
        if (then) plan.push({ then });
        cur = null;
        box.dataset.move = name;
        loop();
      }
      // one frame: move along the step, draw, and decide what comes next
      function frame(now) {
        raf = 0;
        if (!on()) { last = 0; return; } // off screen: he waits
        // just hanging and breathing: half the frames are enough (kinder to the battery)
        if (!cur && !plan.length && !drops.length && now - painted < 31) { loop(); return; }
        painted = now;
        const dt = Math.min(0.05, (now - (last || now)) / 1000);
        last = now;
        if (!cur && plan.length) {
          const next = plan.shift();
          if (next.then) { next.then(); }
          else if (next.to.jump) { me.t = next.to.t; }
          else cur = { ...next, at: now, from: { ...me } };
        }
        if (cur) {
          const u = cur.ms ? Math.min(1, (now - cur.at) / cur.ms) : 1, e = ease(u);
          if (cur.to.run !== undefined) me.t = cur.from.t + cur.to.run * u; // the timeline runs on (the rings settle, the cross trembles)
          else if (cur.to.t !== undefined) me.t = cur.from.t + (cur.to.t - cur.from.t) * (cur.from.t < HANG ? u : e);
          BLEND.forEach((key) => { if (cur.to[key] !== undefined) me[key] = cur.from[key] + (cur.to[key] - cur.from[key]) * e; });
          me.sweat = cur.sweat;
          if (u >= 1) cur = null;
        }
        if (!cur && !plan.length) {
          me.sweat = Math.max(0, me.sweat - dt * 1.5);
          if (box.dataset.move) {
            const was = box.dataset.move;
            delete box.dataset.move;
            nextMove = now + 13000 + Math.random() * 19000;
            if (!OOPS[was] && was !== "hello" && was !== "wave" && Math.random() < 0.35 && greeted) say(PUFFS, 400); // a word after the work
          }
          if (now > nextMove && nextMove) begin(pickMove());
          if (now > nextSay && nextSay) speak();
        }
        drops.forEach((d) => { d.life += dt; d.vy += 300 * sim.s * dt; d.x += d.vx * dt; d.y += d.vy * dt; });
        paint(now);
        loop();
      }
      const on = () => document.visibilityState === "visible" && box.isConnected && box.getClientRects().length > 0 && (!home || LevelUp.getView() === "foryou");
      const loop = () => { if (!raf && !STILL.matches && on()) raf = requestAnimationFrame(frame); };

      // ---- the speech bubble ----
      // say(lines, delay, { help, args, go, ms }): one of the lines, after a delay. go: where a tap on the bubble leads.
      let hideSay = 0;
      const said = []; // the last lines, so he does not repeat himself
      function say(lines, delay = 0, o = {}) {
        if (!bubble) return;
        if (typeof o !== "object") o = { help: Boolean(o) };
        const fresh = lines.filter((l) => !said.includes(l));
        const line = (fresh.length ? fresh : lines)[Math.floor(Math.random() * (fresh.length || lines.length))];
        said.push(line); if (said.length > 8) said.shift();
        clearTimeout(hideSay);
        hideSay = setTimeout(() => {
          bubble.textContent = T(line, ...(o.args || [])) + (o.go ? " ▸" : "");
          bubble.dataset.help = o.help ? "1" : "";
          bubble.dataset.go = o.go || "";
          bubble.hidden = false;
          requestAnimationFrame(() => bubble.classList.add("in"));
          hideSay = setTimeout(() => { bubble.classList.remove("in"); hideSay = setTimeout(() => { bubble.hidden = true; }, 260); }, o.ms || 5600);
        }, delay);
        nextSay = performance.now() + 24000 + Math.random() * 22000;
      }
      // What is on his mind: he knows your name, your XP, your planning, your streak, the high scores, the day and
      // what he wears. Each thought: [weight, lines, options]. The heavier, the sooner he says it.
      const DAYS = { 1: ["Monday. New week, new chances."], 3: ["Halfway through the week. You've got this."], 5: ["Friday! One more workout before the weekend?"],
        6: ["Saturday! The best day for a long session."], 0: ["Sunday is rest day. For you, not for me."] };
      function thoughts() {
        const player = LevelUp.getPlayer();
        if (!player) return [];
        const out = [], now = new Date(), name = String(player.name || "").trim().split(/\s+/)[0] || "";
        const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const daysTo = (d) => Math.round((day0(d) - day0(now)) / 864e5);
        const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        const coach = (id) => LevelUp.trainerById(id)?.short || "";
        // ---- your planning ----
        const sessions = LevelUp.playerBookings().filter((b) => ["pending", "confirmed"].includes(b.status) && LevelUp.slotStart(b.date, b.hour) > now)
          .map((b) => ({ at: LevelUp.slotStart(b.date, b.hour), who: coach(b.trainerId), pending: b.status === "pending" }));
        const classes = (player.classes || []).filter((c) => c.status === "scheduled" && c.start > now && c.mine?.status === "booked")
          .map((c) => ({ at: c.start, who: coach(c.trainerId), title: c.title }));
        const next = [...sessions, ...classes].sort((a, b) => a.at - b.at)[0];
        if (next) {
          const d = daysTo(next.at);
          if (next.pending) out.push([4, ["{0} hasn't confirmed yet. I'm keeping an eye on it."], { args: [next.who] }]);
          else if (d === 0) out.push([9, next.title ? ["Today: {0} at {1}. See you there!"] : ["Today's the day: {0} with {1}. I'm warming up for you!"], { args: next.title ? [next.title, hhmm(next.at)] : [hhmm(next.at), next.who] }]);
          else if (d === 1) out.push([9, next.title ? ["Yes, tomorrow it's time again: {0} with {1}. I'm looking forward to it!"] : ["Yes, tomorrow it's time again: training with {0}. I'm looking forward to it!"], { args: next.title ? [next.title, next.who] : [next.who] }]);
          else if (d <= 6) out.push([5, next.title ? ["{0} more sleeps until {1}."] : ["{0} more sleeps until your session with {1}."], { args: [d, next.title || next.who] }]);
        } else if (!LevelUp.isTrainer()) {
          if (LevelUp.availableVouchers(player).length) out.push([7, ["You have a free session waiting. Don't let it get cold!"], { go: "schedule" }]);
          out.push([5, ["Nothing planned yet, {0}. Shall we pick an hour?", "The rings are free. Your coach too. Just saying."], { args: [name], go: "schedule" }]);
        }
        const done = LevelUp.playerBookings().filter((b) => b.status === "completed").map((b) => LevelUp.slotStart(b.date, b.hour)).sort((a, b) => b - a)[0];
        if (done && daysTo(done) === -1) out.push([6, ["Good session yesterday, {0}! Sore? That's growth."], { args: [name] }]);
        if (done && daysTo(done) < -21 && !next) out.push([6, ["Long time no see, {0}! The rings missed you."], { args: [name], go: "schedule" }]);
        // ---- your score ----
        const p = LevelUp.progress(player.xp || 0), sessionXp = LevelUp.SESSION_XP || 75;
        if (p.toNext <= sessionXp) out.push([6, ["One more session and you're LVL {0}, {1}!"], { args: [p.level + 1, name] }]);
        else out.push([4, ["Hey {0}, {1} XP to go until LVL {2}. Nice work!"], { args: [name, num(p.toNext), p.level + 1] }]);
        if (p.nextRank) { const gap = 50 * p.nextRank.level * (p.nextRank.level - 1) - player.xp; /* the XP that level starts at */ if (gap > 0 && gap <= 300) out.push([5, ["Only {0} XP and you're a {1}. I can almost see the badge."], { args: [num(gap), p.nextRank.title] }]); }
        if (p.level >= 3) out.push([1, ["LVL {0} already! I remember when you were LVL 1."], { args: [p.level] }]);
        const rows = LevelUp.getForYou()?.board?.all?.rows || [], i = rows.findIndex((r) => r.isMe);
        if (i >= 0) {
          const mine = rows[i], above = rows[i - 1], below = rows[i + 1];
          if (mine.place === 1) out.push([3, ["Number 1 in the high scores, {0}! Don't look back."], { args: [name], go: "scores" }]);
          else if (above && above.xp > mine.xp) out.push([4, ["{0} XP and you pass {1}. Just saying."], { args: [num(above.xp - mine.xp + 1), above.name], go: "scores" }]);
          if (below && mine.xp - below.xp <= 100) out.push([3, ["{0} is right behind you. Keep moving!"], { args: [below.name] }]);
        }
        const s = player.streak, c = player.checkin;
        if (s?.weeks >= 2 && s.thisWeek) out.push([3, ["{0} weeks in a row! Don't break the chain."], { args: [s.weeks] }]);
        else if (s?.weeks >= 1 && !s.thisWeek && !s.planned) out.push([5, ["Your streak of {0} weeks wants a session this week."], { args: [s.weeks], go: "schedule" }]);
        if (c && !c.done && !LevelUp.isTrainer()) out.push([4, ["You haven't checked in this week: +{0} XP is waiting below."], { args: [c.xp || 25] }]);
        // ---- the day, and what he wears ----
        if (DAYS[now.getDay()]) out.push([1.5, DAYS[now.getDay()], {}]);
        const look = LevelUp.mascotLook();
        if (look?.say?.length) {
          const lines = look.id === "laurel" && look.years === 1 ? ["One year with LEVEL-UP today. Respect! 🏆", look.say[1]] : look.say;
          out.push([look.why === "season" ? 2.5 : 6, lines, { args: [look.id === "laurel" ? look.years : name] }]);
        }
        // ---- a word for everyone, and an offer to help ----
        out.push([2.5, QUOTES, {}]);
        if (LevelUp.getAssistant().on) out.push([saidHelp ? 2 : 4, HELP_LINES, { help: true }]);
        return out;
      }
      // The first thing he says: hello, by name, with a wave (or what the day is about, on a special day)
      let greeted = false;
      function greet() {
        greeted = true;
        const name = String(LevelUp.getPlayer()?.name || "").trim().split(/\s+/)[0] || "", h = new Date().getHours(), look = LevelUp.mascotLook();
        const special = look?.say?.length && look.why && look.why !== "season";
        if (special) say(look.id === "laurel" && look.years === 1 ? ["One year with LEVEL-UP today. Respect! 🏆"] : look.say, 0, { args: [look.id === "laurel" ? look.years : name] });
        else say(h < 6 || h >= 22 ? ["Still up, {0}? Sleep is training too."] : h < 11 ? ["Good morning, {0}!", "Good morning, {0}! Early bird gets the gains."] : h < 18 ? ["Hey {0}! Good to see you.", "There you are, {0}!"] : ["Good evening, {0}!", "Hey {0}! Still got energy?"], 0, { args: [name] });
        if (!plan.length && !cur) begin("wave");
        nextSay = performance.now() + 8500; // what is on his mind follows soon
      }
      // now and then: one of his thoughts, the heavier ones more often
      function speak() {
        if (!greeted) { greet(); return; }
        const list = thoughts().filter(([, lines]) => lines.some((l) => !said.includes(l)));
        if (!list.length) { say(QUOTES); return; }
        const first = said.length <= 1; // right after hello: what matters most today
        const top = first ? [list.slice().sort((x, y) => y[0] - x[0])[0]] : list;
        let r = Math.random() * top.reduce((n, x) => n + x[0], 0);
        const pick = top.find((x) => (r -= x[0]) <= 0) || top[0];
        if (pick[2].help) saidHelp = true;
        say(pick[1], 0, pick[2]);
      }
      const chat = () => LevelUp.gotoChat({ t: LevelUp.ASSISTANT_ID });
      box.addEventListener("click", () => {
        if (LevelUp.getAssistant().on) { chat(); return; }
        if (!plan.length && !cur) begin(pickMove());
      });
      bubble?.addEventListener("click", () => {
        if (bubble.dataset.help && LevelUp.getAssistant().on) chat();
        else if (bubble.dataset.go) location.href = link(bubble.dataset.go); // "pick an hour", "the high scores": he takes you there
        else { bubble.classList.remove("in"); bubble.hidden = true; }
      });

      mascot = {
        fit: () => { const ok = fit(); loop(); return ok; },
        rep: () => { if (!plan.length && !cur) begin("pullup"); },
        cheer: () => begin("muscleup", () => say(["Checked in! That deserves a muscle-up.", "Nice one. See you next week!"])),
        wake: loop,
        move: (name) => { if (MOVES[name]) begin(name); },   // for a look at one move (LevelUpForYou.move("lsit"))
        say: (help) => say(help ? HELP_LINES : QUOTES, 0, { help: Boolean(help) }),
        think: () => thoughts().map(([w, lines, o]) => ({ w, line: lines[0], text: T(lines[0], ...(o.args || [])), go: o.go || "" })), // what is on his mind now
        speak
      };
      window.addEventListener("resize", fit);
      document.addEventListener("visibilitychange", loop);
      LevelUp.hasAssistant().then((a) => {
        box.setAttribute("aria-label", T(a.on ? "Levelupy, the mascot: tap him to chat" : "The mascot on his rings: tap him for a rep"));
        box.classList.toggle("can-chat", Boolean(a.on));
      });
      if (!fit()) { me.t = HANG; return; }
      if (STILL.matches) { me.t = HANG; paint(performance.now()); return; }
      // he drops in, does one pull-up, and after a moment says hello
      const start = performance.now();
      plan = [step({ t: HANG }, 650, 0), step({}, 500, 0), ...MOVES.pullup()];
      box.dataset.move = "hello";
      nextSay = start + 3600;
      loop();
    } catch (err) {
      box.hidden = true;
      if (bubble) bubble.hidden = true;
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
      <div class="fy-streak">
      <div><p class="fy-big"><span aria-hidden="true">🔥</span> ${weeks} <small>${weeks === 1 ? T("week") : T("weeks")}</small></p>
      <div class="fy-week" aria-hidden="true">${dashes}</div></div>
      <p class="fy-note">${note}</p>
      </div>
      ${c ? `<div class="fy-acts">${c.done
        ? `<button type="button" class="btn btn-small fy-checked" disabled>${T("Checked in ✓")}</button>`
        : `<button type="button" class="btn btn-small btn-primary" data-fy-checkin>${T("Check in")} · +${c.xp} XP</button>`}</div>
        ${c.done ? `<p class="fy-note fy-again">${T("Next check-in from {0}", esc(next.toLocaleDateString("en-GB", { weekday: "long" })))}</p>` : ""}` : ""}`;
  }

  // ---------- Your race: you and the players just above and below you on the high scores ----------
  // All time or this month (the two buttons). Each runner is a lane: the bar is their XP next to the others in the
  // race, the green chip what they earned in the last 7 days. Under it: how far the next one is, in XP and in
  // sessions, and who is coming up behind you.
  let racePeriod = "all";
  function raceHtml(player, data) {
    if (!data) return `<p class="fy-k">${T("Your race")}</p><p class="fy-note">${T("Loading…")}</p>`;
    const more = `<a class="text-link fy-more" href="${link("scores")}">${T("High scores ▸")}</a>`;
    const board = data.board ? data.board[racePeriod] || data.board.all : { rows: data.race || [], place: (data.race || []).find((r) => r.isMe)?.place ?? null, total: 0 };
    const rows = board.rows || [];
    const sessionXp = Number(data.board?.sessionXp) || LevelUp.SESSION_XP || 75;
    const top = Math.max(...rows.map((r) => r.xp), 1), low = Math.min(...rows.map((r) => r.xp), top);
    const width = (xp) => (top === low ? 100 : 38 + 62 * (xp - low) / (top - low));
    const lanes = rows.length ? `<ol class="fy-lanes">${rows.map((r) => `
      <li class="${r.isMe ? "me" : ""}" ${r.isMe || !r.userId ? "" : `data-profile="${esc(r.userId)}" tabindex="0" role="button"`}>
        <span class="fy-place">${r.place}</span>
        ${LevelUp.avatarHtml({ name: r.name, xp: r.totalXp ?? r.xp, avatarUrl: r.avatarUrl })}
        <div class="fy-lane">
          <p><b>${r.isMe ? T("You") : esc(r.name)}</b><em>${num(r.xp)} XP</em></p>
          <div class="fy-track"><i style="--w:${width(r.xp).toFixed(1)}%"></i></div>
          ${Number(r.week) > 0 ? `<small class="fy-up">▲ ${T("{0} XP this week", num(r.week))}</small>` : `<small>${T("No XP this week")}</small>`}
        </div>
      </li>`).join("")}</ol>` : "";
    const tabs = data.board ? `<span class="fy-tabs" role="tablist">
        <button type="button" role="tab" data-fy-race="all" aria-selected="${racePeriod === "all"}">${T("All time")}</button>
        <button type="button" role="tab" data-fy-race="month" aria-selected="${racePeriod === "month"}">${T("This month")}</button></span>` : "";
    const head = (title) => `<p class="fy-k">${title}${tabs}</p>`;
    if (!data.ranked) {
      return `${head(T("High scores"))}${lanes}
        <p class="fy-note">${LevelUp.isTrainer() ? T("Coaches aren't ranked: this is the top 3 right now.")
          : `${T("You're hidden from the high scores.")} <a class="text-link" ${tabLink("me")}>${T("Change this in your settings")}</a>`}</p>${more}`;
    }
    const i = rows.findIndex((r) => r.isMe);
    if (i < 0) { // this month, and no XP yet this month
      return `${head(T("Your race"))}
        <p class="fy-rank-line"><b>–</b><span>${T("Not on this month's board yet")}</span></p>${lanes}
        <p class="fy-note">${T("One session or a check-in and you're in this month's race.")}</p>${more}`;
    }
    const meRow = rows[i], above = rows[i - 1], below = rows[i + 1];
    const sessions = (gap) => { const n = Math.max(1, Math.ceil(gap / sessionXp)); return n === 1 ? T("1 session") : T("{0} sessions", n); };
    let note = T("You're the first on the board. Keep going!");
    if (above) note = above.xp > meRow.xp
      ? T("{0} to go and you pass {1}: that's {2}.", `<b>${num(above.xp - meRow.xp + 1)} XP</b>`, `<span>${esc(above.name)}</span>`, `<b>${sessions(above.xp - meRow.xp + 1)}</b>`)
      : T("You're level with {0}: your next XP puts you ahead.", `<span>${esc(above.name)}</span>`);
    else if (below) note = T("You're in the lead, {0} ahead of {1}.", `<b>${num(meRow.xp - below.xp)} XP</b>`, `<span>${esc(below.name)}</span>`);
    let chase = "";
    if (below && above) {
      const gap = meRow.xp - below.xp;
      chase = Number(below.week) > Number(meRow.week) && gap <= Number(below.week) * 2
        ? T("Watch out: {0} earned {1} this week and is {2} behind you.", `<span>${esc(below.name)}</span>`, `<b>${num(below.week)} XP</b>`, `<b>${num(gap)} XP</b>`)
        : T("{0} is {1} behind you.", `<span>${esc(below.name)}</span>`, `<b>${num(gap)} XP</b>`);
    }
    return `${head(T("Your race"))}
      <p class="fy-rank-line"><b>#${meRow.place}</b><span>${T("of {0} players", board.total)}${racePeriod === "month" ? ` · ${T("this month")}` : ""}</span></p>
      ${lanes}
      <p class="fy-note">${note}</p>${chase ? `<p class="fy-note fy-chase">${chase}</p>` : ""}${more}`;
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
      stats_saved: [player.bodyStats.length ? 1 : 0, 1, tabLink("stats")],
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
    host.append(card("next"), card("streak"), card("race", "fy-race-card"), card("goals"), card("picks", "fy-wide"), card("club", "fy-club"));
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
    const period = event.target.closest("[data-fy-race]");
    if (period) { racePeriod = period.dataset.fyRace; draw(); return; }
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
    host.addEventListener("keydown", (event) => { // the mascot and a runner in the race, with the keyboard
      if ((event.key === "Enter" || event.key === " ") && event.target.matches?.(".fy-mascot, .fy-lanes li[data-profile]")) { event.preventDefault(); event.target.click(); }
    });
    host.addEventListener("submit", (event) => LevelUpPosts.handleSubmit(event, postStore));
    draw();
  }

  document.addEventListener("levelup:change", () => draw());
  document.addEventListener("levelup:view", () => { draw(); mascot?.wake(); }); // the phone page comes into view
  PHONE.addEventListener?.("change", () => draw());
  if (home) mount(document.getElementById("fyHome"));
  window.LevelUpForYou = { mount, draw, move: (name) => mascot?.move(name), say: (help) => mascot?.say(help), think: () => mascot?.think() || [], speak: () => mascot?.speak() };
})();
