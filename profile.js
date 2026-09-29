// LEVEL-UP player profile page.

const root = document.getElementById("profileRoot");
const { esc, ITEMS, ACHIEVEMENTS, RANKS } = LevelUp;

const WORKOUT_TYPES = [
  "Personal Training", "Group Training", "CrossFit", "Muay Thai",
  "Calisthenics", "HIIT", "Running", "Cycling", "Strength", "Other"
];

let workoutMessage = "";
let lastWorkout = { type: "CrossFit", minutes: 60 };

const formatDate = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const euro = (n) => `€${Number(n).toFixed(2)}`;

function renderLoggedOut() {
  root.innerHTML = `
    <section class="no-save pixel-frame">
      <span class="pixel-heart" aria-hidden="true"></span>
      <p class="section-kicker">No save file loaded</p>
      <h1 class="section-title">Player profile</h1>
      <p>Log in to see your level, XP, workouts, body stats, achievements and gear. New here? Create a player and start at LVL 1.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-auth-open="signup">Create your player</button>
        <button type="button" class="btn btn-ghost" data-auth-open="login">Log in</button>
      </div>
    </section>`;
}

function renderHeader(player, p) {
  const since = formatDate(player.createdAt);
  return `
    <section class="player-header pixel-frame">
      ${LevelUp.avatarHtml(player, "xl")}
      <div class="player-header-info">
        <p class="section-kicker">Player 1 · since ${since}</p>
        <h1 class="player-header-name">${esc(player.name)}</h1>
        <p class="player-header-rank"><span class="rank-badge" data-tier="${RANKS.indexOf(p.rank)}">${p.rank.title}</span> LVL ${p.level}</p>
        <div class="xp-bar big" role="progressbar" aria-valuemin="0" aria-valuemax="${p.needed}" aria-valuenow="${p.into}" aria-label="XP to next level">
          <i style="width:${p.pct.toFixed(1)}%"></i>
        </div>
        <p class="xp-caption"><span>${p.into} / ${p.needed} XP</span><span>${p.toNext} XP to LVL ${p.level + 1}${p.nextRank ? ` · ${p.nextRank.title} at LVL ${p.nextRank.level}` : ""}</span></p>
      </div>
      <div class="player-header-level" aria-hidden="true">
        <span>LVL</span>
        <strong>${p.level}</strong>
      </div>
    </section>`;
}

function renderSummary(player) {
  const unlocked = Object.keys(player.achievements).length;
  const minutes = player.workouts.reduce((sum, w) => sum + w.minutes, 0);
  return `
    <section class="summary-tiles">
      <div class="tile"><span class="tile-label">Total XP</span><span class="tile-value">${player.xp.toLocaleString("en-US")}</span></div>
      <div class="tile"><span class="tile-label">Workouts</span><span class="tile-value">${player.workouts.length}</span><span class="tile-note">${Math.round(minutes / 60)} h trained</span></div>
      <div class="tile"><span class="tile-label">Sessions</span><span class="tile-value">${LevelUp.playerBookings().length}</span><span class="tile-note">with a trainer</span></div>
      <div class="tile"><span class="tile-label">Achievements</span><span class="tile-value">${unlocked}/${ACHIEVEMENTS.length}</span></div>
    </section>`;
}

function renderSessions() {
  const now = new Date();
  const bookings = LevelUp.playerBookings();
  const upcoming = bookings.filter((b) => LevelUp.slotStart(b.date, b.hour) > now);
  const done = bookings.filter((b) => LevelUp.slotStart(b.date, b.hour) <= now).reverse().slice(0, 5);

  const row = (b, canCancel) => {
    const trainer = LevelUp.trainerById(b.trainerId);
    return `
      <li class="session-row" style="--c:${trainer.color}">
        <img src="${trainer.img}" alt="">
        <div>
          <p class="session-trainer">${esc(trainer.name)}</p>
          <p class="muted">${LevelUp.formatSlot(b.date, b.hour)}</p>
        </div>
        ${canCancel
          ? `<button type="button" class="btn btn-small btn-ghost" data-cancel-booking="${b.id}">Cancel</button>`
          : `<span class="log-xp">+${b.xp} XP</span>`}
      </li>`;
  };

  return `
    <section class="panel panel-wide">
      <div class="panel-head">
        <h2>My sessions</h2>
        <a href="index.html#schedule" class="btn btn-small btn-primary">Book a trainer</a>
      </div>
      ${upcoming.length
        ? `<ul class="session-list">${upcoming.map((b) => row(b, true)).join("")}</ul>`
        : `<p class="muted">No upcoming sessions. Book an hour with one of our trainers and earn <strong>+${LevelUp.SESSION_XP} XP</strong>.</p>`}
      ${done.length ? `<h3 class="panel-sub">Completed</h3><ul class="session-list">${done.map((b) => row(b, false)).join("")}</ul>` : ""}
    </section>`;
}

