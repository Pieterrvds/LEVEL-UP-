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
  const SESSION_PRICE = 60;       // euro per 1-hour session (the server's app_config decides the real price)
  const TRAINER_FEE = 40;         // the trainer's share; the rest goes to the venue
  const BOOKING_WEEKS_AHEAD = 4;
  const BOOKING_NOTICE_HOURS = 12;
  const FREE_CANCEL_HOURS = 24;   // later cancellations of a confirmed session are charged in full
  const REWARD_WINDOW_DAYS = 7;   // trainers can reward / mark a no-show up to 7 days after
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
    { id: "stats_saved", icon: "♥", title: "Know your numbers", desc: "Set your character stats.", xp: 25 },
    { id: "checkins_4", icon: "◷", title: "On track", desc: "Do a weekly check-in in 4 different weeks.", xp: 150 },
    { id: "first_rep", icon: "▲", title: "First rep", desc: "Log your first workout.", xp: 50 },
    { id: "workouts_10", icon: "⚡", title: "Consistency", desc: "Log 10 workouts.", xp: 150 },
    { id: "workouts_50", icon: "♛", title: "Grinder", desc: "Log 50 workouts.", xp: 500 },
    { id: "first_session", icon: "⚔", title: "Party up", desc: "Complete your first session with a trainer.", xp: 100 },
    { id: "sessions_5", icon: "⛨", title: "Regular", desc: "Complete 5 sessions with a trainer.", xp: 250 },
    { id: "full_party", icon: "♞", title: "Full party", desc: "Complete sessions with 3 different trainers.", xp: 200 },
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
  const CHECKIN_XP = 25;

  // ---------- Character stats ----------
  const ACTIVITY_LEVELS = [
    { value: 1.2, label: "Sedentary (little to no exercise)" },
    { value: 1.375, label: "Lightly active (1–3 days/week)" },
    { value: 1.55, label: "Moderately active (3–5 days/week)" },
    { value: 1.725, label: "Very active (6–7 days/week)" },
    { value: 1.9, label: "Athlete level" }
  ];
  const GOALS = { lose: "Lose fat", maintain: "Maintain", gain: "Build muscle" };

  // BMI, BMR (Mifflin-St Jeor), daily calories for the goal and a protein target
  function computeStats({ weight, height, age, sex, activity, goal }) {
    weight = Number(weight);
    height = Number(height);
    age = Number(age);
    activity = Number(activity) || 1.55;
    goal = GOALS[goal] ? goal : "maintain";
    sex = sex === "female" ? "female" : "male";
    if (!(weight >= 30 && weight <= 300)) throw new Error("Enter a weight between 30 and 300 kg.");
    if (!(height >= 120 && height <= 230)) throw new Error("Enter a height between 120 and 230 cm.");
    if (!(age >= 14 && age <= 100)) throw new Error("Enter an age between 14 and 100.");
    const bmi = weight / ((height / 100) ** 2);
    const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161);
    const maintenance = bmr * activity;
    const target = maintenance * { lose: 0.8, maintain: 1, gain: 1.1 }[goal];
    const protein = weight * { lose: 2.0, maintain: 1.6, gain: 1.8 }[goal];
    return {
      weight, height, age, sex, activity, goal,
      bmi: Math.round(bmi * 10) / 10,
      bmr: Math.round(bmr),
      maintenance: Math.round(maintenance),
      target: Math.round(target),
      protein: Math.round(protein)
    };
  }

  function bmiCategory(bmi) {
    if (bmi < 18.5) return { label: "Underweight", warn: true };
    if (bmi < 25) return { label: "Healthy range", warn: false };
    if (bmi < 30) return { label: "Overweight", warn: true };
    return { label: "Obese", warn: true };
  }

  // Next moment the weekly check-in pays XP again (null = now)
  function nextCheckin(p = player) {
    const last = (p?.xpLog || []).find((e) => e.reason === "Weekly check-in" && e.amount > 0);
    if (!last) return null;
    const next = new Date(new Date(last.date).getTime() + (6 * 24 + 12) * 3600e3);
    return next > new Date() ? next : null;
  }
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
  let slots = new Map();      // "trainer|date|hour" -> { id, status } (only filled in when it's yours)
  let coachBookings = [];     // bookings for the logged-in trainer's card
  let coachEarnings = null;   // { earned, paid, owed, expected, sessions, fee, isOwner }
  let trainerCounts = {};     // trainer id -> { sessions, clients, accountXp }
  let leaderboard = [];       // [{ place, name, xp, isMe }]

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
      bookings: (data.bookings || []).map((b) => ({
        ...b,
        hour: Number(b.hour),
        price: Number(b.price ?? SESSION_PRICE),
        trainerFee: Number(b.trainerFee ?? TRAINER_FEE)
      })),
      applications: data.applications || [],
      unlinkedTrainers: data.unlinkedTrainers || [],
      pricing: {
        price: Number(data.pricing?.price ?? SESSION_PRICE),
        fee: Number(data.pricing?.fee ?? TRAINER_FEE),
        ownerTrainerId: data.pricing?.ownerTrainerId || "pieter"
      }
    };
  }

  // Tells a player when a trainer confirmed or declined since their last visit
  function announceBookingChanges() {
    if (!player) return;
    const key = `levelup.bookingStatus.${player.id}`;
    const seen = read(key, null);
    const now = Object.fromEntries(player.bookings.map((b) => [b.id, b.status]));
    if (seen) {
      player.bookings.forEach((b) => {
        const before = seen[b.id];
        if (before !== "pending" || b.status === "pending") return;
        const t = trainerById(b.trainerId);
        if (b.status === "confirmed") toast({ title: "Session confirmed", text: `${t.short} · ${formatSlot(b.date, b.hour)}`, icon: "✓", tone: "green" });
        if (b.status === "declined") toast({ title: "Request declined", text: `${t.short} can't make it. Pick another hour.`, icon: "✕" });
        if (b.status === "expired") toast({ title: "Request expired", text: `${t.short} didn't answer in time. Pick another hour.`, icon: "⌛" });
      });
    }
    write(key, now);
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
    if (player) {
      announceBookingChanges();
      await loadCoachBookings();
      claimBookingNotices();
    }
    return player;
  }

  async function loadSlots() {
    try {
      const rows = await call("slot_status", {
        p_from: dateKey(startOfWeek(0)),
        p_to: dateKey(startOfWeek(BOOKING_WEEKS_AHEAD))
      });
      slots = new Map((rows || []).map((r) => [`${r.trainer_id}|${r.day}|${r.hour}`, { id: r.booking_id || null, status: r.status || null }]));
    } catch (err) {
      serverError = err.message;
      console.error("Loading the schedule failed:", err);
    }
  }

  async function loadTrainerStats() {
    try {
      const rows = await call("trainer_stats");
      trainerCounts = Object.fromEntries((rows || []).map((r) => [r.trainer_id, {
        sessions: Number(r.sessions),
        clients: Number(r.clients),
        accountXp: r.account_xp === null || r.account_xp === undefined ? null : Number(r.account_xp)
      }]));
    } catch (err) {
      console.error("Loading trainer stats failed:", err);
    }
  }

  // Trainers approved through the admin dashboard get added to the site automatically
  async function loadTrainerList() {
    try {
      const rows = await call("trainer_list");
      (rows || []).forEach((r) => {
        if (TRAINERS.some((t) => t.id === r.id)) return;
        TRAINERS.push({
          id: r.id,
          name: r.name,
          short: String(r.name).trim().split(/\s+/)[0],
          role: r.role || "Personal trainer",
          bio: r.bio || "",
          specialties: r.specialties || "",
          img: "img/pfdefault.png",
          color: r.color || "#a6b3a9",
          chartColor: r.chart_color || "#7f8f84",
          availability: {},
          stats: { sessions: 0, clients: 0 },
          dynamic: true
        });
      });
    } catch (err) {
      console.error("Loading trainers failed:", err);
    }
  }

  async function loadLeaderboard() {
    try {
      const rows = await call("leaderboard");
      leaderboard = (rows || []).map((r) => ({ place: Number(r.place), name: r.name, xp: Number(r.xp), isMe: Boolean(r.is_me) }));
    } catch (err) {
      console.error("Loading the high scores failed:", err);
    }
  }

  async function setLeaderboardVisibility(show) {
    await call("set_leaderboard_visibility", { p_show: Boolean(show) });
    await Promise.all([refreshPlayer(), loadLeaderboard()]);
    emit();
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

  // null when free, otherwise { id, status (only when it's yours), mine }
  function findBooking(trainerId, key, hour) {
    const k = `${trainerId}|${key}|${hour}`;
    if (!slots.has(k)) return null;
    const { id, status } = slots.get(k);
    return { id, status, mine: Boolean(id) };
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
    await Promise.all([refreshPlayer(), loadSlots()]);
    notifyBooking({ ...booking, hour: Number(booking.hour) }, "requested");
    emit();
    return booking;
  }

  // A confirmed session cancelled less than FREE_CANCEL_HOURS before is charged in full
  function isLateCancel(b) {
    if (b.status !== "confirmed") return false;
    const until = b.freeCancelUntil ? new Date(b.freeCancelUntil) : new Date(slotStart(b.date, b.hour) - FREE_CANCEL_HOURS * 3600e3);
    return new Date() >= until;
  }

  async function cancelBooking(id) {
    const booking = await call("cancel_booking", { p_id: id });
    await Promise.all([refreshPlayer(), loadSlots(), loadCoachBookings()]);
    notifyBooking({ ...booking, hour: Number(booking.hour) }, booking.late ? "late_cancel" : "cancelled");
    emit();
    return booking;
  }

  // Expired requests: whichever browser (client, trainer or admin) claims them first sends the email
  async function claimBookingNotices() {
    try {
      const rows = await call("claim_booking_notices");
      (rows || []).forEach((b) => notifyBooking({ ...b, hour: Number(b.hour) }, "expired"));
    } catch (err) {
      console.error("Claiming booking notices failed:", err);
    }
  }

  // ---------- Trainer side: confirm, decline, reward ----------
  const isTrainer = () => Boolean(player?.trainerId);

  async function loadCoachBookings() {
    if (!isTrainer()) { coachBookings = []; coachEarnings = null; return; }
    try {
      const [rows, earnings] = await Promise.all([call("coach_bookings"), call("coach_earnings")]);
      coachBookings = (rows || []).map((b) => ({ ...b, hour: Number(b.hour) }));
      coachEarnings = earnings
        ? Object.fromEntries(Object.entries(earnings).map(([k, v]) => [k, typeof v === "string" && !isNaN(v) && k !== "trainerId" ? Number(v) : v]))
        : null;
    } catch (err) {
      console.error("Loading coach bookings failed:", err);
    }
  }

  async function markPayout(trainerId) {
    const result = await call("mark_payout", { p_trainer: trainerId });
    emit();
    return result;
  }

  const euro = (n) => `€${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  async function respondBooking(id, accept) {
    const booking = await call("respond_booking", { p_id: id, p_accept: Boolean(accept) });
    await Promise.all([loadCoachBookings(), loadSlots()]);
    notifyBooking({ ...booking, hour: Number(booking.hour) }, accept ? "confirmed" : "declined");
    emit();
    return booking;
  }

  async function rewardSession(id) {
    const booking = await call("reward_session", { p_id: id });
    await Promise.all([refreshPlayer({ announce: true }), loadCoachBookings(), loadTrainerStats(), loadLeaderboard()]);
    const trainer = trainerById(booking.trainerId);
    toast({ title: "Session rewarded", text: `${booking.name} · +${booking.xp} XP with ${trainer.short}`, icon: "★", tone: "green" });
    emit();
    return booking;
  }

  async function markNoShow(id) {
    const booking = await call("mark_no_show", { p_id: id });
    await Promise.all([refreshPlayer(), loadCoachBookings()]);
    notifyBooking({ ...booking, hour: Number(booking.hour) }, "no_show");
    toast({ title: "Marked as no-show", text: `${booking.name} · charged ${euro(booking.price)}`, icon: "✕" });
    emit();
    return booking;
  }

  const isToday = (key) => key === dateKey();
  const daysAgo = (key) => Math.round((parseDate(dateKey()) - parseDate(key)) / 864e5);
  // Confirmed sessions from today back to REWARD_WINDOW_DAYS ago still need a Reward or No-show
  const canSettle = (b, admin = false) => b.status === "confirmed" && daysAgo(b.date) >= 0 && (admin || daysAgo(b.date) <= REWARD_WINDOW_DAYS);
  const hasStarted = (b) => slotStart(b.date, b.hour) <= new Date();
  const coachRequests = () => coachBookings.filter((b) => b.status === "pending" && slotStart(b.date, b.hour) > new Date());
  const coachToReward = () => coachBookings.filter((b) => canSettle(b));

  const playerBookings = () =>
    (player?.bookings || []).slice().sort((a, b) => slotStart(a.date, a.hour) - slotStart(b.date, b.hour));

  // Trainers level up with every session and every unique client
  function trainerStats(trainerId) {
    const trainer = trainerById(trainerId);
    const counts = trainerCounts[trainerId] || { sessions: 0, clients: 0 };
    const sessions = trainer.stats.sessions + counts.sessions;
    const clients = trainer.stats.clients + counts.clients;
    // A trainer with an account levels up in that account (coaching XP goes there)
    const xp = counts.accountXp ?? sessions * TRAINER_SESSION_XP + clients * TRAINER_CLIENT_XP;
    return { sessions, clients, linked: counts.accountXp !== null && counts.accountXp !== undefined, ...progress(xp) };
  }

  // Emails every booking step to the LEVEL-UP inbox. The trainer gets a copy
  // (when their account is linked) and the client an automatic reply.
  function notifyBooking(booking, action) {
    const trainer = trainerById(booking.trainerId);
    const when = formatSlot(booking.date, booking.hour);
    const texts = {
      requested: {
        subject: `New booking request: ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, your request for a session with ${trainer.name} on ${when} has been sent. ${trainer.short} will confirm it soon; you'll see the status in your LEVEL-UP profile.`
      },
      confirmed: {
        subject: `Confirmed: ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, good news: ${trainer.name} confirmed your session on ${when}. Price: ${euro(booking.price ?? SESSION_PRICE)} for the hour; LEVEL-UP will send you the payment details. After the session you get +${booking.xp} XP.`
      },
      declined: {
        subject: `Declined: ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, unfortunately ${trainer.name} can't make it on ${when}. Pick another hour in the LEVEL-UP schedule.`
      },
      cancelled: {
        subject: `Cancelled: ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, your session with ${trainer.name} on ${when} has been cancelled. No costs.`
      },
      late_cancel: {
        subject: `Late cancellation (charged): ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, your session with ${trainer.name} on ${when} has been cancelled less than ${FREE_CANCEL_HOURS} hours before the start. As agreed in our cancellation policy, the session is charged in full: ${euro(booking.price ?? SESSION_PRICE)}. LEVEL-UP will send you the payment details.`
      },
      no_show: {
        subject: `No-show (charged): ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, we missed you at your session with ${trainer.name} on ${when}. A missed session is charged in full: ${euro(booking.price ?? SESSION_PRICE)}. LEVEL-UP will send you the payment details. Something came up? Reply to this email.`
      },
      expired: {
        subject: `Request expired: ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, your request for a session with ${trainer.name} on ${when} wasn't confirmed in time, so it has been cancelled. No costs. Pick another hour in the LEVEL-UP schedule.`
      }
    }[action];
    fetch(`https://formsubmit.co/ajax/${OWNER_EMAIL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: texts.subject,
        _template: "table",
        ...(booking.trainerEmail && booking.trainerEmail.toLowerCase() !== OWNER_EMAIL.toLowerCase() ? { _cc: booking.trainerEmail } : {}),
        _autoresponse: `${texts.reply}\n\nThe LEVEL-UP team`,
        status: action,
        trainer: trainer.name,
        when,
        name: booking.name,
        email: booking.email,
        note: booking.note || "-",
        price: euro(booking.price ?? SESSION_PRICE),
        booking_id: booking.id,
        charged: ["late_cancel", "no_show"].includes(action) ? `Yes, ${euro(booking.price ?? SESSION_PRICE)}` : "No",
        next_step: action === "requested" ? `${trainer.short}: log in on the LEVEL-UP website to confirm or decline.` : "-"
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
    await Promise.all([refreshPlayer({ announce: true }), loadLeaderboard(), loadTrainerStats()]);
    emit();
    return result;
  }

  async function saveBodyStats(input) {
    const stats = computeStats(input);
    const result = await call("save_body_stats", { p: stats });
    await Promise.all([refreshPlayer({ announce: true }), loadLeaderboard(), loadTrainerStats()]);
    emit();
    return { xp: Number(result?.xp) || 0, stats };
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
    await Promise.all([refreshPlayer({ announce: true }), loadLeaderboard(), loadTrainerStats()]);
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
      bookings: (data.bookings || []).map((b) => ({
        ...b,
        hour: Number(b.hour),
        price: Number(b.price ?? SESSION_PRICE),
        trainerFee: Number(b.trainerFee ?? TRAINER_FEE)
      })),
      applications: data.applications || [],
      unlinkedTrainers: data.unlinkedTrainers || [],
      pricing: {
        price: Number(data.pricing?.price ?? SESSION_PRICE),
        fee: Number(data.pricing?.fee ?? TRAINER_FEE),
        ownerTrainerId: data.pricing?.ownerTrainerId || "pieter"
      }
    };
  }

  // ---------- Accounts ----------
  const pageUrl = (page) => new URL(page, window.location.href).href.split("#")[0];

  async function signUp({ name, email, password, stats, trainerApplication }) {
    name = String(name || "").trim();
    email = String(email || "").trim().toLowerCase();
    if (!name) throw new Error("Choose a player name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
    if (!password || password.length < 6) throw new Error("Your password needs at least 6 characters.");
    if (!sb) throw new Error(friendly("network"));

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name.slice(0, 24),
          ...(stats ? { stats } : {}),
          ...(trainerApplication ? { trainer_application: trainerApplication } : {})
        },
        emailRedirectTo: pageUrl("profile.html")
      }
    });
    if (error) throw new Error(/registered|exists/i.test(error.message) ? "An account with this email already exists. Log in instead." : friendly(error));
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("An account with this email already exists. Log in instead.");
    }
    if (trainerApplication) notifyApplication({ name, email, ...trainerApplication });
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
      await Promise.all([loadSlots(), loadLeaderboard()]);
      emit();
      return;
    }
    if ((event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") && player) return;
    await Promise.all([refreshPlayer(), loadSlots(), loadLeaderboard(), loadTrainerStats()]);
    if (!wasLoggedIn && player && !welcomed) {
      welcomed = true;
      call("touch_login").catch(() => {});
      claimGuestOrders();
      setTimeout(showCoachInbox, 900);
      setTimeout(showAdminInbox, 1500);
      if (event === "SIGNED_IN") {
        const fresh = Date.now() - new Date(player.createdAt).getTime() < 10 * 60e3;
        toast(fresh
          ? { title: "Player created", text: `${player.name} · LVL ${levelFromXp(player.xp)} · ${player.xp} XP`, icon: "★" }
          : { title: "Welcome back", text: `${player.name} · LVL ${levelFromXp(player.xp)}` });
      }
    }
    emit();
  }

  // ---------- Trainer applications ----------
  function cleanApplication({ role, specialties, bio }) {
    const app = {
      role: String(role || "").trim().slice(0, 60),
      specialties: String(specialties || "").trim().slice(0, 200),
      bio: String(bio || "").trim().slice(0, 600)
    };
    if (!app.role) throw new Error("Fill in your coaching title, e.g. Cycling coach.");
    if (!app.specialties) throw new Error("Tell us what you coach.");
    return app;
  }

  function notifyApplication(app) {
    fetch(`https://formsubmit.co/ajax/${OWNER_EMAIL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: `New trainer application: ${app.name}`,
        _template: "table",
        _autoresponse: `Hi ${app.name}, thanks for applying as a personal trainer on LEVEL-UP! We'll review your application soon and let you know by email. You can already use your account as a player.\n\nThe LEVEL-UP team`,
        name: app.name,
        email: app.email,
        role: app.role,
        specialties: app.specialties,
        about: app.bio || "-",
        next_step: "Review it in the LEVEL-UP admin dashboard under Trainer applications."
      })
    }).catch((error) => console.error("Application email failed:", error));
  }

  async function applyAsTrainer(input) {
    const app = cleanApplication(input);
    await call("apply_as_trainer", { p: app });
    notifyApplication({ ...app, name: player.name, email: player.email });
    await refreshPlayer();
    emit();
  }

  async function reviewApplication(id, approve, trainerId = null) {
    const result = await call("review_trainer_application", { p_id: id, p_approve: Boolean(approve), p_trainer: trainerId || null });
    fetch(`https://formsubmit.co/ajax/${OWNER_EMAIL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: `Trainer application ${approve ? "approved" : "not approved"}: ${result.name}`,
        _template: "table",
        _autoresponse: approve
          ? `Hi ${result.name}, welcome to the LEVEL-UP team! Your trainer account is active. Log in to find your Coach panel in your profile. Add your open hours to the LEVEL-UP calendar as "${String(result.name).split(" ")[0]} available" and players can book you.\n\nThe LEVEL-UP team`
          : `Hi ${result.name}, thanks for your interest in coaching on LEVEL-UP. We can't approve your trainer application right now. You can keep using your account as a player.\n\nThe LEVEL-UP team`,
        name: result.name,
        email: result.email,
        decision: approve ? `Approved (trainer card: ${result.trainerId})` : "Not approved"
      })
    }).catch((error) => console.error("Decision email failed:", error));
    await loadTrainerList();
    emit();
    return result;
  }

  // Admin pop-up: new trainer applications
  async function showAdminInbox() {
    if (!isAdmin()) return;
    let pending = [];
    try { pending = (await call("admin_inbox")) || []; } catch { return; }
    if (!pending.length) return;
    const signature = pending.map((a) => a.id).join(",");
    try {
      if (sessionStorage.getItem("levelup.adminInbox") === signature) return;
      sessionStorage.setItem("levelup.adminInbox", signature);
    } catch { /* storage unavailable */ }
    if (document.querySelector(".coach-dialog[open]")) return; // don't stack pop-ups
    const box = document.createElement("dialog");
    box.className = "auth-dialog coach-dialog";
    box.innerHTML = `
      <button type="button" class="dialog-close" data-close aria-label="Close">✕</button>
      <p class="section-kicker">Game master inbox</p>
      <h2 class="auth-title">${pending.length} new trainer application${pending.length === 1 ? "" : "s"}</h2>
      <ul class="coach-list">${pending.map((a) => `
        <li class="coach-item"><div><p class="coach-who">${esc(a.name)}</p><p class="muted">${esc(a.role || "Personal trainer")}</p></div></li>`).join("")}
      </ul>
      <div class="btn-row"><a href="admin.html#applications" class="btn btn-primary btn-small">Review in admin ▶</a></div>`;
    document.body.appendChild(box);
    box.addEventListener("click", (event) => {
      if (event.target === box || event.target.closest("[data-close]")) box.close();
    });
    box.addEventListener("close", () => box.remove());
    box.showModal();
  }

  // ---------- Trainer pop-up: requests to answer, sessions to reward ----------
  let coachDialog;
  function showCoachInbox({ force = false } = {}) {
    if (!isTrainer()) return;
    const requests = coachRequests();
    const rewards = coachToReward();
    if (!requests.length && !rewards.length) { coachDialog?.close(); return; }
    const signature = [...requests, ...rewards].map((b) => b.id + b.status).join(",");
    try {
      if (!force && sessionStorage.getItem("levelup.coachInbox") === signature) return;
      sessionStorage.setItem("levelup.coachInbox", signature);
    } catch { /* storage unavailable */ }

    if (!coachDialog) {
      coachDialog = document.createElement("dialog");
      coachDialog.className = "auth-dialog coach-dialog";
      coachDialog.setAttribute("aria-labelledby", "coachTitle");
      document.body.appendChild(coachDialog);
      coachDialog.addEventListener("click", async (event) => {
        if (event.target === coachDialog || event.target.closest("[data-close]")) { coachDialog.close(); return; }
        const btn = event.target.closest("[data-coach-action]");
        if (!btn) return;
        btn.disabled = true;
        const row = btn.closest(".coach-item");
        try {
          if (btn.dataset.coachAction === "reward") await rewardSession(btn.dataset.id);
          else if (btn.dataset.coachAction === "noshow") {
            const b = coachBookings.find((x) => x.id === btn.dataset.id);
            if (!confirm(`Mark ${b.name} as no-show? The session is charged in full (${euro(b.price)}) and they get an email.`)) { btn.disabled = false; return; }
            await markNoShow(btn.dataset.id);
          } else await respondBooking(btn.dataset.id, btn.dataset.coachAction === "confirm");
          showCoachInbox({ force: true });
        } catch (err) {
          btn.disabled = false;
          row.querySelector(".form-error").textContent = err.message;
        }
      });
    }
    const item = (b, actions) => `
      <li class="coach-item">
        <div>
          <p class="coach-who">${esc(b.name)}</p>
          <p class="muted">${formatSlot(b.date, b.hour)}${b.note ? ` · “${esc(b.note)}”` : ""}</p>
          <p class="form-error" role="alert"></p>
        </div>
        <div class="coach-actions">${actions(b)}</div>
      </li>`;
    coachDialog.innerHTML = `
      <button type="button" class="dialog-close" data-close aria-label="Close">✕</button>
      <p class="section-kicker">Coach inbox · ${esc(trainerById(player.trainerId).name)}</p>
      <h2 class="auth-title" id="coachTitle">${requests.length ? `${requests.length} new booking request${requests.length === 1 ? "" : "s"}` : `${rewards.length} session${rewards.length === 1 ? "" : "s"} to settle`}</h2>
      ${requests.length ? `
        <ul class="coach-list">${requests.map((b) => item(b, (x) => `
          <button type="button" class="btn btn-small btn-primary" data-coach-action="confirm" data-id="${x.id}">Confirm</button>
          <button type="button" class="btn btn-small btn-ghost" data-coach-action="decline" data-id="${x.id}">Decline</button>`)).join("")}
        </ul>` : ""}
      ${rewards.length ? `
        <h3 class="panel-sub">Sessions to settle · reward after training, or mark a no-show</h3>
        <ul class="coach-list">${rewards.map((b) => item(b, (x) => `
          <button type="button" class="btn btn-small btn-primary" data-coach-action="reward" data-id="${x.id}">Reward +${x.xp} XP</button>
          ${hasStarted(x) ? `<button type="button" class="btn btn-small btn-ghost" data-coach-action="noshow" data-id="${x.id}">No-show</button>` : ""}`)).join("")}
        </ul>
        <p class="auth-note">Settle within ${REWARD_WINDOW_DAYS} days: your ${euro(TRAINER_FEE)} only counts once a session is rewarded or marked as no-show.</p>` : ""}
      <p class="auth-note">You can also handle these later in your profile, under Coach panel.</p>`;
    if (!coachDialog.open) coachDialog.showModal();
  }

  // ---------- Startup ----------
  const ready = (async () => {
    if (!sb) {
      serverError = "offline";
    } else {
      try {
        const { data } = await sb.auth.getSession();
        session = data.session;
        await loadTrainerList(); // before the calendar, so new trainers' open hours are recognised
        await Promise.all([session ? refreshPlayer() : null, loadSlots(), loadTrainerStats(), loadCalendar(), loadLeaderboard()]);
        if (player) {
          welcomed = true;
          call("touch_login").catch(() => {});
          claimGuestOrders();
          setTimeout(showCoachInbox, 600);
          setTimeout(showAdminInbox, 1200);
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
        <fieldset class="signup-only role-picker">
          <legend>I am a…</legend>
          <label><input type="radio" name="kind" value="player" checked><span><b>Player</b><small>I want to train and level up</small></span></label>
          <label><input type="radio" name="kind" value="trainer"><span><b>Personal trainer</b><small>I want to coach players</small></span></label>
        </fieldset>
        <label class="signup-only">Name<input name="name" autocomplete="nickname" maxlength="24"></label>
        <label class="email-field">Email<input name="email" type="email" autocomplete="email" required></label>
        <label class="password-field">Password<input name="password" type="password" minlength="6" required></label>
        <div class="signup-trainer">
          <p class="stats-intro">Step 2 of 2 · <strong>Trainer application.</strong> Pieter reviews it and unlocks your trainer account. Meanwhile you can use LEVEL-UP as a player.</p>
          <label>Coaching title<input name="role" maxlength="60" placeholder="e.g. Cycling coach"></label>
          <label>What do you coach?<input name="specialties" maxlength="200" placeholder="e.g. Road cycling, endurance, bike fitness"></label>
          <label>About you (optional)<textarea name="bio" rows="3" maxlength="600" placeholder="Experience, certificates, where you train…"></textarea></label>
        </div>
        <div class="signup-stats">
          <p class="stats-intro">Step 2 of 2 · <strong>Character stats.</strong> We use these for your BMI, daily calories and progress. Only you and your coach can see them.</p>
          <div class="field-row">
            <label>Weight (kg)<input name="weight" type="number" min="30" max="300" step="0.1" inputmode="decimal"></label>
            <label>Height (cm)<input name="height" type="number" min="120" max="230" inputmode="numeric"></label>
          </div>
          <div class="field-row">
            <label>Age<input name="age" type="number" min="14" max="100" inputmode="numeric"></label>
            <label>Sex<select name="sex"><option value="male">Male</option><option value="female">Female</option></select></label>
          </div>
          <label>Activity level<select name="activity">${ACTIVITY_LEVELS.map((a) => `<option value="${a.value}" ${a.value === 1.55 ? "selected" : ""}>${a.label}</option>`).join("")}</select></label>
          <label>Goal<select name="goal">${Object.entries(GOALS).map(([v, l]) => `<option value="${v}" ${v === "maintain" ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        </div>
        <p class="form-error" role="alert"></p>
        <p class="form-success" role="status"></p>
        <button type="submit" class="btn btn-primary btn-block auth-submit">Log in ▶</button>
        <button type="button" class="link-btn auth-forgot" data-mode="reset">Forgot your password?</button>
        <button type="button" class="link-btn auth-back">◀ Back to step 1</button>
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
    dialog.querySelector(".auth-back").addEventListener("click", () => setStep(1));
    dialog.querySelectorAll('[name="kind"]').forEach((r) => r.addEventListener("change", () => setStep(1)));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      success.textContent = "";
      const data = Object.fromEntries(new FormData(form));
      const submit = form.querySelector(".auth-submit");
      const mode = dialog.dataset.mode;
      submit.disabled = true;
      try {
        if (mode === "signup" && dialog.dataset.step !== "2") {
          // Step 1: account details. Check them before asking for stats.
          if (!String(data.name || "").trim()) throw new Error("Choose a player name.");
          if (!/^\S+@\S+\.\S+$/.test(String(data.email || "").trim())) throw new Error("Enter a valid email address.");
          if (!data.password || data.password.length < 6) throw new Error("Your password needs at least 6 characters.");
          setStep(2);
          (dialog.dataset.kind === "trainer" ? form.elements.role : form.elements.weight).focus();
          return;
        }
        if (mode === "signup") {
          const trainer = data.kind === "trainer";
          const result = trainer
            ? await signUp({ ...data, trainerApplication: cleanApplication(data) })
            : await signUp({ ...data, stats: computeStats(data) });
          if (trainer) toast({ title: "Application sent", text: "Pieter reviews it soon. You'll get an email.", icon: "✉", tone: "green" });
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

  function setStep(step) {
    const trainer = dialog.querySelector('[name="kind"]:checked')?.value === "trainer";
    dialog.dataset.step = String(step);
    dialog.dataset.kind = trainer ? "trainer" : "player";
    dialog.querySelector(".auth-submit").textContent = step === 2
      ? (trainer ? "Send application ▶" : "Create player ▶")
      : (trainer ? "Next: trainer application ▶" : "Next: character stats ▶");
    dialog.querySelector(".auth-title").textContent = step === 2 ? (trainer ? "Trainer application" : "Character creation") : MODES.signup.title;
    dialog.querySelector(".form-error").textContent = "";
  }

  function setMode(mode) {
    dialog.dataset.mode = mode;
    dialog.dataset.step = "1";
    dialog.querySelectorAll("[role=tab][data-mode]").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
    });
    dialog.querySelector(".auth-title").textContent = MODES[mode].title;
    dialog.querySelector(".auth-submit").textContent = MODES[mode].submit;
    dialog.querySelector('[name="password"]').autocomplete = mode === "login" ? "current-password" : "new-password";
    dialog.querySelector(".form-error").textContent = "";
    dialog.querySelector(".form-success").textContent = "";
    if (mode === "signup") setStep(1);
  }

  function openAuth(mode = "login") {
    if (!dialog) buildDialog();
    const asTrainer = mode === "signup-trainer";
    if (asTrainer) mode = "signup";
    dialog.querySelector(`[name="kind"][value="${asTrainer ? "trainer" : "player"}"]`).checked = true;
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
    TRAINER_SESSION_XP, TRAINER_CLIENT_XP, CHECKIN_XP, ACTIVITY_LEVELS, GOALS, computeStats, bmiCategory, nextCheckin,
    ready, isReady: () => isReady, serverError: () => serverError, calendarStatus: () => calendar.status,
    esc, dateKey, startOfWeek, parseDate, slotStart, formatSlot, avatarHtml, progress, levelFromXp, xpForLevel, rankFor, orderXp, workoutXp,
    getPlayer, isAdmin, adminData, getLeaderboard: () => leaderboard, setLeaderboardVisibility, signUp, logIn, logOut, deleteProfile, requestPasswordReset, updatePassword,
    logWorkout, saveBodyStats, recordPurchase,
    trainerById, trainerHours, groupSessions, findBooking, slotBlocker, googleCalendarLink,
    bookSession, cancelBooking, playerBookings, trainerStats,
    isTrainer, respondBooking, rewardSession, getCoachBookings: () => coachBookings, showCoachInbox,
    SESSION_PRICE, TRAINER_FEE, FREE_CANCEL_HOURS, REWARD_WINDOW_DAYS, isLateCancel, markNoShow, canSettle, hasStarted, euro, getCoachEarnings: () => coachEarnings, markPayout,
    applyAsTrainer, reviewApplication, loadTrainerList,
    openAuth, toast
  };
})();
