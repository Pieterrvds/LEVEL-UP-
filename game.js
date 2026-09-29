/* =========================================================
   LEVEL-UP game core
   Player profiles, XP, levels, achievements, the shared HUD,
   the login dialog and toasts. Loaded on every page.

   Save files are stored in this browser (localStorage), so a
   profile lives on the device where it was created. All access
   goes through this module, so it can later be swapped for a
   real backend (e.g. Firebase) without touching the pages.
   ========================================================= */

const LevelUp = (() => {
  const KEYS = {
    accounts: "levelup.accounts.v1",
    session: "levelup.session.v1",
    guestOrders: "levelup.guestOrders.v1",
    bookings: "levelup.bookings.v1"
  };

  const OWNER_EMAIL = "PieterV-D-S@hotmail.com";
  const SESSION_XP = 75;          // client XP per booked session
  const TRAINER_SESSION_XP = 100; // trainer XP per session
  const TRAINER_CLIENT_XP = 50;   // trainer XP per unique client
  const BOOKING_WEEKS_AHEAD = 4;
  const BOOKING_NOTICE_HOURS = 12; // how long before a session it must be booked

  // Accounts with access to the admin dashboard
  const ADMIN_EMAILS = ["pieterv-d-s@hotmail.com"];

  const XP_PER_EURO = 10;
  const WORKOUT_XP_DAILY_LIMIT = 3;

  const RANKS = [
    { level: 1, title: "Rookie" },
    { level: 3, title: "Trainee" },
    { level: 5, title: "Athlete" },
    { level: 8, title: "Warrior" },
    { level: 12, title: "Champion" },
    { level: 16, title: "Legend" }
  ];

  // Personal trainers and the hours they are open for 1-hour sessions.
  // availability: { weekday: [startHour, endHour] }, weekday 0 = Sunday … 6 = Saturday.
  // stats: sessions/clients from before the online schedule, added to their level.
  // color: identity on the site; chartColor: the same hue stepped for charts on the
  // dark surface (validated for colour-blind separation). Next slots: #d95926, #199e70.
  const TRAINERS = [
    {
      id: "filip",
      name: "Filip De Meyst",
      short: "Filip",
      role: "Triathlon coach",
      img: "img/filipironmancoach.jpg",
      color: "#4fc3f7",
      chartColor: "#3987e5",
      availability: { 3: [13, 18] }, // Wednesday afternoon
      stats: { sessions: 0, clients: 0 }
    },
    {
      id: "maxim",
      name: "Maxim Buyl",
      short: "Maxim",
      role: "Cycling coach",
      img: "img/teammembermaximtshirt.jpg",
      color: "#ffd23f",
      chartColor: "#c98500",
      availability: { 0: [9, 18] }, // all day Sunday
      stats: { sessions: 0, clients: 0 }
    }
  ];

  const ITEMS = [
    {
      id: "tshirt",
      name: "LEVEL-UP T-shirt",
      price: 25,
      category: "merch",
      type: "Armor",
      rarity: "common",
      img: "img/teamembermaximtshirtmerch.jpg",
      sizes: ["S", "M", "L"],
      perks: ["+5 Style", "+3 Confidence"],
      desc: "The classic LEVEL-UP tee with the pixel pull-up logo. Light armor for every session."
    },
    {
      id: "hoodie",
      name: "LEVEL-UP Hoodie",
      price: 45,
      category: "merch",
      type: "Armor",
      rarity: "rare",
      img: "img/teammembermaximtruimerch.jpg",
      sizes: ["S", "M", "L"],
      perks: ["+10 Style", "+5 Warmth"],
      desc: "Black hoodie with the full LEVEL-UP back print. Warm-up gear that looks the part."
    },
    {
      id: "parallettes",
      name: "LEVEL-UP Parallettes",
      price: 40,
      category: "tools",
      type: "Tool",
      rarity: "epic",
      img: "img/levelupparalettes.JPG",
      perks: ["+10 STR", "+10 Control"],
      desc: "Wooden parallettes for push-ups, L-sits and handstand work. Unlock new calisthenics skills at home."
    },
    {
      id: "bands",
      name: "LEVEL-UP Resistance Bands",
      price: 25,
      category: "tools",
      type: "Tool",
      rarity: "rare",
      img: null,
      perks: ["+8 STR", "+8 Mobility"],
      desc: "Resistance bands for warm-ups, assisted pull-ups and mobility. Small enough to take on every quest."
    }
  ];

  const ACHIEVEMENTS = [
    { id: "new_player", icon: "★", title: "New player", desc: "Create your player profile.", xp: 50 },
    { id: "stats_saved", icon: "♥", title: "Know your numbers", desc: "Save your body stats.", xp: 25 },
    { id: "first_rep", icon: "▲", title: "First rep", desc: "Log your first workout.", xp: 50 },
    { id: "workouts_10", icon: "⚡", title: "Consistency", desc: "Log 10 workouts.", xp: 150 },
    { id: "workouts_50", icon: "♛", title: "Grinder", desc: "Log 50 workouts.", xp: 500 },
    { id: "first_session", icon: "⚔", title: "Party up", desc: "Book your first session with a trainer.", xp: 100 },
    { id: "sessions_5", icon: "⛨", title: "Regular", desc: "Book 5 sessions with a trainer.", xp: 250 },
    { id: "first_loot", icon: "◆", title: "First loot", desc: "Buy your first item.", xp: 100, shop: true },
    { id: "full_drip", icon: "▣", title: "Full drip", desc: "Own the T-shirt and the hoodie.", xp: 150, shop: true },
    { id: "home_gym", icon: "⚒", title: "Home gym", desc: "Own the parallettes and the resistance bands.", xp: 150, shop: true },
    { id: "collector", icon: "✦", title: "Collector", desc: "Own every item in the shop.", xp: 300, shop: true }
  ];

  // ---------- Helpers ----------
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function remove(key) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }

  const pad = (n) => String(n).padStart(2, "0");
  // Local calendar date as YYYY-MM-DD (built by hand: locale formats differ per browser)
  const dateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  // Monday 00:00 of the current week, shifted by whole weeks
  function startOfWeek(offset = 0, from = new Date()) {
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() - ((from.getDay() + 6) % 7) + offset * 7);
  }
  const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const normaliseEmail = (email) => String(email || "").trim().toLowerCase();

  // ---------- Levels ----------
  // Total XP needed to reach a level: L2 = 100, L3 = 300, L4 = 600, L5 = 1000 …
  const xpForLevel = (level) => 50 * level * (level - 1);

  function levelFromXp(xp) {
    let level = 1;
    while (xp >= xpForLevel(level + 1)) level++;
    return level;
  }

  const rankFor = (level) => [...RANKS].reverse().find((r) => level >= r.level);
  const nextRank = (level) => RANKS.find((r) => r.level > level) || null;

  function progress(xp) {
    const level = levelFromXp(xp);
    const start = xpForLevel(level);
    const end = xpForLevel(level + 1);
    return {
      xp,
      level,
      into: xp - start,
      needed: end - start,
      toNext: end - xp,
      pct: ((xp - start) / (end - start)) * 100,
      rank: rankFor(level),
      nextRank: nextRank(level)
    };
  }

  // ---------- Accounts ----------
  async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(`${salt}:${password}`);
    if (window.crypto && crypto.subtle) {
      return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
    }
    // Fallback for non-secure contexts
    let hash = 0;
    for (const byte of data) hash = (hash * 31 + byte) >>> 0;
    return `f${hash.toString(16)}`;
  }

  function randomSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return toHex(bytes);
  }

  const currentEmail = () => read(KEYS.session, null);

  function getPlayer() {
    const email = currentEmail();
    if (!email) return null;
    return read(KEYS.accounts, {})[email] || null;
  }

  const isAdmin = (player = getPlayer()) => Boolean(player && ADMIN_EMAILS.includes(player.email));

  // Admin only: every player (without password data) and every booking
  function adminData() {
    if (!isAdmin()) throw new Error("Admin access only.");
    const players = Object.values(read(KEYS.accounts, {})).map(({ salt, hash, ...player }) => ({
      ...player,
      admin: ADMIN_EMAILS.includes(player.email)
    }));
    return { players, bookings: getBookings() };
  }

  async function signUp({ name, email, password }) {
    name = String(name || "").trim();
    email = normaliseEmail(email);
    if (!name) throw new Error("Choose a player name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
    if (!password || password.length < 6) throw new Error("Your password needs at least 6 characters.");

    const accounts = read(KEYS.accounts, {});
    if (accounts[email]) throw new Error("A player with this email already exists on this device. Log in instead.");

    const salt = randomSalt();
    accounts[email] = {
      name: name.slice(0, 24),
      email,
      salt,
      hash: await hashPassword(password, salt),
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      xp: 0,
      xpLog: [],
      achievements: {},
      workouts: [],
      bodyStats: [],
      purchases: [],
      inventory: {}
    };

    if (!write(KEYS.accounts, accounts)) {
      throw new Error("Your browser blocked saving the profile (private mode?). Try a normal window.");
    }
    write(KEYS.session, email);
    mutate((player, game) => game.unlock("new_player"));
    claimGuestOrders();
    return getPlayer();
  }

  async function logIn({ email, password }) {
    email = normaliseEmail(email);
    const player = read(KEYS.accounts, {})[email];
    if (!player || (await hashPassword(password || "", player.salt)) !== player.hash) {
      throw new Error("Wrong email or password. New here? Create a new player.");
    }
    write(KEYS.session, email);
    const accounts = read(KEYS.accounts, {});
    accounts[email].lastLogin = new Date().toISOString();
    write(KEYS.accounts, accounts);
    claimGuestOrders();
    emit();
    toast({ title: "Welcome back", text: `${player.name} · LVL ${levelFromXp(player.xp)}` });
    return getPlayer();
  }

  function logOut() {
    remove(KEYS.session);
    emit();
  }

  function deleteProfile() {
    const email = currentEmail();
    if (!email) return;
    const accounts = read(KEYS.accounts, {});
    delete accounts[email];
    write(KEYS.accounts, accounts);
    remove(KEYS.session);
    emit();
  }

  // Apply a change to the logged-in player, then check achievements,
  // save, announce XP / level ups and notify the page.
  function mutate(change) {
    const email = currentEmail();
    const accounts = read(KEYS.accounts, {});
    const player = email && accounts[email];
    if (!player) return null;

    const startLevel = levelFromXp(player.xp);
    const events = [];
    const game = {
      grant(amount, reason) {
        amount = Math.round(amount);
        if (amount <= 0) return;
        player.xp += amount;
        player.xpLog.unshift({ date: new Date().toISOString(), amount, reason });
        player.xpLog = player.xpLog.slice(0, 50);
        events.push({ type: "xp", amount, reason });
      },
      revoke(amount, reason) {
        amount = Math.min(Math.round(amount), player.xp);
        if (amount <= 0) return;
        player.xp -= amount;
        player.xpLog.unshift({ date: new Date().toISOString(), amount: -amount, reason });
        player.xpLog = player.xpLog.slice(0, 50);
        events.push({ type: "xp", amount: -amount, reason });
      },
      unlock(id) {
        if (player.achievements[id]) return;
        const achievement = ACHIEVEMENTS.find((a) => a.id === id);
        if (!achievement) return;
        player.achievements[id] = new Date().toISOString();
        events.push({ type: "achievement", achievement });
        player.xp += achievement.xp;
        player.xpLog.unshift({ date: new Date().toISOString(), amount: achievement.xp, reason: `Achievement: ${achievement.title}` });
      }
    };

    const result = change(player, game);
    checkAchievements(player, game);

    accounts[email] = player;
    write(KEYS.accounts, accounts);
    announce(events, startLevel, levelFromXp(player.xp));
    emit();
    return result;
  }

  function checkAchievements(player, game) {
    const owns = (id) => (player.inventory[id] || 0) > 0;
    const workouts = player.workouts.length;
    if (player.bodyStats.length) game.unlock("stats_saved");
    if (workouts >= 1) game.unlock("first_rep");
    if (workouts >= 10) game.unlock("workouts_10");
    if (workouts >= 50) game.unlock("workouts_50");
    if ((player.sessionsBooked || 0) >= 1) game.unlock("first_session");
    if ((player.sessionsBooked || 0) >= 5) game.unlock("sessions_5");
    if (player.purchases.length) game.unlock("first_loot");
    if (owns("tshirt") && owns("hoodie")) game.unlock("full_drip");
    if (owns("parallettes") && owns("bands")) game.unlock("home_gym");
    if (ITEMS.every((item) => owns(item.id))) game.unlock("collector");
  }

  // ---------- Game actions ----------
  function workoutXp(minutes) {
    return 30 + Math.min(30, Math.floor((Number(minutes) || 0) / 10) * 5);
  }

  function logWorkout({ type, minutes }) {
    minutes = Math.max(5, Math.min(300, Math.round(Number(minutes) || 0)));
    return mutate((player, game) => {
      const date = dateKey();
      const rewardedToday = player.workouts.filter((w) => w.date === date && w.xp > 0).length;
      const xp = rewardedToday < WORKOUT_XP_DAILY_LIMIT ? workoutXp(minutes) : 0;
      player.workouts.unshift({ date, type, minutes, xp });
      player.workouts = player.workouts.slice(0, 500);
      game.grant(xp, `Workout: ${type}`);
      return { xp, limitReached: xp === 0 };
    });
  }

  function saveBodyStats(stats) {
    return mutate((player) => {
      player.bodyStats.unshift({ date: dateKey(), ...stats });
      player.bodyStats = player.bodyStats.slice(0, 30);
      return true;
    });
  }

  const orderXp = (total) => Math.round(total * XP_PER_EURO);

  // Records a paid order. Guests' orders are kept on this device and
  // credited as soon as they log in or create a profile.
  function recordPurchase(order) {
    const xp = orderXp(order.total);
    if (!getPlayer()) {
      const guestOrders = read(KEYS.guestOrders, []);
      guestOrders.push(order);
      write(KEYS.guestOrders, guestOrders);
      return { guest: true, xp };
    }

    const before = levelFromXp(getPlayer().xp);
    mutate((player, game) => {
      if (player.purchases.some((p) => p.id === order.id)) return;
      player.purchases.unshift(order);
      order.items.forEach((item) => {
        player.inventory[item.id] = (player.inventory[item.id] || 0) + item.qty;
      });
      game.grant(xp, `Order ${order.id.slice(-6)}`);
    });
    return { guest: false, xp, levelBefore: before, levelAfter: levelFromXp(getPlayer().xp) };
  }

  function claimGuestOrders() {
    const guestOrders = read(KEYS.guestOrders, []);
    if (!guestOrders.length || !getPlayer()) return;
    remove(KEYS.guestOrders);
    guestOrders.forEach(recordPurchase);
  }

  // ---------- Trainers & bookings ----------
  const trainerById = (id) => TRAINERS.find((t) => t.id === id);
  const getBookings = () => read(KEYS.bookings, []);

  function parseDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // Hours a trainer is open on a given date (YYYY-MM-DD)
  function trainerHours(trainerId, dateKey) {
    const range = trainerById(trainerId)?.availability[parseDate(dateKey).getDay()];
    if (!range) return [];
    const hours = [];
    for (let h = range[0]; h < range[1]; h++) hours.push(h);
    return hours;
  }

  const findBooking = (trainerId, dateKey, hour) =>
    getBookings().find((b) => b.trainerId === trainerId && b.date === dateKey && b.hour === hour);

  const slotStart = (dateKey, hour) => {
    const d = parseDate(dateKey);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  // Why a slot can't be booked right now, or null when it can
  function slotBlocker(dateKeyValue, hour, now = new Date()) {
    const start = slotStart(dateKeyValue, hour);
    if (start <= now) return "past";
    if (start - now < BOOKING_NOTICE_HOURS * 3600 * 1000) return "notice";
    if (start >= startOfWeek(BOOKING_WEEKS_AHEAD, now)) return "horizon";
    return null;
  }

  function bookSession({ trainerId, date, hour, note = "" }) {
    const player = getPlayer();
    if (!player) throw new Error("Log in to book a session.");
    const trainer = trainerById(trainerId);
    if (!trainer || !trainerHours(trainerId, date).includes(hour)) throw new Error("This trainer isn't available at that time.");
    const blocker = slotBlocker(date, hour);
    if (blocker === "past") throw new Error("This time slot has already passed.");
    if (blocker === "notice") throw new Error(`Sessions must be booked at least ${BOOKING_NOTICE_HOURS} hours in advance.`);
    if (blocker === "horizon") throw new Error(`You can book up to ${BOOKING_WEEKS_AHEAD} weeks ahead.`);
    const bookings = getBookings();
    if (bookings.some((b) => b.trainerId === trainerId && b.date === date && b.hour === hour)) {
      throw new Error("Someone just booked this slot. Pick another hour.");
    }
    if (bookings.some((b) => b.email === player.email && b.date === date && b.hour === hour)) {
      throw new Error("You already have a session at this time.");
    }

    const booking = {
      id: `bk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      trainerId,
      date,
      hour,
      note: String(note).slice(0, 300),
      email: player.email,
      name: player.name,
      xp: SESSION_XP,
      createdAt: new Date().toISOString()
    };
    bookings.push(booking);
    write(KEYS.bookings, bookings);

    mutate((p, game) => {
      p.sessionsBooked = (p.sessionsBooked || 0) + 1;
      game.grant(SESSION_XP, `Session with ${trainer.short}`);
    });
    notifyBooking(booking, "booked");
    return booking;
  }

  function cancelBooking(id) {
    const player = getPlayer();
    const bookings = getBookings();
    const booking = bookings.find((b) => b.id === id);
    if (!player || !booking || booking.email !== player.email) throw new Error("Booking not found.");
    if (slotStart(booking.date, booking.hour) <= new Date()) throw new Error("This session has already started.");

    write(KEYS.bookings, bookings.filter((b) => b.id !== id));
    mutate((p, game) => {
      p.sessionsBooked = Math.max(0, (p.sessionsBooked || 0) - 1);
      game.revoke(booking.xp || SESSION_XP, `Cancelled session with ${trainerById(booking.trainerId).short}`);
    });
    notifyBooking(booking, "cancelled");
  }

  const playerBookings = () => {
    const player = getPlayer();
    if (!player) return [];
    return getBookings()
      .filter((b) => b.email === player.email)
      .sort((a, b) => slotStart(a.date, a.hour) - slotStart(b.date, b.hour));
  };

  // Trainers level up with every session and every unique client
  function trainerStats(trainerId) {
    const trainer = trainerById(trainerId);
    const bookings = getBookings().filter((b) => b.trainerId === trainerId);
    const sessions = trainer.stats.sessions + bookings.length;
    const clients = trainer.stats.clients + new Set(bookings.map((b) => b.email)).size;
    const xp = sessions * TRAINER_SESSION_XP + clients * TRAINER_CLIENT_XP;
    return { sessions, clients, ...progress(xp) };
  }

  const formatSlot = (dateKey, hour) =>
    `${parseDate(dateKey).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`;

  // Emails the booking to the LEVEL-UP inbox; the client gets an automatic confirmation.
  function notifyBooking(booking, action) {
    const trainer = trainerById(booking.trainerId);
    const when = formatSlot(booking.date, booking.hour);
    const booked = action === "booked";
    fetch(`https://formsubmit.co/ajax/${OWNER_EMAIL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: `${booked ? "New booking" : "Cancelled"}: ${trainer.short} · ${when}`,
        _template: "table",
        _autoresponse: booked
          ? `Hi ${booking.name}, your session with ${trainer.name} is booked for ${when}. Your trainer will contact you about the location and payment. See you there!\n\nThe LEVEL-UP team`
          : `Hi ${booking.name}, your session with ${trainer.name} on ${when} has been cancelled.\n\nThe LEVEL-UP team`,
        status: booked ? "Booked" : "Cancelled",
        trainer: trainer.name,
        when,
        name: booking.name,
        email: booking.email,
        note: booking.note || "-",
        booking_id: booking.id
      })
    }).catch((error) => console.error("Booking email failed:", error));
  }

  // ---------- Events ----------
  function emit() {
    renderHud();
    document.dispatchEvent(new CustomEvent("levelup:change", { detail: getPlayer() }));
  }

  // Keep tabs in sync
  window.addEventListener("storage", (event) => {
    if (Object.values(KEYS).includes(event.key)) emit();
  });

  // ---------- Toasts ----------
  const toastQueue = [];
  let toastBusy = false;
  let toastEl;

  function toast({ title, text, icon = "★", tone = "gold" }) {
    toastQueue.push({ title, text, icon, tone });
    if (!toastBusy) nextToast();
  }

  function nextToast() {
    const item = toastQueue.shift();
    if (!item) { toastBusy = false; return; }
    toastBusy = true;

    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.dataset.tone = item.tone;
    toastEl.innerHTML = `
      <span class="toast-icon" aria-hidden="true">${esc(item.icon)}</span>
      <div><p class="toast-title">${esc(item.title)}</p><p class="toast-text">${esc(item.text)}</p></div>`;
    requestAnimationFrame(() => toastEl.classList.add("show"));
    setTimeout(() => {
      toastEl.classList.remove("show");
      setTimeout(nextToast, 380);
    }, 2600);
  }

  function announce(events, startLevel, endLevel) {
    events.forEach((event) => {
      if (event.type === "achievement") {
        const a = event.achievement;
        toast({ title: "Achievement unlocked", text: `${a.title} · +${a.xp} XP`, icon: a.icon });
      } else {
        toast(event.amount > 0
          ? { title: `+${event.amount} XP`, text: event.reason, icon: "▲", tone: "green" }
          : { title: `${event.amount} XP`, text: event.reason, icon: "▼", tone: "gold" });
      }
    });
    if (endLevel > startLevel) {
      const rank = rankFor(endLevel);
      const rankUp = rankFor(startLevel).title !== rank.title;
      toast({
        title: "Level up!",
        text: rankUp ? `LVL ${endLevel} · New rank: ${rank.title}` : `You reached LVL ${endLevel}`,
        icon: "⬆"
      });
    }
  }

  // ---------- HUD (header player chip) ----------
  function avatarHtml(player, size = "") {
    const letter = esc((player.name || "?").trim().charAt(0).toUpperCase() || "?");
    const tier = RANKS.indexOf(rankFor(levelFromXp(player.xp)));
    return `<span class="avatar ${size}" data-tier="${tier}" aria-hidden="true">${letter}</span>`;
  }

  function renderHud() {
    const slot = document.getElementById("hudAccount");
    if (!slot) return;
    const player = getPlayer();
    if (!player) {
      slot.innerHTML = `<button type="button" class="btn btn-small hud-login" data-auth-open="login">▶ Log in</button>`;
      return;
    }
    const p = progress(player.xp);
    slot.innerHTML = `
      <a href="profile.html" class="hud-player" title="Your profile · ${p.xp} XP">
        ${avatarHtml(player)}
        <span class="hud-player-meta">
          <span class="hud-player-level">LVL <b>${p.level}</b></span>
          <span class="mini-xp" aria-hidden="true"><i style="width:${p.pct.toFixed(1)}%"></i></span>
        </span>
        <span class="sr-only">Open your profile, level ${p.level}</span>
      </a>
      ${isAdmin(player) ? `<a href="admin.html" class="hud-admin" title="Admin dashboard">⚙<span class="hud-admin-label"> Admin</span></a>` : ""}`;
  }

  // ---------- Login dialog ----------
  let dialog;

  function buildDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "auth-dialog";
    dialog.setAttribute("aria-labelledby", "authTitle");
    dialog.innerHTML = `
      <button type="button" class="dialog-close" data-close aria-label="Close">✕</button>
      <p class="section-kicker">Save file</p>
      <h2 class="auth-title" id="authTitle">Continue your quest</h2>
      <div class="auth-tabs" role="tablist">
        <button type="button" role="tab" data-mode="login">Log in</button>
        <button type="button" role="tab" data-mode="signup">New player</button>
      </div>
      <form class="auth-form" novalidate>
        <label class="signup-only">Player name<input name="name" autocomplete="nickname" maxlength="24"></label>
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <label>Password<input name="password" type="password" minlength="6" required></label>
        <p class="form-error" role="alert"></p>
        <button type="submit" class="btn btn-primary btn-block auth-submit">Log in ▶</button>
      </form>
      <p class="auth-note">Your profile is saved in this browser on this device.</p>`;
    document.body.appendChild(dialog);

    const form = dialog.querySelector("form");
    const error = dialog.querySelector(".form-error");

    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close(); // click on backdrop
    });
    dialog.querySelectorAll("[data-mode]").forEach((tab) => {
      tab.addEventListener("click", () => setMode(tab.dataset.mode));
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      const data = Object.fromEntries(new FormData(form));
      const submit = form.querySelector(".auth-submit");
      submit.disabled = true;
      try {
        if (dialog.dataset.mode === "signup") await signUp(data);
        else await logIn(data);
        form.reset();
        dialog.close();
      } catch (err) {
        error.textContent = err.message;
      } finally {
        submit.disabled = false;
      }
    });
  }

  function setMode(mode) {
    dialog.dataset.mode = mode;
    dialog.querySelectorAll("[data-mode]").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
    });
    dialog.querySelector(".auth-title").textContent = mode === "signup" ? "Create your player" : "Continue your quest";
    dialog.querySelector(".auth-submit").textContent = mode === "signup" ? "Start at LVL 1 ▶" : "Log in ▶";
    dialog.querySelector('[name="password"]').autocomplete = mode === "signup" ? "new-password" : "current-password";
    dialog.querySelector(".form-error").textContent = "";
  }

  function openAuth(mode = "login") {
    if (!dialog) buildDialog();
    setMode(mode);
    if (!dialog.open) dialog.showModal();
    dialog.querySelector(mode === "signup" ? '[name="name"]' : '[name="email"]').focus();
  }

  // ---------- Shared page chrome ----------
  function initChrome() {
    const hud = document.getElementById("hud");
    const nav = document.getElementById("nav");
    const menuToggle = document.getElementById("menuToggle");
    const xpFill = document.getElementById("xpFill");

    if (nav && menuToggle) {
      const setMenu = (open) => {
        nav.classList.toggle("open", open);
        menuToggle.setAttribute("aria-expanded", String(open));
        menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      };
      menuToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        setMenu(!nav.classList.contains("open"));
      });
      nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));
      document.addEventListener("click", (event) => {
        if (nav.classList.contains("open") && !nav.contains(event.target)) setMenu(false);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") setMenu(false);
      });
    }

    const onScroll = () => {
      if (xpFill) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        xpFill.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
      }
      if (hud) hud.classList.toggle("scrolled", window.scrollY > 10);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Any element with data-auth-open opens the login dialog
    document.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-auth-open]");
      if (opener) {
        event.preventDefault();
        openAuth(opener.dataset.authOpen || "login");
      }
      const logout = event.target.closest("[data-logout]");
      if (logout) {
        event.preventDefault();
        logOut();
      }
    });

    const year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();

    renderHud();
  }

  initChrome();

  return {
    ITEMS, TRAINERS, ACHIEVEMENTS, RANKS, XP_PER_EURO, WORKOUT_XP_DAILY_LIMIT, SESSION_XP, BOOKING_WEEKS_AHEAD, BOOKING_NOTICE_HOURS,
    TRAINER_SESSION_XP, TRAINER_CLIENT_XP, dateKey, startOfWeek, isAdmin, adminData, slotBlocker,
    esc, avatarHtml, progress, levelFromXp, xpForLevel, rankFor, orderXp, workoutXp,
    getPlayer, signUp, logIn, logOut, deleteProfile,
    logWorkout, saveBodyStats, recordPurchase,
    trainerById, trainerHours, findBooking, slotStart, parseDate, formatSlot,
    bookSession, cancelBooking, playerBookings, trainerStats,
    openAuth, toast
  };
})();
