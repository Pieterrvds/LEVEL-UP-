/* =========================================================
   LEVEL-UP game core
   Player accounts (Supabase), XP, levels, achievements, bookings,
   the Google Calendar schedule, the shared HUD, login dialog and
   toasts. Loaded on every page, after the Supabase client.

   The database rules live in supabase/schema.sql: XP is awarded
   on the server, players only read their own data and only admins
   can see everything.
   ========================================================= */

const LevelUp = (() => {
  const SUPABASE_URL = "https://zdwlihbsmqiggpyensxc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_sG2smuMtYS_T5Xz1HAPOMA_p70i8nJX"; // public key, safe in the browser

  const OWNER_EMAIL = "PieterV-D-S@hotmail.com";
  const GUEST_ORDERS_KEY = "levelup.guestOrders.v2";

  // Keep these in sync with app_config in supabase/schema.sql
  const SESSION_XP = 75;
  const BOOKING_WEEKS_AHEAD = 4;
  const BOOKING_NOTICE_HOURS = 12;
  const TRAINER_SESSION_XP = 100; // trainer XP per session
  const TRAINER_CLIENT_XP = 50;   // trainer XP per unique client
  const XP_PER_EURO = 10;
  const WORKOUT_XP_DAILY_LIMIT = 3;

  // Personal trainers. Open hours come from the Google Calendar (events such
  // as "Filip available"); `availability` is only used while a trainer has no
  // such events. { weekday: [startHour, endHour] }, weekday 0 = Sunday.
  // color: identity on the site; chartColor: the same hue for charts on the
  // dark surface (the three are validated together for colour-blind readers).
  const TRAINERS = [
    {
      id: "pieter",
      name: "Pieter Van den Spiegel",
      short: "Pieter",
      role: "Head coach",
      img: "img/pf.jpg",
      color: "#ff7eb6",
      chartColor: "#d55181",
      availability: {},
      stats: { sessions: 0, clients: 0 }
    },
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

  const RANKS = [
    { level: 1, title: "Rookie" },
    { level: 3, title: "Trainee" },
    { level: 5, title: "Athlete" },
    { level: 8, title: "Warrior" },
    { level: 12, title: "Champion" },
    { level: 16, title: "Legend" }
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
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => (
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
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }

  const pad = (n) => String(n).padStart(2, "0");
  // Local calendar date as YYYY-MM-DD (built by hand: locale formats differ per browser)
  const dateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  // Monday 00:00 of the current week, shifted by whole weeks
  function startOfWeek(offset = 0, from = new Date()) {
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() - ((from.getDay() + 6) % 7) + offset * 7);
  }

  function parseDate(key) {
    const [y, m, d] = String(key).slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  const slotStart = (key, hour) => {
    const d = parseDate(key);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  const formatSlot = (key, hour) =>
    `${parseDate(key).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${pad(hour)}:00–${pad(hour + 1)}:00`;

  // Turns database errors into messages a player can act on
  function friendly(error, fallback = "Something went wrong. Please try again.") {
    const msg = error?.message || String(error || "");
    if (/failed to fetch|network/i.test(msg)) return "Can't reach the server. Check your connection and try again.";
    if (/could not find the function|schema cache/i.test(msg)) return "The LEVEL-UP server isn't set up yet. Please try again later.";
    return msg || fallback;
  }

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

  const orderXp = (total) => Math.round(total * XP_PER_EURO);
  const workoutXp = (minutes) => 30 + Math.min(30, Math.floor((Number(minutes) || 0) / 10) * 5);

  // ---------- Supabase ----------
  const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  let session = null;
  let player = null;
  let isReady = false;
  let serverError = "";
  let slots = new Map();      // "trainer|date|hour" -> booking id when it's yours, else null
  let trainerCounts = {};     // trainer id -> { sessions, clients }

  async function call(fn, args) {
    if (!sb) throw new Error("Can't reach the server. Check your connection and try again.");
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(friendly(error));
    return data;
  }

  // Player data comes back from the database in the shape the pages use
  function normalisePlayer(data) {
    if (!data) return null;
    return {
      ...data,
      xp: Number(data.xp) || 0,
      sessionsBooked: Number(data.sessionsBooked) || 0,
      inventory: data.inventory || {},
      achievements: data.achievements || {},
      xpLog: data.xpLog || [],
      workouts: data.workouts || [],
      bodyStats: (data.bodyStats || []).map((s) => ({ ...s, weight: Number(s.weight), height: Number(s.height), bmi: Number(s.bmi) })),
      purchases: (data.purchases || []).map((o) => ({ ...o, total: Number(o.total) })),
      bookings: (data.bookings || []).map((b) => ({ ...b, hour: Number(b.hour) }))
    };
  }

  async function refreshPlayer({ announce = false } = {}) {
    if (!session) {
      player = null;
      return null;
    }
    const before = player;
    try {
      player = normalisePlayer(await call("my_data"));
      serverError = "";
    } catch (err) {
      serverError = err.message;
      console.error("Loading player failed:", err);
    }
    if (announce && before && player) announceDiff(before, player);
    return player;
  }

  async function loadSlots() {
    try {
      const rows = await call("slot_status", {
        p_from: dateKey(startOfWeek(0)),
        p_to: dateKey(startOfWeek(BOOKING_WEEKS_AHEAD))
      });
      slots = new Map((rows || []).map((r) => [`${r.trainer_id}|${r.day}|${r.hour}`, r.booking_id || null]));
    } catch (err) {
      serverError = err.message;
      console.error("Loading the schedule failed:", err);
    }
  }

  async function loadTrainerStats() {
    try {
      const rows = await call("trainer_stats");
      trainerCounts = Object.fromEntries((rows || []).map((r) => [r.trainer_id, { sessions: Number(r.sessions), clients: Number(r.clients) }]));
    } catch (err) {
      console.error("Loading trainer stats failed:", err);
    }
  }

  // ---------- Google Calendar ----------
  // Event titles decide what an event means:
  //  "Filip available" / "Maxim beschikbaar"  → bookable hours for that trainer
  //  a title with "group" / "groep"            → group session, shown on the board
  //  anything else                             → busy time (title never shown). It blocks
  //                                              the trainer named in it, or Pieter when no
  //                                              trainer is named (it's his calendar).
  const calendar = { status: "idle", availability: {}, hasAvailability: {}, blocked: {}, groups: [] };
  const AVAILABLE_RE = /\b(available|availability|beschikbaar|vrij|open)\b/i;
  const GROUP_RE = /group|groep/i;

  const trainerInTitle = (title) =>
    TRAINERS.find((t) => new RegExp(`\\b${t.short}\\b`, "i").test(title));

  function addHours(map, trainerId, start, end, allDay) {
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (cursor < end) {
      const key = dateKey(cursor);
      for (let h = 0; h < 24; h++) {
        const from = new Date(cursor); from.setHours(h, 0, 0, 0);
        const to = new Date(cursor); to.setHours(h + 1, 0, 0, 0);
        const inside = allDay || (map === calendar.availability ? from >= start && to <= end : from < end && to > start);
        if (!inside) continue;
        ((map[trainerId] ||= {})[key] ||= new Set()).add(h);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  function parseCalendar(ics) {
    const from = startOfWeek(0);
    const to = startOfWeek(BOOKING_WEEKS_AHEAD);
    const root = new ICAL.Component(ICAL.parse(ics));
    root.getAllSubcomponents("vtimezone").forEach((vtz) => {
      const tz = new ICAL.Timezone(vtz);
      if (!ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz.tzid, tz);
    });

    const vevents = root.getAllSubcomponents("vevent");
    const exceptions = vevents.filter((v) => v.hasProperty("recurrence-id"));
    const occurrences = [];

    vevents.filter((v) => !v.hasProperty("recurrence-id")).forEach((v) => {
      const event = new ICAL.Event(v);
      exceptions.filter((x) => x.getFirstPropertyValue("uid") === event.uid).forEach((x) => event.relateException(x));
      if (event.isRecurring()) {
        const it = event.iterator();
        let next;
        let guard = 0;
        while ((next = it.next()) && guard++ < 5000) {
          const d = event.getOccurrenceDetails(next);
          const start = d.startDate.toJSDate();
          if (start >= to) break;
          const end = d.endDate.toJSDate();
          if (end > from) occurrences.push({ title: d.item.summary || "", location: d.item.location || "", start, end, allDay: d.startDate.isDate });
        }
      } else if (event.startDate) {
        const start = event.startDate.toJSDate();
        const end = event.endDate ? event.endDate.toJSDate() : new Date(start.getTime() + 3600e3);
        if (end > from && start < to) occurrences.push({ title: event.summary || "", location: event.location || "", start, end, allDay: event.startDate.isDate });
      }
    });

    calendar.availability = {};
    calendar.hasAvailability = {};
    calendar.blocked = {};
    calendar.groups = [];
    occurrences.forEach((ev) => {
      const trainer = trainerInTitle(ev.title);
      if (trainer && AVAILABLE_RE.test(ev.title) && !ev.allDay) {
        calendar.hasAvailability[trainer.id] = true;
        addHours(calendar.availability, trainer.id, ev.start, ev.end, false);
        return;
      }
      if (GROUP_RE.test(ev.title) && !ev.allDay) {
        calendar.groups.push({ title: ev.title.trim(), location: ev.location.split(",")[0].trim(), start: ev.start, end: ev.end });
      }
      addHours(calendar.blocked, (trainer || TRAINERS[0]).id, ev.start, ev.end, ev.allDay);
    });
    calendar.groups.sort((a, b) => a.start - b.start);
  }

  async function loadCalendar() {
    if (!window.ICAL) return;
    try {
      const ics = await call("calendar_feed");
      if (ics) {
        parseCalendar(ics);
        calendar.status = "ok";
      } else {
        calendar.status = "fallback";
      }
    } catch (err) {
      calendar.status = "fallback";
      console.error("Loading the calendar failed:", err);
    }
  }

  // Bookable hours of a trainer on a date: calendar availability (or the
  // fallback hours) minus anything else in the trainer's calendar
  function trainerHours(trainerId, key) {
    const trainer = trainerById(trainerId);
    if (!trainer) return [];
    let hours;
    if (calendar.hasAvailability[trainerId]) {
      hours = [...(calendar.availability[trainerId]?.[key] || [])];
    } else {
      const range = trainer.availability[parseDate(key).getDay()];
      hours = [];
      if (range) for (let h = range[0]; h < range[1]; h++) hours.push(h);
    }
    const blocked = calendar.blocked[trainerId]?.[key];
    return hours.filter((h) => !blocked || !blocked.has(h)).sort((a, b) => a - b);
  }

  const groupSessions = (key) => calendar.groups.filter((g) => dateKey(g.start) === key);

  // ---------- Bookings ----------
  const trainerById = (id) => TRAINERS.find((t) => t.id === id);

  // null when free, otherwise { id (only when it's yours), mine }
  function findBooking(trainerId, key, hour) {
    const k = `${trainerId}|${key}|${hour}`;
    if (!slots.has(k)) return null;
    const id = slots.get(k);
    return { id, mine: Boolean(id) };
  }

  // Why a slot can't be booked right now, or null when it can
  function slotBlocker(key, hour, now = new Date()) {
    const start = slotStart(key, hour);
    if (start <= now) return "past";
    if (start - now < BOOKING_NOTICE_HOURS * 3600e3) return "notice";
    if (start >= startOfWeek(BOOKING_WEEKS_AHEAD, now)) return "horizon";
    return null;
  }

  async function bookSession({ trainerId, date, hour, note = "" }) {
    if (!player) throw new Error("Log in to book a session.");
    if (!trainerHours(trainerId, date).includes(hour)) throw new Error("This trainer isn't available at that time.");
    const booking = await call("book_session", { p_trainer: trainerId, p_day: date, p_hour: hour, p_note: String(note).slice(0, 300) });
    await Promise.all([refreshPlayer({ announce: true }), loadSlots(), loadTrainerStats()]);
    notifyBooking({ ...booking, hour: Number(booking.hour), name: player?.name, email: player?.email }, "booked");
    emit();
    return booking;
  }

  async function cancelBooking(id) {
    const booking = await call("cancel_booking", { p_id: id });
    await Promise.all([refreshPlayer({ announce: true }), loadSlots(), loadTrainerStats()]);
    notifyBooking({ ...booking, hour: Number(booking.hour) }, "cancelled");
    emit();
    return booking;
  }

  const playerBookings = () =>
    (player?.bookings || []).slice().sort((a, b) => slotStart(a.date, a.hour) - slotStart(b.date, b.hour));

  // Trainers level up with every session and every unique client
  function trainerStats(trainerId) {
    const trainer = trainerById(trainerId);
    const counts = trainerCounts[trainerId] || { sessions: 0, clients: 0 };
    const sessions = trainer.stats.sessions + counts.sessions;
    const clients = trainer.stats.clients + counts.clients;
    return { sessions, clients, ...progress(sessions * TRAINER_SESSION_XP + clients * TRAINER_CLIENT_XP) };
  }

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

  // Link that adds a session to the visitor's own Google Calendar
  function googleCalendarLink({ trainerId, date, hour }) {
    const trainer = trainerById(trainerId);
    const stamp = (h) => `${String(date).replace(/-/g, "")}T${pad(h)}0000`;
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `LEVEL-UP session with ${trainer.short}`,
      dates: `${stamp(hour)}/${stamp(hour + 1)}`,
      ctz: "Europe/Brussels",
      details: `Personal training with ${trainer.name}. Your trainer contacts you about the location.`
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  }

  // ---------- Player actions ----------
  const getPlayer = () => player;
  const isAdmin = (p = player) => Boolean(p?.admin);

  async function logWorkout({ type, minutes }) {
    const result = await call("log_workout", { p_type: type, p_minutes: Math.round(Number(minutes) || 0) });
    await refreshPlayer({ announce: true });
    emit();
    return result;
  }

  async function saveBodyStats(stats) {
    await call("save_body_stats", { p: stats });
    await refreshPlayer({ announce: true });
    emit();
  }

  // Records a paid order. Guests' orders are remembered on this device
  // and credited as soon as they log in.
  async function recordPurchase(order) {
    const levelBefore = player ? levelFromXp(player.xp) : 1;
    const result = await call("record_order", {
      p_id: order.id,
      p_items: order.items.map(({ id, size, qty }) => ({ id, size, qty }))
    });
    const xp = Number(result?.xp) || orderXp(order.total);
    if (!player) {
      write(GUEST_ORDERS_KEY, [...new Set([...read(GUEST_ORDERS_KEY, []), order.id])]);
      return { guest: true, xp };
    }
    await refreshPlayer({ announce: true });
    emit();
    return { guest: false, xp, levelBefore, levelAfter: levelFromXp(player?.xp || 0) };
  }

  async function claimGuestOrders() {
    const ids = read(GUEST_ORDERS_KEY, []);
    if (!ids.length || !session) return;
    try {
      const gained = await call("claim_orders", { p_ids: ids });
      write(GUEST_ORDERS_KEY, []);
      if (gained > 0) {
        await refreshPlayer({ announce: true });
        emit();
      }
    } catch (err) {
      console.error("Claiming orders failed:", err);
    }
  }

  async function adminData() {
    const data = await call("admin_data");
    return {
      players: (data.players || []).map(normalisePlayer),
      bookings: (data.bookings || []).map((b) => ({ ...b, hour: Number(b.hour) }))
    };
  }

  // ---------- Accounts ----------
  const pageUrl = (page) => new URL(page, window.location.href).href.split("#")[0];

  async function signUp({ name, email, password }) {
    name = String(name || "").trim();
    email = String(email || "").trim().toLowerCase();
    if (!name) throw new Error("Choose a player name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
    if (!password || password.length < 6) throw new Error("Your password needs at least 6 characters.");
    if (!sb) throw new Error(friendly("network"));

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { name: name.slice(0, 24) }, emailRedirectTo: pageUrl("profile.html") }
    });
    if (error) throw new Error(/registered|exists/i.test(error.message) ? "An account with this email already exists. Log in instead." : friendly(error));
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("An account with this email already exists. Log in instead.");
    }
    return { needsConfirmation: !data.session };
  }

  async function logIn({ email, password }) {
    if (!sb) throw new Error(friendly("network"));
    const { error } = await sb.auth.signInWithPassword({ email: String(email || "").trim().toLowerCase(), password: password || "" });
    if (error) {
      if (/confirm/i.test(error.message)) throw new Error("Confirm your email first: click the link we sent you, then log in.");
      if (/invalid/i.test(error.message)) throw new Error("Wrong email or password. New here? Create a new player.");
      throw new Error(friendly(error));
    }
    // onAuthStateChange loads the player and shows the welcome toast
  }

  async function logOut() {
    if (sb) await sb.auth.signOut();
  }

  async function requestPasswordReset(email) {
    email = String(email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter the email address of your account.");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: pageUrl("profile.html") });
    if (error) throw new Error(friendly(error));
  }

  async function updatePassword(password) {
    if (!password || password.length < 6) throw new Error("Your password needs at least 6 characters.");
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw new Error(friendly(error));
  }

  async function deleteProfile() {
    await call("delete_my_account");
    await sb.auth.signOut();
  }

  let welcomed = false;
  async function onSession(event, newSession) {
    const wasLoggedIn = Boolean(session);
    session = newSession;
    if (event === "PASSWORD_RECOVERY") openAuth("new-password");
    if (!session) {
      player = null;
      welcomed = false;
      await loadSlots();
      emit();
      return;
    }
    if ((event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") && player) return;
    await Promise.all([refreshPlayer(), loadSlots()]);
    if (!wasLoggedIn && player && !welcomed) {
      welcomed = true;
      call("touch_login").catch(() => {});
      claimGuestOrders();
      if (event === "SIGNED_IN") {
        const fresh = Date.now() - new Date(player.createdAt).getTime() < 10 * 60e3 && player.xpLog.length <= 1;
        toast(fresh
          ? { title: "Achievement unlocked", text: "New player · +50 XP", icon: "★" }
          : { title: "Welcome back", text: `${player.name} · LVL ${levelFromXp(player.xp)}` });
      }
    }
    emit();
  }

  // ---------- Startup ----------
  const ready = (async () => {
    if (!sb) {
      serverError = "offline";
    } else {
      try {
        const { data } = await sb.auth.getSession();
        session = data.session;
        await Promise.all([session ? refreshPlayer() : null, loadSlots(), loadTrainerStats(), loadCalendar()]);
        if (player) {
          welcomed = true;
          call("touch_login").catch(() => {});
          claimGuestOrders();
        }
      } catch (err) {
        serverError = friendly(err);
        console.error(err);
      }
      sb.auth.onAuthStateChange((event, newSession) => {
        // Supabase advises not to await other calls inside this callback
        setTimeout(() => onSession(event, newSession), 0);
      });
    }
    isReady = true;
    emit();
  })();

  // ---------- Events ----------
  function emit() {
    renderHud();
    document.dispatchEvent(new CustomEvent("levelup:change", { detail: player }));
  }

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

  // Toasts for XP gained since the last load (the server writes the XP log)
  function announceDiff(before, after) {
    const last = before.xpLog[0];
    const fresh = [];
    for (const entry of after.xpLog) {
      if (last && entry.date === last.date && entry.reason === last.reason && entry.amount === last.amount) break;
      fresh.push(entry);
    }
    fresh.reverse().forEach((entry) => {
      const achievement = ACHIEVEMENTS.find((a) => `Achievement: ${a.title}` === entry.reason);
      if (achievement) {
        toast({ title: "Achievement unlocked", text: `${achievement.title} · +${achievement.xp} XP`, icon: achievement.icon });
      } else if (entry.amount > 0) {
        toast({ title: `+${entry.amount} XP`, text: entry.reason, icon: "▲", tone: "green" });
      } else {
        toast({ title: `${entry.amount} XP`, text: entry.reason, icon: "▼", tone: "gold" });
      }
    });
    const startLevel = levelFromXp(before.xp);
    const endLevel = levelFromXp(after.xp);
    if (endLevel > startLevel) {
      const rank = rankFor(endLevel);
      const rankUp = rankFor(startLevel).title !== rank.title;
      toast({ title: "Level up!", text: rankUp ? `LVL ${endLevel} · New rank: ${rank.title}` : `You reached LVL ${endLevel}`, icon: "⬆" });
    }
  }

  // ---------- HUD (header player chip) ----------
  function avatarHtml(p, size = "") {
    const letter = esc((p.name || "?").trim().charAt(0).toUpperCase() || "?");
    const tier = RANKS.indexOf(rankFor(levelFromXp(p.xp)));
    return `<span class="avatar ${size}" data-tier="${tier}" aria-hidden="true">${letter}</span>`;
  }

  function renderHud() {
    const slot = document.getElementById("hudAccount");
    if (!slot) return;
    if (!isReady) {
      slot.innerHTML = `<span class="hud-loading" aria-label="Loading">…</span>`;
      return;
    }
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
      ${isAdmin() ? `<a href="admin.html" class="hud-admin" title="Admin dashboard">⚙<span class="hud-admin-label"> Admin</span></a>` : ""}`;
  }

  // ---------- Login dialog ----------
  let dialog;
  const MODES = {
    login: { title: "Continue your quest", submit: "Log in ▶" },
    signup: { title: "Create your player", submit: "Start at LVL 1 ▶" },
    reset: { title: "Reset your password", submit: "Send reset link ▶" },
    "new-password": { title: "Choose a new password", submit: "Save password ▶" }
  };

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
        <label class="email-field">Email<input name="email" type="email" autocomplete="email" required></label>
        <label class="password-field">Password<input name="password" type="password" minlength="6" required></label>
        <p class="form-error" role="alert"></p>
        <p class="form-success" role="status"></p>
        <button type="submit" class="btn btn-primary btn-block auth-submit">Log in ▶</button>
        <button type="button" class="link-btn auth-forgot" data-mode="reset">Forgot your password?</button>
      </form>
      <p class="auth-note">Your account is stored securely on the LEVEL-UP server.</p>`;
    document.body.appendChild(dialog);

    const form = dialog.querySelector("form");
    const error = dialog.querySelector(".form-error");
    const success = dialog.querySelector(".form-success");

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
      success.textContent = "";
      const data = Object.fromEntries(new FormData(form));
      const submit = form.querySelector(".auth-submit");
      const mode = dialog.dataset.mode;
      submit.disabled = true;
      try {
        if (mode === "signup") {
          const result = await signUp(data);
          if (result.needsConfirmation) {
            form.reset();
            setMode("login");
            dialog.querySelector(".form-success").textContent =
              `Almost there! We sent a confirmation link to ${data.email}. Click it, then log in here.`;
            return;
          }
          dialog.close("success");
        } else if (mode === "reset") {
          await requestPasswordReset(data.email);
          success.textContent = "Check your inbox: we sent you a link to choose a new password.";
        } else if (mode === "new-password") {
          await updatePassword(data.password);
          form.reset();
          dialog.close("success");
          toast({ title: "Password saved", text: "You're logged in with your new password.", icon: "✓", tone: "green" });
        } else {
          await logIn(data);
          form.reset();
          dialog.close("success");
        }
      } catch (err) {
        error.textContent = err.message;
      } finally {
        submit.disabled = false;
      }
    });
  }

  function setMode(mode) {
    dialog.dataset.mode = mode;
    dialog.querySelectorAll("[role=tab][data-mode]").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
    });
    dialog.querySelector(".auth-title").textContent = MODES[mode].title;
    dialog.querySelector(".auth-submit").textContent = MODES[mode].submit;
    dialog.querySelector('[name="password"]').autocomplete = mode === "login" ? "current-password" : "new-password";
    dialog.querySelector(".form-error").textContent = "";
    dialog.querySelector(".form-success").textContent = "";
  }

  function openAuth(mode = "login") {
    if (!dialog) buildDialog();
    setMode(mode);
    dialog.returnValue = "";
    if (!dialog.open) dialog.showModal();
    const focus = { signup: '[name="name"]', "new-password": '[name="password"]' }[mode] || '[name="email"]';
    dialog.querySelector(focus).focus();
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
    TRAINER_SESSION_XP, TRAINER_CLIENT_XP,
    ready, isReady: () => isReady, serverError: () => serverError, calendarStatus: () => calendar.status,
    esc, dateKey, startOfWeek, parseDate, slotStart, formatSlot, avatarHtml, progress, levelFromXp, xpForLevel, rankFor, orderXp, workoutXp,
    getPlayer, isAdmin, adminData, signUp, logIn, logOut, deleteProfile, requestPasswordReset, updatePassword,
    logWorkout, saveBodyStats, recordPurchase,
    trainerById, trainerHours, groupSessions, findBooking, slotBlocker, googleCalendarLink,
    bookSession, cancelBooking, playerBookings, trainerStats,
    openAuth, toast
  };
})();
