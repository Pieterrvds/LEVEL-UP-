// Home page behaviour. Shared HUD, login and XP logic lives in game.js.

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ===== Rotating class name in the hero =====
const classRotator = document.getElementById("classRotator");
const classes = ["CROSSFIT", "THERAPEUTIC BOXING", "CALISTHENICS", "MUAY THAI", "RUNNING", "HIIT"];
let classIndex = 0;

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
  ".section-title, .section-intro, .quest-steps li, .class-card, .team-card, .gallery-item, .calendar, .contact-form, .stats-form, .results, .xp-sources li"
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

// ===== Level system section: swap the call to action when logged in =====
const levelsCta = document.getElementById("levelsCta");

function renderLevelsCta() {
  const player = LevelUp.getPlayer();
  if (!player) {
    levelsCta.innerHTML = `
      <button type="button" class="btn btn-primary" data-auth-open="signup">Create your player</button>
      <button type="button" class="btn btn-ghost" data-auth-open="login">Log in</button>`;
    return;
  }
  const p = LevelUp.progress(player.xp);
  levelsCta.innerHTML = `
    <a href="profile.html" class="btn btn-primary">Open your profile ▶</a>
    <span class="levels-status">${LevelUp.esc(player.name)} · LVL ${p.level} ${p.rank.title}</span>`;
}

// ===== Stats calculator: BMI, BMR, calories & meal plan =====
const statsForm = document.getElementById("statsForm");
const statsError = document.getElementById("statsError");
const results = document.getElementById("results");
let lastStats = null;

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

// Save-to-profile block under the results
function renderSaveBlock() {
  const slot = document.getElementById("saveStats");
  if (!slot) return;
  const player = LevelUp.getPlayer();
  if (!player) {
    slot.innerHTML = `
      <p>Log in to save these stats to your profile and earn XP.</p>
      <button type="button" class="btn btn-small" data-auth-open="login">Log in to save</button>`;
  } else if (slot.dataset.saved === "true") {
    slot.innerHTML = `<p>✓ Saved to your profile. <a href="profile.html" class="text-link">View your stats</a></p>`;
  } else {
    const firstTime = !player.achievements.stats_saved;
    slot.innerHTML = `
      <p>Track your progress over time on your profile.</p>
      <button type="button" class="btn btn-small btn-primary" id="saveStatsBtn">Save to profile${firstTime ? " · +25 XP" : ""}</button>`;
    document.getElementById("saveStatsBtn").addEventListener("click", () => {
      LevelUp.saveBodyStats(lastStats);
      slot.dataset.saved = "true";
      renderSaveBlock();
    });
  }
}

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

  lastStats = {
    weight, height, age, sex: gender, goal,
    bmi: Math.round(bmi * 10) / 10,
    bmr: Math.round(bmr),
    maintenance: Math.round(maintenance),
    target: Math.round(target),
    protein: Math.round(protein)
  };

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
    <div class="save-stats" id="saveStats"></div>
    <h3>Starter meal plan 🍽️</h3>
    <ul class="meal-list">
      <li><b>Breakfast</b><span>${meals[0]}</span></li>
      <li><b>Lunch</b><span>${meals[1]}</span></li>
      <li><b>Snack</b><span>${meals[2]}</span></li>
      <li><b>Dinner</b><span>${meals[3]}</span></li>
    </ul>
    <p class="results-note">These are estimates. Want a plan built for you? <a href="#contact" class="text-link" data-subject="Customized Meal Plans">Ask for a custom meal plan</a>.</p>
  `;
  renderSaveBlock();

  if (window.innerWidth < 960) results.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.addEventListener("levelup:change", () => {
  renderLevelsCta();
  renderSaveBlock();
});
renderLevelsCta();
