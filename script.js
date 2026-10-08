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

// ===== Classes: show 3, "See all" unfolds the rest =====
const classGrid = document.getElementById("classGrid");
const classToggle = document.getElementById("classToggle");
const classCount = classGrid.querySelectorAll(".class-card").length;
classToggle.textContent = `See all ${classCount} trainings ▼`;
classToggle.addEventListener("click", () => {
  const open = classGrid.classList.toggle("collapsed") === false;
  classToggle.setAttribute("aria-expanded", String(open));
  classToggle.textContent = open ? "Show fewer trainings ▲" : `See all ${classCount} trainings ▼`;
  if (!open) document.getElementById("programs").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ===== Phones: section descriptions behind "Read more" (always shown on bigger screens) =====
document.querySelectorAll("section").forEach((section, i) => {
  const parts = section.querySelectorAll("[data-more]");
  const title = section.querySelector(".section-title");
  if (!parts.length || !title) return;
  parts.forEach((el, j) => { el.id ||= `more-${i}-${j}`; });
  const button = document.createElement("button");
  button.type = "button";
  button.className = "read-more";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", [...parts].map((el) => el.id).join(" "));
  button.textContent = "Read more ▼";
  title.after(button);
  button.addEventListener("click", () => {
    const open = section.classList.toggle("more-open");
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "Read less ▲" : "Read more ▼";
  });
});

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
    ? `${stars(Math.round(avg))}<b>${avg.toFixed(1)}</b><span>from ${list.length} players</span>` : "";
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
