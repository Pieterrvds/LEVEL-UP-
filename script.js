// ===== Navigation =====
const hud = document.getElementById("hud");
const nav = document.getElementById("nav");
const menuToggle = document.getElementById("menuToggle");

function setMenu(open) {
  nav.classList.toggle("open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}

menuToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  setMenu(!nav.classList.contains("open"));
});

// Close menu when clicking a link, clicking outside or pressing Escape
nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => setMenu(false)));
document.addEventListener("click", (event) => {
  if (nav.classList.contains("open") && !nav.contains(event.target)) setMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});

// ===== XP bar (scroll progress) + HUD background =====
const xpFill = document.getElementById("xpFill");

function onScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const progress = max > 0 ? (window.scrollY / max) * 100 : 0;
  xpFill.style.width = `${progress}%`;
  hud.classList.toggle("scrolled", window.scrollY > 10);
}
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ===== Rotating class name in the hero =====
const classRotator = document.getElementById("classRotator");
const classes = ["CROSSFIT", "THERAPEUTIC BOXING", "CALISTHENICS", "MUAY THAI", "RUNNING", "HIIT"];
let classIndex = 0;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

setInterval(() => {
  classRotator.classList.add("swap");
  setTimeout(() => {
    classIndex = (classIndex + 1) % classes.length;
    classRotator.textContent = classes[classIndex];
    classRotator.classList.remove("swap");
  }, prefersReducedMotion ? 0 : 250);
}, 2200);

// ===== Player card stat bars =====
window.addEventListener("load", () => {
  document.querySelector(".player-card")?.classList.add("ready");
});

// ===== Levels, active nav link and achievement toasts =====
const sections = document.querySelectorAll("section[data-level]");
const navLinks = nav.querySelectorAll('a[href^="#"]');
const hudLevel = document.getElementById("hudLevel");
const hudLevelBox = hudLevel.parentElement;
const toast = document.getElementById("toast");
const toastText = document.getElementById("toastText");
let currentLevel = 1;
let toastTimer;

function showToast(message) {
  toastText.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const section = entry.target;

    navLinks.forEach(link => {
      link.classList.toggle("active", link.getAttribute("href") === `#${section.id}`);
    });

    const level = Number(section.dataset.level);
    if (level > currentLevel) {
      currentLevel = level;
      hudLevel.textContent = level;
      hudLevelBox.classList.remove("bump");
      void hudLevelBox.offsetWidth; // restart animation
      hudLevelBox.classList.add("bump");
      showToast(`LVL ${level}: ${section.dataset.achievement}`);
    }
  });
}, { rootMargin: "-45% 0px -50% 0px" });

sections.forEach(section => sectionObserver.observe(section));

// ===== Reveal on scroll =====
const revealTargets = document.querySelectorAll(
  ".section-title, .section-intro, .quest-steps li, .class-card, .team-card, .gallery-item, .calendar, .contact-form, .stats-form, .results"
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
document.querySelectorAll("[data-subject]").forEach(button => {
  button.addEventListener("click", () => {
    subjectSelect.value = button.dataset.subject;
  });
});

// ===== Stats calculator: BMI, BMR, calories & meal plan =====
const statsForm = document.getElementById("statsForm");
const statsError = document.getElementById("statsError");
const results = document.getElementById("results");

function bmiCategory(bmi) {
  if (bmi < 18.5) return { label: "Underweight", warn: true };
  if (bmi < 25) return { label: "Healthy range", warn: false };
  if (bmi < 30) return { label: "Overweight", warn: true };
  return { label: "Obese", warn: true };
}

const mealPlans = {
  lose: ["Scrambled egg whites & avocado 🥑", "Grilled chicken salad 🥗", "Greek yogurt & berries 🍓", "Salmon & quinoa 🐟"],
  maintain: ["Oatmeal with peanut butter 🥜", "Brown rice & tuna 🍚", "Greek yogurt with nuts 🥣", "Grilled chicken wrap 🌯"],
  gain: ["Egg omelette with toast 🍳", "Salmon with pasta 🍝", "Protein shake with oats 🥤", "Steak with potatoes 🥩"]
};

const goalLabels = { lose: "Lose fat", maintain: "Maintain", gain: "Build muscle" };

statsForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const weight = parseFloat(document.getElementById("weight").value);
  const height = parseFloat(document.getElementById("height").value);
  const age = parseInt(document.getElementById("age").value, 10);
  const gender = document.getElementById("gender").value;
  const activity = parseFloat(document.getElementById("activity").value);
  const goal = statsForm.querySelector('input[name="goal"]:checked').value;

  if (!weight || !height || !age || weight <= 0 || height <= 0 || age <= 0) {
    statsError.textContent = "Fill in your weight, height and age to calculate your stats.";
    return;
  }
  statsError.textContent = "";

  const bmi = weight / ((height / 100) ** 2);
  const category = bmiCategory(bmi);

  // Mifflin-St Jeor equation
  const bmr = 10 * weight + 6.25 * height - 5 * age + (gender === "male" ? 5 : -161);
  const maintenance = bmr * activity;

  // Adjust calories for the goal
  const goalFactor = { lose: 0.8, maintain: 1, gain: 1.1 }[goal];
  const target = maintenance * goalFactor;

  // Protein target in grams per kg bodyweight
  const proteinPerKg = { lose: 2.0, maintain: 1.6, gain: 1.8 }[goal];
  const protein = weight * proteinPerKg;

  const meals = mealPlans[goal];
  const round = (n) => Math.round(n).toLocaleString("en-US");

  results.innerHTML = `
    <h3>Your stats · ${goalLabels[goal]}</h3>
    <div class="result-tiles">
      <div class="tile">
        <span class="tile-label">BMI</span>
        <span class="tile-value">${bmi.toFixed(1)}</span>
        <span class="tile-note ${category.warn ? "warn" : ""}">${category.label}</span>
      </div>
      <div class="tile">
        <span class="tile-label">BMR</span>
        <span class="tile-value">${round(bmr)}<small>kcal</small></span>
        <span class="tile-note">At rest</span>
      </div>
      <div class="tile">
        <span class="tile-label">Maintenance</span>
        <span class="tile-value">${round(maintenance)}<small>kcal</small></span>
        <span class="tile-note">Per day</span>
      </div>
      <div class="tile highlight">
        <span class="tile-label">Daily target</span>
        <span class="tile-value">${round(target)}<small>kcal</small></span>
        <span class="tile-note">~${round(protein)} g protein</span>
      </div>
    </div>
    <h3>Starter meal plan 🍽️</h3>
    <ul class="meal-list">
      <li><b>Breakfast</b><span>${meals[0]}</span></li>
      <li><b>Lunch</b><span>${meals[1]}</span></li>
      <li><b>Snack</b><span>${meals[2]}</span></li>
      <li><b>Dinner</b><span>${meals[3]}</span></li>
    </ul>
    <p class="results-note">These are estimates. Want a plan built for you? <a href="#contact" class="text-link" data-subject="Customized Meal Plans">Ask for a custom meal plan</a>.</p>
  `;

  results.querySelector("[data-subject]").addEventListener("click", () => {
    subjectSelect.value = "Customized Meal Plans";
  });

  if (window.innerWidth < 960) results.scrollIntoView({ behavior: "smooth", block: "start" });
});

// ===== Footer year =====
document.getElementById("year").textContent = new Date().getFullYear();
