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
  const PAYMENTS_URL = `${SUPABASE_URL}/functions/v1/payments`; // Edge Function that talks to Mollie
  const PUSH_URL = `${SUPABASE_URL}/functions/v1/push`;         // Edge Function that sends push notifications
  const HQ_ADDRESS = "Hoogstraat 40, 9308 Aalst";
  const GUEST_ORDERS_KEY = "levelup.guestOrders.v2";

  // Keep these in sync with app_config in supabase/schema.sql
  const SESSION_XP = 75;
  const LOYALTY_SESSIONS = 20;    // every 20 completed sessions earn a free 1:1 session (app_config loyalty_sessions)
  const SESSION_PRICE = 60;       // euro per 1-hour session (the server's app_config decides the real price)
  const TRAINER_FEE = 40;         // the trainer's share; the rest goes to the venue
  const BOOKING_WEEKS_AHEAD = 4;
  const BOOKING_NOTICE_HOURS = 12;
  const FREE_CANCEL_HOURS = 24;   // later cancellations of a confirmed session are charged in full
  const REWARD_WINDOW_DAYS = 7;   // trainers can reward / mark a no-show up to 7 days after
  const TRAINER_SESSION_XP = 100; // trainer XP per session
  const TRAINER_CLIENT_XP = 50;   // trainer XP per unique client
  const XP_PER_EURO = 10;

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
      availability: { 3: [19, 21], 6: [17, 20] }, // Wednesday 19:00–21:00, Saturday 17:00–20:00
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
  // Phone status-bar colour per rank (applyRankTheme); up here so an early emit() can use it.

  const ITEMS = [
    {
      id: "tshirt",
      name: "LEVEL-UP T-shirt",
      price: 25,
      category: "merch",
      type: "Apparel",
      rarity: "common",
      img: "img/teamembermaximtshirtmerch.jpg",
      sizes: ["S", "M", "L"],
      perks: ["+5 Style", "+3 Confidence"],
      desc: "The classic LEVEL-UP tee with the pull-up logo. Made for every session."
    },
    {
      id: "hoodie",
      name: "LEVEL-UP Hoodie",
      price: 45,
      category: "merch",
      type: "Apparel",
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
      type: "Equipment",
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
      type: "Equipment",
      rarity: "rare",
      img: null,
      perks: ["+8 STR", "+8 Mobility"],
      desc: "Resistance bands for warm-ups, assisted pull-ups and mobility. Small enough to take to every session."
    },
    // Limited drop: a set number of pieces until a date (stock and end date are set in admin -> Shop)
    {
      id: "hoodie_s1",
      name: "Season 1 Hoodie",
      price: 55,
      category: "limited",
      type: "Limited drop",
      rarity: "legendary",
      img: "img/teammembermaximtruimerch.jpg",
      sizes: ["S", "M", "L", "XL"],
      perks: ["+15 Style", "Season 1 only"],
      desc: "Numbered Season 1 hoodie with the gold pull-up logo. Only made once: when it's gone, it's gone."
    },
    // Fuel: drinks and bars from the fridge at the gym (shop.html?fridge, the QR code on the fridge)
    { id: "shake", name: "Protein shake", price: 3.5, category: "fuel", type: "Fuel", rarity: "common", art: "🥤", perks: ["+20 g protein"], desc: "Ready-to-drink protein shake, cold from the fridge. Recovery starts now." },
    { id: "bar", name: "Protein bar", price: 2.5, category: "fuel", type: "Fuel", rarity: "common", art: "🍫", perks: ["+20 g protein"], desc: "Protein bar for before or after the session." },
    { id: "energy", name: "Energy drink", price: 2.5, category: "fuel", type: "Fuel", rarity: "common", art: "⚡", perks: ["+Energy"], desc: "A sugar-free energy drink to get going." },
    { id: "water", name: "Water", price: 1.5, category: "fuel", type: "Fuel", rarity: "common", art: "💧", perks: ["+Hydration"], desc: "Bottle of still water." }
  ];
  // Until the server's shop list is in, only the gear that was always on sale shows
  const ALWAYS_ON = ["merch", "tools"];

  const ACHIEVEMENTS = [
    { id: "new_player", icon: "★", title: "New player", desc: "Create your player profile.", xp: 50 },
    { id: "stats_saved", icon: "♥", title: "Know your numbers", desc: "Set your body stats.", xp: 25 },
    { id: "checkins_4", icon: "◷", title: "On track", desc: "Do a weekly check-in in 4 different weeks.", xp: 150 },
    { id: "first_session", icon: "✓", title: "First session", desc: "Complete your first session with a trainer.", xp: 100 },
    { id: "sessions_5", icon: "⛨", title: "Regular", desc: "Complete 5 sessions with a trainer.", xp: 250 },
    { id: "full_party", icon: "♞", title: "Full squad", desc: "Complete sessions with 3 different trainers.", xp: 200 },
    { id: "first_loot", icon: "◆", title: "First buy", desc: "Buy your first item.", xp: 100, shop: true },
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
    if (/rate limit|too many|over_email_send_rate/i.test(msg)) return "Too many emails were sent just now. Try again in an hour, or message us on WhatsApp.";
    if (/not authori[sz]ed|error sending|sending (confirmation|recovery)/i.test(msg)) return "We couldn't send the email right now. Try again later, or message us on WhatsApp.";
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

  // Next moment the weekly check-in pays XP again (null = now). One check-in a week (Monday to Sunday): the tap
  // on the start screen or a saved set of body stats. (A database from before the check-in: 6.5 days after the last.)
  function nextCheckin(p = player) {
    if (p?.checkin) return p.checkin.done ? startOfWeek(1) : null;
    const last = (p?.xpLog || []).find((e) => e.reason === "Weekly check-in" && e.amount > 0);
    if (!last) return null;
    const next = new Date(new Date(last.date).getTime() + (6 * 24 + 12) * 3600e3);
    return next > new Date() ? next : null;
  }

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
  let openingHours = null;     // rows from trainer_hours (null = not loaded: use TRAINERS' hours)
  let coachEarnings = null;   // { earned, paid, owed, expected, sessions, fee, isOwner }
  // Public price list (the server's app_config decides; these are the fallbacks)
  let pricing = {
    price: SESSION_PRICE, fee: TRAINER_FEE, introPrice: 30, duoPrice: 80,
    packs: [{ size: 5, price: 280 }, { size: 10, price: 540 }], trainers: {}, onlinePayments: false,
    classPrice: 12, classXp: 50, classCapacity: 12, classCancelHours: 4, classTrainerFee: 35, tabLimit: 30, news: []
  };
  let trainerCounts = {};     // trainer id -> { sessions, clients, accountXp }
  let leaderboard = [];       // all time: [{ place, name, xp, totalXp, isMe }]
  let leaderboardMonth = null; // this month (loaded when the tab is opened)

  async function call(fn, args) {
    if (!sb) throw new Error("Can't reach the server. Check your connection and try again.");
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(friendly(error));
    if (PUSH_AFTER.has(fn)) flushPush();
    return data;
  }

  // Changes that can queue a push notification: send it right away
  const PUSH_AFTER = new Set(["book_session", "respond_booking", "reward_session", "mark_no_show", "cancel_booking",
    "pay_in_person_instead", "mark_paid_in_person", "mark_pack_paid", "push_test", "chat_send", "admin_grant_xp",
    "class_signup", "class_cancel", "class_cancel_class", "class_mark", "class_finish", "shop_tab_paid",
    "class_create", "admin_shop_update", "admin_shop_sale", "admin_announce", "give_like",
    "book_series", "series_stop", "move_booking"]);

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
      packs: (data.packs || []).map(normalisePack),
      // weekly sessions: { id, trainerId, weekday (1 = Monday), hour, lastDay, status: requested | active | ended, upcoming, next }
      series: (data.series || []).map((s) => ({ ...s, weekday: Number(s.weekday), hour: Number(s.hour), upcoming: Number(s.upcoming) || 0 })),
      classes: (data.classes || []).map(normaliseClass),
      rewards: normaliseRewards(data.rewards),
      introEligible: Boolean(data.introEligible),
      streak: { weeks: Number(data.streak?.weeks) || 0, thisWeek: Boolean(data.streak?.thisWeek),
                planned: Boolean(data.streak?.planned), atRisk: Boolean(data.streak?.atRisk) },
      // the weekly check-in (null = the database doesn't know it yet): done this week, in how many weeks so far
      checkin: data.checkin ? { done: Boolean(data.checkin.done), weeks: Number(data.checkin.weeks) || 0, xp: Number(data.checkin.xp) || CHECKIN_XP } : null,
      potm: data.potm || null,                 // { month, xp } when you won last month
      potmWins: Number(data.potmWins) || 0,
      likes: Number(data.likes) || 0,           // hearts other players gave you (all time)
      likesWeek: Number(data.likesWeek) || 0,
      likedBy: data.likedBy || [],              // the latest likes: { userId, name, avatarUrl, date }
      bio: data.bio || "",                      // their page for other members
      profileVisible: data.profileVisible !== false,
      photos: data.photos || [],
      celebrations: data.celebrations || []     // waiting full-screen moments: { id, kind, payload }
    };
  }

  const normaliseRewards = (r) => ({
    every: Number(r?.every) || LOYALTY_SESSIONS,
    count: Number(r?.count) || 0,
    validMonths: Number(r?.validMonths) || 3,
    vouchers: r?.vouchers || []
  });

  const normalisePack = (pk) => ({ ...pk, size: Number(pk.size), price: Number(pk.price), used: Number(pk.used), remaining: Number(pk.remaining) });

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
    const packKey = `levelup.packStatus.${player.id}`;
    const seenPacks = read(packKey, null);
    if (seenPacks) player.packs.forEach((pk) => {
      if (seenPacks[pk.id] === "requested" && pk.status === "paid") toast({ title: "Pack active", text: `${pk.size} session credits ready to use`, icon: "★", tone: "green" });
    });
    write(packKey, Object.fromEntries(player.packs.map((pk) => [pk.id, pk.status])));
    const rewardKey = `levelup.vouchers.${player.id}`;
    const seenVouchers = read(rewardKey, null);
    if (seenVouchers) player.rewards.vouchers.filter((v) => !seenVouchers.includes(v.id)).forEach((v) => {
      toast({ title: v.source === "legend" ? "Legend reward!" : v.source === "champion" ? "Champion reward!" : "Free session earned!",
        text: v.hoodie ? "A free 1:1 session + a LEVEL-UP hoodie" : "A free 1:1 session is waiting for you", icon: "🎁", tone: "green" });
    });
    write(rewardKey, player.rewards.vouchers.map((v) => v.id));
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
      checkPromotion();
      announceBookingChanges();
      await loadCoachBookings();
      claimBookingNotices();
    }
    return player;
  }

  let roomBlocks = []; // rentals of the gym room on the schedule: { date, start, end, kind: "full" | "shared", name (staff only) }
  const roomBlocksOn = (key) => roomBlocks.filter((r) => r.date === key);
  async function loadSlots() {
    try {
      const range = { p_from: dateKey(startOfWeek(0)), p_to: dateKey(startOfWeek(BOOKING_WEEKS_AHEAD)) };
      const [rows, blocks] = await Promise.all([
        call("slot_status", range),
        // the hours the gym room is rented out, to show on the schedule (an older database doesn't know this yet)
        call("room_blocks", range).catch(() => [])
      ]);
      slots = new Map((rows || []).map((r) => [`${r.trainer_id}|${r.day}|${r.hour}`, { id: r.booking_id || null, status: r.status || null }]));
      roomBlocks = (blocks || []).map((r) => ({ ...r, start: Number(r.start), end: Number(r.end) }));
    } catch (err) {
      serverError = err.message;
      console.error("Loading the schedule failed:", err);
    }
  }

  // ---------- Shop catalogue (prices, on/off, stock and drops come from the server) ----------
  let shopCatalog = null; // id -> { price, active, stock, dropEndsAt, available }
  async function loadShopCatalog() {
    try {
      const rows = await call("shop_catalog");
      shopCatalog = Object.fromEntries((rows || []).map((r) => [r.id, { ...r, price: Number(r.price), stock: r.stock == null ? null : Number(r.stock) }]));
    } catch (err) {
      console.error("Loading the shop failed:", err);
    }
  }
  // The shop's items with today's price and status; switched-off products are left out
  function shopItems() {
    return ITEMS.map((item) => {
      const c = shopCatalog?.[item.id];
      if (!c) return ALWAYS_ON.includes(item.category) ? { ...item, available: true, stock: null, dropEndsAt: null, listPrice: null, saleEndsAt: null } : null;
      if (!c.active) return null;
      // listPrice: the normal price while a sale runs (price is then the sale price)
      return { ...item, price: c.price, available: c.available, stock: c.stock, dropEndsAt: c.dropEndsAt,
               listPrice: c.listPrice == null ? null : Number(c.listPrice), saleEndsAt: c.saleEndsAt || null };
    }).filter(Boolean);
  }
  const shopCheck = (items) => call("shop_check", { p_items: items });
  async function tabOrder(items) {
    const r = await call("shop_tab_order", { p_items: items });
    await Promise.all([refreshPlayer(), loadShopCatalog()]);
    emit();
    return r;
  }
  async function tabCancel(id) {
    await call("shop_tab_cancel", { p_id: id });
    await Promise.all([refreshPlayer(), loadShopCatalog()]);
    emit();
  }
  const openTab = (p = player) => (p?.purchases || []).filter((o) => o.status === "open");
  const adminShop = () => call("admin_shop");
  const adminShopUpdate = (id, p) => call("admin_shop_update", { p_id: id, p });
  const adminShopSale = (category, pct, ends, notify) => call("admin_shop_sale", { p_category: category, p_pct: Number(pct), p_ends: ends || null, p_notify: Boolean(notify) });
  const adminAnnounce = (title, body, url) => call("admin_announce", { p_title: title, p_body: body || "", p_url: url || "index.html" });
  const adminDeleteNews = (id) => call("admin_delete_news", { p_id: id });
  async function setPushNews(on) {
    await call("set_push_news", { p_on: Boolean(on) });
    await refreshPlayer();
    emit();
  }
  async function setPushChat(on) {
    await call("set_push_chat", { p_on: Boolean(on) });
    await refreshPlayer();
    emit();
  }
  const tabPaid = (id) => call("shop_tab_paid", { p_id: id });
  const packGift = (size, gift) => call("admin_pack_gift", { p_size: size, p_gift: gift || "" });
  const markPackGiftGiven = (id) => call("mark_pack_gift_given", { p_id: id });

  // ---------- Group classes ----------
  // class_list rows for the bookable weeks (the schedule); a player's own classes come with their data
  let classes = [];
  function normaliseClass(c) {
    return {
      ...c, price: Number(c.price), capacity: Number(c.capacity), taken: Number(c.taken), waitlist: Number(c.waitlist),
      xp: Number(c.xp), minutes: Number(c.minutes), start: new Date(c.startsAt), end: new Date(c.endsAt),
      hour: Number(String(c.time).slice(0, 2)),
      // shown in Brussels time whatever the phone's time zone: the day at noon, the end as HH:MM
      day: new Date(`${c.date}T12:00:00`),
      endTime: (() => { const [h, m] = String(c.time).split(":").map(Number); const t = h * 60 + m + Number(c.minutes); return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; })(),
      mine: c.mine ? { ...c.mine, price: Number(c.mine.price), xp: Number(c.mine.xp), waitPos: c.mine.waitPos == null ? null : Number(c.mine.waitPos) } : null
    };
  }
  async function loadClasses() {
    try {
      const rows = await call("class_list", { p_from: dateKey(startOfWeek(0)), p_to: dateKey(startOfWeek(BOOKING_WEEKS_AHEAD)) });
      classes = (rows || []).map(normaliseClass);
    } catch (err) {
      console.error("Loading group classes failed:", err);
    }
  }
  const classesOn = (key) => classes.filter((c) => c.date === key && (c.status !== "cancelled" || c.mine));
  const classById = (id) => classes.find((c) => c.id === id) || (player?.classes || []).find((c) => c.id === id) || null;
  const classStarted = (c) => c.start <= new Date();
  const classFull = (c) => c.taken >= c.capacity;
  // Your place counts as "in" (booked, waiting for the payment, present) or on the waitlist
  const classIn = (c) => ["booked", "awaiting_payment", "attended"].includes(c?.mine?.status);
  const CLASS_PAYABLE = ["awaiting_payment", "booked", "attended", "no_show", "late_cancel"];
  const canPayClassOnline = (c) => pricing.onlinePayments && c?.mine && c.mine.payStatus === "unpaid" && c.mine.price > 0 && CLASS_PAYABLE.includes(c.mine.status);
  const isClassLateCancel = (c) => c?.mine?.status === "booked" && c.mine.price > 0 && new Date(c.freeCancelUntil) <= new Date();
  function classPayLabel(m) {
    if (!m) return "";
    if (m.price <= 0) return "Free";
    if (m.refundStatus === "manual") return "Refund at the HQ";
    if (m.refundStatus === "due" || m.refundStatus === "processing") return "Refund on its way";
    if (m.payStatus === "refunded") return "Refunded";
    if (m.payStatus === "paid") return m.payMethod === "online" ? "Paid online ✓" : "Paid ✓";
    if (m.status === "awaiting_payment") return "Payment not finished";
    if (["cancelled", "waitlist"].includes(m.status)) return "";
    return "Pay at the class";
  }
  // ---------- Kinds of group training: one card each on the home page ("Choose your training") ----------
  // [{ key, title, description, photoUrl, trainers: [ids], next, upcoming }]: the kinds with a class planned or held lately
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
  let classKinds = [];
  // The photo for a group class by its name: the admin's own photo for that kind, else one that fits the name
  const classPhoto = (title) => {
    const key = String(title || "").trim().replace(/\s+/g, " ").toLowerCase();
    return classKinds.find((k) => k.key === key)?.photoUrl || GROUP_LOOKS.find(([re]) => re.test(title || ""))?.[1] || GROUP_DEFAULT[0];
  };
  async function loadClassKinds() {
    try { classKinds = (await call("class_kinds")) || []; } catch (err) { console.error("Loading group trainings failed:", err); }
    return classKinds;
  }
  // Admin: the text of a kind, or its photo (shrunk in the browser, stored like the photos on a page)
  async function adminClassKind(key, p) {
    classKinds = (await call("admin_class_kind", { p_key: key, p })) || [];
    emit();
    return classKinds;
  }
  async function uploadKindPhoto(key, file) {
    if (!player || !sb) throw new Error("Log in first.");
    const blob = await fitPhoto(file);
    const path = `${player.id}/k${Date.now()}.jpg`;
    const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (error) throw new Error(/bucket/i.test(error.message) ? "Photo uploads aren't switched on yet. Try again later." : friendly(error));
    const old = avatarPath(classKinds.find((k) => k.key === key)?.photoUrl);
    try {
      await adminClassKind(key, { photoUrl: sb.storage.from("avatars").getPublicUrl(path).data.publicUrl });
    } catch (err) {
      sb.storage.from("avatars").remove([path]).catch(() => {});
      throw err;
    }
    if (old && old.startsWith(`${player.id}/`)) sb.storage.from("avatars").remove([old]).catch(() => {});
  }

  async function afterClassChange() {
    await Promise.all([refreshPlayer({ announce: true }), document.getElementById("weekBoard") ? loadClasses() : null, loadSlots(),
      document.getElementById("classGrid") || document.getElementById("adminKinds") ? loadClassKinds() : null]);
    emit();
  }
  async function signupClass(id, pay = "in_person") {
    const c = normaliseClass(await call("class_signup", { p_class: id, p_pay: pay }));
    await afterClassChange();
    return c;
  }
  async function cancelClassSignup(signupId) {
    const r = await call("class_cancel", { p_signup: signupId });
    processRefunds();
    await afterClassChange();
    return r;
  }
  const classRoster = (id) => call("class_roster", { p_class: id });
  const classMark = (signupId, present) => call("class_mark", { p_signup: signupId, p_present: present });
  const classMarkPaid = (signupId, paid) => call("class_mark_paid", { p_signup: signupId, p_paid: paid });
  const classFinish = (id) => call("class_finish", { p_class: id });
  const classManageList = (days = 35) => call("class_manage_list", { p_days: days }).then((rows) => (rows || []).map(normaliseClass));
  const classMarkRefunded = (signupId) => call("class_mark_refunded", { p_signup: signupId });
  // The gym room (admin): how busy it is, the rentals and the settings
  const adminRoom = (weeks = 8) => call("admin_room", { p_weeks: weeks });
  const adminRentalAdd = async (p) => { const r = await call("admin_rental_add", { p }); await loadSlots(); emit(); return r; };
  const adminRentalCancel = async (id, series = false) => { const r = await call("admin_rental_cancel", { p_id: id, p_series: series }); await loadSlots(); emit(); return r; };
  const adminRentalPaid = async (id, paid = true, all = false) => { const r = await call("admin_rental_paid", { p_id: id, p_paid: paid, p_all: all }); emit(); return r; };
  const adminRoomSettings = async (p) => { await call("admin_room_settings", { p }); await loadSlots(); emit(); };
  async function classCreate(p) {
    const r = await call("class_create", { p });
    await afterClassChange();
    return r;
  }
  // Change a planned class (name, trainer, date, time, places …); the players signed up hear what changed
  async function classUpdate(id, p) {
    const r = await call("class_update", { p_class: id, p });
    await afterClassChange();
    return r;
  }
  async function classCancel(id, reason, series = false) {
    const r = await call("class_cancel_class", { p_class: id, p_reason: reason || "", p_series: series });
    processRefunds();
    await afterClassChange();
    return r;
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
  async function loadPricing() {
    try {
      const p = await call("pricing_info");
      if (!p) return;
      pricing = {
        price: Number(p.price), fee: Number(p.fee), introPrice: Number(p.introPrice), duoPrice: Number(p.duoPrice),
        packs: (p.packs || []).map((o) => ({ size: Number(o.size), price: Number(o.price), gift: o.gift || null })),
        onlinePayments: Boolean(p.onlinePayments),
        classPrice: Number(p.classPrice ?? pricing.classPrice), classXp: Number(p.classXp ?? pricing.classXp),
        classCapacity: Number(p.classCapacity ?? pricing.classCapacity), classCancelHours: Number(p.classCancelHours ?? pricing.classCancelHours),
        classTrainerFee: Number(p.classTrainerFee ?? pricing.classTrainerFee), tabLimit: Number(p.tabLimit ?? pricing.tabLimit),
        news: (p.news || []).map((n) => ({ ...n, id: Number(n.id) })),
        trainers: Object.fromEntries(Object.entries(p.trainers || {}).map(([id, v]) => [id, Number(v)]))
      };
    } catch (err) {
      console.error("Loading prices failed:", err);
    }
  }

  const priceFor = (trainerId) => pricing.trainers[trainerId] ?? pricing.price;
  const packCredits = () => (player?.packs || []).filter((pk) => pk.status === "paid").reduce((n, pk) => n + pk.remaining, 0);
  const openPackRequest = () => (player?.packs || []).find((pk) => pk.status === "requested") || null;

  // What the next booking costs this player (the server applies the same rules):
  // duo > pack credit > first-session price > the trainer's price
  function quote(trainerId, kind = "solo") {
    if (kind === "duo") return { type: "duo", price: pricing.duoPrice };
    if (player) {
      const pk = (player.packs || []).filter((x) => x.status === "paid" && x.remaining > 0)
        .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt))[0];
      if (pk) return { type: "pack", price: Math.round((pk.price / pk.size) * 100) / 100, credits: packCredits() };
      if (player.introEligible) return { type: "intro", price: pricing.introPrice, normal: priceFor(trainerId) };
    }
    return { type: "standard", price: priceFor(trainerId) };
  }

  // ---------- Rewards: a free 1:1 session every LOYALTY_SESSIONS sessions, and at Champion and Legend ----------
  const REWARD_SOURCES = {
    loyalty: { title: "Loyalty card", icon: "🎟" },
    champion: { title: "Champion rank", icon: "♛" },
    legend: { title: "Legend rank", icon: "★" }
  };
  const voucherOpen = (v) => !v.bookingId && new Date(v.expiresAt) > new Date();
  const availableVouchers = (p = player) => (p?.rewards?.vouchers || []).filter(voucherOpen)
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
  const shortDate = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  async function markHoodieGiven(id) {
    await call("mark_hoodie_given", { p_id: id });
  }

  // Short description of what a booking costs, for rows and emails
  function priceLabel(b) {
    if (b.priceType === "reward") return "free session 🎁";
    if (b.priceType === "pack") return "pack credit";
    if (b.priceType === "intro") return `${euro(b.price)} first session`;
    if (b.kind === "duo") return `${euro(b.price)} duo${b.partner ? ` with ${b.partner}` : ""}`;
    return euro(b.price ?? SESSION_PRICE);
  }

  async function requestPack(size, pay = "in_person") {
    const pack = normalisePack(await call("request_pack", { p_size: size, p_pay: pay }));
    await refreshPlayer();
    if (pay === "online") {
      emit();
      await startPayment("pack", pack.id);
      return pack;
    }
    notifyPack(pack, "requested");
    emit();
    return pack;
  }

  async function cancelPackRequest(id) {
    await call("cancel_pack_request", { p_id: id });
    await refreshPlayer();
    emit();
  }

  async function markPackPaid(id) {
    const pack = normalisePack(await call("mark_pack_paid", { p_id: id }));
    notifyPack(pack, "paid");
    emit();
    return pack;
  }

  async function setTrainerPricing(trainerId, price, fee) {
    await call("set_trainer_pricing", { p_trainer: trainerId, p_price: price, p_fee: fee });
    await loadPricing();
    emit();
  }

  // Pack request / activation emails (to the LEVEL-UP inbox, automatic reply to the player)
  function notifyPack(pack, action) {
    const texts = {
      requested: {
        subject: `Pack request: ${pack.size} sessions · ${euro(pack.price)} · ${pack.name}`,
        reply: `Hi ${pack.name}, thanks for your request for a ${pack.size}-session pack (${euro(pack.price)}, ${euro(pack.price / pack.size)} per session). Pay at the headquarters (${HQ_ADDRESS})${pricing.onlinePayments ? " or online in your LEVEL-UP profile" : ""}; your credits become active as soon as the payment is in.`
      },
      paid: {
        subject: `Pack active: ${pack.size} sessions · ${pack.name}`,
        reply: `Hi ${pack.name}, your payment is in: your ${pack.size} session credits are active. Every 1:1 session you book now uses one credit automatically. Level up!`
      }
    }[action];
    fetch(`https://formsubmit.co/ajax/${OWNER_EMAIL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: texts.subject,
        _template: "table",
        _autoresponse: `${texts.reply}\n\nThe LEVEL-UP team`,
        status: action,
        name: pack.name,
        email: pack.email,
        pack: `${pack.size} sessions`,
        price: euro(pack.price),
        next_step: action === "requested" ? "Send the payment details, then mark the pack as paid in the admin dashboard." : "-"
      })
    }).catch((error) => console.error("Pack email failed:", error));
  }

  async function loadTrainerList() {
    try {
      const rows = await call("trainer_list");
      (rows || []).forEach((r) => {
        const known = TRAINERS.find((t) => t.id === r.id);
        if (known) {
          known.linked = Boolean(r.linked);
          known.defaultImg = known.defaultImg || known.img;
          known.img = r.avatar_url || known.defaultImg; // the photo the coach put on their own page wins
          return;
        }
        TRAINERS.push({
          id: r.id,
          name: r.name,
          short: String(r.name).trim().split(/\s+/)[0],
          role: r.role || "Personal trainer",
          bio: r.bio || "",
          specialties: r.specialties || "",
          img: r.avatar_url || "img/pfdefault.png",
          defaultImg: "img/pfdefault.png",
          color: r.color || "#b0b0b0",
          chartColor: r.chart_color || "#8c8c8c",
          availability: {},
          stats: { sessions: 0, clients: 0 },
          linked: Boolean(r.linked),
          dynamic: true
        });
      });
    } catch (err) {
      console.error("Loading trainers failed:", err);
    }
    applyCoachPhotos();
  }

  // One photo per coach: the one on their page (their profile photo) is also the one on their coach card,
  // in the calendar and in the chat. Coach faces that are written in the page itself follow here.
  function applyCoachPhotos() {
    if (player?.trainerId) {
      const mine = TRAINERS.find((t) => t.id === player.trainerId);
      if (mine) { mine.defaultImg = mine.defaultImg || mine.img; mine.img = player.avatarUrl || mine.defaultImg; }
    }
    TRAINERS.forEach((t) => {
      if (!t.defaultImg) return;
      document.querySelectorAll(`img[data-coach="${t.id}"], #team-${t.id} .team-photo`).forEach((img) => {
        if (img.getAttribute("src") !== t.img) img.setAttribute("src", t.img);
      });
    });
  }

  const scoreRows = (rows) => (rows || []).map((r) => ({
    place: Number(r.place), name: r.name, xp: Number(r.xp), totalXp: Number(r.total_xp ?? r.xp), isMe: Boolean(r.is_me), avatarUrl: r.avatar_url || null,
    potm: Boolean(r.potm), userId: r.user_id || null, likes: Number(r.likes) || 0, liked: Boolean(r.liked)
  }));
  let playerOfMonth = null;

  // ---------- Likes (hearts on the high scores) ----------
  // One like per player per week; the heart sits on the corner of the photo with the total count.
  // Players on the board and the Player of the Month card share it, so a like updates everywhere at once.
  function likeHtml(r, size = "") {
    if (!r) return "";
    const n = Number(r.likes) || 0;
    const label = `${n} like${n === 1 ? "" : "s"}`;
    if (r.isMe) return n ? `<span class="like-badge mine ${size}" title="${label}" aria-label="${label}"><span aria-hidden="true">♥</span>${n}</span>` : "";
    const id = r.userId || "";
    return `<button type="button" class="like-badge ${size} ${r.liked ? "liked" : ""}" data-like="${esc(id)}" data-like-name="${esc(r.name)}"
      aria-pressed="${r.liked}" aria-label="${r.liked ? `You liked ${esc(r.name)} this week` : `Like ${esc(r.name)}`} (${label})"><span aria-hidden="true">♥</span>${n || ""}</button>`;
  }
  function eachLikeTarget(userId, fn) {
    [leaderboard, leaderboardMonth].forEach((rows) => (rows || []).forEach((r) => { if (r.userId === userId) fn(r); }));
    if (playerOfMonth && playerOfMonth.userId === userId) fn(playerOfMonth);
  }
  let likeBusy = false;
  async function giveLike(userId, name) {
    if (!player) { openAuth("login"); return; }
    if (likeBusy || !userId) return;
    let already = false;
    eachLikeTarget(userId, (r) => { already = already || r.liked; });
    if (already) {
      toast({ title: "Already liked this week", text: `You can like ${name} again on Monday.`, icon: "♥", tone: "gold" });
      return;
    }
    likeBusy = true;
    eachLikeTarget(userId, (r) => { r.liked = true; r.likes += 1; });  // show it right away
    emit();
    try {
      const res = await call("give_like", { p_to: userId });
      eachLikeTarget(userId, (r) => { r.likes = Number(res?.likes) || r.likes; });
      toast({ title: "Like sent", text: `${name} gets a heart from you ❤️`, icon: "♥", tone: "green" });
    } catch (err) {
      eachLikeTarget(userId, (r) => { r.liked = false; r.likes = Math.max(0, r.likes - 1); });
      toast({ title: "No like sent", text: err.message, icon: "!", tone: "gold" });
    } finally {
      likeBusy = false;
      emit();
    }
  }
  document.addEventListener("click", (event) => {
    const heart = event.target.closest("button[data-like]");
    if (!heart) return;
    event.preventDefault();
    heart.classList.remove("pop");
    void heart.offsetWidth; // restart the animation
    heart.classList.add("pop");
    giveLike(heart.dataset.like, heart.dataset.likeName);
  });

  // ---------- Reviews (real clients, approved by the admin) ----------
  let reviews = [];
  async function loadReviews() {
    try { reviews = (await call("public_reviews")) || []; } catch (err) { console.error("Loading reviews failed:", err); }
  }
  async function submitReview(quote, rating) {
    player = normalisePlayer(await call("submit_review", { p_quote: quote, p_rating: Number(rating) }));
    fetch(`https://formsubmit.co/ajax/${OWNER_EMAIL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: `New review to approve: ${player.name} (${"★".repeat(Number(rating))})`,
        _template: "table",
        name: player.name, email: player.email, rating: `${rating} / 5`, review: quote,
        next_step: "Approve or hide it in the LEVEL-UP admin dashboard (Overview → Reviews)."
      })
    }).catch((error) => console.error("Review email failed:", error));
    emit();
  }
  async function deleteMyReview() {
    player = normalisePlayer(await call("delete_my_review"));
    await loadReviews();
    emit();
  }
  const adminReviews = async () => (await call("admin_reviews")) || [];
  async function adminSetReview(id, status) { await call("admin_set_review", { p_id: id, p_status: status }); await loadReviews(); emit(); }
  // Admin: extra XP (or a correction) with a reason; the player gets a push notification
  async function adminGrantXp(userId, amount, reason) {
    const r = await call("admin_grant_xp", { p_user: userId, p_amount: Math.round(Number(amount)), p_reason: String(reason || "").trim() });
    if (player && userId === player.id) await refreshPlayer({ announce: true }); // your own XP: show the toast here
    return r;
  }
  async function adminAddReview(name, quote, rating) { await call("admin_add_review", { p_name: name, p_quote: quote, p_rating: Number(rating) }); await loadReviews(); emit(); }
  // A review you added for a client: show that member's profile photo with it (null = their first letter)
  async function adminReviewPhoto(id, userId) { await call("admin_review_photo", { p_id: id, p_user: userId || null }); await loadReviews(); emit(); }
  async function loadLeaderboard(period = "all") {
    try {
      if (period === "all") call("player_of_month").then((r) => { playerOfMonth = r || null; emit(); }).catch(() => {});
      const rows = scoreRows(await call("leaderboard", { p_period: period }));
      if (period === "month") leaderboardMonth = rows;
      else {
        leaderboard = rows;
        if (leaderboardMonth) loadLeaderboard("month").then(emit); // keep the other tab fresh too
      }
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
  // Opening hours from the admin dashboard (trainer_hours). While they haven't loaded
  // (older database), the hours in TRAINERS are used instead.
  function trainerHours(trainerId, key) {
    const trainer = trainerById(trainerId);
    if (!trainer) return [];
    const hours = new Set();
    const addRange = (a, b) => { for (let h = a; h < b; h++) hours.add(h); };
    if (openingHours) {
      const weekday = parseDate(key).getDay();
      openingHours.forEach((r) => {
        if (r.trainerId !== trainerId || r.kind !== "open") return;
        if (r.weekday === weekday || r.date === key) addRange(r.start, r.end);
      });
    } else if (!calendar.hasAvailability[trainerId]) {
      const range = trainer.availability[parseDate(key).getDay()];
      if (range) addRange(range[0], range[1]);
    }
    // "Filip available" events in the Google Calendar still add hours
    (calendar.availability[trainerId]?.[key] || []).forEach((h) => hours.add(h));
    // Closed on this date (admin dashboard) or busy in the Google Calendar
    (openingHours || []).forEach((r) => {
      if (r.trainerId === trainerId && r.kind === "closed" && r.date === key) for (let h = r.start; h < r.end; h++) hours.delete(h);
    });
    const blocked = calendar.blocked[trainerId]?.[key];
    return [...hours].filter((h) => !blocked || !blocked.has(h)).sort((a, b) => a - b);
  }

  // Weekly hours of a trainer as text, e.g. "Wed 19:00–21:00, Sat 17:00–20:00"
  function weeklyHoursText(trainerId) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const order = [1, 2, 3, 4, 5, 6, 0];
    const rows = openingHours
      ? openingHours.filter((r) => r.trainerId === trainerId && r.weekday !== null && r.kind === "open")
      : Object.entries(trainerById(trainerId)?.availability || {}).map(([d, [a, b]]) => ({ weekday: Number(d), start: a, end: b }));
    return rows.sort((a, b) => order.indexOf(a.weekday) - order.indexOf(b.weekday) || a.start - b.start)
      .map((r) => `${days[r.weekday]} ${pad(r.start)}:00–${pad(r.end)}:00`).join(", ");
  }

  async function loadOpeningHours() {
    try {
      const rows = await call("trainer_hours_list");
      openingHours = (rows || []).map((r) => ({ ...r, weekday: r.weekday === null ? null : Number(r.weekday), start: Number(r.start), end: Number(r.end) }));
    } catch (err) {
      openingHours = null; // database not updated yet: keep the hours from the code
      console.error("Loading opening hours failed:", err);
    }
  }

  async function saveOpeningHours({ id = null, trainerId, weekday = null, date = null, start, end, kind = "open", note = "" }) {
    await call("save_trainer_hours", {
      p_id: id, p_trainer: trainerId, p_weekday: weekday, p_day: date,
      p_start: Number(start), p_end: Number(end), p_kind: kind, p_note: note
    });
    await loadOpeningHours();
    emit();
  }

  async function deleteOpeningHours(id) {
    await call("delete_trainer_hours", { p_id: id });
    await loadOpeningHours();
    emit();
  }

  const groupSessions = (key) => calendar.groups.filter((g) => dateKey(g.start) === key);

  // ---------- Bookings ----------
  const trainerById = (id) => TRAINERS.find((t) => t.id === id);

  // null when free, otherwise { id, status (only when it's yours), mine }
  function findBooking(trainerId, key, hour) {
    const k = `${trainerId}|${key}|${hour}`;
    if (!slots.has(k)) {
      // the gym room has no place left that hour (a group class or a rental takes it whole, or all places are
      // in use): taken for every trainer. room: true tells it apart from the trainer's own bookings.
      return slots.has(`*|${key}|${hour}`) ? { id: null, status: "room", mine: false, room: true } : null;
    }
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

  // pay: "online" (Mollie, the request reaches the trainer once paid) or "in_person" (at the headquarters)
  // ---------- Weekly sessions: the same hour with the same trainer every week ----------
  const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  // "Every Monday · 18:00" and "until 7 Dec 2026" / "until someone stops it"
  const seriesText = (s) => `Every ${WEEKDAYS[(Number(s.weekday) || 1) - 1]} · ${pad(Number(s.hour))}:00`;
  const seriesUntil = (s) => (s.lastDay ? `until ${shortDate(`${s.lastDay}T12:00:00`)}` : "until someone stops it");
  // One row per weekly request (its first week): the trainer answers a weekly request once
  function oneRowPerSeries(list) {
    const seen = new Set();
    return [...list].sort((a, b) => slotStart(a.date, a.hour) - slotStart(b.date, b.hour))
      .filter((b) => !b.series || b.series.status !== "requested" || (!seen.has(b.series.id) && seen.add(b.series.id)));
  }
  async function stopSeries(id) {
    const r = await call("series_stop", { p_series: id });
    await Promise.all([refreshPlayer(), loadSlots()]);
    emit();
    return r;
  }
  // The trainer moves a session after agreeing on it with the player. scope "series": this week and all after it.
  async function moveBooking(id, date, hour, scope = "once") {
    const b = await call("move_booking", { p_id: id, p_day: date, p_hour: Number(hour), p_scope: scope });
    await Promise.all([refreshPlayer(), loadSlots()]);
    emit();
    return b;
  }

  // weeks: 0 = one session; a number of weeks or "open" (until someone stops it) = a weekly session
  async function bookSession({ trainerId, date, hour, note = "", kind = "solo", partner = "", pay = "in_person", weeks = 0 }) {
    if (!player) throw new Error("Log in to book a session.");
    if (!trainerHours(trainerId, date).includes(hour)) throw new Error("This trainer isn't available at that time.");
    if (weeks) {
      const r = await call("book_series", {
        p_trainer: trainerId, p_day: date, p_hour: hour, p_weeks: weeks === "open" ? null : Number(weeks),
        p_note: String(note).slice(0, 300), p_kind: kind, p_partner: String(partner).trim().slice(0, 40)
      });
      await Promise.all([refreshPlayer(), loadSlots()]);
      const first = { ...r.planned[0], hour: Number(r.planned[0].hour) };
      notifyBooking(first, "requested"); // one email for the whole request
      emit();
      return { ...first, weekly: r };
    }
    const booking = await call("book_session", {
      p_trainer: trainerId, p_day: date, p_hour: hour, p_note: String(note).slice(0, 300),
      p_kind: kind, p_partner: String(partner).trim().slice(0, 40), p_pay: pay
    });
    await Promise.all([refreshPlayer(), loadSlots()]);
    // Online bookings email the trainer once the payment is in (see claimBookingNotices)
    if (booking.status !== "awaiting_payment") notifyBooking({ ...booking, hour: Number(booking.hour) }, "requested");
    emit();
    return booking;
  }

  // ---------- Page tabs (My account and admin) ----------
  // tabs: [{ id, label, badge }]. Panels carry data-pane="<id>"; only the active tab's panels show.
  function pageTabsHtml(tabs, active) {
    return `
      <nav class="page-tabs" aria-label="Sections">
        <div class="page-tabs-inner" role="tablist">${tabs.map((t) => `
          <button type="button" role="tab" class="page-tab" data-page-tab="${t.id}" aria-selected="${t.id === active}">
            ${esc(t.label)}${t.badge ? `<span class="tab-badge">${esc(String(t.badge))}</span>` : ""}</button>`).join("")}
        </div>
      </nav>`;
  }

  function showPageTab(root, id) {
    root.querySelectorAll("[data-pane]").forEach((el) => { el.hidden = el.dataset.pane !== id; });
    root.querySelectorAll("[data-page-tab]").forEach((b) => {
      const on = b.dataset.pageTab === id;
      b.setAttribute("aria-selected", String(on));
      // keep the active tab in view in the swipeable bar (phones), without scrolling the page
      if (on) b.parentElement.scrollLeft = b.offsetLeft - (b.parentElement.clientWidth - b.offsetWidth) / 2;
    });
  }

  // The tab to open for the address bar's #hash: a tab id, or the tab holding an element with that id
  function tabFromHash(root, ids) {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return null;
    if (ids.includes(hash)) return hash;
    const tab = document.getElementById(hash)?.closest("[data-pane]")?.dataset.pane;
    return ids.includes(tab) ? tab : null;
  }

  // After switching tabs: if the page was scrolled past the tab bar, go back to the top of the new tab
  function scrollToTabs(root) {
    const bar = root.querySelector(".page-tabs");
    if (!bar) return;
    const before = bar.previousElementSibling;
    const hud = (document.getElementById("hud")?.offsetHeight || 0) + 4;
    const y = (before ? before.getBoundingClientRect().bottom : root.getBoundingClientRect().top) + window.scrollY - hud;
    if (window.scrollY > y) window.scrollTo({ top: y });
  }

  // Adds data-pane to the first element of a block of HTML
  const inTab = (tab, html) => html ? html.replace(/<(section|details|div|header)\b/, `<$1 data-pane="${tab}"`) : "";

  // ---------- Push notifications ----------
  // States: "unsupported", "ios-install" (iPhone: only works in the home-screen app), "denied", "on", "off"
  let pushStatus = "unknown"; // until the service worker answers
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  async function pushRegistration() {
    if (!pushSupported()) return null;
    return Promise.race([navigator.serviceWorker.ready, new Promise((resolve) => setTimeout(() => resolve(null), 4000))]);
  }

  async function refreshPushStatus() {
    let next;
    if (isIOS() && !isStandalone()) next = "ios-install";
    else if (!pushSupported()) next = "unsupported";
    else if (Notification.permission === "denied") next = "denied";
    else {
      const reg = await pushRegistration();
      const sub = Notification.permission === "granted" && reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
      next = sub ? "on" : "off";
    }
    if (next !== pushStatus) { pushStatus = next; emit(); }
    return pushStatus;
  }

  const keyBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
  const sameKey = (a, b) => a && b && a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i]);

  async function pushPublicKey() {
    const key = await call("push_public_key").catch(() => null);
    if (key) return key;
    // first time ever: the Edge Function makes the key pair
    const res = await fetch(`${PUSH_URL}/setup`, { method: "POST", headers: { apikey: SUPABASE_KEY } }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => ({})) : {};
    return body.publicKey || null;
  }

  async function saveSubscription(sub) {
    const j = sub.toJSON();
    await call("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
      p_user_agent: navigator.userAgent.slice(0, 200) });
  }

  async function enablePush() {
    if (!player) throw new Error("Log in first.");
    if (isIOS() && !isStandalone()) throw new Error("On iPhone, add LEVEL-UP to your home screen first and turn notifications on in the app.");
    if (!pushSupported()) throw new Error("This browser can't show notifications.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      await refreshPushStatus();
      throw new Error("Notifications are blocked. Allow them for this site in your browser or phone settings.");
    }
    const key = await pushPublicKey();
    if (!key) throw new Error("Notifications aren't switched on on the LEVEL-UP server yet. Try again later.");
    const reg = await pushRegistration();
    if (!reg) throw new Error("Reload the page and try again.");
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options?.applicationServerKey, keyBytes(key))) { await sub.unsubscribe(); sub = null; }
    sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    await saveSubscription(sub);
    await call("push_test");
    await refreshPushStatus();
  }

  async function disablePush() {
    await unlinkPushSubscription(true);
    await refreshPushStatus();
  }

  async function unlinkPushSubscription(unsubscribe = false) {
    const reg = pushSupported() && Notification.permission === "granted" ? await pushRegistration() : null;
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    if (!sub) return;
    await call("delete_push_subscription", { p_endpoint: sub.endpoint }).catch(() => {});
    if (unsubscribe) await sub.unsubscribe().catch(() => {});
  }

  // After logging in: a phone that already has notifications on belongs to this account now
  async function syncPushSubscription() {
    flushPush();
    if (!pushSupported() || Notification.permission !== "granted") return refreshPushStatus();
    const reg = await pushRegistration();
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    if (sub) await saveSubscription(sub).catch(() => {});
    refreshPushStatus();
  }

  // Ask the Edge Function to send what's waiting (also session reminders). Calls close together are
  // combined into one, at most every 5 seconds; none is dropped.
  let lastFlush = 0;
  let flushTimer = null;
  function flushPush() {
    if (!sb) return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      lastFlush = Date.now();
      fetch(`${PUSH_URL}/flush`, { method: "POST", headers: { apikey: SUPABASE_KEY }, keepalive: true }).catch(() => {});
    }, Math.max(300, lastFlush + 5000 - Date.now()));
  }

  // ---------- Notifications: three switches, the same in the menu (phones) and under Settings ----------
  // "On this phone" is the subscription of this device; chat and news are choices of the account.
  function notifyHtml() {
    if (!player) return "";
    const on = pushStatus === "on";
    const why = {
      "ios-install": "On iPhone, notifications work in the LEVEL-UP app: add it to your home screen first, then turn them on here in the app.",
      denied: "Notifications are blocked for LEVEL-UP. Allow them in your phone or browser settings (site settings → Notifications), then come back here.",
      unsupported: "This browser can't show notifications. Try Chrome, Edge, Firefox or Safari on your phone.",
      unknown: "Checking…"
    }[pushStatus];
    const row = (attr, checked, title, text, disabled) => `
      <label class="switch-row${disabled ? " is-off" : ""}">
        <span><b>${title}</b><small>${text}</small></span>
        <input type="checkbox" class="switch" role="switch" ${attr} ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
      </label>`;
    return `<div class="notify push-${pushStatus}">
      ${row("data-push-device", on, "On this phone", `Your sessions: confirmed, the reminder the day before, XP and rewards${isTrainer() ? ", and new requests from your clients" : ""}.`, Boolean(why))}
      ${why ? `<p class="notify-why">${why}${pushStatus === "ios-install" ? ` <button type="button" class="link-btn" data-install-app>How to install</button>` : ""}</p>` : ""}
      ${row("data-push-chat", player.pushChat !== false, "Chat messages", "A message from your coach, a member or a group.", !on)}
      ${row("data-push-news", player.pushNews !== false, "News", "New group classes, products and sales: at most 2 a day and never at night.", !on)}
      ${on ? "" : why ? "" : `<p class="notify-why">Turn on "On this phone" first: the other two follow it.</p>`}
    </div>`;
  }
  let notifyDialog = null;
  function openNotify() {
    if (!player) { openAuth("login"); return; }
    if (!notifyDialog) {
      notifyDialog = document.createElement("dialog");
      notifyDialog.className = "auth-dialog notify-dialog";
      notifyDialog.setAttribute("aria-labelledby", "notifyTitle");
      document.body.appendChild(notifyDialog);
      notifyDialog.addEventListener("click", (event) => { if (event.target === notifyDialog || event.target.closest("[data-close]")) notifyDialog.close(); });
      document.addEventListener("levelup:change", () => { if (notifyDialog.open && !notifyDialog.querySelector(".switch:focus")) paintNotify(); });
    }
    paintNotify();
    if (!notifyDialog.open) notifyDialog.showModal();
    refreshPushStatus().then(() => { if (notifyDialog.open) paintNotify(); }).catch(() => {});
  }
  function paintNotify() {
    notifyDialog.innerHTML = `
      <button type="button" class="dialog-close" data-close aria-label="Close">✕</button>
      <p class="section-kicker">Your phone</p>
      <h2 class="auth-title" id="notifyTitle">Notifications</h2>
      ${notifyHtml()}
      <p class="auth-note"><a href="profile.html#settings" class="text-link">All settings</a></p>`;
  }
  // the switches work wherever they are drawn
  document.addEventListener("change", async (event) => {
    const box = event.target.closest?.("[data-push-device], [data-push-chat], [data-push-news]");
    if (!box) return;
    const on = box.checked;
    box.disabled = true;
    try {
      if (box.hasAttribute("data-push-device")) {
        if (on) { await enablePush(); toast({ title: "Notifications on", text: "A test message is on its way", icon: "🔔", tone: "green" }); }
        else { await disablePush(); toast({ title: "Notifications off", text: "This phone won't get LEVEL-UP messages anymore", icon: "🔕" }); }
      } else if (box.hasAttribute("data-push-chat")) {
        await setPushChat(on);
        toast({ title: on ? "Chat notifications on" : "Chat notifications off", text: on ? "You hear it when a message comes in." : "New messages still show in the chat.", icon: on ? "💬" : "🔕", tone: "green" });
      } else {
        await setPushNews(on);
        toast({ title: on ? "News notifications on" : "News notifications off", text: on ? "You hear about new classes and deals." : "You only get messages about your own sessions.", icon: on ? "🔔" : "🔕", tone: "green" });
      }
    } catch (err) {
      box.checked = !on;
      toast({ title: "That didn't work", text: err.message, icon: "!" });
    } finally {
      box.disabled = false;
      emit();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-notify-open]")) return;
    event.preventDefault();
    document.getElementById("nav")?.classList.remove("open");
    document.getElementById("menuToggle")?.setAttribute("aria-expanded", "false");
    openNotify();
  });

  // A small "turn on notifications" prompt, only when it can work and isn't on yet
  function pushCalloutHtml(text) {
    if (!player || pushStatus !== "off") return "";
    return `<div class="push-callout"><span aria-hidden="true">🔔</span><p>${esc(text)}</p>
      <button type="button" class="btn btn-small btn-primary" data-push-on>Turn on</button></div>`;
  }

  // ---------- Health questionnaire (PAR-Q style, before the first booking) ----------
  const HEALTH_QUESTIONS = [
    ["q1", "Has a doctor ever said you have a heart condition or high blood pressure?"],
    ["q2", "Do you feel pain in your chest at rest, in daily life or when you exercise?"],
    ["q3", "Do you lose your balance because of dizziness, or did you faint in the last 12 months?"],
    ["q4", "Do you have a bone, joint or muscle problem (back, knee, shoulder…) that could get worse by exercising?"],
    ["q5", "Do you take medication for a condition (e.g. blood pressure, diabetes, asthma, epilepsy)?"],
    ["q6", "Are you pregnant, or did you give birth in the last 6 months?"],
    ["q7", "Did you have surgery or a serious injury in the last 12 months?"],
    ["q8", "Is there any other reason you shouldn't be physically active?"]
  ];
  const healthValid = () => Boolean(player?.healthForm?.valid);
  const healthYes = (form) => HEALTH_QUESTIONS.filter(([k]) => form?.answers?.[k]).map(([, q]) => q);

  // The form, prefilled with earlier answers when there are any
  function healthFormHtml(prev = player?.healthForm) {
    return `
      <form class="health-form" data-health-form>
        <ol class="health-list">${HEALTH_QUESTIONS.map(([k, q]) => `
          <li><p>${q}</p>
            <span class="health-yn" role="radiogroup" aria-label="${esc(q)}">
              <label><input type="radio" name="${k}" value="no" ${prev && prev.answers?.[k] === false ? "checked" : ""} required> No</label>
              <label><input type="radio" name="${k}" value="yes" ${prev?.answers?.[k] ? "checked" : ""}> Yes</label>
            </span>
          </li>`).join("")}
        </ol>
        <label class="health-notes" ${prev?.hasRisk ? "" : "hidden"}>You answered yes: tell your trainer a bit more (what, since when, what to avoid)
          <textarea name="notes" rows="3" maxlength="600" placeholder="e.g. old knee injury on the left, no jumping">${esc(prev?.notes || "")}</textarea>
        </label>
        <p class="health-advice" ${prev?.hasRisk ? "" : "hidden"}>⚠ With a yes answer we advise you to check with your doctor before your first session.</p>
        <label class="health-consent"><input type="checkbox" name="consent" required>
          <span>I answered honestly. I train at my own risk, follow my trainer's instructions and tell my trainer when my health changes. LEVEL-UP only uses these answers to train me safely.</span>
        </label>
        <p class="health-privacy small-text muted">Read how we handle your data: <a href="privacy.html" target="_blank" rel="noopener" class="text-link">Privacy policy</a></p>
        <label>Your full name (as signature)<input type="text" name="name" maxlength="80" required autocomplete="name"></label>
        <p class="form-error" role="alert"></p>
        <button type="submit" class="btn btn-primary btn-block">Save and continue ▶</button>
      </form>`;
  }

  // Show the notes box and advice as soon as one answer is "yes"
  document.addEventListener("change", (event) => {
    const form = event.target.closest?.("[data-health-form]");
    if (!form || event.target.type !== "radio") return;
    const anyYes = HEALTH_QUESTIONS.some(([k]) => form.elements[k]?.value === "yes");
    form.querySelector(".health-notes").hidden = !anyYes;
    form.querySelector(".health-advice").hidden = !anyYes;
    form.elements.notes.required = anyYes;
  });

  // For trainers and admin: ⚠ with the "yes" answers and notes of a client (health = booking.health)
  function healthFlagHtml(health) {
    if (!health) return `<details class="health-flag missing"><summary>No health questionnaire yet</summary></details>`;
    if (!health.hasRisk) return "";
    return `<details class="health-flag"><summary>⚠ Health info</summary>
      <ul>${healthYes(health).map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
      ${health.notes ? `<p>“${esc(health.notes)}”</p>` : ""}
    </details>`;
  }

  async function saveHealthForm(form) {
    const f = form.elements;
    const answers = Object.fromEntries(HEALTH_QUESTIONS.map(([k]) => [k, f[k].value === "yes"]));
    await call("save_health_form", { p_answers: answers, p_notes: f.notes.value, p_name: f.name.value });
    await refreshPlayer();
    emit();
  }

  // ---------- Payments (Mollie) ----------
  // Sends the player to Mollie's payment page for a booking or pack
  async function startPayment(type, id) {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Log in first.");
    let res;
    try {
      res = await fetch(`${PAYMENTS_URL}/create`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ type, id })
      });
    } catch {
      throw new Error("Can't reach the payment service. Try again, or pay at the headquarters.");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.checkoutUrl) throw new Error(body.error || "Online payment failed. Try again, or pay at the headquarters.");
    window.location.href = body.checkoutUrl;
  }

  // Refunds the server marked as due (declined, expired or cancelled for free after paying online)
  function processRefunds() {
    if (!pricing.onlinePayments) return;
    fetch(`${PAYMENTS_URL}/refunds`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: "{}" })
      .catch(() => { /* the next action or webhook tries again */ });
  }

  const PAYABLE = ["awaiting_payment", "pending", "confirmed", "completed", "no_show", "late_cancel"];
  const canPayOnline = (b) => pricing.onlinePayments && !["pack", "reward"].includes(b.payMethod) && b.payStatus === "unpaid" && PAYABLE.includes(b.status);

  // How a booking is paid, for rows and emails
  function payLabel(b) {
    if (b.payMethod === "pack") return "";
    if (b.payMethod === "reward") return "";
    if (b.refundStatus === "manual") return "Refund at the HQ";
    if (b.refundStatus === "due" || b.refundStatus === "processing") return "Refund on its way";
    if (b.payStatus === "refunded") return "Refunded";
    if (b.payStatus === "paid") return b.payMethod === "online" ? "Paid online ✓" : "Paid at the HQ ✓";
    if (b.status === "awaiting_payment") return "Payment not finished";
    if (["declined", "expired", "cancelled"].includes(b.status)) return "";
    return "Pay at the HQ";
  }

  // Back from Mollie (?payment=booking:<id>): wait for the webhook, then tell the player
  async function handlePaymentReturn() {
    const params = new URLSearchParams(location.search);
    const ref = params.get("payment");
    if (!ref || !player) return;
    params.delete("payment");
    history.replaceState(null, "", `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`);
    const [type, id] = ref.split(":");
    const myClass = () => (player.classes || []).find((c) => c.mine?.id === id);
    const isPaid = () => type === "pack"
      ? player.packs.find((pk) => pk.id === id)?.status === "paid"
      : type === "class" ? myClass()?.mine.payStatus === "paid"
      : ["paid"].includes(player.bookings.find((b) => b.id === id)?.payStatus);
    toast({ title: "Checking your payment…", text: "One moment", icon: "€" });
    celebrateHolds.add("payment"); // the purchase celebration waits until the payment is checked
    setTimeout(() => holdCelebrations("payment", false), 30000); // never keep it waiting for good
    const gaveUp = () => (type === "booking" && player.bookings.find((b) => b.id === id)?.status === "expired")
      || (type === "class" && myClass()?.mine.status === "cancelled");
    for (let i = 0; i < 10 && !isPaid() && !gaveUp(); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await refreshPlayer();
    }
    celebrateHolds.delete("payment");
    emit();
    if (isPaid()) {
      if (type === "class") {
        toast({ title: "Payment received", text: `You're in: ${myClass()?.title || "group class"}`, icon: "✓", tone: "green" });
      } else if (type === "pack") {
        const pk = player.packs.find((x) => x.id === id);
        notifyPack({ ...pk, name: player.name, email: player.email }, "paid");
        toast({ title: "Payment received", text: `${pk.size} session credits are active`, icon: "★", tone: "green" });
      } else {
        const b = player.bookings.find((x) => x.id === id);
        toast({ title: "Payment received", text: b.status === "pending" ? `Request sent to ${trainerById(b.trainerId).short}` : "Thanks!", icon: "✓", tone: "green" });
      }
    } else {
      toast({ title: "Payment not completed", text: "Try again from your profile, or pay at the headquarters.", icon: "✕" });
    }
  }

  // Online payment failed or the player changed their mind: pay at the HQ, request goes out now
  async function payInPersonInstead(id) {
    const booking = await call("pay_in_person_instead", { p_id: id });
    await Promise.all([refreshPlayer(), loadSlots()]);
    notifyBooking({ ...booking, hour: Number(booking.hour) }, "requested");
    emit();
    return booking;
  }

  async function markPaidInPerson(id) {
    const booking = await call("mark_paid_in_person", { p_id: id });
    await claimBookingNotices();
    emit();
    return booking;
  }

  async function markRefunded(id) {
    await call("mark_refunded", { p_id: id });
    emit();
  }

  // A confirmed session cancelled less than FREE_CANCEL_HOURS before is charged in full
  function isLateCancel(b) {
    if (b.status !== "confirmed") return false;
    const until = b.freeCancelUntil ? new Date(b.freeCancelUntil) : new Date(slotStart(b.date, b.hour) - FREE_CANCEL_HOURS * 3600e3);
    return new Date() >= until;
  }

  async function cancelBooking(id) {
    const booking = await call("cancel_booking", { p_id: id });
    processRefunds();
    await Promise.all([refreshPlayer(), loadSlots(), loadCoachBookings()]);
    notifyBooking({ ...booking, hour: Number(booking.hour) }, booking.late ? "late_cancel" : "cancelled");
    emit();
    return booking;
  }

  // Expired requests: whichever browser (client, trainer or admin) claims them first sends the email
  async function claimBookingNotices() {
    try {
      const rows = await call("claim_booking_notices");
      (rows || []).forEach((b) => notifyBooking({ ...b, hour: Number(b.hour) }, b.notice === "requested" ? "requested" : "expired"));
      if ((rows || []).some((b) => b.notice === "expired")) processRefunds();
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

  // The logged-in trainer's charged sessions between two dates (for their monthly statement)
  async function coachStatement(from, to) {
    const rows = await call("coach_statement", { p_from: from, p_to: to });
    return (rows || []).map((b) => ({ ...b, hour: Number(b.hour), price: Number(b.price), trainerFee: Number(b.trainerFee) }));
  }

  async function markPayout(trainerId) {
    const result = await call("mark_payout", { p_trainer: trainerId });
    emit();
    return result;
  }

  const euro = (n) => `€${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  async function respondBooking(id, accept) {
    const booking = await call("respond_booking", { p_id: id, p_accept: Boolean(accept) });
    if (!accept) processRefunds();
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
  const coachRequests = () => oneRowPerSeries(coachBookings.filter((b) => b.status === "pending" && slotStart(b.date, b.hour) > new Date()));
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
        reply: `Hi ${booking.name}, your request for a ${booking.kind === "duo" ? "duo " : ""}session with ${trainer.name} on ${when} has been sent (${priceLabel(booking)}${booking.payStatus === "paid" ? ", paid online" : ""}). ${trainer.short} will confirm it soon; you'll see the status in your LEVEL-UP profile.${booking.payMethod === "in_person" && booking.payStatus !== "paid" ? ` You pay at the headquarters (${HQ_ADDRESS}), or online in your profile.` : ""}${booking.payStatus === "paid" ? " If the session doesn't go ahead, you get your money back automatically." : ""}`
      },
      confirmed: {
        subject: `Confirmed: ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, good news: ${trainer.name} confirmed your session on ${when}. ${booking.priceType === "pack" ? "This session uses one of your pack credits." : booking.priceType === "reward" ? "This is your free session: nothing to pay." : booking.payStatus === "paid" ? `Price: ${priceLabel(booking)}, already paid.` : `Price: ${priceLabel(booking)}: pay at the headquarters (${HQ_ADDRESS}) or online in your LEVEL-UP profile.`} After the session you get +${booking.xp} XP.`
      },
      declined: {
        subject: `Declined: ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, unfortunately ${trainer.name} can't make it on ${when}. Pick another hour in the LEVEL-UP schedule.${booking.payStatus === "paid" ? " You get your payment back." : ""}`
      },
      cancelled: {
        subject: `Cancelled: ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, your session with ${trainer.name} on ${when} has been cancelled. No costs${booking.payStatus === "paid" ? "; you get your payment back" : ""}.`
      },
      late_cancel: {
        subject: `Late cancellation (charged): ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, your session with ${trainer.name} on ${when} has been cancelled less than ${FREE_CANCEL_HOURS} hours before the start. As agreed in our cancellation policy, ${booking.priceType === "reward" ? "your free session is used up." : `the session is charged in full: ${euro(booking.price ?? SESSION_PRICE)}.`}${booking.payStatus === "paid" || ["pack", "reward"].includes(booking.payMethod) ? "" : " Pay at the headquarters or online in your LEVEL-UP profile."}`
      },
      no_show: {
        subject: `No-show (charged): ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, we missed you at your session with ${trainer.name} on ${when}. ${booking.priceType === "reward" ? "A missed free session is used up." : `A missed session is charged in full: ${euro(booking.price ?? SESSION_PRICE)}.`}${booking.payStatus === "paid" || ["pack", "reward"].includes(booking.payMethod) ? "" : " Pay at the headquarters or online in your LEVEL-UP profile."} Something came up? Reply to this email.`
      },
      expired: {
        subject: `Request expired: ${trainer.short} · ${when}`,
        reply: `Hi ${booking.name}, your request for a session with ${trainer.name} on ${when} wasn't confirmed in time, so it has been cancelled. No costs${booking.payStatus === "paid" ? "; you get your payment back" : ""}. Pick another hour in the LEVEL-UP schedule.`
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
        ...(booking.series ? { weekly: `${seriesText(booking.series)} · ${seriesUntil(booking.series)}` } : {}),
        price: priceLabel(booking),
        payment: booking.payMethod === "pack" ? "Pack credit" : booking.payMethod === "reward" ? "Free session (reward)" : booking.payStatus === "paid" ? `Paid ${booking.payMethod === "online" ? "online" : "at the HQ"}` : "Pays at the HQ",
        session: booking.kind === "duo" ? `Duo with ${booking.partner}` : "1:1",
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

  async function saveBodyStats(input) {
    const stats = computeStats(input);
    const result = await call("save_body_stats", { p: stats });
    await Promise.all([refreshPlayer({ announce: true }), loadLeaderboard(), loadTrainerStats()]);
    emit();
    return { xp: Number(result?.xp) || 0, stats };
  }

  // ---------- The start screen ("For you", foryou.js) ----------
  // What it shows on top of your own data: { race: [{ place, name, xp, isMe … }] (you and your neighbours on the
  // high scores, or the top 3 when ranked is false), photos: [...] from other members, trainersDone }
  let forYou = null;
  async function loadForYou() {
    if (!player) { forYou = null; return null; }
    try {
      const d = await call("for_you");
      forYou = {
        race: (d?.race || []).map((r) => ({ ...r, place: Number(r.place), xp: Number(r.xp), isMe: Boolean(r.isMe) })),
        ranked: Boolean(d?.ranked),
        // the race of all time and of this month: { place, total, rows: [{ place, name, xp, week, isMe … }] } (null: older database)
        board: d?.board ? Object.fromEntries(["all", "month"].map((k) => [k, {
          place: d.board[k]?.place == null ? null : Number(d.board[k].place), total: Number(d.board[k]?.total) || 0,
          rows: (d.board[k]?.rows || []).map((r) => ({ ...r, place: Number(r.place), xp: Number(r.xp), week: Number(r.week) || 0, isMe: Boolean(r.isMe) }))
        }]).concat([["sessionXp", Number(d.board.sessionXp) || 0]])) : null,
        // the latest posts of the club: { id, urls, caption, name, userId, likes, liked, comments: [...] }
        photos: (d?.photos || []).map((ph) => ({ ...ph, urls: ph.urls || (ph.url ? [ph.url] : []), comments: ph.comments || [],
          ownerTrainerId: ph.ownerTrainerId || ph.trainerId || null, likes: Number(ph.likes) || 0, liked: Boolean(ph.liked), commentCount: Number(ph.commentCount) || 0 })),
        trainersDone: Number(d?.trainersDone) || 0
      };
    } catch (err) {
      console.error("Loading your start screen failed:", err);
      forYou = forYou || { race: [], ranked: false, photos: [], trainersDone: 0 };
    }
    return forYou;
  }
  // The weekly check-in: one tap, XP once a week, and the week counts for your streak
  async function checkIn() {
    const r = await call("check_in");
    await Promise.all([refreshPlayer({ announce: true }), loadForYou(), leaderboard.length ? loadLeaderboard() : null]);
    emit();
    return { xp: Number(r?.xp) || 0 };
  }

  // Corrects an earlier check-in (same date, new values); never earns XP
  async function updateBodyStats(id, input) {
    const stats = computeStats(input);
    await call("update_body_stats", { p_id: id, p: stats });
    await refreshPlayer();
    emit();
    return stats;
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
    await loadShopCatalog(); // stock of limited drops
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
      hours: data.hours ? data.hours.map((r) => ({ ...r, weekday: r.weekday === null ? null : Number(r.weekday), start: Number(r.start), end: Number(r.end) })) : null,
      packs: (data.packs || []).map(normalisePack),
      vouchers: data.vouchers || [],
      pricing: {
        price: Number(data.pricing?.price ?? SESSION_PRICE),
        fee: Number(data.pricing?.fee ?? TRAINER_FEE),
        ownerTrainerId: data.pricing?.ownerTrainerId || "pieter",
        introPrice: Number(data.pricing?.introPrice ?? pricing.introPrice),
        duoPrice: Number(data.pricing?.duoPrice ?? pricing.duoPrice),
        duoFee: Number(data.pricing?.duoFee ?? 50),
        trainers: Object.fromEntries(Object.entries(data.pricing?.trainers || {}).map(([id, v]) => [id, {
          price: v.price === null ? null : Number(v.price), fee: v.fee === null ? null : Number(v.fee)
        }]))
      }
    };
  }

  // ---------- Accounts ----------
  const pageUrl = (page) => new URL(page, window.location.href).href.split("#")[0];

  async function signUp({ name, email, password, stats, trainerApplication }) {
    name = String(name || "").trim();
    email = String(email || "").trim().toLowerCase();
    if (!name) throw new Error("Enter your name.");
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
      if (/invalid/i.test(error.message)) throw new Error("Wrong email or password. New here? Create your profile.");
      throw new Error(friendly(error));
    }
    // onAuthStateChange loads the player and shows the welcome toast
  }

  // The confirmation email didn't arrive (spam folder, typo, sent too early): send it again
  async function resendConfirmation(email) {
    email = String(email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
    if (!sb) throw new Error(friendly("network"));
    const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: pageUrl("profile.html") } });
    if (error) throw new Error(friendly(error));
  }

  async function logOut() {
    await unlinkPushSubscription(); // this phone stops getting the old account's notifications
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
      if (event === "INITIAL_SESSION") return; // startup already loaded everything for a visitor
      player = null;
      forYou = null;
      welcomed = false;
      await Promise.all([loadSlots(), onHome ? loadLeaderboard() : null, document.getElementById("weekBoard") ? loadClasses() : null]);
      emit();
      return;
    }
    if ((event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") && player) return;
    await Promise.all([refreshPlayer(), loadSlots(), onHome ? loadLeaderboard() : null, loadTrainerStats(), loadOpeningHours(),
      document.getElementById("weekBoard") ? loadClasses() : null]);
    if (!wasLoggedIn && player && !welcomed) {
      welcomed = true;
      call("touch_login").catch(() => {});
      claimGuestOrders();
      syncPushSubscription();
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
      <p class="section-kicker">Admin inbox</p>
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
          ${b.series && b.series.status === "requested" ? `<p class="weekly-line"><span class="weekly-chip">🔁 Weekly</span> <span>${seriesText(b.series)}</span> · <span>${seriesUntil(b.series)}</span></p>` : ""}
          <p class="muted">${b.series && b.series.status === "requested" ? "First session: " : ""}${formatSlot(b.date, b.hour)}${b.note ? ` · “${esc(b.note)}”` : ""}</p>
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

  // ---------- Loading screen (#boot in each page) ----------
  // Pure CSS shows it only when loading takes longer than ~0.35 s and hides it by itself after
  // 12 s as a safety net; here it gets the real progress and is closed as soon as the data is in.
  const BOOT_TIPS = [
    "Every 20 sessions = a free 1:1 session 🎁",
    "Cancel for free up to 24 hours before your session",
    "Your first session is only €30",
    "Train with a friend: a duo session is €80 for the two of you",
    "Reach Champion and Legend for a free session",
    "Turn on notifications: hear it when your trainer confirms",
    "Check in every week on your start screen: +25 XP",
    "Session packs make every session cheaper"
  ];
  const bootEl = document.getElementById("boot");
  let bootTotal = 0;
  let bootDoneCount = 0;
  if (bootEl) {
    const tip = document.getElementById("bootTip");
    if (tip) tip.textContent = `Tip: ${BOOT_TIPS[Math.floor(Math.random() * BOOT_TIPS.length)]}`;
  }
  // The mascot on the loading screen: he drops in on his rings and does pull-ups while the data comes in. The logo
  // stands there until he is ready (his file loads next to the data) and stays when there is no movement wanted.
  function bootMascot() {
    const logo = bootEl?.querySelector(".boot-inner img");
    if (!logo || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    loadCelebrate().then((lib) => {
      if (!bootEl.isConnected || bootEl.classList.contains("done")) return;
      const W = 170, H = 210, q = Math.min(window.devicePixelRatio || 1, 2);
      const cv = document.createElement("canvas");
      cv.className = "boot-mascot";
      cv.width = W * q; cv.height = H * q;
      cv.setAttribute("aria-hidden", "true");
      const ctx = dressMascot(cv.getContext("2d"));
      ctx.setTransform(q, 0, 0, q, 0, 0);
      const sim = lib._createSim({ type: "rank", accent: themeAccent() || "#C6FF3D", glow: "transparent", short: false, hold: 999 }, W, H);
      sim.gripped = true; sim.burst = true; // his pose only: no chalk, no confetti
      sim.resize(W, H, 1);
      sim.s = Math.min(W / 190, H / 440); sim.ox = W / 2; sim.top = -22 * sim.s;
      const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      const t0 = performance.now();
      const frame = (now) => {
        if (!bootEl.isConnected || bootEl.classList.contains("done")) return;
        const ms = now - t0;
        if (ms < 650) sim.t = 0.02 + 0.68 * (ms / 650);            // he drops in
        else {                                                      // then pull-ups: up, a short hold, down, hang
          const u = ((ms - 650) % 1500) / 1500;
          sim.t = 0.7 + 0.65 * (u < 0.3 ? ease(u / 0.3) : u < 0.42 ? 1 : u < 0.78 ? 1 - ease((u - 0.42) / 0.36) : 0);
        }
        sim.step(0);
        sim.draw(ctx);
        requestAnimationFrame(frame);
      };
      sim.t = 0.02; sim.step(0); sim.draw(ctx);
      logo.replaceWith(cv);
      requestAnimationFrame(frame);
    }).catch(() => { /* the logo stays */ });
  }
  if (bootEl) Promise.resolve().then(bootMascot); // after this file has run: loadCelebrate and the theme are further down

  function bootStep(text) {
    const el = document.getElementById("bootStep");
    if (el) el.textContent = text;
  }
  const bootPending = [];
  function bootTask(promise, label) {
    bootTotal++;
    bootPending.push(label);
    bootStep(bootPending[0]);
    return Promise.resolve(promise).finally(() => {
      bootPending.splice(bootPending.indexOf(label), 1);
      if (bootPending.length) bootStep(bootPending[0]);
      bootDoneCount++;
      const fill = document.getElementById("bootFill");
      if (fill) fill.style.width = `${Math.min(95, 10 + (bootDoneCount / Math.max(bootTotal, 1)) * 85)}%`;
    });
  }
  function bootDone() {
    if (!bootEl) return;
    const fill = document.getElementById("bootFill");
    if (fill) fill.style.width = "100%";
    bootStep("Ready!");
    bootEl.classList.add("done");
    setTimeout(() => bootEl.remove(), 600);
  }

  // ---------- Startup ----------
  // High scores and reviews only show on the home page; other pages skip loading them.
  const onHome = Boolean(document.getElementById("scores"));
  const onSchedule = Boolean(document.getElementById("weekBoard"));
  const onShop = Boolean(document.getElementById("itemGrid"));
  // Everything loads at once; only the calendar and the player wait for the trainer list
  // (so new trainers' hours and names are known). The loading screen shows the real progress.
  const ready = (async () => {
    if (!sb) {
      serverError = "offline";
    } else {
      try {
        bootStep("Connecting…");
        const { data } = await sb.auth.getSession();
        session = data.session;
        const trainersLoaded = bootTask(loadTrainerList(), "Loading trainers…");
        await Promise.all([
          trainersLoaded.then(() => bootTask(loadCalendar(), "Loading the schedule…")),
          session ? trainersLoaded.then(() => bootTask(refreshPlayer(), "Loading your profile…")) : null,
          bootTask(loadPricing(), "Loading prices…"),
          bootTask(loadOpeningHours(), "Loading opening hours…"),
          bootTask(loadSlots(), "Loading open sessions…"),
          onSchedule ? bootTask(loadClasses(), "Loading group classes…") : null,
          onShop ? bootTask(loadShopCatalog(), "Loading the shop…") : null,
          bootTask(loadTrainerStats(), "Loading trainer levels…"),
          onHome ? bootTask(loadLeaderboard(), "Loading high scores…") : null,
          onHome ? bootTask(loadReviews(), "Loading reviews…") : null,
          onHome ? bootTask(loadClassKinds(), "Loading group trainings…") : null
        ]);
        if (player) {
          welcomed = true;
          call("touch_login").catch(() => {});
          claimGuestOrders();
          syncPushSubscription();
          setTimeout(showCoachInbox, 600);
          setTimeout(showAdminInbox, 1200);
          setTimeout(handlePaymentReturn, 300);
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
    bootDone();
  })();

  // ---------- Chat (player ↔ coach) ----------
  // The conversations live on the server (chat_* in schema.sql); chat.html shows them. Every page keeps
  // the unread badge up to date (tab bar, header) and pops up a notice when a new message comes in.
  // A push notification (sw.js) wakes the page up right away; otherwise it checks every 20 seconds.
  const CHAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>';
  let chatUnread = 0;
  let chatTimer = null;
  let chatActiveThread = null; // set by chat.js while a conversation is on screen
  const chatSeenKey = () => `levelup.chatSeen.${player?.id || ""}`;

  const chatList = () => call("chat_list");

  // ---------- Levelupy: the assistant in the chat (the mascot) ----------
  // The Edge Function "assistant" answers (supabase/functions/assistant, a Claude model); supabase/schema.sql decides
  // who has it (assistant_mode), what it knows and how many questions a day. It only reads: its answers can carry
  // buttons that open the right screen. chat.js shows the conversation, foryou.js the mascot that leads to it.
  const ASSISTANT_URL = `${SUPABASE_URL}/functions/v1/assistant`;
  const ASSISTANT_ID = "levelupy"; // the conversation: chat.html?t=levelupy, #chat/t/levelupy
  let assistant = { on: false };
  let assistantFor = null, assistantWait = null;
  // Is Levelupy there for this member (asked once per login), and with messages: the conversation so far
  async function loadAssistant(withMessages = false) {
    if (!player) { assistant = { on: false }; assistantFor = null; return assistant; }
    const who = player.id;
    try {
      const s = await call("assistant_state", { p_messages: Boolean(withMessages) });
      if (who !== player?.id) return assistant;
      assistant = { ...s, messages: s.messages || (assistant.on && assistantFor === who ? assistant.messages : null) || null };
    } catch { assistant = { on: false }; } // an older database: no Levelupy
    assistantFor = who;
    return assistant;
  }
  function hasAssistant() {
    if (!player) return Promise.resolve({ on: false });
    if (assistantFor === player.id) return Promise.resolve(assistant);
    assistantWait = assistantWait || loadAssistant().finally(() => { assistantWait = null; });
    return assistantWait;
  }
  async function askAssistant(message) {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Log in first.");
    let res;
    try {
      res = await fetch(ASSISTANT_URL, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message, lang: window.LEVELUP_LANG === "en" ? "en" : "nl" })
      });
    } catch { throw new Error("Can't reach the server. Check your connection and try again."); }
    const out = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error("Levelupy is not switched on yet.");
    if (!res.ok || !out.reply) throw new Error(out.error || "Levelupy can't answer right now. Try again in a moment.");
    assistant.left = Number(out.left);
    if (assistant.messages) assistant.messages.push({ role: "user", body: message, at: new Date().toISOString() }, out.reply);
    return out.reply;
  }
  const adminAssistant = () => call("admin_assistant");
  const adminAssistantSave = async (p) => { await call("admin_assistant_save", { p }); assistantFor = null; };
  const adminAssistantGapDone = (id) => call("admin_assistant_gap_done", { p_id: id });
  // Levelupy's own account: the mascot as a member who posts once a month
  const adminMascot = () => call("admin_mascot");
  const adminMascotSet = (email) => call("admin_mascot_set", { p_email: email });
  const adminMascotPost = () => call("admin_mascot_post");
  const adminMascotClear = () => call("admin_mascot_clear");
  async function clearAssistant() {
    await call("assistant_clear");
    assistant.messages = [];
  }
  // Where a button under an answer of Levelupy goes
  function assistantGo(action, arg = "") {
    const coach = trainerById(arg) ? arg : "";
    if (action === "chat_coach") { if (coach) openChatWith(coach); else gotoChat(); return; }
    const to = {
      book: "index.html#schedule", classes: "index.html#schedule", my_sessions: "profile.html#overview",
      check_in: PHONE.matches ? "index.html#foryou" : "profile.html#foryou", scores: "index.html#scores", shop: "shop.html",
      my_profile: "profile.html", contact: "index.html#contact"
    }[action];
    if (!to) return;
    const [file, hash] = to.split("#");
    const withCoach = action === "book" && coach;
    if (onIndex && file === "index.html" && hash) { // already on the home page: go to that part of it
      const el = document.getElementById(hash);
      if (el) {
        if (withCoach) window.LevelUpSchedule?.showTrainer(coach);
        setView(viewOf(el), { target: el });
        return;
      }
    }
    location.href = withCoach ? `index.html?trainer=${encodeURIComponent(coach)}#schedule` : to;
  }
  // The mascot's face as a picture (his head on the rings, in the colour of your rank), for the chat
  const mascotFaces = {};
  async function mascotFace(px = 96) {
    const accent = themeAccent() || "#C6FF3D";
    let look = mascotLook();
    let key = `${accent}|${px}|${look?.id || ""}`;
    if (mascotFaces[key]) return mascotFaces[key];
    try {
      const lib = await loadCelebrate();
      look = mascotLook(); // his wardrobe came in with the engine
      key = `${accent}|${px}|${look?.id || ""}`;
      if (mascotFaces[key]) return mascotFaces[key];
      const sim = lib._createSim({ type: "rank", accent, glow: "#ffd23f", short: false, hold: 999 }, px, px);
      sim.gripped = true; sim.burst = true; // no chalk, no confetti: just him
      sim.t = 3.0;                          // up in support on the rings, with a grin
      sim.step(0);
      // the frame: his face, plus what he wears on it (a tall hat, a beard) so nothing is cut off
      const up = Math.max(30, (look?.up || 0) + 3), down = Math.max(34, (look?.down || 0) + 3), wide = Math.max(32, (look?.side || 0) + 3);
      const R = sim.R, s = px / Math.max(up + down, wide * 2);
      sim.W = px; sim.H = px; sim.s = s;
      sim.ox = px / 2 - R.cx * s;
      sim.top = px / 2 - (R.rigY + R.sy - 35.5 + (down - up) / 2) * s;
      const cv = document.createElement("canvas");
      cv.width = px; cv.height = px;
      sim.draw(dressMascot(cv.getContext("2d")));
      mascotFaces[key] = cv.toDataURL("image/png");
    } catch { mascotFaces[key] = ""; }
    return mascotFaces[key];
  }
  const chatThread = (id, after = 0) => call("chat_thread", { p_thread: id, p_after: after });
  const chatSend = (id, body) => call("chat_send", { p_thread: id, p_body: body });
  const chatMute = (id, on) => call("chat_mute", { p_thread: id, p_on: Boolean(on) });
  const chatLike = (messageId) => call("chat_like", { p_message: Number(messageId) });
  const chatGroupDelete = (id) => call("chat_group_delete", { p_thread: id });
  const chatOpen = (trainerId) => call("chat_open", { p_trainer: trainerId });
  const chatSearch = (query) => call("chat_search", { p_query: query });
  const chatOpenUser = (userId) => call("chat_open_user", { p_user: userId });

  function setChatBadge(n) {
    chatUnread = n;
    document.querySelectorAll("[data-chat-badge]").forEach((el) => {
      el.textContent = n > 9 ? "9+" : String(n);
      el.hidden = !n;
    });
    document.documentElement.classList.toggle("has-chat-unread", n > 0);
  }

  async function refreshChatUnread() {
    if (!player || !sb) { setChatBadge(0); return; }
    try {
      const r = await call("chat_unread");
      setChatBadge(Number(r?.unread) || 0);
      checkCelebrations(Number(r?.celebrations) || 0);
      const seen = Number(read(chatSeenKey(), 0));
      if (r?.lastId && r.lastId > seen) {
        write(chatSeenKey(), r.lastId);
        if (r.thread !== chatActiveThread) chatNotice(r);
      }
      document.dispatchEvent(new CustomEvent("levelup:chat", { detail: r }));
    } catch (err) {
      console.warn("Chat check failed:", err.message);
    }
  }

  function scheduleChatCheck() {
    clearTimeout(chatTimer);
    if (!player) return;
    chatTimer = setTimeout(async () => {
      if (document.visibilityState === "visible") await refreshChatUnread();
      scheduleChatCheck();
    }, 20000);
  }

  // The "new message" pop-up at the top of the page (tap = open the conversation)
  let chatNoticeEl = null;
  function chatNotice({ thread, name, body }) {
    if (!chatNoticeEl) {
      chatNoticeEl = document.createElement("a");
      chatNoticeEl.className = "chat-notice";
      chatNoticeEl.setAttribute("role", "status");
      chatNoticeEl.setAttribute("aria-live", "polite");
      document.body.appendChild(chatNoticeEl);
    }
    chatNoticeEl.href = `chat.html?t=${encodeURIComponent(thread)}`;
    chatNoticeEl.innerHTML = `
      <span class="chat-notice-ico">${CHAT_ICON}</span>
      <span class="chat-notice-txt"><b data-no-i18n>${esc(name || "New message")}</b><span data-no-i18n>${esc(body || "")}</span></span>
      <span class="chat-notice-go" aria-hidden="true">›</span>`;
    chatNoticeEl.classList.remove("show");
    void chatNoticeEl.offsetWidth;
    chatNoticeEl.classList.add("show");
    clearTimeout(chatNoticeEl._hide);
    chatNoticeEl._hide = setTimeout(() => chatNoticeEl.classList.remove("show"), 6500);
  }

  // "Chat" on a coach card: log in first, then straight into the conversation
  function openChatWith(trainerId) {
    const t = trainerById(trainerId);
    if (!player) { openAuth("login"); return; }
    if (player.trainerId === trainerId) { gotoChat(); return; }
    if (t && t.linked === false) {
      toast({ title: `${t.short} isn't on the chat yet`, text: "Book a session or send a message to Pieter.", icon: "💬", tone: "green" });
      return;
    }
    gotoChat({ coach: trainerId });
  }

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-chat-trainer]");
    if (!btn) return;
    event.preventDefault();
    openChatWith(btn.dataset.chatTrainer);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshChatUnread(); });
  // A push arrived (sw.js tells the open pages): check right away
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "push") refreshChatUnread();
  });
  document.addEventListener("levelup:change", () => {
    if (!isReady) return;
    if (player && !chatTimer) { refreshChatUnread(); scheduleChatCheck(); }
    if (!player) { clearTimeout(chatTimer); chatTimer = null; setChatBadge(0); }
  });

  // ---------- Coach photos: tap one to go to that coach's card (Level 3 on the home page) ----------
  function goToCoach(id) {
    const card = document.getElementById(`team-${id}`);
    if (!card) { location.href = `index.html#team-${encodeURIComponent(id)}`; return; }
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    const row = card.parentElement;
    document.getElementById("team")?.scrollIntoView({ behavior: "smooth", block: "start" });
    row.dispatchEvent(new CustomEvent("levelup:hold")); // the gliding phone row stands still for a moment
    row.scrollTo({ left: card.offsetLeft - row.offsetLeft - 4, behavior: "smooth" });
    card.classList.remove("coach-focus");
    void card.offsetWidth;
    card.classList.add("coach-focus");
    setTimeout(() => card.classList.remove("coach-focus"), 2400);
  }
  document.addEventListener("click", (event) => {
    const face = event.target.closest("img[data-coach]"); // photos only: the Coach tab has buttons with data-coach too
    if (!face || face.closest(".team-card")) return;
    event.preventDefault();
    event.stopPropagation(); // e.g. the photo inside a "next free session" button
    goToCoach(face.dataset.coach);
  }, true);
  const coachFromHash = () => {
    const m = location.hash.match(/^#team-([\w-]+)$/);
    if (m) ready.then(() => setTimeout(() => goToCoach(decodeURIComponent(m[1])), 400));
  };
  if (!/profile|shop|admin|chat|privacy/.test(location.pathname)) { coachFromHash(); window.addEventListener("hashchange", coachFromHash); }

  // ---------- Phones: no pinch zoom (iPhone ignores user-scalable=no; double-tap zoom is off via touch-action in style.css) ----------
  if (window.matchMedia("(pointer: coarse)").matches) {
    ["gesturestart", "gesturechange", "gestureend"].forEach((type) =>
      document.addEventListener(type, (event) => event.preventDefault(), { passive: false }));
  }

  // ---------- Animated logo ----------
  // The header/footer logo becomes img/logo-anim.svg (the stickman doing real pull-ups): 3 reps when the
  // page opens (the footer one when it scrolls into view) and 3 more on hover or tap. It stays an <img>
  // (not inline SVG) so phones draw it sharp: Safari blurs animated inline SVG parts into grey.
  // The boot screen shows the same file, looping. If the file can't be loaded the plain logo.JPG stays.
  function animateLogos() {
    const imgs = document.querySelectorAll("img.brand-logo");
    if (!imgs.length || !window.fetch || !window.Blob) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    fetch("img/logo-anim.svg?v=3").then((r) => (r.ok ? r.text() : Promise.reject())).then((text) => {
      const reps = text.replaceAll('repeatCount="indefinite"', 'repeatCount="3"');
      if (reps === text) return;
      imgs.forEach((img, i) => {
        let playing = false, url = "";
        const play = () => {
          if (playing) return;
          playing = true;
          const next = URL.createObjectURL(new Blob([reps], { type: "image/svg+xml" })); // a fresh copy restarts the reps
          const pre = new Image();
          pre.onload = () => { img.src = next; if (url) URL.revokeObjectURL(url); url = next; };
          pre.src = next;
          setTimeout(() => { playing = false; }, 3 * 1150 + 300); // 3 reps of 1.15 s
        };
        const host = img.closest("a, .brand") || img;
        host.addEventListener("mouseenter", play);
        host.addEventListener("touchstart", play, { passive: true });
        if (i === 0 || !window.IntersectionObserver) { play(); return; }
        const seen = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) { seen.disconnect(); play(); }
        });
        seen.observe(img);
      });
    }).catch(() => {});
  }
  animateLogos();

  // ---------- Events ----------
  // What is about a level (rank badge, XP bars, your own row, the mascot) takes the colour of the player's rank
  // (Rookie mint … Legend gold); the site itself keeps its own colours. See style.css "Level colour".
  // Remembered so the next page load starts in the right colour (inline script in each page's <head>).
  function applyRankTheme() {
    if (!player && (!isReady || session)) return; // still loading: keep the colour the <head> script set
    const tier = player ? RANKS.indexOf(rankFor(levelFromXp(player.xp || 0))) : -1;
    const root = document.documentElement;
    if (tier > 0) root.dataset.rank = String(tier);
    else delete root.dataset.rank;
    try {
      if (tier > 0) localStorage.setItem("levelup.rank", String(tier));
      else localStorage.removeItem("levelup.rank");
    } catch {}
    // Logged in: on a phone the app opens on your own start screen ("For you"). Remembered like the colour, so the
    // next visit starts there at once (the script in the <head> of index.html reads it).
    try {
      if (player) localStorage.setItem("levelup.fy", "1");
      else localStorage.removeItem("levelup.fy");
    } catch {}
  }

  function emit() {
    applyCoachPhotos();
    applyRankTheme();
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
      if (!rankUp) toast({ title: "Level up!", text: `You reached LVL ${endLevel}`, icon: "⬆" }); // a new rank gets the promotion screen
    }
  }

  // ---------- HUD (header player chip) ----------
  // A player's avatar: their photo when they uploaded one, otherwise their first letter (colour = rank)
  function avatarHtml(p, size = "") {
    const letter = esc((p.name || "?").trim().charAt(0).toUpperCase() || "?");
    const tier = RANKS.indexOf(rankFor(levelFromXp(p.xp || 0)));
    const coach = p.trainerId ? TRAINERS.find((t) => t.id === p.trainerId) : null;
    const url = p.avatarUrl || p.avatar || (coach && !coach.dynamic ? coach.defaultImg || coach.img : null);
    if (url) return `<span class="avatar has-photo ${size}" data-tier="${tier}" aria-hidden="true"><img src="${esc(url)}" alt="" loading="lazy" decoding="async"></span>`;
    return `<span class="avatar ${size}" data-tier="${tier}" aria-hidden="true">${letter}</span>`;
  }

  // ---------- Player card image (Share my card) and the promotion screen ----------
  const TIER_COLORS = ["#5ee6a8", "#5ab0ff", "#b18cff", "#ff9a4d", "#ff6b9d", "#ffcf5a"]; // Rookie … Legend
  const SITE_LINK = "pieterrvds.github.io/LEVEL-UP-";
  const tr = (s) => (window.t ? window.t(s) : s); // Dutch/English (i18n.js) for text drawn on the card image
  const completedSessions = (p) => (p?.bookings || []).filter((b) => b.status === "completed").length;
  const loadImage = (src, cors) => new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  // A 1080×1350 image (Instagram portrait) in the style of an Ultimate Team card
  async function drawPlayerCard(p = player) {
    if (!p) throw new Error("Log in first.");
    const prog = progress(p.xp);
    const tier = RANKS.indexOf(prog.rank);
    const color = TIER_COLORS[Math.max(0, tier)];
    await Promise.all([
      document.fonts?.load("italic 800 100px 'Barlow Condensed'"),
      document.fonts?.load("600 40px Inter")
    ].map((x) => x?.catch?.(() => {})));
    const [photo, logo] = await Promise.all([p.avatarUrl ? loadImage(p.avatarUrl, true) : null, loadImage("img/logo.JPG")]);
    const W = 1080, H = 1350;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    const display = (size, weight = 800) => `italic ${weight} ${size}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;
    const sans = (size, weight = 600) => `${weight} ${size}px Inter, system-ui, sans-serif`;
    const fit = (text, font, size, max) => { let s = size; do { g.font = font(s); s -= 4; } while (g.measureText(text).width > max && s > 20); };
    const rounded = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };

    // background with a light streak
    g.fillStyle = "#070707"; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,0.035)";
    g.beginPath(); g.moveTo(W * 0.62, 0); g.lineTo(W * 0.74, 0); g.lineTo(W * 0.34, H); g.lineTo(W * 0.22, H); g.fill();
    // card shape with rounded corners
    const X = 90, Y = 80, CW = 900, CH = 1150;
    const shape = () => rounded(X, Y, CW, CH, 56);
    const grad = g.createLinearGradient(X, Y, X + CW * 0.7, Y + CH);
    grad.addColorStop(0, color); grad.addColorStop(0.32, "#1c1c1c"); grad.addColorStop(1, "#000");
    g.save(); shape(); g.fillStyle = grad; g.fill(); g.clip();
    g.globalAlpha = 0.18; g.fillStyle = color; g.beginPath(); g.moveTo(X + CW * 0.55, Y); g.lineTo(X + CW * 0.7, Y); g.lineTo(X + CW * 0.25, Y + CH); g.lineTo(X + CW * 0.1, Y + CH); g.fill(); g.globalAlpha = 1;
    g.restore();
    shape(); g.lineWidth = 5; g.strokeStyle = color; g.stroke();

    // level + rank (top left), logo (top right)
    g.fillStyle = "#fff"; g.textBaseline = "alphabetic"; g.textAlign = "left";
    g.font = display(190); g.fillText(String(prog.level), X + 60, Y + 230);
    g.font = display(46); g.fillStyle = "rgba(255,255,255,0.85)"; g.fillText("LVL", X + 66, Y + 285);
    g.fillStyle = color; g.font = display(54); g.fillText(prog.rank.title.toUpperCase(), X + 66, Y + 345);
    if (logo) { g.save(); rounded(X + CW - 190, Y + 70, 120, 120, 20); g.clip(); g.drawImage(logo, X + CW - 190, Y + 70, 120, 120); g.restore(); }

    // photo or letter
    const PS = 480, PX = X + CW - PS - 70, PY = Y + 230;
    g.save(); rounded(PX, PY, PS, PS, 36); g.clip();
    if (photo) {
      const s = Math.min(photo.width, photo.height);
      g.drawImage(photo, (photo.width - s) / 2, (photo.height - s) / 2, s, s, PX, PY, PS, PS);
    } else {
      g.fillStyle = color; g.fillRect(PX, PY, PS, PS);
      g.fillStyle = "#000"; g.font = display(300); g.textAlign = "center";
      g.fillText((p.name || "?").trim().charAt(0).toUpperCase(), PX + PS / 2, PY + PS / 2 + 105); g.textAlign = "left";
    }
    g.restore();
    rounded(PX, PY, PS, PS, 36); g.lineWidth = 4; g.strokeStyle = "rgba(255,255,255,0.18)"; g.stroke();
    if (p.potm) {
      const label = tr("👑 PLAYER OF THE MONTH");
      g.font = display(40); const w = g.measureText(label).width + 44;
      rounded(PX + PS / 2 - w / 2, PY + PS - 34, w, 68, 12); g.fillStyle = "#ffd23f"; g.fill();
      g.fillStyle = "#000"; g.textAlign = "center"; g.fillText(label, PX + PS / 2, PY + PS + 14); g.textAlign = "left";
    }

    // name
    g.fillStyle = "#fff"; g.textAlign = "center";
    fit(p.name.toUpperCase(), display, 128, CW - 120); g.fillText(p.name.toUpperCase(), X + CW / 2, Y + 870);
    g.fillStyle = color; g.fillRect(X + CW / 2 - 140, Y + 900, 280, 6);

    // stats
    const stats = [
      [p.xp.toLocaleString("en-US"), tr("TOTAL XP")],
      [String(completedSessions(p)), tr("SESSIONS")],
      [p.streak?.weeks >= 2 ? `🔥 ${p.streak.weeks}` : "–", tr("WEEK STREAK")]
    ];
    stats.forEach(([v, l], i) => {
      const cx = X + CW / 2 + (i - 1) * 290;
      g.fillStyle = "#fff"; g.font = display(84); g.fillText(v, cx, Y + 1010);
      g.fillStyle = "rgba(255,255,255,0.6)"; g.font = sans(28, 700); g.fillText(l, cx, Y + 1055);
    });
    g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(X + CW / 2 - 145, Y + 945, 2, 120); g.fillRect(X + CW / 2 + 145, Y + 945, 2, 120);

    // footer: brand line inside the card, the link under it
    g.fillStyle = color; g.font = display(38); g.fillText("LEVEL-UP PERSONAL TRAINING · AALST", X + CW / 2, Y + CH - 45);
    g.fillStyle = "rgba(255,255,255,0.6)"; g.font = sans(30, 600); g.fillText(SITE_LINK, W / 2, H - 42);
    g.textAlign = "left";
    return new Promise((resolve) => c.toBlob(resolve, "image/png"));
  }

  // Preview + Share (phones: Instagram, WhatsApp…) or Save image
  async function shareCard() {
    const blob = await drawPlayerCard();
    const file = new File([blob], "levelup-player-card.png", { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const prog = progress(player.xp);
    const text = tr(`LVL ${prog.level} ${prog.rank.title} at LEVEL-UP 💪 ${SITE_LINK}`);
    let dlg = document.getElementById("shareDialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "shareDialog"; dlg.className = "auth-dialog share-dialog"; dlg.setAttribute("aria-labelledby", "shareTitle");
      document.body.appendChild(dlg);
      dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
      dlg.addEventListener("close", () => { const img = dlg.querySelector("img"); if (img) URL.revokeObjectURL(img.src); });
    }
    const canShare = Boolean(navigator.canShare?.({ files: [file] }));
    dlg.innerHTML = `
      <button type="button" class="dialog-close" data-close aria-label="Close">✕</button>
      <p class="section-kicker">Your player card</p>
      <h2 class="auth-title" id="shareTitle">Share my card</h2>
      <img class="share-preview" src="${url}" alt="Your LEVEL-UP player card">
      <div class="btn-row">
        ${canShare ? `<button type="button" class="btn btn-primary" data-share-now>Share ▶</button>` : ""}
        <a class="btn ${canShare ? "btn-ghost" : "btn-primary"}" href="${url}" download="levelup-player-card.png">Save image</a>
      </div>`;
    dlg.querySelector("[data-share-now]")?.addEventListener("click", () => {
      navigator.share({ files: [file], title: tr("My LEVEL-UP player card"), text }).catch(() => {});
    });
    if (!dlg.open) dlg.showModal();
  }

  // A new rank since this phone last saw this player: full-screen promotion card in the new colour
  function checkPromotion() {
    if (!player) return;
    const tier = RANKS.indexOf(rankFor(levelFromXp(player.xp)));
    const key = `levelup.rankSeen.${player.id}`;
    const seen = read(key, null);
    write(key, tier);
    if (seen !== null && tier > Number(seen)) setTimeout(() => showPromotion(), 600);
  }

  function showPromotion(p = player) {
    if (!p || document.querySelector(".promo")) return;
    const prog = progress(p.xp);
    const tier = RANKS.indexOf(prog.rank);
    const el = document.createElement("div");
    el.className = "promo";
    el.style.setProperty("--c", TIER_COLORS[Math.max(0, tier)]);
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", `Promoted to ${prog.rank.title}`);
    el.innerHTML = `
      <div class="promo-rays" aria-hidden="true"></div>
      <div class="promo-card">
        <p class="promo-kicker">Promoted</p>
        ${avatarHtml(p, "xl")}
        <h2 class="promo-rank">${esc(prog.rank.title)}</h2>
        <p class="promo-level">LVL ${prog.level} · ${esc(p.name)}</p>
        <p class="promo-note">New rank, new colour. Keep it up!</p>
      </div>
      <div class="promo-actions">
        <button type="button" class="btn btn-primary" data-promo-share>Share my card ▶</button>
        <button type="button" class="btn btn-ghost" data-promo-close>Continue</button>
      </div>`;
    const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 250); };
    el.querySelector("[data-promo-close]").addEventListener("click", close);
    el.querySelector("[data-promo-share]").addEventListener("click", () => { close(); shareCard().catch((e) => toast({ title: "Card not made", text: e.message, icon: "✕" })); });
    document.body.appendChild(el);
    el.querySelector("[data-promo-close]").focus({ preventScroll: true });
  }

  // ---------- Profile photo: square-cropped and shrunk in the browser, then stored in Storage "avatars" ----------
  const AVATAR_SIZE = 640; // also the photo on a coach card, so a bit bigger than an avatar needs
  async function squarePhoto(file) {
    if (!/^image\//.test(file?.type || "")) throw new Error("Choose a photo (JPG, PNG or WebP).");
    if (file.size > 15 * 1024 * 1024) throw new Error("That photo is too big. Choose one under 15 MB.");
    let img;
    try {
      img = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("This photo can't be read. Try a JPG or PNG."));
        el.src = URL.createObjectURL(file);
      });
    }
    const w = img.width, h = img.height, side = Math.min(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (w - side) / 2, Math.max(0, (h - side) * 0.3), side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE); // a bit above centre: faces
    return new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Couldn't prepare the photo.")), "image/jpeg", 0.86));
  }

  const avatarPath = (url) => url?.split("/storage/v1/object/public/avatars/")[1] || null;

  async function uploadAvatar(file) {
    if (!player || !sb) throw new Error("Log in first.");
    const blob = await squarePhoto(file);
    const path = `${player.id}/${Date.now()}.jpg`;
    const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (error) throw new Error(/bucket/i.test(error.message) ? "Photo uploads aren't switched on yet. Try again later." : friendly(error));
    const old = avatarPath(player.avatarUrl);
    const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    await call("set_avatar", { p_url: url });
    if (old) sb.storage.from("avatars").remove([old]).catch(() => {});
    await Promise.all([refreshPlayer(), loadLeaderboard()]);
    emit();
  }

  async function removeAvatar() {
    if (!player) return;
    const old = avatarPath(player.avatarUrl);
    await call("set_avatar", { p_url: null });
    if (old && sb) sb.storage.from("avatars").remove([old]).catch(() => {});
    await Promise.all([refreshPlayer(), loadLeaderboard()]);
    emit();
  }

  // ---------- Member pages: photos on your own page (same Storage bucket as the profile photo) ----------
  const PHOTO_MAX = 1280; // longest side, to keep the file small
  async function fitPhoto(file) {
    if (!/^image\//.test(file?.type || "")) throw new Error("Choose a photo (JPG, PNG or WebP).");
    if (file.size > 15 * 1024 * 1024) throw new Error("That photo is too big. Choose one under 15 MB.");
    let img;
    try {
      img = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("This photo can't be read. Try a JPG or PNG."));
        el.src = URL.createObjectURL(file);
      });
    }
    const scale = Math.min(1, PHOTO_MAX / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = (q) => new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Couldn't prepare the photo.")), "image/jpeg", q));
    let out = await blob(0.82);
    if (out.size > 950 * 1024) out = await blob(0.6); // the bucket takes files up to 1 MB
    return out;
  }
  // A post on your page: one to six photos (shrunk in the browser, stored in your own folder) with a text.
  // progress(done, all) is called while the photos go up.
  async function addPost(files, text = "", progress = null) {
    if (!player || !sb) throw new Error("Log in first.");
    const list = [...(files || [])];
    if (!list.length) throw new Error("Add at least one photo.");
    if (list.length > 6) throw new Error("A post takes up to 6 photos.");
    const body = String(text || "").trim();
    if (body.length > 500) throw new Error("Keep the text under 500 characters.");
    const paths = [];
    const cleanUp = () => { if (paths.length) sb.storage.from("avatars").remove(paths).catch(() => {}); };
    const stamp = Date.now();
    try {
      for (let i = 0; i < list.length; i++) {
        if (progress) progress(i, list.length);
        const blob = await fitPhoto(list[i]);
        const path = `${player.id}/p${stamp}-${i}.jpg`;
        const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
        if (error) throw new Error(/bucket/i.test(error.message) ? "Photo uploads aren't switched on yet. Try again later." : friendly(error));
        paths.push(path);
      }
      if (progress) progress(list.length, list.length);
      const urls = paths.map((path) => sb.storage.from("avatars").getPublicUrl(path).data.publicUrl);
      let data;
      try {
        data = await call("post_add", { p_urls: urls, p_text: body });
      } catch (err) {
        // a database from before posts: one photo with a short text still works
        if (!/isn't set up yet/.test(err.message) || urls.length > 1) throw err;
        data = await call("photo_add", { p_url: urls[0], p_caption: body.slice(0, 140) });
      }
      player = normalisePlayer(data);
    } catch (err) {
      cleanUp();
      throw err;
    }
    if (forYou) await loadForYou();
    emit();
  }
  const addPhoto = (file, caption = "") => addPost([file], caption);
  // Your own post, or any post as admin: the row and its files go
  async function deletePhoto(id) {
    const r = await call("photo_delete", { p_id: id });
    const paths = (r?.urls || [r?.url]).map(avatarPath).filter(Boolean);
    if (paths.length && sb) sb.storage.from("avatars").remove(paths).catch(() => {});
    if (forYou) forYou.photos = forYou.photos.filter((ph) => ph.id !== id);
    if (player && r?.userId === player.id) await refreshPlayer();
    emit();
  }
  async function setProfile(p) {
    player = normalisePlayer(await call("set_profile", { p }));
    emit();
  }

  // ---------- Member pages: profile.html?u=… or ?trainer=… shows another member or a coach (photos, classes, likes, chat, booking);
  // without either it is your own page, with your account in tabs only you see ----------
  // Opens from anything with data-profile="<user id>" or data-profile-trainer="<trainer id>": the high scores,
  // a chat, the likes on your profile, a coach card. Coaches are public; members see each other when logged in.
  const publicProfile = (who) => call("public_profile", who.trainerId ? { p_trainer: who.trainerId } : { p_user: who.userId });
  const memberLink = (who) => who.trainerId ? `profile.html?trainer=${encodeURIComponent(who.trainerId)}` : `profile.html?u=${encodeURIComponent(who.userId)}`;
  function openProfile(who) {
    if (!who || (!who.trainerId && !who.userId)) { if (!player) openAuth("login"); return; }
    if (!who.trainerId && !player) { openAuth("login"); return; }
    location.href = memberLink(who);
  }
  // Reactions on photos: each returns the photo again, with its likes and comments
  const photoLike = (id) => call("photo_like", { p_photo: id });
  const photoComment = (id, body) => call("photo_comment", { p_photo: id, p_body: body });
  const photoCommentDelete = (id) => call("photo_comment_delete", { p_id: id });
  const photoCommentLike = (id) => call("photo_comment_like", { p_id: id });
  // A like from a member page (the hearts on the high scores follow)
  async function likeMember(userId) {
    const res = await call("give_like", { p_to: userId });
    eachLikeTarget(userId, (r) => { r.liked = true; r.likes = Number(res?.likes) || r.likes + 1; });
    emit();
    return res;
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest("button[data-like]")) return; // the heart on a photo gives a like
    const el = event.target.closest("[data-profile], [data-profile-trainer]");
    if (el) {
      event.preventDefault();
      openProfile(el.dataset.profileTrainer ? { trainerId: el.dataset.profileTrainer } : { userId: el.dataset.profile });
      return;
    }
    if (event.target.closest("a, button, dialog")) return;
    // a coach card on the home page (photo or name) and the small coach faces on the training cards
    const card = event.target.closest(".team-card[id^='team-']");
    if (card && event.target.closest(".team-photo-wrap, h3")) { openProfile({ trainerId: card.id.slice(5) }); return; }
    const face = event.target.closest("img[data-coach]");
    if (face) openProfile({ trainerId: face.dataset.coach });
  });

  async function adminClearAvatar(userId) {
    await call("admin_clear_avatar", { p_user: userId });
  }

  function renderHud() {
    const slot = document.getElementById("hudAccount");
    if (!slot) return;
    if (!isReady) {
      slot.innerHTML = `<span class="hud-loading" aria-label="Loading">…</span>`;
      return;
    }
    if (!player) {
      slot.innerHTML = `${newsButtonHtml()}<button type="button" class="btn btn-small hud-login" data-auth-open="login">▶ Log in</button>`;
      return;
    }
    const p = progress(player.xp);
    slot.innerHTML = `
      ${newsButtonHtml()}
      <a href="chat.html" class="hud-chat" title="Chat" aria-label="Chat">${CHAT_ICON}<i class="chat-badge" data-chat-badge ${chatUnread ? "" : "hidden"}>${chatUnread > 9 ? "9+" : chatUnread}</i></a>
      <a href="profile.html" class="hud-player" title="Your profile · ${p.xp} XP">
        ${avatarHtml(player)}
        <span class="hud-player-meta">
          <span class="hud-player-level">LVL <b>${p.level}</b></span>
          <span class="mini-xp" aria-hidden="true"><i style="width:${p.pct.toFixed(1)}%"></i></span>
        </span>
        <span class="sr-only">Open your profile, level ${p.level}</span>
      </a>
      <a href="profile.html#settings" class="hud-gear" title="Settings" aria-label="Settings">${GEAR_ICON}</a>
      ${isAdmin() ? `<a href="admin.html" class="hud-admin" title="Admin dashboard">🛠<span class="hud-admin-label"> Admin</span></a>` : ""}`;
  }

  // ---------- Celebrations: a full-screen moment for a purchase, a higher place on the high scores or a like ----------
  // The animation is levelup-celebrate.js (loaded here, once, the first time one is due). The server keeps the queue
  // (table "celebrations"); each one is claimed just before it plays, so it shows exactly once, on any device.
  // They play one after another, and never on top of a form, a dialog or a payment: then they wait.
  const GEAR_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2.6-1.5L14 2.6h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.7 7.7 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3 1 2-3.4z"/></svg>`;
  const CELEBRATE_FILE = "levelup-celebrate.js?v=1";
  const LOOKS_FILE = "mascot-looks.js?v=1";
  // ---------- What the mascot wears today (mascot-looks.js) ----------
  // A hat, glasses or a moustache by season and feast day; a cake on the member's birthday and a laurel wreath on
  // the day they joined. "?look=santa" (or "none") in the address shows one look, to try them out.
  let lookNow = { at: 0, key: "", look: null };
  function mascotLook() {
    const L = window.LevelUpLooks;
    if (!L) return null;
    const key = `${player?.id || ""}|${player?.birthday || ""}`, now = Date.now();
    if (now - lookNow.at < 60000 && lookNow.key === key) return lookNow.look;
    let force = "";
    try { force = new URLSearchParams(location.search).get("look") || ""; } catch {}
    const look = force === "none" ? null : L.LOOKS[force] || L.pick(new Date(), { birthday: player?.birthday, joined: player?.createdAt });
    lookNow = { at: now, key, look };
    return look;
  }
  const dressMascot = (ctx) => (window.LevelUpLooks && ctx ? window.LevelUpLooks.dress(ctx, mascotLook, () => ({ accent: themeAccent() || "#5ee6a8" })) : ctx);
  async function setBirthday(md) {
    await call("set_birthday", { p_md: md || null });
    await refreshPlayer();
    lookNow.at = 0;
    emit();
  }
  const onAdminPage = /admin\.html$/.test(location.pathname);
  const celebrated = new Set();      // ids this page already handled
  const celebrateHolds = new Set();  // reasons to wait, e.g. "paypal" while the payment window is open
  let celebrateLib = null;
  let celebrateRun = null;
  let celebrateTimer = null;
  let celebratedOnce = false;
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function loadCelebrate() {
    if (celebrateLib) return celebrateLib; // one answer for everyone: the engine and, right after it, his wardrobe
    celebrateLib = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CELEBRATE_FILE;
      script.onload = () => {
        if (!window.LevelUpCelebrate) { reject(new Error("Celebration didn't load.")); return; }
        // everywhere the calm, full version: a bit slower and never the short cut (set once, right after loading)
        window.LevelUpCelebrate.defaults.speed = 0.8;
        window.LevelUpCelebrate.defaults.short = false;
        const lib = window.LevelUpCelebrate;
        // the celebrations make their own canvas: whatever they create while they start gets dressed
        ["play", "purchase", "like", "rankUp"].forEach((fn) => {
          const run = lib[fn];
          lib[fn] = (opts) => {
            const proto = HTMLCanvasElement.prototype, get = proto.getContext;
            proto.getContext = function (type, ...rest) { const ctx = get.call(this, type, ...rest); return type === "2d" && ctx ? dressMascot(ctx) : ctx; };
            try { return run(opts); } finally { proto.getContext = get; }
          };
        });
        // his wardrobe (mascot-looks.js); without it he is simply bareheaded
        const looks = document.createElement("script");
        looks.src = LOOKS_FILE;
        looks.onload = looks.onerror = () => resolve(lib);
        document.head.appendChild(looks);
      };
      script.onerror = () => { celebrateLib = null; reject(new Error("Celebration didn't load.")); };
      document.head.appendChild(script);
    });
    return celebrateLib;
  }
  function holdCelebrations(reason, on) {
    if (on) celebrateHolds.add(reason); else celebrateHolds.delete(reason);
    if (!on) queueCelebrations(300);
  }
  // In the middle of something? A dialog, the bag, the loading or promotion screen, typing in a field, a payment
  function celebrateBusy() {
    if (celebrateHolds.size || document.visibilityState !== "visible") return true;
    if (document.getElementById("boot")) return true;
    if (document.querySelector("dialog[open], .promo, .bag.open, .lu-cel") || document.body.classList.contains("no-scroll")) return true;
    const a = document.activeElement;
    return Boolean(a && a !== document.body && a.matches(
      "textarea, select, [contenteditable=''], [contenteditable='true'], input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file])"));
  }
  const themeAccent = () => {
    const c = getComputedStyle(document.documentElement).getPropertyValue("--level").trim() || "";
    return /^#[0-9a-f]{6}$/i.test(c) ? c : undefined; // the colour of the player's level
  };
  function purchaseLine(p) {
    if (p.what === "pack") return `Your ${p.size}-session pack is ready.${p.gift ? ` · Your free ${p.gift} is waiting at the desk` : ""}`;
    if (p.what === "session") return `Session with ${p.trainer} · ${p.slot}`;
    if (p.what === "class") return `${p.title} · ${p.slot}`;
    const items = p.items || [];
    return `${items[0] || "Your order"}${items.length > 1 ? ` and ${items.length - 1} more` : ""}${p.xp ? ` · +${p.xp} XP` : ""}`;
  }
  function likeNames(rows) {
    const names = [...new Set(rows.map((r) => String(r.payload?.by || "").trim()).filter(Boolean))];
    if (names.length <= 1) return `Likes from ${names[0] || "a member"}`;
    if (names.length === 2) return `Likes from ${names[0]} and ${names[1]}`;
    if (names.length === 3) return `Likes from ${names[0]}, ${names[1]} and ${names[2]}`;
    return `Likes from ${names[0]}, ${names[1]} and ${names.length - 2} others`;
  }
  // The waiting rows as the moments to play: every purchase, then one for the ranking, then one for all likes
  function celebrationShows(rows) {
    const shows = [];
    rows.filter((r) => r.kind === "purchase").forEach((r) => shows.push({ ids: [r.id], fn: "purchase",
      opts: { title: tr("Purchase complete!"), subtitle: tr(purchaseLine(r.payload || {})) } }));
    const ranks = rows.filter((r) => r.kind === "rank");
    if (ranks.length) {
      const from = Math.max(...ranks.map((r) => Number(r.payload?.from) || 0));
      const to = Number(ranks[ranks.length - 1].payload?.to) || 0;
      shows.push({ ids: ranks.map((r) => r.id), fn: to && to < from ? "rankUp" : null,
        opts: { from, to, title: tr("Level up!"), subtitle: tr("You climbed the high scores.") } });
    }
    const likes = rows.filter((r) => r.kind === "like");
    if (likes.length === 1) {
      const by = String(likes[0].payload?.by || "").trim() || tr("A member");
      shows.push({ ids: [likes[0].id], fn: "like", opts: { by, title: tr("New like!"), subtitle: tr(`${by} gave you a like.`) } });
    } else if (likes.length > 1) {
      shows.push({ ids: likes.map((r) => r.id), fn: "like",
        opts: { by: likes[0].payload?.by, title: tr(`${likes.length} new likes!`), subtitle: tr(likeNames(likes)) } });
    }
    return shows;
  }
  const waitingCelebrations = () => (player?.celebrations || []).filter((c) => !celebrated.has(c.id));
  // only: play just this kind now (after a payment: the purchase first, the rest once the order summary is closed)
  function runCelebrations(only = null) {
    if (celebrateRun) return celebrateRun;
    const due = () => waitingCelebrations().filter((c) => !only || c.kind === only);
    if (onAdminPage || !player || !sb || !due().length) return Promise.resolve();
    if (celebrateBusy()) { queueCelebrations(1500); return Promise.resolve(); }
    celebrateRun = (async () => {
      try {
        const lib = await loadCelebrate();
        for (const show of celebrationShows(due())) {
          while (celebrateBusy()) await pause(1000);            // something opened in between: wait for it
          show.ids.forEach((id) => celebrated.add(id));
          const mine = await call("celebrations_claim", { p_ids: show.ids }); // seen from now on, here and on other devices
          if (!show.fn || !(mine || []).length) continue;        // another tab or phone already showed it
          await lib[show.fn]({ accent: themeAccent(), ...show.opts }).done;
          await pause(250);
        }
      } catch (err) {
        console.warn("Celebration skipped:", err.message);
      } finally {
        if (player) player.celebrations = waitingCelebrations();
        celebrateRun = null;
        queueCelebrations(1500); // anything left (or new) plays when nothing is in the way
      }
    })();
    return celebrateRun;
  }
  function queueCelebrations(delay = 400) {
    clearTimeout(celebrateTimer);
    if (onAdminPage || !player || !waitingCelebrations().length) return;
    celebrateTimer = setTimeout(() => runCelebrations(), delay);
  }
  // Right now (the page knows nothing is in the way, e.g. just after a payment): resolves when they are over
  async function celebrateNow(only = null) {
    clearTimeout(celebrateTimer);
    if (celebrateRun) await celebrateRun;
    return runCelebrations(only);
  }
  // Something that isn't in the queue: a visitor without an account who just paid
  async function celebrateLocal(kind, opts = {}) {
    try {
      const lib = await loadCelebrate();
      const fn = kind === "like" ? "like" : kind === "rank" ? "rankUp" : "purchase";
      await lib[fn]({ accent: themeAccent(), title: tr(kind === "purchase" ? "Purchase complete!" : kind === "like" ? "New like!" : "Level up!"),
        ...opts, subtitle: opts.subtitle ? tr(opts.subtitle) : undefined }).done;
    } catch (err) {
      console.warn("Celebration skipped:", err.message);
    }
  }
  // The chat check (every 20 seconds, and at once when a push arrives) says when something new is waiting
  async function checkCelebrations(count) {
    if (onAdminPage || !player || !count || celebrateRun) return;
    if (!waitingCelebrations().length) {
      try { player.celebrations = (await call("celebrations_open")) || []; } catch { return; }
    }
    queueCelebrations(200);
  }
  document.addEventListener("levelup:change", () => {
    if (!isReady) return;
    // the first time after loading: let the loading screen and a promotion go first
    queueCelebrations(celebratedOnce ? 400 : 1300);
    celebratedOnce = true;
  });

  // ---------- News (the bell): new group classes, products, sales and messages from LEVEL-UP ----------
  // The same items go out as notifications; here everyone sees them, also without notifications on.
  // What you've seen is remembered on this device.
  const NEWS_SEEN_KEY = "levelup.newsSeen";
  const BELL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>';
  const newsSeen = () => Number(read(NEWS_SEEN_KEY, 0)) || 0;
  function newsButtonHtml() {
    const list = pricing.news || [];
    if (!list.length) return "";
    const fresh = list.filter((n) => n.id > newsSeen()).length;
    return `<button type="button" class="hud-news ${fresh ? "has-new" : ""}" data-news-open title="News" aria-label="News${fresh ? ` (${fresh} new)` : ""}">${BELL_ICON}${fresh ? `<i class="chat-badge">${fresh}</i>` : ""}</button>`;
  }
  let newsDialog;
  function openNews() {
    const list = pricing.news || [];
    if (!newsDialog) {
      newsDialog = document.createElement("dialog");
      newsDialog.className = "auth-dialog news-dialog";
      newsDialog.setAttribute("aria-labelledby", "newsTitle");
      document.body.appendChild(newsDialog);
      newsDialog.addEventListener("click", (event) => {
        if (event.target === newsDialog || event.target.closest("[data-close], a")) newsDialog.close();
      });
    }
    const seen = newsSeen();
    newsDialog.innerHTML = `
      <button type="button" class="dialog-close" data-close aria-label="Close">✕</button>
      <p class="section-kicker">What's new</p>
      <h2 class="auth-title" id="newsTitle">News</h2>
      ${list.length ? `<ul class="news-list">${list.map((n) => `
        <li class="${n.id > seen ? "fresh" : ""}">
          <a href="${esc(n.url)}">
            <b>${esc(n.title)}</b>
            ${n.body ? `<span>${esc(n.body)}</span>` : ""}
            <small>${shortDate(n.date)}</small>
          </a>
        </li>`).join("")}</ul>` : `<p class="muted">No news right now.</p>`}
      <p class="auth-note">${player ? `New classes and shop deals also come as a notification, at most 2 a day. Switch them off in <a class="text-link" href="profile.html#app">your profile → Settings</a>.`
        : `<button type="button" class="link-btn" data-auth-open="login" data-close>Log in</button> and turn on notifications to hear it first.`}</p>`;
    if (list.length) write(NEWS_SEEN_KEY, Math.max(...list.map((n) => n.id)));
    renderHud();
    newsDialog.showModal();
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-news-open]")) openNews();
  });

  // ---------- Login dialog ----------
  let dialog;
  const MODES = {
    login: { title: "Welcome back", submit: "Log in ▶" },
    signup: { title: "Create your account", submit: "Create account ▶" },
    reset: { title: "Reset your password", submit: "Send reset link ▶" },
    "new-password": { title: "Choose a new password", submit: "Save password ▶" }
  };

  function buildDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "auth-dialog";
    dialog.setAttribute("aria-labelledby", "authTitle");
    dialog.innerHTML = `
      <button type="button" class="dialog-close" data-close aria-label="Close">✕</button>
      <p class="section-kicker">Your account</p>
      <h2 class="auth-title" id="authTitle">Welcome back</h2>
      <div class="auth-tabs" role="tablist">
        <button type="button" role="tab" data-mode="login">Log in</button>
        <button type="button" role="tab" data-mode="signup">Create account</button>
      </div>
      <form class="auth-form" novalidate>
        <fieldset class="signup-only role-picker" hidden>
          <legend>I am a…</legend>
          <label><input type="radio" name="kind" value="player" checked><span><b>Player</b><small>I want to train and level up</small></span></label>
          <label><input type="radio" name="kind" value="trainer"><span><b>Personal trainer</b><small>I want to coach players</small></span></label>
        </fieldset>
        <label class="signup-only">First name<input name="name" autocomplete="given-name" maxlength="24" placeholder="How your trainer calls you"></label>
        <label class="email-field">Email<input name="email" type="email" autocomplete="email" required></label>
        <label class="password-field">Password<input name="password" type="password" minlength="6" required placeholder="At least 6 characters"></label>
        <div class="signup-trainer">
          <p class="stats-intro">Step 2 of 2 · <strong>Trainer application.</strong> Pieter reviews it and unlocks your trainer account. Meanwhile you can use LEVEL-UP as a player.</p>
          <label>Coaching title<input name="role" maxlength="60" placeholder="e.g. Cycling coach"></label>
          <label>What do you coach?<input name="specialties" maxlength="200" placeholder="e.g. Road cycling, endurance, bike fitness"></label>
          <label>About you (optional)<textarea name="bio" rows="3" maxlength="600" placeholder="Experience, certificates, where you train…"></textarea></label>
        </div>
        <p class="form-error" role="alert"></p>
        <p class="form-success" role="status"></p>
        <button type="button" class="text-link auth-resend" hidden>Resend the confirmation email</button>
        <button type="submit" class="btn btn-primary btn-block auth-submit">Log in ▶</button>
        <button type="button" class="link-btn auth-forgot" data-mode="reset">Forgot your password?</button>
        <button type="button" class="link-btn auth-back">◀ Back to step 1</button>
        <button type="button" class="link-btn auth-coach signup-only">Are you a personal trainer? Apply as a coach</button>
      </form>
      <p class="auth-note">Your account is stored securely on the LEVEL-UP server. <a href="privacy.html" class="text-link">Privacy policy</a></p>`;
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
    // most people come to train: the choice "player or trainer" only shows for who asks for it
    dialog.querySelector(".auth-coach").addEventListener("click", () => {
      dialog.querySelector('[name="kind"][value="trainer"]').checked = true;
      dialog.querySelector(".role-picker").hidden = false;
      dialog.querySelector(".auth-coach").hidden = true;
      setStep(1);
    });
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
        if (mode === "signup" && dialog.dataset.step !== "2" && data.kind === "trainer") {
          // Trainers: step 1 = account details, step 2 = the application. Players sign up in one step;
          // they fill in their body stats later in My account → Body.
          if (!String(data.name || "").trim()) throw new Error("Enter your name.");
          if (!/^\S+@\S+\.\S+$/.test(String(data.email || "").trim())) throw new Error("Enter a valid email address.");
          if (!data.password || data.password.length < 6) throw new Error("Your password needs at least 6 characters.");
          setStep(2);
          form.elements.role.focus();
          return;
        }
        if (mode === "signup") {
          const trainer = data.kind === "trainer";
          const result = trainer
            ? await signUp({ ...data, trainerApplication: cleanApplication(data) })
            : await signUp(data);
          if (trainer) toast({ title: "Application sent", text: "Pieter reviews it soon. You'll get an email.", icon: "✉", tone: "green" });
          if (result.needsConfirmation) {
            form.reset();
            setMode("login");
            form.elements.email.value = data.email;
            dialog.querySelector(".form-success").textContent =
              `Almost there! We sent a confirmation link to ${data.email}. Click it, then log in here. No email? Check your spam folder.`
              + (localStorage.getItem("levelup.slot") ? " Your chosen hour stays ready." : "");
            offerResend(data.email);
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
        if (/^Confirm your email first/.test(err.message)) offerResend(data.email);
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
      ? "Send application ▶"
      : (trainer ? "Next: trainer application ▶" : MODES.signup.submit);
    dialog.querySelector(".auth-title").textContent = step === 2 ? "Trainer application" : MODES.signup.title;
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
    dialog.querySelector(".auth-resend").hidden = true;
    if (mode === "signup") setStep(1);
  }

  // "Resend the confirmation email" under the log-in form
  function offerResend(email) {
    const btn = dialog.querySelector(".auth-resend");
    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = "Resend the confirmation email";
    btn.onclick = async () => {
      btn.disabled = true;
      const typed = dialog.querySelector('[name="email"]').value || email;
      try {
        await resendConfirmation(typed);
        dialog.querySelector(".form-error").textContent = "";
        dialog.querySelector(".form-success").textContent = `Sent again to ${typed}. It can take a few minutes; check your spam folder too.`;
        btn.textContent = "Email sent ✓";
      } catch (err) {
        dialog.querySelector(".form-error").textContent = err.message;
        btn.disabled = false;
      }
    };
  }

  function openAuth(mode = "login") {
    if (!dialog) buildDialog();
    const asTrainer = mode === "signup-trainer";
    if (asTrainer) mode = "signup";
    dialog.querySelector(`[name="kind"][value="${asTrainer ? "trainer" : "player"}"]`).checked = true;
    dialog.querySelector(".role-picker").hidden = !asTrainer;
    dialog.querySelector(".auth-coach").hidden = asTrainer;
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

    initTabBar();
    initApp(nav);
    renderHud();
  }

  // ---------- Installable app (PWA): manifest.webmanifest + sw.js ----------
  // Android / desktop Chrome and Edge fire beforeinstallprompt: we show our own "Get the app" button.
  // iPhone and iPad have no install prompt: the button opens the Add to Home Screen steps instead.
  let installPrompt = null;
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = () => /android/i.test(navigator.userAgent);
  // Links opened from WhatsApp, Instagram, Facebook, Messenger… often open in that app's own browser,
  // which can't install web apps: the page has to be opened in Chrome / Safari first.
  const inAppBrowser = () => {
    const ua = navigator.userAgent;
    if (/FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|WhatsApp|Snapchat|musical_ly|Bytedance|TikTok|LinkedInApp|Pinterest|Line\/|GSA\//i.test(ua)) return true;
    return isAndroid() && /; wv\)/.test(ua); // Android web views
  };
  const browserName = () => {
    const ua = navigator.userAgent;
    if (/CriOS/i.test(ua)) return "chrome-ios";
    if (/FxiOS/i.test(ua)) return "firefox-ios";
    if (/EdgiOS/i.test(ua)) return "edge-ios";
    if (/SamsungBrowser/i.test(ua)) return "samsung";
    if (/Firefox/i.test(ua)) return "firefox";
    if (/EdgA/i.test(ua)) return "edge";
    return isIOS() ? "safari" : "chrome";
  };
  const appInstallState = () => ({ standalone: isStandalone(), canPrompt: Boolean(installPrompt), ios: isIOS(), inApp: inAppBrowser() });
  // Phones always get the button (with the steps for their browser); computers only when the browser offers it
  const canInstall = () => !isStandalone() && (Boolean(installPrompt) || isIOS() || isAndroid());

  function initApp(nav) {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js")
        .then(() => refreshPushStatus())
        .catch(() => { /* the site works without it */ }));
    }
    if (isStandalone()) document.documentElement.classList.add("is-app");

    if (nav) {
      nav.insertAdjacentHTML("beforeend", `<button type="button" class="nav-install" data-install-app hidden>📲 Get the app</button>`);
    }
    const refresh = () => {
      document.querySelectorAll(".nav-install").forEach((b) => { b.hidden = !canInstall(); });
      maybeShowAppBanner();
      emit();
    };
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault(); // we show our own button instead of the browser's mini bar
      installPrompt = event;
      refresh();
    });
    window.addEventListener("appinstalled", () => {
      installPrompt = null;
      document.querySelector(".app-banner")?.remove();
      toast({ title: "App installed", text: "Find LEVEL-UP on your home screen", icon: "📲", tone: "green" });
      refresh();
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-install-app]")) return;
      event.preventDefault();
      installApp();
    });
    // Any [data-push-on] / [data-push-off] button turns notifications on or off for this phone
    document.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-push-on], [data-push-off]");
      if (!btn) return;
      event.preventDefault();
      const on = btn.hasAttribute("data-push-on");
      btn.disabled = true;
      try {
        if (on) {
          await enablePush();
          toast({ title: "Notifications on", text: "A test message is on its way", icon: "🔔", tone: "green" });
        } else {
          await disablePush();
          toast({ title: "Notifications off", text: "This phone won't get LEVEL-UP messages anymore", icon: "🔕" });
        }
      } catch (err) {
        toast({ title: on ? "Couldn't turn on notifications" : "Something went wrong", text: err.message, icon: "!" });
      } finally {
        btn.disabled = false;
      }
    });
    refresh();
  }

  async function installApp() {
    if (installPrompt && !inAppBrowser()) {
      const prompt = installPrompt;
      installPrompt = null;
      prompt.prompt();
      await prompt.userChoice.catch(() => null);
      document.querySelectorAll(".nav-install").forEach((b) => { b.hidden = !canInstall(); });
      emit();
      return;
    }
    showInstallSteps();
  }

  function showInstallSteps() {
    let dialog = document.getElementById("appDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "appDialog";
      dialog.className = "auth-dialog app-dialog";
      dialog.setAttribute("aria-labelledby", "appDialogTitle");
      document.body.appendChild(dialog);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog || event.target.closest("[data-close-app]")) dialog.close();
      });
    }
    const share = `<svg class="ios-share" viewBox="0 0 24 24" aria-label="Share" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 11v10h14V11"/></svg>`;
    const inApp = inAppBrowser();
    const browser = browserName();
    let steps;
    if (inApp) {
      steps = isIOS()
        ? [`Tap <strong>⋯</strong> or Share ${share} in this screen`,
           `Choose <strong>Open in Safari</strong> (or Open in browser)`,
           `In Safari: tap Share ${share}, then <strong>Add to Home Screen</strong>`]
        : [`Tap <strong>⋮</strong> at the top right of this screen`,
           `Choose <strong>Open in Chrome</strong> (or Open in browser)`,
           `In Chrome: tap <strong>⋮</strong>, then <strong>Install app</strong>`];
    } else if (isIOS()) {
      steps = browser === "chrome-ios" || browser === "edge-ios"
        ? [`Tap Share ${share} in the address bar at the top`, `Tap <strong>Add to Home Screen</strong>`, `Tap <strong>Add</strong>`]
        : browser === "firefox-ios"
          ? [`Tap the menu <strong>☰</strong>`, `Tap Share ${share}, then <strong>Add to Home Screen</strong>`, `Tap <strong>Add</strong>`]
          : [`Tap Share ${share} at the bottom of Safari`, `Tap <strong>Add to Home Screen</strong>`, `Tap <strong>Add</strong>`];
    } else if (browser === "samsung") {
      steps = [`Tap the menu <strong>☰</strong> at the bottom right`, `Tap <strong>Add page to</strong>`, `Choose <strong>Home screen</strong>`];
    } else if (browser === "firefox") {
      steps = [`Open the browser menu (<strong>⋮</strong>)`, `Tap <strong>Install</strong> (or Add to Home screen)`, `Tap <strong>Add</strong>`];
    } else {
      steps = [`Open the browser menu (<strong>⋮</strong>)`, `Tap <strong>Install app</strong> (or Add to Home screen)`, `Tap <strong>Install</strong>`];
    }
    const pageLink = location.href.split("#")[0];
    const chromeIntent = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
    const extra = inApp
      ? `<div class="btn-row app-open-row">
          ${isAndroid() ? `<a class="btn btn-primary" href="${esc(chromeIntent)}">Open in Chrome</a>` : ""}
          <button type="button" class="btn btn-ghost" data-copy-link>Copy link</button>
        </div>`
      : "";
    dialog.innerHTML = `
      <button type="button" class="dialog-close" data-close-app aria-label="Close">✕</button>
      <div class="app-dialog-head">
        <img src="img/app/icon-192.png" alt="" width="64" height="64">
        <div>
          <p class="section-kicker">LEVEL-UP app</p>
          <h2 class="auth-title" id="appDialogTitle">Get the app</h2>
        </div>
      </div>
      ${inApp ? `<p class="app-inapp-note">You opened this link inside another app. Installing only works in ${isIOS() ? "Safari" : "Chrome"}:</p>` : ""}
      <ol class="app-steps">${steps.map((t) => `<li>${t}</li>`).join("")}</ol>
      ${!inApp && isAndroid() ? `<p class="muted small-text">No install option in the menu? You probably opened the link from WhatsApp or another app: choose <strong>Open in Chrome</strong> first.</p>` : ""}
      ${extra}
      <p class="muted small-text">Free, no app store needed.</p>
      <button type="button" class="btn ${inApp ? "btn-ghost" : "btn-primary"} btn-block" data-close-app>Got it</button>`;
    dialog.querySelector("[data-copy-link]")?.addEventListener("click", async (event) => {
      try { await navigator.clipboard.writeText(pageLink); event.target.textContent = "Link copied ✓"; }
      catch { window.prompt("Copy this link and open it in your browser:", pageLink); }
    });
    if (!dialog.open) dialog.showModal();
  }

  // Phones: a small banner, not on the admin page, at most once every 3 weeks after "Not now"
  let bannerPlanned = false;
  function maybeShowAppBanner() {
    if (bannerPlanned || !canInstall() || window.innerWidth > 760) return;
    if (/admin\.html$/.test(location.pathname)) return;
    const key = "levelup.appBanner";
    const dismissed = Number(read(key, 0));
    if (dismissed && Date.now() - dismissed < 21 * 864e5) return;
    const banner = document.createElement("div");
    banner.className = "app-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Get the app");
    banner.innerHTML = `
      <img src="img/app/icon-192.png" alt="" width="44" height="44">
      <p><strong>LEVEL-UP app</strong><span>Book your trainer straight from your home screen</span></p>
      <button type="button" class="btn btn-small btn-primary" data-install-app>Install</button>
      <button type="button" class="app-banner-close" aria-label="Not now">✕</button>`;
    banner.querySelector(".app-banner-close").addEventListener("click", () => { write(key, Date.now()); banner.remove(); });
    banner.querySelector("[data-install-app]").addEventListener("click", () => { write(key, Date.now()); banner.remove(); });
    bannerPlanned = true;
    setTimeout(() => { if (canInstall()) document.body.appendChild(banner); }, 2500);
  }

  // ---------- Phones: five pages next to each other, with a bar at the bottom ----------
  // For you · Home · Chat · Book · Scores. Tap one in the bar or swipe sideways: the page slides to its neighbour.
  // All five are parts of index.html (a "view": only that part shows); they follow your finger from one to the next.
  // The home page still holds everything, so scrolling it also passes the high scores and the schedule.
  // The chat is chat.js in the section #chat; chat.html is the chat on a computer (a phone is sent on to #chat).
  // The menu (☰) sits at the top right, in the header. A computer has no views: there it is one long page.
  const TAB_ICONS = {
    foryou: '<path d="M12 3l2.4 5.6L20 9.3l-4.2 3.9L17 19l-5-3-5 3 1.2-5.8L4 9.3l5.6-.7z"/>',
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    book: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4M8 14h3v3H8z"/>',
    scores: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M9 17h6"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6 8-6s7 1.5 8 6"/>'
  };
  const tabIcon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square">${TAB_ICONS[name]}</svg>`;

  const VIEWS = ["foryou", "home", "chat", "book", "scores"];           // left to right
  const VIEW_HASH = { foryou: "foryou", home: "home", chat: "chat", book: "schedule", scores: "scores" };
  const PHONE = window.matchMedia("(max-width: 760px)");
  const STILL = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pageName = location.pathname.split("/").pop() || "index.html";
  const onIndex = pageName === "index.html";
  const docRoot = document.documentElement;
  let view = onIndex ? (VIEWS.includes(docRoot.dataset.view) ? docRoot.dataset.view : "home") : null;
  const viewScroll = {};  // where you were on each page
  let tabBar = null;
  let slide = null;       // a page that is sliding in right now (see openSlide)

  const viewOf = (el) => el?.closest?.("[data-v]")?.dataset.v || "home";
  const markTab = (now = view) => tabBar?.querySelectorAll("[data-tab]").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === now);
    if (el.dataset.tab === now) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
  });
  const hudHeight = () => document.getElementById("hud")?.offsetHeight || 0;
  // the address follows the page (the chat keeps its own: #chat/t/<conversation>)
  const stampView = (next, target) => {
    const hash = target && target.id ? target.id : VIEW_HASH[next];
    const now = location.hash.slice(1);
    if (now === hash || (next === "chat" && now.startsWith("chat/"))) return;
    history.replaceState(null, "", `${location.pathname}${location.search}#${hash}`);
  };
  // #chat/t/<conversation> (a phone) is chat.html?t=<conversation> on a computer
  const chatQuery = () => { const m = /^#chat\/(t|coach)\/(.+)$/.exec(location.hash); return m ? `?${m[1]}=${m[2]}` : ""; };
  const landed = (next) => document.dispatchEvent(new CustomEvent("levelup:view", { detail: next }));

  // Two pages next to each other, for as long as one slides to the other: under a finger (the swipe) or by itself
  // (a tap in the bar). Every page but the home page is one section; that one "floats" (fixed to the screen) next
  // to the other page, which stays the real page. So a home page that slides in is already scrolled to where you
  // were. to(p): how far, 0 = still the old page, 1 = the new one. Returns null when these two can't be put next
  // to each other: the home page and Book or Scores share a section (they are never neighbours).
  function openSlide(next, target = null) {
    const main = document.querySelector("main");
    const from = view;
    const section = (v) => (v === "home" ? null : document.getElementById(VIEW_HASH[v]));
    const incoming = section(next), outgoing = section(from);
    if (!main || from === next || (!incoming && !outgoing)) return null;
    if ([from, next].includes("home") && [from, next].some((v) => v === "book" || v === "scores")) return null;
    const dir = VIEWS.indexOf(next) > VIEWS.indexOf(from) ? 1 : -1; // 1: the new page comes from the right
    const width = window.innerWidth;
    const y0 = window.scrollY;
    const mainTop = main.getBoundingClientRect().top + y0;
    const float = incoming || outgoing;
    // the parts of the other page (the home page: everything but For you and the chat)
    const other = incoming ? outgoing : null;
    const rest = other ? [other] : [...main.children].filter((el) => el.tagName !== "DIALOG" && el.id !== "foryou" && el.id !== "chat" && !el.dataset.photo);
    // a page's own photo (For you, Book, Scores) slides along with it
    const photo = (v) => main.querySelector(`.view-photo[data-photo="${v}"]`);
    const oldPhoto = photo(from), newPhoto = photo(next);
    [oldPhoto, newPhoto].forEach((el) => el?.classList.add("pg-on"));
    let top;
    const wanted = (inPage) => {
      if (target && target.id !== VIEW_HASH[next]) return Math.max(0, inPage(target) - hudHeight() - 12);
      return target ? 0 : viewScroll[next] || 0;
    };
    if (incoming) {
      // the new page floats in, next to the page that is there
      float.classList.add("pg-solo", "pg-float");
      top = wanted((el) => el.getBoundingClientRect().top - float.getBoundingClientRect().top);
      const room = mainTop + float.offsetHeight + (parseFloat(getComputedStyle(document.body).paddingBottom) || 0) - window.innerHeight;
      top = Math.min(top, Math.max(0, room));
      float.style.top = `${mainTop - top}px`;
    } else {
      // to the home page: the page that is there floats where it is, the home page comes in as the real page
      float.style.top = `${float.getBoundingClientRect().top}px`;
      float.classList.add("pg-solo", "pg-float");
      docRoot.dataset.view = next;
      top = wanted((el) => el.getBoundingClientRect().top + window.scrollY);
      window.scrollTo({ top, behavior: "instant" });
    }
    const oldEls = [...(incoming ? rest : [float]), oldPhoto].filter(Boolean);
    const newEls = [...(incoming ? [float] : rest), newPhoto].filter(Boolean);
    const all = [...oldEls, ...newEls];
    let timer = 0, over = false;
    const s = {
      from, next, width, p: 0,
      to(p) {
        s.p = p;
        const a = `translate3d(${-dir * p * width}px,0,0)`, b = `translate3d(${dir * (1 - p) * width}px,0,0)`;
        oldEls.forEach((el) => { el.style.transform = a; });
        newEls.forEach((el) => { el.style.transform = b; });
      },
      // let go: slide on to the new page (commit) or back to the old one, then tidy up
      settle(commit, ms = 260) {
        if (over) return;
        if (commit) markTab(next);
        all.forEach((el) => { el.style.transition = `transform ${ms}ms cubic-bezier(0.22, 0.75, 0.25, 1)`; });
        void float.offsetWidth;
        s.to(commit ? 1 : 0);
        timer = setTimeout(() => s.end(commit), ms + 40);
      },
      end(commit = true) {
        if (over) return;
        over = true;
        clearTimeout(timer);
        all.forEach((el) => { el.style.transform = ""; el.style.transition = ""; });
        float.style.top = "";
        float.classList.remove("pg-solo", "pg-float");
        [oldPhoto, newPhoto].forEach((el) => el?.classList.remove("pg-on"));
        slide = null;
        if (commit) {
          viewScroll[from] = y0;
          view = next;
          docRoot.dataset.view = next;
          markTab();
          stampView(next, target);
          window.scrollTo({ top, behavior: "instant" });
          landed(next);
        } else {
          docRoot.dataset.view = from;
          markTab();
          window.scrollTo({ top: y0, behavior: "instant" });
        }
      }
    };
    s.to(0);
    slide = s;
    return s;
  }

  // Show another page of index.html. target: an element on it to scroll to (else: where you were, or the top).
  function setView(next, { target = null, animate = true } = {}) {
    if (!onIndex || !VIEWS.includes(next)) return;
    if (!PHONE.matches) { // a computer: one page, just go to the section (the chat is a page of its own there)
      if (next === "chat") { location.href = "chat.html"; return; }
      stampView(next, target);
      view = next; docRoot.dataset.view = next;
      (target || document.getElementById(VIEW_HASH[next]))?.scrollIntoView({ block: "start" });
      return;
    }
    slide?.end(slide.p > 0.5); // one that was still under way lands first
    const from = view;
    const apply = () => {
      viewScroll[from] = window.scrollY;
      view = next;
      docRoot.dataset.view = next;
      markTab();
      let top = from === next ? window.scrollY : viewScroll[next] || 0;
      if (target && target.id !== VIEW_HASH[next]) top = target.getBoundingClientRect().top + window.scrollY - hudHeight() - 12;
      else if (target) top = 0;
      window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
      landed(next);
    };
    if (from === next || !animate || STILL.matches) { stampView(next, target); apply(); return; }
    const s = openSlide(next, target);
    if (s) { void document.body.offsetWidth; s.settle(true, 300); return; }
    // the home page and Book or Scores (one section of the home page): the browser slides a picture of the page
    stampView(next, target);
    const dir = VIEWS.indexOf(next) > VIEWS.indexOf(from) ? "next" : "prev";
    if (document.startViewTransition) {
      docRoot.dataset.slide = dir; // the old page slides out, the new one in (style.css "Phones: five pages")
      const done = () => { delete docRoot.dataset.slide; };
      try {
        const tr = document.startViewTransition(apply);
        tr.ready.catch(() => {}); // skipped (e.g. the tab went to the background): the page still changed
        tr.updateCallbackDone?.catch(() => {});
        tr.finished.then(done, done);
      } catch { apply(); done(); }
    } else {
      apply();
      const main = document.querySelector("main");
      main?.classList.remove("view-in-next", "view-in-prev");
      void main?.offsetWidth;
      main?.classList.add(`view-in-${dir}`);
      setTimeout(() => main?.classList.remove(`view-in-${dir}`), 400);
    }
  }
  // Go to a page by name. From another file than index.html that is a page load.
  function goView(next) {
    if (next === view || !VIEWS.includes(next)) return;
    if (onIndex) { setView(next); return; }
    location.href = !PHONE.matches && next === "chat" ? "chat.html" : `index.html#${VIEW_HASH[next]}`;
  }
  // To the chat, a conversation (t) or the one with a coach: a page of index.html on a phone, chat.html on a computer
  function gotoChat({ t = "", coach = "" } = {}) {
    const part = t ? ["t", t] : coach ? ["coach", coach] : null;
    if (onIndex && PHONE.matches) {
      const hash = `#chat${part ? `/${part[0]}/${encodeURIComponent(part[1])}` : ""}`;
      if (location.hash === hash) setView("chat"); else location.hash = hash;
      return;
    }
    location.href = `chat.html${part ? `?${part[0]}=${encodeURIComponent(part[1])}` : ""}`;
  }

  function initViews() {
    if (!onIndex) return;
    // every part of the page carries data-pg (see "Phones: five pages" in style.css)
    document.querySelectorAll("main > :not(dialog):not([data-pg])").forEach((el) => el.setAttribute("data-pg", ""));
    // the page the address points to: a section, something inside one (#highScores, #team-maxim …) or a conversation
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id.startsWith("chat/")) return { view: "chat", el: document.getElementById("chat"), deep: true };
      const el = id ? document.getElementById(id) : null;
      return el ? { view: viewOf(el), el } : null;
    };
    const first = fromHash();
    if (first && first.view === "chat" && !PHONE.matches) { location.replace(`chat.html${chatQuery()}`); return; }
    if (first) {
      view = first.view; docRoot.dataset.view = view;
      if (PHONE.matches && first.el.id !== VIEW_HASH[view]) requestAnimationFrame(() => setView(view, { target: first.el, animate: false }));
    } else docRoot.dataset.view = view;
    window.addEventListener("hashchange", () => {
      const to = fromHash();
      if (!to) return;
      if (!PHONE.matches) { if (to.view === "chat") location.href = `chat.html${chatQuery()}`; return; }
      if (to.view !== view) setView(to.view, { target: to.el, animate: !to.deep });
    });
    // a link to a section: on a phone that can be another page. A link to the chat stays in this file on a phone.
    document.addEventListener("click", (event) => {
      const a = event.target.closest?.("a[href]");
      if (!a || event.defaultPrevented || !PHONE.matches || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (url.pathname.endsWith("/chat.html") && url.origin === location.origin) {
        event.preventDefault();
        gotoChat({ t: url.searchParams.get("t") || "", coach: url.searchParams.get("coach") || "" });
        return;
      }
      if (url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
      const el = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!el) return;
      const to = viewOf(el);
      if (to === view && !(a.dataset.tab && el.id === VIEW_HASH[to])) return; // same page: the browser scrolls to it
      event.preventDefault();
      setView(to, { target: el });
    });

    // Swipe sideways: the page follows your finger and its neighbour comes along; let go past a third of the screen
    // (or flick) and it slides on, else it springs back. Not on something that scrolls sideways itself (a row of
    // cards, the days of the schedule, the photos of a post), not in a window, a form field or an open conversation,
    // and not from the very edge of the screen (there the phone's own back gesture lives).
    const sideways = (el) => {
      for (let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
        if (n.matches("input, textarea, select, [contenteditable], [data-no-swipe], iframe")) return true;
        if (n.scrollWidth > n.clientWidth + 8 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
      }
      return false;
    };
    let touch = null, frame = 0;
    // while a page slides, a tap on it does nothing (the bar keeps working)
    document.addEventListener("click", (event) => {
      if (slide && event.target.closest?.("main")) { event.preventDefault(); event.stopPropagation(); }
    }, true);
    const drop = () => { // the finger is gone without a decision: back to the old page
      if (touch?.drag) { cancelAnimationFrame(frame); touch.drag.settle(false, 180); }
      touch = null;
    };
    document.addEventListener("touchstart", (event) => {
      if (touch?.drag) { drop(); return; }
      touch = null;
      if (!PHONE.matches || event.touches.length !== 1 || slide || docRoot.dataset.slide) return;
      if (document.querySelector("dialog[open], .nav.open, .lu-cel") || (view === "chat" && document.querySelector(".chat-app.show-thread"))) return;
      const t = event.touches[0];
      if (t.clientX < 24 || t.clientX > window.innerWidth - 24 || sideways(event.target)) return;
      touch = { x: t.clientX, y: t.clientY, at: Date.now(), drag: null, step: 0, x0: 0, moved: 0, trail: [] };
    }, { passive: true });
    document.addEventListener("touchmove", (event) => {
      if (!touch) return;
      if (event.touches.length !== 1) { drop(); return; } // a pinch
      const t = event.touches[0];
      const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (!touch.drag) {
        if (STILL.matches) { if (ay > 24 && ay > ax) touch = null; return; } // no movement wanted: decided on letting go
        if (!event.cancelable || (ay > 10 && ay >= ax)) { touch = null; return; } // scrolling up or down
        if (ax < 10 || ax < ay * 1.3) return; // not clear yet
        const step = dx < 0 ? 1 : -1;         // to the left = the page on the right
        const next = VIEWS[VIEWS.indexOf(view) + step];
        const s = next ? openSlide(next) : null;
        if (!s) { touch = null; return; }
        touch.drag = s; touch.step = step; touch.x0 = t.clientX;
      }
      if (event.cancelable) event.preventDefault();
      touch.moved = Math.max(0, Math.min(touch.drag.width, (touch.x0 - t.clientX) * touch.step));
      touch.trail.push([event.timeStamp, touch.moved]);
      if (touch.trail.length > 12) touch.trail.shift();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => touch?.drag?.to(touch.moved / touch.drag.width));
    }, { passive: false });
    document.addEventListener("touchend", (event) => {
      if (!touch) return;
      const now = touch;
      touch = null;
      if (!now.drag) { // no movement wanted: a clear swipe changes the page at once
        if (!STILL.matches) return;
        const t = event.changedTouches[0];
        const dx = t.clientX - now.x, dy = t.clientY - now.y;
        if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - now.at > 800) return;
        const next = VIEWS[VIEWS.indexOf(view) + (dx < 0 ? 1 : -1)];
        if (next) setView(next);
        return;
      }
      cancelAnimationFrame(frame);
      const s = now.drag, p = now.moved / s.width;
      s.to(p);
      // how fast the finger went at the end (px per ms, towards the new page); a finger that stood still first: 0
      const b = now.trail.at(-1);
      const a = b ? now.trail.find((x) => b[0] - x[0] < 150) : null;
      const speed = a && b[0] > a[0] && event.timeStamp - b[0] < 100 ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
      const commit = speed > 0.3 ? now.moved > 12 : speed < -0.3 ? false : p > 0.33;
      const left = (commit ? 1 - p : p) * s.width;
      s.settle(commit, Math.round(Math.max(140, Math.min(320, left / Math.max(Math.abs(speed), 1.1)))));
    }, { passive: true });
    document.addEventListener("touchcancel", drop, { passive: true });

    // The pages that wait off screen are measured for the first time while nothing else is going on, one part at a
    // time: then the first swipe to one doesn't have to wait for that either.
    let warmed = false;
    const warm = () => {
      if (warmed || !PHONE.matches || !window.CSS?.supports?.("content-visibility", "hidden")) return;
      warmed = true;
      const waiting = (el) => getComputedStyle(el).contentVisibility === "hidden";
      const parts = [...document.querySelectorAll("main > [data-pg]")].filter(waiting);
      const idle = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 1500 }) : (fn) => setTimeout(fn, 150);
      const next = () => {
        const el = parts.shift();
        if (!el) return;
        if (!slide && !touch && waiting(el)) {
          el.style.contentVisibility = "visible";
          void el.offsetHeight;
          el.style.contentVisibility = "";
        }
        idle(next);
      };
      idle(next);
    };
    document.addEventListener("levelup:change", () => { if (isReady) setTimeout(warm, 1200); });
  }

  function initTabBar() {
    const link = (v) => (onIndex ? `#${VIEW_HASH[v]}` : `index.html#${VIEW_HASH[v]}`); // a computer has no bar
    const bar = document.createElement("nav");
    bar.className = "tabbar";
    bar.setAttribute("aria-label", "Quick menu");
    bar.innerHTML = `
      <a href="${link("foryou")}" data-tab="foryou">${tabIcon("foryou")}<span>For you</span></a>
      <a href="${link("home")}" data-tab="home">${tabIcon("home")}<span>Home</span></a>
      <a href="${link("chat")}" data-tab="chat">${CHAT_ICON}<span>Chat</span><i class="chat-badge" data-chat-badge hidden></i></a>
      <a href="${link("book")}" data-tab="book" class="tab-book">${tabIcon("book")}<span>Book</span></a>
      <a href="${link("scores")}" data-tab="scores">${tabIcon("scores")}<span>Scores</span></a>`;
    document.body.appendChild(bar);
    document.body.classList.add("has-tabbar");
    tabBar = bar;

    // Profile in the menu (phones), first in the list
    const nav = document.getElementById("nav");
    const menuProfile = document.createElement("a");
    menuProfile.href = "profile.html";
    menuProfile.className = "nav-profile";
    menuProfile.innerHTML = `${tabIcon("profile")}<span data-menu-profile>Profile</span>`;
    nav?.prepend(menuProfile);
    menuProfile.addEventListener("click", (event) => {
      if (player) return;
      event.preventDefault();
      openAuth("login");
    });
    const menuNotify = document.createElement("a");
    menuNotify.href = "profile.html#settings"; // the same switches are there too
    menuNotify.className = "nav-profile nav-notify";
    menuNotify.dataset.notifyOpen = "";
    menuNotify.innerHTML = `${BELL_ICON}<span>Notifications</span><i data-notify-state></i>`;
    menuProfile.after(menuNotify);
    const menuSettings = document.createElement("a");
    menuSettings.href = "profile.html#settings";
    menuSettings.className = "nav-profile nav-notify nav-settings";
    menuSettings.innerHTML = `${GEAR_ICON}<span>Settings</span>`;
    menuNotify.after(menuSettings);
    const paintMenuNotify = () => {
      menuNotify.hidden = !player;
      menuSettings.hidden = !player;
      const state = menuNotify.querySelector("[data-notify-state]");
      state.textContent = pushStatus === "on" ? "On" : pushStatus === "unknown" ? "" : "Off";
      state.className = pushStatus === "on" ? "on" : "";
    };
    paintMenuNotify();
    document.addEventListener("levelup:change", paintMenuNotify);

    markTab();
    bar.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-tab]");
      if (!tab) return;
      // on index.html the page slides there; the other pages just open it
      if (!onIndex || !PHONE.matches) return;
      event.preventDefault();
      if (tab.dataset.tab !== view) { goView(tab.dataset.tab); return; }
      // the page you are on: back to its top (the chat: back to the list of conversations)
      if (view === "chat") window.LevelUpChat?.home(); else setView(view, { target: document.getElementById(VIEW_HASH[view]) });
    });
    document.addEventListener("levelup:change", () => {
      menuProfile.querySelector("[data-menu-profile]").textContent = player ? "My profile" : "Log in";
      menuProfile.classList.toggle("active", pageName === "profile.html");
    });
    initViews();
    initAssistantButton();
  }

  // Levelupy within reach on every page: a small round button with his face (for who has him). Not on the chat
  // itself, the start screen (there he hangs on his rings) or the admin dashboard.
  function initAssistantButton() {
    if (["chat.html", "admin.html", "privacy.html"].includes(pageName)) return;
    let button = null, shownFor = null;
    const sync = async () => {
      const who = player?.id || null;
      if (who === shownFor) return;
      shownFor = who;
      button?.remove(); button = null;
      if (!who) return;
      const a = await hasAssistant();
      if (!a.on || who !== player?.id) return;
      const face = await mascotFace(96);
      if (who !== player?.id || button) return;
      button = document.createElement("button");
      button.type = "button";
      button.className = "lvy-fab";
      button.setAttribute("aria-label", tr("Ask Levelupy"));
      button.title = tr("Ask Levelupy");
      button.innerHTML = `${face ? `<img src="${face}" alt="">` : "<span aria-hidden=\"true\">🤸</span>"}<i aria-hidden="true">?</i>`;
      button.addEventListener("click", () => gotoChat({ t: ASSISTANT_ID }));
      document.body.appendChild(button);
    };
    document.addEventListener("levelup:change", () => { (window.requestIdleCallback || ((fn) => setTimeout(fn, 800)))(sync); });
  }

  initChrome();

  return {
    ITEMS, TRAINERS, ACHIEVEMENTS, RANKS, XP_PER_EURO, SESSION_XP, BOOKING_WEEKS_AHEAD, BOOKING_NOTICE_HOURS,
    TRAINER_SESSION_XP, TRAINER_CLIENT_XP, CHECKIN_XP, ACTIVITY_LEVELS, GOALS, computeStats, bmiCategory, nextCheckin,
    ready, isReady: () => isReady, serverError: () => serverError, calendarStatus: () => calendar.status,
    esc, dateKey, startOfWeek, parseDate, slotStart, formatSlot, avatarHtml, progress, levelFromXp, xpForLevel, rankFor, orderXp,
    getPlayer, isAdmin, adminData, likeHtml, giveLike, celebrateNow, celebrateLocal, loadCelebrate, themeAccent, mascotLook, dressMascot, setBirthday, holdCelebrations, openProfile,
    adminRoom, adminRentalAdd, adminRentalCancel, adminRentalPaid, adminRoomSettings, publicProfile, memberLink, likeMember, photoLike, photoComment, photoCommentDelete, photoCommentLike, addPhoto, addPost, deletePhoto, setProfile, getLeaderboard: (period = "all") => period === "month" ? leaderboardMonth : leaderboard, getPlayerOfMonth: () => playerOfMonth, getReviews: () => reviews, submitReview, deleteMyReview, adminReviews, adminSetReview, adminAddReview, adminReviewPhoto, adminGrantXp, shareCard, drawPlayerCard, showPromotion, loadLeaderboard, setLeaderboardVisibility, signUp, logIn, logOut, deleteProfile, requestPasswordReset, updatePassword,
    saveBodyStats, updateBodyStats, recordPurchase, checkIn, loadForYou, getForYou: () => forYou,
    trainerById, trainerHours, weeklyHoursText, saveOpeningHours, deleteOpeningHours, getOpeningHours: () => openingHours, groupSessions, findBooking, slotBlocker, googleCalendarLink,
    bookSession, cancelBooking, playerBookings, trainerStats, stopSeries, moveBooking, seriesText, seriesUntil, oneRowPerSeries, WEEKDAYS,
    isTrainer, respondBooking, rewardSession, getCoachBookings: () => coachBookings, showCoachInbox,
    SESSION_PRICE, TRAINER_FEE, getPricing: () => pricing, priceFor, quote, priceLabel, packCredits, openPackRequest,
    requestPack, cancelPackRequest, markPackPaid, setTrainerPricing,
    pageTabsHtml, showPageTab, tabFromHash, scrollToTabs, inTab, appInstallState, installApp,
    uploadAvatar, removeAvatar, adminClearAvatar,
    getPushStatus: () => pushStatus, refreshPushStatus, enablePush, disablePush, pushCalloutHtml, notifyHtml, openNotify, setPushChat,
    pushServerReady: () => call("push_public_key").then(Boolean, () => false),
    LOYALTY_SESSIONS, REWARD_SOURCES, availableVouchers, voucherOpen, shortDate, markHoodieGiven,
    HEALTH_QUESTIONS, healthValid, healthYes, healthFormHtml, saveHealthForm, healthFlagHtml,
    startPayment, canPayOnline, payLabel, markPaidInPerson, payInPersonInstead, markRefunded, HQ_ADDRESS, FREE_CANCEL_HOURS, REWARD_WINDOW_DAYS, isLateCancel, markNoShow, canSettle, hasStarted, euro, getCoachEarnings: () => coachEarnings, markPayout, coachStatement,
    applyAsTrainer, reviewApplication, loadTrainerList,
    chatList, chatThread, chatSend, chatMute, chatLike, chatGroupDelete, adminShopSale, adminAnnounce, adminDeleteNews, setPushNews, getNews: () => pricing.news, openNews, chatOpen, chatSearch, chatOpenUser, refreshChatUnread, openChatWith, CHAT_ICON, getChatUnread: () => chatUnread,
    setChatActive: (id) => { chatActiveThread = id; },
    openAuth, toast, loadAssistant, hasAssistant, askAssistant, clearAssistant, assistantGo, mascotFace, adminAssistant, adminAssistantSave, adminAssistantGapDone, adminMascot, adminMascotSet, adminMascotPost, adminMascotClear, ASSISTANT_ID, getAssistant: () => assistant,
    setView, goView, gotoChat, getView: () => view, viewSliding: () => Boolean(slide),
    getClasses: () => classes, classesOn, roomBlocksOn, classById, classStarted, classFull, classIn, canPayClassOnline, isClassLateCancel, classPayLabel,
    signupClass, cancelClassSignup, classRoster, classMark, classMarkPaid, classFinish, classManageList, classMarkRefunded, classCreate, classUpdate, classCancel, loadClasses,
    getClassKinds: () => classKinds, loadClassKinds, classPhoto, GROUP_LOOKS, GROUP_DEFAULT, adminClassKind, uploadKindPhoto,
    refreshCoach: async () => { if (isTrainer()) await loadCoachBookings(); emit(); },
    shopItems, loadShopCatalog, loadPricing, shopCheck, tabOrder, tabCancel, openTab, adminShop, adminShopUpdate, tabPaid, packGift, markPackGiftGiven
  };
})();