function renderWorkouts(player) {
  const today = LevelUp.dateKey();
  const rewardedToday = player.workouts.filter((w) => w.date === today && w.xp > 0).length;
  const left = Math.max(0, LevelUp.WORKOUT_XP_DAILY_LIMIT - rewardedToday);
  const recent = player.workouts.slice(0, 6);

  return `
    <section class="panel">
      <div class="panel-head">
        <h2>Log a workout</h2>
        <span class="xp-chip">${left} XP drops left today</span>
      </div>
      <form class="workout-form" id="workoutForm">
        <label>Training
          <select name="type">
            ${WORKOUT_TYPES.map((type) => `<option ${type === lastWorkout.type ? "selected" : ""}>${type}</option>`).join("")}
          </select>
        </label>
        <label>Minutes
          <input type="number" name="minutes" min="5" max="300" step="5" value="${lastWorkout.minutes}" required inputmode="numeric">
        </label>
        <button type="submit" class="btn btn-primary">
          Log it · <span id="workoutXpPreview">+${left ? LevelUp.workoutXp(lastWorkout.minutes) : 0}</span> XP
        </button>
      </form>
      ${workoutMessage ? `<p class="form-success">${esc(workoutMessage)}</p>` : ""}
      <h3 class="panel-sub">Recent workouts</h3>
      ${recent.length ? `
        <ul class="log-list">
          ${recent.map((w) => `
            <li>
              <span>${esc(w.type)}</span>
              <span class="muted">${w.minutes} min · ${formatDate(w.date)}</span>
              <span class="log-xp">${w.xp ? `+${w.xp} XP` : "no XP"}</span>
            </li>`).join("")}
        </ul>` : `<p class="muted">No workouts yet. Log your first one to unlock <strong>First rep</strong>.</p>`}
    </section>`;
}

const MEAL_PLANS = {
  lose: ["Scrambled egg whites & avocado", "Grilled chicken salad", "Greek yogurt & berries", "Salmon & quinoa"],
  maintain: ["Oatmeal with peanut butter", "Brown rice & tuna", "Greek yogurt with nuts", "Grilled chicken wrap"],
  gain: ["Egg omelette with toast", "Salmon with pasta", "Protein shake with oats", "Steak with potatoes"]
};
let statsMessage = "";

// Weight over time: one line, hover or focus a point for its value (the table below has every value)
function weightChart(entries) {
  const points = entries.slice(0, 12).reverse();
  if (points.length < 2) {
    return `<p class="muted chart-hint">Do your next weekly check-in to start your progress line.</p>`;
  }
  const w = 560, h = 180, m = { top: 20, right: 44, bottom: 28, left: 40 };
  const weights = points.map((p) => p.weight);
  let min = Math.floor(Math.min(...weights) - 1);
  let max = Math.ceil(Math.max(...weights) + 1);
  const x = (i) => m.left + (i / (points.length - 1)) * (w - m.left - m.right);
  const y = (v) => m.top + (1 - (v - min) / (max - min)) * (h - m.top - m.bottom);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.weight)}`).join("");
  const grid = [min, (min + max) / 2, max].map((v) => `
    <line x1="${m.left}" x2="${w - m.right}" y1="${y(v)}" y2="${y(v)}" stroke="#1f3026"/>
    <text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end" class="tick">${Math.round(v)}</text>`).join("");
  const last = points[points.length - 1];
  const fmt = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `
    <svg class="weight-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Weight over time, from ${points[0].weight} to ${last.weight} kg">
      ${grid}
      <path d="${line}L${x(points.length - 1)},${h - m.bottom}L${x(0)},${h - m.bottom}Z" fill="#3fa34d" opacity="0.1"/>
      <path d="${line}" fill="none" stroke="#3fa34d" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.map((p, i) => `
        <g class="pt" tabindex="0" aria-label="${fmt(p.date)}: ${p.weight} kg">
          <circle cx="${x(i)}" cy="${y(p.weight)}" r="12" fill="transparent"/>
          <circle cx="${x(i)}" cy="${y(p.weight)}" r="4" fill="#3fa34d" stroke="var(--panel)" stroke-width="2"/>
          <title>${fmt(p.date)}: ${p.weight} kg</title>
        </g>`).join("")}
      <text x="${x(points.length - 1) + 8}" y="${y(last.weight) + 4}" class="val">${last.weight}</text>
      <text x="${m.left}" y="${h - 8}" class="tick">${fmt(points[0].date)}</text>
      <text x="${w - m.right}" y="${h - 8}" text-anchor="end" class="tick">${fmt(last.date)}</text>
    </svg>`;
}

