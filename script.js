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

// ===== Replays dialog: photos and video, kept off the main page =====
const replayDialog = document.getElementById("replayDialog");
if (replayDialog) {
  const replayVideo = replayDialog.querySelector("video");
  document.querySelectorAll("[data-replays]").forEach((btn) => btn.addEventListener("click", () => {
    replayDialog.showModal();
    if (replayVideo && !prefersReducedMotion) replayVideo.play().catch(() => {});
  }));
  replayDialog.addEventListener("click", (event) => {
    if (event.target === replayDialog || event.target.closest("[data-close]")) replayDialog.close();
  });
  replayDialog.addEventListener("close", () => replayVideo?.pause());
}

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
  // A kind of group training without a photo or text of its own gets one that fits its name
  const GROUP_LOOKS = [
    [/run|loop|jog/i, "img/socialrunclub.jpg", "Run together at a pace where you can still talk. Everyone is welcome, from your first kilometres to your next race. We start and finish together."],
    [/ring|gymnast|turn/i, "img/pulluptraining.jpg", "Gymnastics on the rings in a small group: support, swings, pulls and step by step towards your first skills. Strength, control and shoulders that can take a lot.", "12%"],
    [/calisthenic|pull|street/i, "img/calipersonal.jpg", ""],
    [/hiit|interval|tabata/i, "img/HIIT.JPG", ""],
    [/muay|box|kick/i, "img/muaythay.jpg", ""],
    [/spin|cycl|fiets|bike/i, "img/highlights/cycling.jpg", ""],
    [/hyrox|crossfit|wod|bootcamp|kettlebell/i, "img/jimsgroepstraining.jpg", ""]
  ];
  const GROUP_DEFAULT = ["img/grouptrainingsessie.jpg", "Train together in a small group with a coach: the same quality as a personal training, with the energy of the group."];

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

// ===== Level 01: one call to action, depending on who is visiting =====
const aboutCta = document.getElementById("aboutCta");

function renderAboutCta() {
  const player = LevelUp.getPlayer();
  aboutCta.innerHTML = player
    ? `<a href="#schedule" class="btn btn-primary">▶ Book a trainer</a>`
    : `<button type="button" class="btn btn-primary" data-auth-open="signup">▶ Create your profile</button>`;
}

document.addEventListener("levelup:change", renderAboutCta);
renderAboutCta();

// ===== Phones: the swipe rows (steps, classes, team) glide to the left in an endless loop =====
// Each row gets one copy of its cards at the end. When the first set has fully passed, the row jumps
// back by exactly one set, which looks the same, so it never ends. Touching a row pauses it (you can
// swipe freely, also backwards); it starts again 3 seconds after you let go.
(function loopRows() {
  const SPEED = 26; // pixels per second
  const phone = window.matchMedia("(max-width: 640px)");
  const rows = [".quest-steps", "#classGrid", "#team .team-grid"].map((s) => document.querySelector(s)).filter(Boolean);

  rows.forEach((row) => {
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
      if (!phone.matches || originals.length < 2) { period = 0; return; }
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
    window.addEventListener("resize", measure);

    build();
    requestAnimationFrame((t) => { last = t; tick(t); });
  });
})();

// ---------- Reviews: approved reviews from real clients (hidden until there is one) ----------
const stars = (n) => `<span class="stars" aria-label="${n} out of 5 stars">${"★".repeat(n)}<i>${"★".repeat(5 - n)}</i></span>`;
function renderReviews() {
  const section = document.getElementById("reviews");
  if (!section || !LevelUp.isReady()) return;
  const list = LevelUp.getReviews();
  section.hidden = !list.length;
  if (!list.length) return;
  const esc = LevelUp.esc;
  const avg = list.reduce((sum, r) => sum + Number(r.rating), 0) / list.length;
  document.getElementById("reviewSummary").innerHTML = list.length >= 3
    ? `${stars(Math.round(avg))}<b>${avg.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b><span>from ${list.length} players</span>` : "";
  document.getElementById("reviewGrid").innerHTML = list.map((r) => `
    <figure class="review-card">
      ${stars(Number(r.rating))}
      <blockquote>“${esc(r.quote)}”</blockquote>
      <figcaption>
        <span class="review-face">${r.avatarUrl ? `<img src="${esc(r.avatarUrl)}" alt="" loading="lazy" decoding="async">` : esc(r.name.trim().charAt(0).toUpperCase())}</span>
        <span><b>${esc(r.name)}</b><small>LEVEL-UP player</small></span>
      </figcaption>
    </figure>`).join("");
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
