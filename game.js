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
    }
  ];

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
    packs: [{ size: 5, price: 280 }, { size: 10, price: 540 }], trainers: {}, onlinePayments: false
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
    "pay_in_person_instead", "mark_paid_in_person", "mark_pack_paid", "push_test"]);

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
      rewards: normaliseRewards(data.rewards),
      introEligible: Boolean(data.introEligible)
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
  async function loadPricing() {
    try {
      const p = await call("pricing_info");
      if (!p) return;
      pricing = {
        price: Number(p.price), fee: Number(p.fee), introPrice: Number(p.introPrice), duoPrice: Number(p.duoPrice),
        packs: (p.packs || []).map((o) => ({ size: Number(o.size), price: Number(o.price) })),
        onlinePayments: Boolean(p.onlinePayments),
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
        if (TRAINERS.some((t) => t.id === r.id)) return;
        TRAINERS.push({
          id: r.id,
          name: r.name,
          short: String(r.name).trim().split(/\s+/)[0],
          role: r.role || "Personal trainer",
          bio: r.bio || "",
          specialties: r.specialties || "",
          img: "img/pfdefault.png",
          color: r.color || "#b0b0b0",
          chartColor: r.chart_color || "#8c8c8c",
          availability: {},
          stats: { sessions: 0, clients: 0 },
          dynamic: true
        });
      });
    } catch (err) {
      console.error("Loading trainers failed:", err);
    }
  }

  const scoreRows = (rows) => (rows || []).map((r) => ({
    place: Number(r.place), name: r.name, xp: Number(r.xp), totalXp: Number(r.total_xp ?? r.xp), isMe: Boolean(r.is_me), avatarUrl: r.avatar_url || null
  }));
  async function loadLeaderboard(period = "all") {
    try {
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

  // pay: "online" (Mollie, the request reaches the trainer once paid) or "in_person" (at the headquarters)
  async function bookSession({ trainerId, date, hour, note = "", kind = "solo", partner = "", pay = "in_person" }) {
    if (!player) throw new Error("Log in to book a session.");
    if (!trainerHours(trainerId, date).includes(hour)) throw new Error("This trainer isn't available at that time.");
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
    const before = bar?.previousElementSibling;
    if (!before) return;
    const hud = (document.getElementById("hud")?.offsetHeight || 0) + 4;
    const y = before.getBoundingClientRect().bottom + window.scrollY - hud;
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
    const isPaid = () => type === "pack"
      ? player.packs.find((pk) => pk.id === id)?.status === "paid"
      : ["paid"].includes(player.bookings.find((b) => b.id === id)?.payStatus);
    toast({ title: "Checking your payment…", text: "One moment", icon: "€" });
    const gaveUp = () => type === "booking" && player.bookings.find((b) => b.id === id)?.status === "expired";
    for (let i = 0; i < 10 && !isPaid() && !gaveUp(); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await refreshPlayer();
    }
    emit();
    if (isPaid()) {
      if (type === "pack") {
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
      player = null;
      welcomed = false;
      await Promise.all([loadSlots(), loadLeaderboard()]);
      emit();
      return;
    }
    if ((event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") && player) return;
    await Promise.all([refreshPlayer(), loadSlots(), loadLeaderboard(), loadTrainerStats(), loadOpeningHours()]);
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
    "A weekly check-in of your stats earns XP",
    "Session packs make every session cheaper"
  ];
  const bootEl = document.getElementById("boot");
  let bootTotal = 0;
  let bootDoneCount = 0;
  if (bootEl) {
    const tip = document.getElementById("bootTip");
    if (tip) tip.textContent = `Tip: ${BOOT_TIPS[Math.floor(Math.random() * BOOT_TIPS.length)]}`;
  }
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
          bootTask(loadTrainerStats(), "Loading trainer levels…"),
          bootTask(loadLeaderboard(), "Loading high scores…")
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

  // ---------- Events ----------
  // The site's main colour follows the player's rank (Rookie green … Legend gold); see style.css "Rank colours".
  // Remembered so the next page load starts in the right colour (inline script in each page's <head>).
  const RANK_BG = ["#070707", "#05070b", "#07060b", "#080606", "#080606", "#080706"];
  // "Always Carbon green" (Account): this device keeps the green look whatever the rank.
  const carbonOnly = () => { try { return localStorage.getItem("levelup.carbon") === "1"; } catch { return false; } };
  function setCarbonOnly(on) {
    try { on ? localStorage.setItem("levelup.carbon", "1") : localStorage.removeItem("levelup.carbon"); } catch {}
    applyRankTheme();
  }
  function applyRankTheme() {
    if (!player && (!isReady || session)) return; // still loading: keep the colour the <head> script set
    const tier = player && !carbonOnly() ? RANKS.indexOf(rankFor(levelFromXp(player.xp || 0))) : -1;
    const root = document.documentElement;
    if (tier > 0) root.dataset.rank = String(tier);
    else delete root.dataset.rank;
    const bar = document.querySelector('meta[name="theme-color"]'); // phone status bar
    if (bar) bar.content = RANK_BG[Math.max(tier, 0)];
    try {
      if (tier > 0) localStorage.setItem("levelup.rank", String(tier));
      else localStorage.removeItem("levelup.rank");
    } catch {}
  }

  function emit() {
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
      toast({ title: "Level up!", text: rankUp ? `LVL ${endLevel} · New rank: ${rank.title}` : `You reached LVL ${endLevel}`, icon: "⬆" });
    }
  }

  // ---------- HUD (header player chip) ----------
  // A player's avatar: their photo when they uploaded one, otherwise their first letter (colour = rank)
  function avatarHtml(p, size = "") {
    const letter = esc((p.name || "?").trim().charAt(0).toUpperCase() || "?");
    const tier = RANKS.indexOf(rankFor(levelFromXp(p.xp || 0)));
    const url = p.avatarUrl || p.avatar;
    if (url) return `<span class="avatar has-photo ${size}" data-tier="${tier}" aria-hidden="true"><img src="${esc(url)}" alt="" loading="lazy" decoding="async"></span>`;
    return `<span class="avatar ${size}" data-tier="${tier}" aria-hidden="true">${letter}</span>`;
  }

  // ---------- Profile photo: square-cropped and shrunk in the browser, then stored in Storage "avatars" ----------
  const AVATAR_SIZE = 320;
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
    login: { title: "Welcome back", submit: "Log in ▶" },
    signup: { title: "Create your profile", submit: "Start at LVL 1 ▶" },
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
          <p class="stats-intro">Step 2 of 2 · <strong>Body stats.</strong> We use these for your BMI, daily calories and progress. Only you and your coach can see them.</p>
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
      : (trainer ? "Next: trainer application ▶" : "Next: body stats ▶");
    dialog.querySelector(".auth-title").textContent = step === 2 ? (trainer ? "Trainer application" : "Your body stats") : MODES.signup.title;
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

    initTabBar(menuToggle);
    initApp(nav);
    renderHud();
  }

  // ---------- Installable app (PWA): manifest.webmanifest + sw.js ----------
  // Android / desktop Chrome and Edge fire beforeinstallprompt: we show our own "Get the app" button.
  // iPhone and iPad have no install prompt: the button opens the Add to Home Screen steps instead.
  let installPrompt = null;
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const appInstallState = () => ({ standalone: isStandalone(), canPrompt: Boolean(installPrompt), ios: isIOS() });
  const canInstall = () => !isStandalone() && (Boolean(installPrompt) || isIOS());

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
    if (installPrompt) {
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
    const steps = isIOS()
      ? [`Tap the Share button ${share} in Safari (at the bottom, or at the top on iPad).`,
         `Scroll down and tap <strong>Add to Home Screen</strong>.`,
         `Tap <strong>Add</strong>. LEVEL-UP is now on your home screen.`]
      : [`Open your browser menu (<strong>⋮</strong> or <strong>…</strong>).`,
         `Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>. On a computer, click the install icon in the address bar.`,
         `Confirm. LEVEL-UP opens like an app from now on.`];
    dialog.innerHTML = `
      <button type="button" class="dialog-close" data-close-app aria-label="Close">✕</button>
      <div class="app-dialog-head">
        <img src="img/app/icon-192.png" alt="" width="64" height="64">
        <div>
          <p class="section-kicker">Get the app</p>
          <h2 class="auth-title" id="appDialogTitle">LEVEL-UP on your home screen</h2>
        </div>
      </div>
      <ol class="app-steps">${steps.map((t) => `<li>${t}</li>`).join("")}</ol>
      <p class="muted small-text">Free, no app store needed. It opens full screen, and you always get the newest version.</p>
      <button type="button" class="btn btn-primary btn-block" data-close-app>Got it</button>`;
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

  // ---------- Phones: app-style bar at the bottom (Home · Book · Scores · Profile · Menu) ----------
  const TAB_ICONS = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    book: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4M8 14h3v3H8z"/>',
    scores: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M9 17h6"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6 8-6s7 1.5 8 6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  const tabIcon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square">${TAB_ICONS[name]}</svg>`;

  function initTabBar(menuToggle) {
    const page = location.pathname.split("/").pop() || "index.html";
    const home = page === "index.html" || page === "";
    const link = (hash) => home ? `#${hash}` : `index.html#${hash}`;
    const bar = document.createElement("nav");
    bar.className = "tabbar";
    bar.setAttribute("aria-label", "Quick menu");
    bar.innerHTML = `
      <a href="${link("home")}" data-tab="home">${tabIcon("home")}<span>Home</span></a>
      <a href="${link("schedule")}" data-tab="book" class="tab-book">${tabIcon("book")}<span>Book</span></a>
      <a href="${link("highScores")}" data-tab="scores">${tabIcon("scores")}<span>Scores</span></a>
      <a href="profile.html" data-tab="profile">${tabIcon("profile")}<span data-tab-label>Profile</span></a>
      <button type="button" data-tab="menu" aria-controls="nav" aria-expanded="false">${tabIcon("menu")}<span>Menu</span></button>`;
    document.body.appendChild(bar);
    document.body.classList.add("has-tabbar");

    const setActive = (tab) => bar.querySelectorAll("[data-tab]").forEach((el) => el.classList.toggle("active", el.dataset.tab === tab));
    if (page === "profile.html") setActive("profile");
    else if (home) {
      // Highlight the tab of the section on screen
      const sections = { home: "home", about: "home", programs: "home", team: "home", highScores: "scores", schedule: "book", contact: "home" };
      const onScreen = () => {
        let current = "home";
        Object.keys(sections).forEach((id) => {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top < window.innerHeight * 0.45) current = sections[id];
        });
        setActive(current);
      };
      window.addEventListener("scroll", onScreen, { passive: true });
      onScreen();
    }

    bar.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-tab]");
      if (!tab) return;
      if (tab.dataset.tab === "menu") {
        event.stopPropagation();
        menuToggle?.click(); // same menu as the ☰ button
        bar.querySelector('[data-tab="menu"]').setAttribute("aria-expanded", String(document.getElementById("nav")?.classList.contains("open")));
      } else if (tab.dataset.tab === "profile" && !player) {
        event.preventDefault();
        openAuth("login");
      }
    });
    document.addEventListener("levelup:change", () => {
      const label = bar.querySelector("[data-tab-label]");
      if (label) label.textContent = player ? "Profile" : "Log in";
    });
  }

  initChrome();

  return {
    ITEMS, TRAINERS, ACHIEVEMENTS, RANKS, XP_PER_EURO, SESSION_XP, BOOKING_WEEKS_AHEAD, BOOKING_NOTICE_HOURS,
    TRAINER_SESSION_XP, TRAINER_CLIENT_XP, CHECKIN_XP, ACTIVITY_LEVELS, GOALS, computeStats, bmiCategory, nextCheckin,
    ready, isReady: () => isReady, serverError: () => serverError, calendarStatus: () => calendar.status,
    esc, dateKey, startOfWeek, parseDate, slotStart, formatSlot, avatarHtml, progress, levelFromXp, xpForLevel, rankFor, orderXp,
    getPlayer, isAdmin, adminData, getLeaderboard: (period = "all") => period === "month" ? leaderboardMonth : leaderboard, loadLeaderboard, setLeaderboardVisibility, carbonOnly, setCarbonOnly, signUp, logIn, logOut, deleteProfile, requestPasswordReset, updatePassword,
    saveBodyStats, recordPurchase,
    trainerById, trainerHours, weeklyHoursText, saveOpeningHours, deleteOpeningHours, getOpeningHours: () => openingHours, groupSessions, findBooking, slotBlocker, googleCalendarLink,
    bookSession, cancelBooking, playerBookings, trainerStats,
    isTrainer, respondBooking, rewardSession, getCoachBookings: () => coachBookings, showCoachInbox,
    SESSION_PRICE, TRAINER_FEE, getPricing: () => pricing, priceFor, quote, priceLabel, packCredits, openPackRequest,
    requestPack, cancelPackRequest, markPackPaid, setTrainerPricing,
    pageTabsHtml, showPageTab, tabFromHash, scrollToTabs, inTab, appInstallState, installApp,
    uploadAvatar, removeAvatar, adminClearAvatar,
    getPushStatus: () => pushStatus, refreshPushStatus, enablePush, disablePush, pushCalloutHtml,
    pushServerReady: () => call("push_public_key").then(Boolean, () => false),
    LOYALTY_SESSIONS, REWARD_SOURCES, availableVouchers, voucherOpen, shortDate, markHoodieGiven,
    HEALTH_QUESTIONS, healthValid, healthYes, healthFormHtml, saveHealthForm, healthFlagHtml,
    startPayment, canPayOnline, payLabel, markPaidInPerson, payInPersonInstead, markRefunded, HQ_ADDRESS, FREE_CANCEL_HOURS, REWARD_WINDOW_DAYS, isLateCancel, markNoShow, canSettle, hasStarted, euro, getCoachEarnings: () => coachEarnings, markPayout, coachStatement,
    applyAsTrainer, reviewApplication, loadTrainerList,
    openAuth, toast
  };
})();