function statsForm(latest) {
  const v = latest || { sex: "male", activity: 1.55, goal: "maintain" };
  const next = LevelUp.nextCheckin();
  const reward = next
    ? `Next check-in XP on ${next.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`
    : `+${LevelUp.CHECKIN_XP} XP weekly check-in`;
  return `
    <form class="stats-form-inline" id="statsForm" novalidate>
      <div class="field-row four">
        <label>Weight (kg)<input name="weight" type="number" min="30" max="300" step="0.1" inputmode="decimal" value="${v.weight ?? ""}" required></label>
        <label>Height (cm)<input name="height" type="number" min="120" max="230" inputmode="numeric" value="${v.height ?? ""}" required></label>
        <label>Age<input name="age" type="number" min="14" max="100" inputmode="numeric" value="${v.age ?? ""}" required></label>
        <label>Sex<select name="sex">${["male", "female"].map((x) => `<option value="${x}" ${v.sex === x ? "selected" : ""}>${x === "male" ? "Male" : "Female"}</option>`).join("")}</select></label>
      </div>
      <div class="field-row">
        <label>Activity level<select name="activity">${LevelUp.ACTIVITY_LEVELS.map((a) => `<option value="${a.value}" ${Math.abs(Number(v.activity) - a.value) < 0.001 ? "selected" : ""}>${a.label}</option>`).join("")}</select></label>
        <label>Goal<select name="goal">${Object.entries(LevelUp.GOALS).map(([k, l]) => `<option value="${k}" ${v.goal === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <p class="form-error" role="alert"></p>
      <div class="stats-submit">
        <button type="submit" class="btn btn-primary">${latest ? "Save check-in ▶" : "Save my stats ▶"}</button>
        <span class="xp-chip ${next ? "muted-chip" : ""}">${reward}</span>
      </div>
    </form>`;
}

function renderBodyStats(player) {
  const entries = player.bodyStats;
  const [latest] = entries;
  if (!latest) {
    return `
      <section class="panel panel-wide" id="stats">
        <div class="panel-head"><h2>Character stats</h2><span class="xp-chip">+${25 + LevelUp.CHECKIN_XP} XP</span></div>
        <p class="muted">Set your stats to see your BMI, daily calories and protein target, and to track your progress week by week.</p>
        ${statsForm(null)}
      </section>`;
  }
  const first = entries[entries.length - 1];
  const change = latest.weight - first.weight;
  const since = new Date(first.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const cat = LevelUp.bmiCategory(latest.bmi);
  const meals = MEAL_PLANS[latest.goal] || MEAL_PLANS.maintain;
  const activity = LevelUp.ACTIVITY_LEVELS.find((a) => Math.abs(a.value - Number(latest.activity)) < 0.001);
  const fmtNum = (n) => Number(n).toLocaleString("en-US");

  return `
    <section class="panel panel-wide" id="stats">
      <div class="panel-head">
        <h2>Character stats</h2>
        <span class="muted">Goal: <strong>${LevelUp.GOALS[latest.goal] || "Maintain"}</strong>${activity ? ` · ${activity.label}` : ""}</span>
      </div>
      <div class="stats-layout">
        <div>
          <div class="result-tiles three">
            <div class="tile"><span class="tile-label">Weight</span><span class="tile-value">${latest.weight}<small>kg</small></span>
              <span class="tile-note">${entries.length > 1 ? `${change > 0 ? "+" : ""}${change.toFixed(1)} kg since ${since}` : "Starting point"}</span></div>
            <div class="tile"><span class="tile-label">BMI</span><span class="tile-value">${latest.bmi}</span><span class="tile-note ${cat.warn ? "warn" : ""}">${cat.label}</span></div>
            <div class="tile"><span class="tile-label">BMR</span><span class="tile-value">${fmtNum(latest.bmr)}<small>kcal</small></span><span class="tile-note">At rest</span></div>
            <div class="tile"><span class="tile-label">Maintenance</span><span class="tile-value">${fmtNum(latest.maintenance)}<small>kcal</small></span><span class="tile-note">Per day</span></div>
            <div class="tile highlight"><span class="tile-label">Daily target</span><span class="tile-value">${fmtNum(latest.target)}<small>kcal</small></span><span class="tile-note">For your goal</span></div>
            <div class="tile"><span class="tile-label">Protein</span><span class="tile-value">${latest.protein}<small>g</small></span><span class="tile-note">Per day</span></div>
          </div>
          <h3 class="panel-sub">Weight progress</h3>
          ${weightChart(entries)}
        </div>
        <div>
          <h3 class="panel-sub first">Weekly check-in</h3>
          <p class="muted small-text">Update your stats whenever you like. Your first update each week earns XP, and 4 check-in weeks unlock <strong>On track</strong>.</p>
          ${statsForm(latest)}
          ${statsMessage ? `<p class="form-success">${esc(statsMessage)}</p>` : ""}
          <h3 class="panel-sub">Starter meal plan</h3>
          <ul class="meal-list">
            <li><b>Breakfast</b><span>${meals[0]}</span></li>
            <li><b>Lunch</b><span>${meals[1]}</span></li>
            <li><b>Snack</b><span>${meals[2]}</span></li>
            <li><b>Dinner</b><span>${meals[3]}</span></li>
          </ul>
          <p class="muted small-text">Estimates only. Want a plan built for you? <a href="index.html#contact" class="text-link">Ask your coach</a>.</p>
        </div>
      </div>
      <h3 class="panel-sub">History</h3>
      <div class="table-wrap">
        <table class="stats-table">
          <thead><tr><th>Date</th><th>Weight</th><th>BMI</th><th>Target</th><th>Goal</th></tr></thead>
          <tbody>
            ${entries.slice(0, 10).map((e) => `
              <tr><td>${formatDate(e.date)}</td><td>${e.weight} kg</td><td>${e.bmi}</td><td>${fmtNum(e.target)} kcal</td><td>${LevelUp.GOALS[e.goal] || ""}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderAchievements(player) {
  return `
    <section class="panel panel-wide">
      <div class="panel-head">
        <h2>Achievements</h2>
        <span class="muted">${Object.keys(player.achievements).length} of ${ACHIEVEMENTS.length} unlocked</span>
      </div>
      <div class="bonus-grid">
        ${ACHIEVEMENTS.map((a) => {
          const unlocked = player.achievements[a.id];
          return `
            <div class="bonus-card ${unlocked ? "unlocked" : ""}">
              <span class="bonus-icon" aria-hidden="true">${unlocked ? a.icon : "?"}</span>
              <div>
                <h3>${a.title}</h3>
                <p>${a.desc}</p>
                <span class="bonus-xp">${unlocked ? `✓ ${formatDate(unlocked)}` : `+${a.xp} XP`}</span>
              </div>
            </div>`;
        }).join("")}
      </div>
    </section>`;
}

function renderInventory(player) {
  const owned = ITEMS.filter((item) => player.inventory[item.id]);
  return `
    <section class="panel">
      <div class="panel-head">
        <h2>Inventory</h2>
        <a href="shop.html" class="btn btn-small">Item shop</a>
      </div>
      ${owned.length ? `
        <ul class="inventory">
          ${owned.map((item) => `
            <li class="rarity-${item.rarity}">
              ${item.img ? `<img src="${item.img}" alt="">` : `<span class="inv-placeholder" aria-hidden="true">≋</span>`}
              <span class="inv-name">${esc(item.name)}</span>
              <span class="inv-qty">×${player.inventory[item.id]}</span>
            </li>`).join("")}
        </ul>` : `<p class="muted">Your inventory is empty. Every item you buy earns XP and shows up here.</p>`}
      ${player.purchases.length ? `
        <h3 class="panel-sub">Orders</h3>
        <ul class="log-list">
          ${player.purchases.slice(0, 5).map((order) => `
            <li>
              <span>${order.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(", ")}</span>
              <span class="muted">${formatDate(order.date)} · ${euro(order.total)}</span>
              <span class="log-xp">+${LevelUp.orderXp(order.total)} XP</span>
            </li>`).join("")}
        </ul>` : ""}
    </section>`;
}

function renderRanks(player, p) {
  return `
    <section class="panel">
      <div class="panel-head"><h2>Rank ladder</h2></div>
      <ol class="rank-ladder">
        ${RANKS.map((rank, i) => {
          const state = p.level >= rank.level ? (rank === p.rank ? "current" : "done") : "locked";
          return `
            <li class="${state}">
              <span class="rank-badge" data-tier="${i}">${rank.title}</span>
              <span class="muted">LVL ${rank.level}${rank.level > 1 ? ` · ${LevelUp.xpForLevel(rank.level).toLocaleString("en-US")} XP` : ""}</span>
              <span class="rank-state">${state === "current" ? "◀ You" : state === "done" ? "✓" : "🔒"}</span>
            </li>`;
        }).join("")}
      </ol>
      <h3 class="panel-sub">Recent XP</h3>
      ${player.xpLog.length ? `
        <ul class="log-list compact">
          ${player.xpLog.slice(0, 6).map((entry) => `
            <li><span>${esc(entry.reason)}</span><span class="log-xp">+${entry.amount}</span></li>`).join("")}
        </ul>` : `<p class="muted">No XP yet.</p>`}
    </section>`;
}

function renderSettings() {
  return `
    <section class="panel panel-wide settings">
      <div>
        <h2>Account</h2>
        <p class="muted">Logged in as ${esc(LevelUp.getPlayer().email)}. Your profile is saved on the LEVEL-UP server, so it works on every device.</p>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost btn-small" data-logout>Log out</button>
        <button type="button" class="btn btn-small btn-danger" id="deleteProfile">Delete profile</button>
      </div>
    </section>`;
}

function render() {
  const player = LevelUp.getPlayer();
  if (!LevelUp.isReady()) {
    root.innerHTML = `<p class="board-message">Loading your save file…</p>`;
    return;
  }
  if (!player) {
    renderLoggedOut();
    return;
  }
  const p = LevelUp.progress(player.xp);
  root.innerHTML = `
    ${renderHeader(player, p)}
    ${renderSummary(player)}
    <div class="panel-grid">
      ${renderBodyStats(player)}
      ${renderSessions()}
      ${renderWorkouts(player)}
      ${renderAchievements(player)}
      ${renderInventory(player)}
      ${renderRanks(player, p)}
      ${renderSettings()}
    </div>`;
  bindEvents(player);
}

function bindEvents(player) {
  const form = document.getElementById("workoutForm");
  const preview = document.getElementById("workoutXpPreview");
  const today = LevelUp.dateKey();
  const limitReached = player.workouts.filter((w) => w.date === today && w.xp > 0).length >= LevelUp.WORKOUT_XP_DAILY_LIMIT;

  form.elements.minutes.addEventListener("input", () => {
    preview.textContent = `+${limitReached ? 0 : LevelUp.workoutXp(form.elements.minutes.value)}`;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    lastWorkout = { type: form.elements.type.value, minutes: Number(form.elements.minutes.value) || 30 };
    try {
      const result = await LevelUp.logWorkout(lastWorkout);
      workoutMessage = result.limitReached
        ? "Workout logged. You've reached today's XP limit, so this one earns no XP. Rest up and come back tomorrow!"
        : `Workout logged: +${result.xp} XP. Keep grinding!`;
    } catch (err) {
      workoutMessage = `Not logged: ${err.message}`;
    }
    render();
  });

  const statsFormEl = document.getElementById("statsForm");
  statsFormEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = statsFormEl.querySelector('button[type="submit"]');
    const error = statsFormEl.querySelector(".form-error");
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = "Saving…";
    try {
      const result = await LevelUp.saveBodyStats(Object.fromEntries(new FormData(statsFormEl)));
      statsMessage = result.xp ? `Check-in saved: +${result.xp} XP.` : "Stats updated. Check-in XP is once a week.";
      render();
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
      submit.textContent = "Try again";
    }
  });

  root.querySelectorAll("[data-cancel-booking]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Cancel this session? The XP you earned for it will be removed.")) return;
      button.disabled = true;
      try {
        await LevelUp.cancelBooking(button.dataset.cancelBooking);
      } catch (err) {
        button.disabled = false;
        alert(err.message);
      }
    });
  });

  document.getElementById("deleteProfile").addEventListener("click", async () => {
    if (!confirm("Delete your account? Your level, XP, sessions, workouts and stats will be gone for good.")) return;
    try {
      await LevelUp.deleteProfile();
    } catch (err) {
      alert(err.message);
    }
  });
}

document.addEventListener("levelup:change", render);
render();
