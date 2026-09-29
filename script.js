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
  ".section-title, .section-intro, .quest-steps li, .class-card, .team-card, .gallery-item, .calendar, .contact-form, .stats-form, .xp-board"
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

// ===== Gallery video: play only while visible =====
const galleryVideo = document.querySelector(".gallery video");
if (galleryVideo && !prefersReducedMotion) {
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) galleryVideo.play().catch(() => {});
    else galleryVideo.pause();
  }, { threshold: 0.4 }).observe(galleryVideo);
}

// ===== "Select class" buttons pre-fill the contact form =====
const subjectSelect = document.getElementById("subject");
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-subject]");
  if (button) subjectSelect.value = button.dataset.subject;
});

// ===== Level 01: one call to action, depending on who is visiting =====
const aboutCta = document.getElementById("aboutCta");

function renderAboutCta() {
  const player = LevelUp.getPlayer();
  aboutCta.innerHTML = player
    ? `<a href="#schedule" class="btn btn-primary">▶ Book a trainer</a>`
    : `<button type="button" class="btn btn-primary" data-auth-open="signup">▶ Create your player</button>`;
}

document.addEventListener("levelup:change", renderAboutCta);
renderAboutCta();
