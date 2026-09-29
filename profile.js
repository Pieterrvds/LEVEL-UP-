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
        : `<p class="muted">No upcoming sessions. Book an hour with Filip or Maxim and earn <strong>+${LevelUp.SESSION_XP} XP</strong>.</p>`}
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

function renderBodyStats(player) {
  const [latest, previous] = player.bodyStats;
  if (!latest) {
    return `
      <section class="panel">
        <div class="panel-head"><h2>Body stats</h2></div>
        <p class="muted">No stats saved yet. Use the stats calculator and press <strong>Save to profile</strong> to track your BMI, BMR and calories over time.</p>
        <a href="index.html#stats" class="btn btn-small">Open stats calculator</a>
      </section>`;
  }
  const change = previous ? latest.weight - previous.weight : null;
  const changeText = change === null ? "First entry" : `${change > 0 ? "+" : ""}${change.toFixed(1)} kg since last`;
  return `
    <section class="panel">
      <div class="panel-head">
        <h2>Body stats</h2>
        <a href="index.html#stats" class="btn btn-small btn-ghost">Update</a>
      </div>
      <div class="result-tiles">
        <div class="tile"><span class="tile-label">Weight</span><span class="tile-value">${latest.weight}<small>kg</small></span><span class="tile-note">${changeText}</span></div>
        <div class="tile"><span class="tile-label">BMI</span><span class="tile-value">${latest.bmi}</span></div>
        <div class="tile"><span class="tile-label">BMR</span><span class="tile-value">${latest.bmr.toLocaleString("en-US")}<small>kcal</small></span></div>
        <div class="tile highlight"><span class="tile-label">Daily target</span><span class="tile-value">${latest.target.toLocaleString("en-US")}<small>kcal</small></span><span class="tile-note">~${latest.protein} g protein</span></div>
      </div>
      <h3 class="panel-sub">History</h3>
      <div class="table-wrap">
        <table class="stats-table">
          <thead><tr><th>Date</th><th>Weight</th><th>BMI</th><th>Target</th></tr></thead>
          <tbody>
            ${player.bodyStats.slice(0, 8).map((s) => `
              <tr><td>${formatDate(s.date)}</td><td>${s.weight} kg</td><td>${s.bmi}</td><td>${s.target.toLocaleString("en-US")} kcal</td></tr>`).join("")}
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
        <h2>Save file</h2>
        <p class="muted">Your profile is stored in this browser on this device. Clearing your browser data removes it.</p>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost btn-small" data-logout>Log out</button>
        <button type="button" class="btn btn-small btn-danger" id="deleteProfile">Delete profile</button>
      </div>
    </section>`;
}

function render() {
  const player = LevelUp.getPlayer();
  if (!player) {
    renderLoggedOut();
    return;
  }
  const p = LevelUp.progress(player.xp);
  root.innerHTML = `
    ${renderHeader(player, p)}
    ${renderSummary(player)}
    <div class="panel-grid">
      ${renderSessions()}
      ${renderWorkouts(player)}
      ${renderBodyStats(player)}
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    lastWorkout = { type: form.elements.type.value, minutes: Number(form.elements.minutes.value) || 30 };
    const result = LevelUp.logWorkout(lastWorkout);
    workoutMessage = result.limitReached
      ? "Workout logged. You've reached today's XP limit, so this one earns no XP. Rest up and come back tomorrow!"
      : `Workout logged: +${result.xp} XP. Keep grinding!`;
    render();
  });

  root.querySelectorAll("[data-cancel-booking]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!confirm("Cancel this session? The XP you earned for it will be removed.")) return;
      try {
        LevelUp.cancelBooking(button.dataset.cancelBooking);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  document.getElementById("deleteProfile").addEventListener("click", () => {
    if (confirm("Delete your profile? Your level, XP, workouts and stats on this device will be gone for good.")) {
      LevelUp.deleteProfile();
    }
  });
}

document.addEventListener("levelup:change", render);
render();
