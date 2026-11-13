// LEVEL-UP shop: departments, search, product pages, the bag, delivery, PayPal checkout, the tab for the fridge and XP.
// shop.html?fridge is the fridge mode (the QR code on the fridge at the gym): drinks and bars only.
// shop.html?p=<id> opens a product page; shop.html?preview shows the admin every product, also the switched-off ones.

const CART_KEY = "levelup.cart.v1";
const DELIVERY_KEY = "levelup.delivery";
const OWNER_EMAIL = "PieterV-D-S@hotmail.com";
const MAX_QTY = 10;
const { ITEMS, ACHIEVEMENTS, SHOP_CATEGORIES, esc } = LevelUp;
const params = new URLSearchParams(location.search);
const FRIDGE = params.has("fridge");
const PREVIEW_ASKED = params.has("preview") && !FRIDGE;
const T = (s) => (window.t ? window.t(s) : s);

const $ = (id) => document.getElementById(id);
const itemGrid = $("itemGrid");
const bonusGrid = $("bonusGrid");
const playerPanel = $("playerPanel");
const bag = $("bag");
const bagBackdrop = $("bagBackdrop");
const bagItems = $("bagItems");
const bagEmpty = $("bagEmpty");
const bagFoot = $("bagFoot");
const bagXp = $("bagXp");
const bagLogin = $("bagLogin");
const bagStatus = $("bagStatus");
const paypalContainer = $("paypal-button-container");
const lootDialog = $("lootDialog");
const lootContent = $("lootContent");
const productDialog = $("productDialog");
const productContent = $("productContent");
const bagTab = $("bagTab");
const xpBanner = $("xpBanner");
const bundleSection = $("bundles");
const bundleGrid = $("bundleGrid");

let filter = FRIDGE ? "fuel" : location.hash === "#fuel" ? "fuel" : "all";
let query = "";
let sort = "featured";
let tabBusy = false;
let checkFailed = false;
let paypalRendered = false;
let note = "";
let openId = null;      // the product page that is open
let checked = null;     // the server's answer for the bag that is being paid

// ---------- Cart storage ----------
function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY)) || [];
    return saved.filter((line) => ITEMS.some((item) => item.id === line.id));
  } catch {
    return [];
  }
}

function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* storage unavailable */ }
  LevelUp.renderHud(); // the count on the bag button in the header
}

let cart = loadCart(); // [{ id, size, qty }]  (size = the chosen size or flavour)
let delivery = "pickup";
try { if (localStorage.getItem(DELIVERY_KEY) === "ship") delivery = "ship"; } catch { /* storage unavailable */ }

// The admin's preview: every product, also the ones that are switched off (those can't be bought)
const preview = () => PREVIEW_ASKED && LevelUp.isAdmin();
// What the shop shows, with today's price, stock and drop
const shopItems = () => LevelUp.shopItems({ all: preview() });
// What can be in a bag: only what is for sale
const itemById = (id) => LevelUp.shopItems().find((item) => item.id === id);
const anyItem = (id) => shopItems().find((item) => item.id === id);
// Lines of products that were switched off stay in storage but don't count
const cartLines = () => cart.map((line) => ({ ...line, item: itemById(line.id) })).filter((line) => line.item);
const cartTotal = () => cartLines().reduce((sum, line) => sum + line.item.price * line.qty, 0);
const cartQty = () => cartLines().reduce((sum, line) => sum + line.qty, 0);
const euro = (n) => `€${Number(n).toFixed(2)}`;
const basket = () => cartLines().map(({ id, size, qty }) => ({ id, size, qty }));
const tabTotal = () => LevelUp.openTab().reduce((sum, o) => sum + o.total, 0);
const isLimited = (item) => item.stock != null || item.dropEndsAt;
const onSale = (item) => item.listPrice != null && item.listPrice > item.price;
const salePct = (item) => Math.round((1 - item.price / item.listPrice) * 100);
const inFilter = (item, f) => f === "all" || (f === "sale" ? onSale(item) : item.category === f);
// A product's choice: a size for clothes, a flavour for powders
const optionOf = (item) => item.sizes ? { label: "Size", values: item.sizes } : item.options || null;
const catName = (id) => SHOP_CATEGORIES.find((c) => c.id === id)?.name || id;

// Delivery: sending only exists when the admin switched it on; drinks and bars from the fridge are never sent
const shipping = () => LevelUp.getPricing().shipping;
const canShip = () => Boolean(shipping()?.on);
const fuelInBag = () => cartLines().some((line) => line.item.category === "fuel");
const deliveryNow = () => (canShip() && delivery === "ship" && !fuelInBag() && !FRIDGE ? "ship" : "pickup");
const shipCost = (subtotal = cartTotal()) => {
  if (deliveryNow() !== "ship") return 0;
  const s = shipping();
  return s.freeFrom != null && subtotal >= s.freeFrom ? 0 : s.fee;
};

// "Ends in 2d 5h" for a drop
function endsIn(iso, what = "") {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return what ? "Sale ended" : "Drop ended";
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  const left = d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${Math.max(1, m)}m`;
  return what ? `Sale ends in ${left}` : `Ends in ${left}`;
}

// ---------- Item art ----------
const itemArt = (item, eager) => item.img ? `<img src="${item.img}" alt="${esc(item.name)}" ${eager ? "" : 'loading="lazy"'} width="600" height="600">`
  : `<span class="item-emoji" aria-hidden="true">${item.art || "📦"}</span>`;
const thumbArt = (item) => item.img ? `<img src="${item.img}" alt="">`
  : `<span class="bag-thumb"><span class="item-emoji" aria-hidden="true">${item.art || "📦"}</span></span>`;

// ---------- Rendering ----------
function renderTabs() {
  const all = shopItems();
  document.querySelectorAll("[data-filter]").forEach((tab) => {
    const f = tab.dataset.filter;
    tab.hidden = f !== "all" && !all.some((item) => inFilter(item, f));
  });
  if (filter !== "all" && !FRIDGE && !all.some((item) => inFilter(item, filter))) filter = "all";
  document.querySelectorAll("[data-filter]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.filter === filter)));
}

// The tags on a product picture: discount, limited stock, what you own, not for sale yet
function tagsHtml(item, owned) {
  const out = !item.available;
  const tags = [];
  if (!item.live) tags.push(`<span class="item-tag tag-off">Not live</span>`);
  if (onSale(item) && !out) tags.push(`<span class="item-tag tag-sale">−${salePct(item)}%</span>`);
  if (isLimited(item) && item.live) tags.push(`<span class="item-tag tag-limited">Limited</span>`);
  if (item.stock != null && !out) tags.push(`<span class="item-tag tag-stock">${item.stock <= 10 ? `Only ${item.stock} left` : `${item.stock} left`}</span>`);
  if (owned) tags.push(`<span class="item-tag tag-owned">Owned ×${owned}</span>`);
  return tags.length ? `<span class="item-tags">${tags.join("")}</span>` : "";
}

function cardHtml(item, player) {
  const owned = player ? player.inventory[item.id] || 0 : 0;
  const ended = item.dropEndsAt && new Date(item.dropEndsAt) <= new Date();
  const out = !item.available;
  const opt = optionOf(item);
  const sale = onSale(item) && !out;
  const timer = item.dropEndsAt && !out ? `<p class="drop-timer" data-ends="${esc(item.dropEndsAt)}">${endsIn(item.dropEndsAt)}</p>` : "";
  const saleTimer = sale && item.saleEndsAt ? `<p class="drop-timer sale-timer" data-ends="${esc(item.saleEndsAt)}" data-ends-label="Sale">${endsIn(item.saleEndsAt, "Sale")}</p>` : "";
  const label = !item.live ? "Not for sale yet" : out ? (ended ? "Drop ended" : "Sold out")
    : FRIDGE ? "Take one" : opt ? (opt.label === "Size" ? "Choose size" : "Choose flavour") : "Add to bag";
  const media = `${itemArt(item)}${tagsHtml(item, owned)}`;
  return `
    <article class="item-card rarity-${item.rarity}${out ? " sold-out" : ""}${sale ? " on-sale" : ""}${item.category === "fuel" ? " fuel-card" : ""}${item.live ? "" : " not-live"}" data-id="${item.id}">
      ${FRIDGE ? `<div class="item-media">${media}</div>` : `<a class="item-media" href="shop.html?p=${item.id}" data-open="${item.id}" aria-label="${esc(item.name)}">${media}</a>`}
      <div class="item-body">
        <p class="item-type">${item.type}</p>
        <h3>${FRIDGE ? esc(item.name) : `<a href="shop.html?p=${item.id}" data-open="${item.id}">${esc(item.name)}</a>`}</h3>
        <p class="item-desc">${esc(item.desc)}</p>
        ${timer}
        ${saleTimer}
        <div class="item-foot">
          <span class="price">${euro(item.price)}${sale ? ` <s class="was-price">${euro(item.listPrice)}</s>` : ""}</span>
          <span class="xp-reward">+${LevelUp.orderXp(item.price)} XP</span>
        </div>
        <button type="button" class="btn ${out ? "btn-ghost" : "btn-primary"} btn-block add-btn" ${out ? "disabled" : ""}${opt && !FRIDGE ? ` data-open="${item.id}"` : ""}>${label}</button>
      </div>
    </article>`;
}

// Search looks at the name, the kind and the text, in English and in Dutch
function matches(item, q) {
  if (!q) return true;
  const hay = [item.name, item.type, item.desc, catName(item.category), ...(item.details || [])];
  const text = hay.concat(hay.map(T)).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}

function sorted(items) {
  const by = {
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    name: (a, b) => T(a.name).localeCompare(T(b.name))
  }[sort];
  if (by) return [...items].sort(by);
  // featured: by department, what is for sale first
  const order = (item) => SHOP_CATEGORIES.findIndex((c) => c.id === item.category);
  return [...items].sort((a, b) => order(a) - order(b) || Number(b.available) - Number(a.available));
}

function renderItems() {
  const player = LevelUp.getPlayer();
  const pool = shopItems().filter((item) => inFilter(item, filter));
  const items = sorted(pool.filter((item) => matches(item, query)));
  const title = $("itemsTitle");
  if (title) title.textContent = FRIDGE ? "Take your pick" : filter === "all" ? "All products" : filter === "sale" ? "On sale" : catName(filter);
  const count = $("shopCount");
  if (count) count.textContent = FRIDGE || !pool.length ? "" : query ? `${items.length} of ${pool.length} products` : `${items.length} ${items.length === 1 ? "product" : "products"}`;

  if (!items.length) {
    itemGrid.innerHTML = `<p class="muted shop-empty">${FRIDGE
      ? "The fridge isn't in the app yet. Pay at the desk for now."
      : query ? `Nothing found for "<span data-no-i18n>${esc(query)}</span>". <button type="button" class="text-link link-button" data-search-clear>Show everything</button>`
      : "Nothing here right now. Check back soon."}</p>`;
    return;
  }
  // Everything, unsorted and unsearched: one row of products per department
  if (filter === "all" && !query && sort === "featured" && !FRIDGE) {
    itemGrid.innerHTML = SHOP_CATEGORIES.map((c) => {
      const group = items.filter((item) => item.category === c.id);
      return group.length ? `
        <section class="item-group" data-group="${c.id}">
          <h3 class="item-group-title">${c.name} <span>${group.length}</span></h3>
          <div class="item-grid">${group.map((item) => cardHtml(item, player)).join("")}</div>
        </section>` : "";
    }).join("");
    return;
  }
  itemGrid.innerHTML = `<div class="item-grid">${items.map((item) => cardHtml(item, player)).join("")}</div>`;
}

// The departments as tiles above the collection
function renderCategories() {
  const grid = $("catGrid");
  if (!grid) return;
  const all = shopItems();
  const cats = SHOP_CATEGORIES.map((c) => ({ ...c, n: all.filter((item) => item.category === c.id).length })).filter((c) => c.n);
  $("categories").hidden = FRIDGE || cats.length < 2;
  grid.innerHTML = $("categories").hidden ? "" : cats.map((c) => `
    <button type="button" class="cat-tile" data-filter-go="${c.id}">
      ${c.img ? `<img src="${c.img}" alt="" loading="lazy" width="400" height="400">` : `<span class="cat-emoji" aria-hidden="true">🥤</span>`}
      <span class="cat-text"><b>${c.name}</b><small>${c.blurb}</small></span>
      <span class="cat-count">${c.n} ${c.n === 1 ? "product" : "products"}</span>
    </button>`).join("");
}

const ICONS = {
  pin: `<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10.3" r="2.3"/>`,
  truck: `<path d="M2.5 6.5h11v10h-11zM13.5 10h4.2l3.3 3.4v3.1h-7.5z"/><circle cx="7" cy="17.5" r="1.9"/><circle cx="17" cy="17.5" r="1.9"/>`,
  lock: `<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/>`,
  bolt: `<path d="M13.2 2.5 5 13.5h6l-1.2 8L18.5 10H12Z"/>`,
  back: `<path d="M4 8.5h10.5a5 5 0 0 1 0 10H9"/><path d="M7.5 5 4 8.5 7.5 12"/>`,
  mail: `<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6.5L20.5 7"/>`
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const shipLine = () => {
  const s = shipping();
  return s.freeFrom != null ? `${euro(s.fee)} · free from ${euro(s.freeFrom)}` : euro(s.fee);
};

// Why buy here (under the hero) and the longer version further down
function renderService() {
  const usps = $("uspList");
  if (usps) usps.innerHTML = [
    ["pin", "Pick up in Aalst", "Free, at the desk"],
    canShip() ? ["truck", "Delivery in Belgium", shipLine()] : null,
    ["lock", "Pay safely", "PayPal or card"],
    ["bolt", "€1 = 10 XP", "Level up with every order"]
  ].filter(Boolean).map(([i, title, text]) => `<li>${icon(i)}<span><b>${title}</b><small>${text}</small></span></li>`).join("");

  const grid = $("serviceGrid");
  if (grid) grid.innerHTML = [
    ["pin", "Pick up at the gym", `Free. You pick up your order at the desk: ${esc(LevelUp.HQ_ADDRESS)}. We let you know when it is ready.`],
    canShip()
      ? ["truck", "Delivery in Belgium", `We send to addresses in Belgium for ${shipLine()}.`]
      : ["truck", "Delivery", "Can't come by? Mail us after your order and we look for a solution together."],
    ["back", "Returns", "You can return unused products within 14 days. Supplements only with the seal intact."],
    ["mail", "Questions?", `Ask at the desk or <a href="index.html#contact" class="text-link">send us a message</a>.`]
  ].map(([i, title, text]) => `<article class="service-card">${icon(i)}<h3>${title}</h3><p>${text}</p></article>`).join("");
}

// The admin's preview bar
function renderPreview() {
  const bar = $("shopPreview");
  if (!bar) return;
  bar.hidden = !PREVIEW_ASKED;
  if (!PREVIEW_ASKED) return;
  if (!preview()) {
    bar.innerHTML = `<p><b>Preview</b> <span>Log in as admin to see the products that are switched off.</span></p>`;
    return;
  }
  const all = shopItems();
  const off = all.filter((item) => !item.live).length;
  bar.innerHTML = `<p><b>Preview</b> <span>You see all ${all.length} products. ${off} of them are switched off ("Not live"): members don't see those.</span></p>
    <a href="admin.html#shop" class="btn btn-small btn-ghost">Manage products</a>`;
}

// €1 = 10 XP, with a couple of real examples from the shop
function renderXpBanner() {
  if (!xpBanner) return;
  const items = LevelUp.shopItems().filter((item) => item.available && (!FRIDGE || item.category === "fuel"));
  const top = [...items].sort((a, b) => b.price - a.price)[0];
  const fuel = items.find((item) => item.category === "fuel");
  const examples = [
    top && `${esc(top.name)} <b>+${LevelUp.orderXp(top.price)} XP</b>`,
    FRIDGE && fuel && fuel !== top && `${esc(fuel.name)} <b>+${LevelUp.orderXp(fuel.price)} XP</b>`
  ].filter(Boolean);
  const deal = items.filter(onSale).sort((a, b) => salePct(b) - salePct(a))[0];
  xpBanner.innerHTML = `<span class="xp-rate"><span class="coin" aria-hidden="true"></span> €1 = 10 XP</span>${deal && !FRIDGE ? `<button type="button" class="sale-chip" data-filter-go="sale">🔥 Sale: up to −${salePct(deal)}%</button>` : ""}${examples.map((e) => `<span>${e}</span>`).join("")}`;
}

// Session packs that come with a free item (set in admin -> Shop)
function renderBundles() {
  if (!bundleSection) return;
  const packs = LevelUp.getPricing().packs;
  const single = LevelUp.getPricing().price;
  const gifted = packs.filter((o) => o.gift && ITEMS.some((item) => item.id === o.gift));
  bundleSection.hidden = FRIDGE || !gifted.length;
  if (bundleSection.hidden) return;
  bundleGrid.innerHTML = packs.map((o) => {
    const gift = o.gift && ITEMS.find((item) => item.id === o.gift);
    return `
      <a class="bundle-card${gift ? " has-gift" : ""}" href="profile.html#packs">
        <span class="price-tag">${o.size} sessions</span>
        <strong>${euro(o.price)}</strong>
        <span class="muted">${euro(o.price / o.size)} per session · save ${euro(single * o.size - o.price)}</span>
        ${gift ? `<span class="bundle-gift">${gift.img ? `<img src="${gift.img}" alt="">` : `<span class="item-emoji" aria-hidden="true">${gift.art || "🎁"}</span>`}+ free ${esc(gift.name)}</span>` : ""}
        <span class="text-link">Get this pack →</span>
      </a>`;
  }).join("");
}

function renderBonuses() {
  const player = LevelUp.getPlayer();
  bonusGrid.innerHTML = ACHIEVEMENTS.filter((a) => a.shop).map((a) => {
    const unlocked = Boolean(player && player.achievements[a.id]);
    return `
      <div class="bonus-card ${unlocked ? "unlocked" : ""}">
        <span class="bonus-icon" aria-hidden="true">${unlocked ? a.icon : "?"}</span>
        <div>
          <h3>${a.title}</h3>
          <p>${a.desc}</p>
          <span class="bonus-xp">${unlocked ? "✓ Unlocked" : `+${a.xp} XP`}</span>
        </div>
      </div>`;
  }).join("");
}

function renderPlayerPanel() {
  const player = LevelUp.getPlayer();
  if (!player) {
    playerPanel.innerHTML = `
      <p class="panel-kicker">Not logged in</p>
      <h2>Earn XP with every item</h2>
      <p>Log in or create a player before you check out, so your purchase counts toward your level.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-primary btn-small" data-auth-open="signup">New player</button>
        <button type="button" class="btn btn-ghost btn-small" data-auth-open="login">Log in</button>
      </div>`;
    return;
  }
  const p = LevelUp.progress(player.xp);
  const itemsOwned = Object.values(player.inventory).reduce((a, b) => a + b, 0);
  playerPanel.innerHTML = `
    <div class="panel-player">
      ${LevelUp.avatarHtml(player)}
      <div>
        <p class="panel-name">${esc(player.name)}</p>
        <p class="panel-rank">LVL ${p.level} · ${p.rank.title}</p>
      </div>
    </div>
    <div class="xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${p.needed}" aria-valuenow="${p.into}" aria-label="XP to next level">
      <i style="width:${p.pct.toFixed(1)}%"></i>
    </div>
    <p class="panel-xp">${p.into} / ${p.needed} XP · ${p.toNext} XP to LVL ${p.level + 1}</p>
    <p class="panel-owned">Items owned: <strong>${itemsOwned}</strong> · <a href="profile.html" class="text-link">View profile</a></p>
    ${tabTotal() > 0 ? `<p class="panel-tab">🧾 Open tab: <strong>${euro(tabTotal())}</strong> · pay at the desk · <a href="profile.html#inventory" class="text-link">Details</a></p>` : ""}`;
}

// ---------- The product page ----------
function productHtml(item) {
  const player = LevelUp.getPlayer();
  const owned = player ? player.inventory[item.id] || 0 : 0;
  const out = !item.available;
  const ended = item.dropEndsAt && new Date(item.dropEndsAt) <= new Date();
  const sale = onSale(item) && !out;
  const opt = optionOf(item);
  const picker = opt && !out ? `
    <fieldset class="size-picker pd-options">
      <legend>${opt.label}</legend>
      ${opt.values.map((v, i) => `<label><input type="radio" name="pd-option" value="${esc(v)}" ${i === (opt.label === "Size" && opt.values.length > 2 ? 1 : 0) ? "checked" : ""}><span${opt.label === "Size" ? " data-no-i18n" : ""}>${esc(v)}</span></label>`).join("")}
    </fieldset>` : "";
  const facts = [
    item.details?.length ? `<details open><summary>Details</summary><ul>${item.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></details>` : "",
    item.use ? `<details><summary>How to use</summary><p>${esc(item.use)}</p></details>` : "",
    item.ingredients ? `<details><summary>Ingredients and allergens</summary>
        <p>${esc(item.ingredients)}</p>
        ${item.allergens ? `<p class="pd-allergens"><b>Allergens</b> <span>${esc(item.allergens)}</span></p>` : ""}
        ${item.warning ? `<p class="pd-warning">${esc(item.warning)}</p>` : ""}
        ${item.supplement ? `<p class="pd-legal">A food supplement is no substitute for a varied diet. Do not take more than the recommended daily amount. Keep out of reach of young children.</p>` : ""}
      </details>` : "",
    `<details><summary>Delivery and returns</summary>
        <p>Pick up at the gym in Aalst for free.${canShip() && item.category !== "fuel" ? ` Or have it sent in Belgium for ${shipLine()}.` : ""}</p>
        <p>You can return unused products within 14 days. Supplements only with the seal intact.</p>
      </details>`
  ].join("");
  const related = shopItems().filter((x) => x.id !== item.id && x.category === item.category && x.live).slice(0, 4);
  return `
    <div class="pd">
      <div class="pd-media">${itemArt(item, true)}${tagsHtml(item, owned)}</div>
      <div class="pd-info">
        <p class="item-type">${catName(item.category)} · ${item.type}</p>
        <h2 class="pd-name" id="productName">${esc(item.name)}</h2>
        <p class="pd-price">
          <span class="price">${euro(item.price)}${sale ? ` <s class="was-price">${euro(item.listPrice)}</s>` : ""}</span>
          <span class="xp-reward">+${LevelUp.orderXp(item.price)} XP</span>
        </p>
        <p class="pd-desc">${esc(item.desc)}</p>
        <ul class="item-perks">${item.perks.map((perk) => `<li>${perk}</li>`).join("")}</ul>
        ${item.dropEndsAt && !out ? `<p class="drop-timer" data-ends="${esc(item.dropEndsAt)}">${endsIn(item.dropEndsAt)}</p>` : ""}
        ${sale && item.saleEndsAt ? `<p class="drop-timer sale-timer" data-ends="${esc(item.saleEndsAt)}" data-ends-label="Sale">${endsIn(item.saleEndsAt, "Sale")}</p>` : ""}
        ${picker}
        <div class="pd-buy">
          ${out ? "" : `<div class="qty pd-qty"><button type="button" data-pd-qty="-1" aria-label="Remove one">−</button><span id="pdQty" aria-label="Quantity">1</span><button type="button" data-pd-qty="1" aria-label="Add one">+</button></div>`}
          <button type="button" class="btn ${out ? "btn-ghost" : "btn-primary"} pd-add" data-pd-add="${item.id}" ${out ? "disabled" : ""}>${!item.live ? "Not for sale yet" : out ? (ended ? "Drop ended" : "Sold out") : "Add to bag"}</button>
        </div>
        <p class="pd-pickup">${icon("pin")}<span>Pick up in Aalst for free${canShip() && item.category !== "fuel" ? ` · delivery ${shipLine()}` : ""}</span></p>
        <div class="pd-facts">${facts}</div>
      </div>
    </div>
    ${related.length ? `<div class="pd-related"><h3>You may also like</h3><div class="item-grid">${related.map((x) => cardHtml(x, player)).join("")}</div></div>` : ""}`;
}

const productUrl = (id) => {
  const url = new URL(location.href);
  if (id) url.searchParams.set("p", id); else url.searchParams.delete("p");
  url.hash = "";
  return url.pathname + url.search;
};

// how: "push" (a tap in the shop: Back closes it), "replace" (another product from this page) or "none" (Back/Forward)
function openProduct(id, how = "push") {
  const item = anyItem(id);
  if (!item || FRIDGE) return false;
  openId = id;
  productContent.innerHTML = productHtml(item);
  if (!productDialog.open) productDialog.showModal();
  productDialog.scrollTop = 0;
  if (how === "push") history.pushState({ product: id }, "", productUrl(id));
  else if (how === "replace") history.replaceState(history.state?.product ? { product: id } : history.state, "", productUrl(id));
  document.title = `${T(item.name)} | LEVEL-UP`;
  return true;
}

function closeProduct(fromHistory = false) {
  if (!openId) return;
  openId = null;
  if (productDialog.open) productDialog.close();
  document.title = FRIDGE ? "The fridge | LEVEL-UP" : "Shop | LEVEL-UP";
  if (fromHistory) return;
  if (history.state?.product) history.back(); // the entry this page added
  else history.replaceState(history.state, "", productUrl(null));
}

productDialog.addEventListener("close", () => closeProduct());
productDialog.addEventListener("click", (event) => {
  if (event.target === productDialog || event.target.closest("[data-close]")) { productDialog.close(); return; }
  const step = event.target.closest("[data-pd-qty]");
  if (step) {
    const el = $("pdQty");
    el.textContent = Math.min(MAX_QTY, Math.max(1, Number(el.textContent) + Number(step.dataset.pdQty)));
    return;
  }
  const add = event.target.closest("[data-pd-add]");
  if (add) {
    const size = productDialog.querySelector('input[name="pd-option"]:checked')?.value || null;
    const qty = Number($("pdQty")?.textContent) || 1;
    if (!addToCart(add.dataset.pdAdd, size, qty, true)) return;
    productDialog.close();
    openBag();
  }
});
window.addEventListener("popstate", () => {
  const id = new URLSearchParams(location.search).get("p");
  if (id) openProduct(id, "none"); else closeProduct(true);
});

// ---------- The bag ----------
function renderBag() {
  const lines = cartLines();
  const subtotal = cartTotal();
  const empty = lines.length === 0;
  const ship = shipCost(subtotal);
  const total = subtotal + ship;

  $("bagTitle").textContent = empty ? "Your bag" : `Your bag (${cartQty()})`;
  bagEmpty.hidden = !empty;
  bagFoot.hidden = empty;

  bagItems.innerHTML = lines.map((line) => { const index = cart.findIndex((c) => c.id === line.id && c.size === line.size); const opt = optionOf(line.item); return `
    <li class="bag-line">
      ${thumbArt(line.item)}
      <div class="bag-line-info">
        <p class="bag-line-name">${esc(line.item.name)}</p>
        <p class="bag-line-meta">${line.size ? `${opt?.label === "Flavour" ? esc(line.size) : `Size <span data-no-i18n>${esc(line.size)}</span>`} · ` : ""}${euro(line.item.price)}${onSale(line.item) ? ` <s class="was-price">${euro(line.item.listPrice)}</s>` : ""}${line.item.available ? "" : ` · <span class="sold-note">Sold out</span>`}</p>
        <div class="qty">
          <button type="button" data-qty="-1" data-index="${index}" aria-label="Remove one">−</button>
          <span aria-label="Quantity">${line.qty}</span>
          <button type="button" data-qty="1" data-index="${index}" aria-label="Add one" ${line.qty >= MAX_QTY ? "disabled" : ""}>+</button>
        </div>
      </div>
      <div class="bag-line-end">
        <button type="button" class="bag-remove" data-remove="${index}" aria-label="Remove ${esc(line.item.name)}">✕</button>
        <strong>${euro(line.item.price * line.qty)}</strong>
      </div>
    </li>`; }).join("");

  renderDelivery(lines, subtotal);
  $("bagSum").innerHTML = empty ? "" : `
    <div><dt>Subtotal</dt><dd>${euro(subtotal)}</dd></div>
    ${shipping() && !FRIDGE ? `<div><dt>${deliveryNow() === "ship" ? "Delivery" : "Pickup at the gym"}</dt><dd>${ship ? euro(ship) : "Free"}</dd></div>` : ""}
    <div class="bag-total"><dt>Total</dt><dd id="bagTotal">${euro(total)}</dd></div>`;

  const xp = LevelUp.orderXp(subtotal);
  const player = LevelUp.getPlayer();
  if (player) {
    const now = LevelUp.levelFromXp(player.xp);
    const after = LevelUp.levelFromXp(player.xp + xp);
    bagXp.innerHTML = `
      <span class="xp-chip">+${xp} XP</span>
      <span>${after > now ? `LVL ${now} → <strong>LVL ${after}</strong>` : `${LevelUp.xpForLevel(now + 1) - player.xp - xp} XP left to LVL ${now + 1}`}</span>`;
    bagLogin.innerHTML = "";
  } else {
    bagXp.innerHTML = `<span class="xp-chip">+${xp} XP</span><span>for this order</span>`;
    bagLogin.innerHTML = `
      <p>Log in first to add this XP to your level.</p>
      <button type="button" class="btn btn-small" data-auth-open="login">Log in</button>`;
  }

  $("bagNote").textContent = !shipping() ? "Secure payment with PayPal. After checkout we contact you by email to arrange delivery or pickup."
    : deliveryNow() === "ship" ? "Secure payment with PayPal or card. You enter your address there. You get a confirmation by email."
    : "Secure payment with PayPal or card. You get a confirmation by email and a message when your order is ready.";

  renderTabOption(lines, subtotal);
  paypalContainer.hidden = empty;
  if (!empty && bag.classList.contains("open")) renderPayPal();
}

// Pickup or delivery, how far the bag is from free delivery, and a remark for the order
function renderDelivery(lines, subtotal) {
  const box = $("bagDelivery");
  const bar = $("bagShipBar");
  const s = shipping();
  if (!lines.length || !s || FRIDGE) { box.innerHTML = ""; bar.hidden = true; return; }
  const fuel = fuelInBag();
  const now = deliveryNow();
  const fee = s.freeFrom != null && subtotal >= s.freeFrom ? 0 : s.fee;
  const noteField = `<label class="bag-note-field"><span>Remark (optional)</span><input type="text" id="bagNoteInput" maxlength="300" value="${esc(note)}" placeholder="E.g. I pick it up on Thursday" autocomplete="off"></label>`;
  if (!s.on) {
    box.innerHTML = `<p class="delivery-fixed">${icon("pin")}<span><b>Pick up at the gym</b><small data-no-i18n>${esc(LevelUp.HQ_ADDRESS)}</small></span><em>Free</em></p>${noteField}`;
    bar.hidden = true;
    return;
  }
  box.innerHTML = `
    <fieldset class="delivery-pick">
      <legend>How do you want it?</legend>
      <label><input type="radio" name="delivery" value="pickup" ${now === "pickup" ? "checked" : ""}><span><b>Pick up at the gym</b><small data-no-i18n>${esc(LevelUp.HQ_ADDRESS)}</small></span><em>Free</em></label>
      <label class="${fuel ? "off" : ""}"><input type="radio" name="delivery" value="ship" ${now === "ship" ? "checked" : ""} ${fuel ? "disabled" : ""}><span><b>Send it to me</b><small>${fuel ? "Not for drinks and bars from the fridge" : "To an address in Belgium"}</small></span><em>${fee ? euro(fee) : "Free"}</em></label>
    </fieldset>${noteField}`;
  // how far from free delivery
  bar.hidden = s.freeFrom == null || fuel;
  if (!bar.hidden) {
    const left = s.freeFrom - subtotal;
    bar.innerHTML = `<p>${left > 0 ? `${icon("truck")}<span><b>${euro(left)}</b> to go for free delivery</span>` : `${icon("truck")}<span><b>Free delivery</b> on this order</span>`}</p>
      <div class="ship-meter"><i style="width:${Math.min(100, (subtotal / s.freeFrom) * 100).toFixed(1)}%"></i></div>`;
    bar.classList.toggle("reached", left <= 0);
  }
}

$("bagDelivery").addEventListener("change", (event) => {
  if (event.target.name !== "delivery") return;
  delivery = event.target.value === "ship" ? "ship" : "pickup";
  try { localStorage.setItem(DELIVERY_KEY, delivery); } catch { /* storage unavailable */ }
  renderBag();
});
$("bagDelivery").addEventListener("input", (event) => {
  if (event.target.id === "bagNoteInput") note = event.target.value;
});

// Drinks and bars can go on the member's tab: pay later at the desk, XP when it's paid
function renderTabOption(lines, total) {
  if (!bagTab) return;
  const fuelOnly = lines.length > 0 && lines.every((line) => line.item.category === "fuel");
  if (!fuelOnly) { bagTab.innerHTML = ""; return; }
  const player = LevelUp.getPlayer();
  if (!player) {
    bagTab.innerHTML = `<p class="bag-tab-note">Log in to put drinks and bars on your tab and pay at the desk later.</p>`;
    return;
  }
  const open = tabTotal();
  const limit = LevelUp.getPricing().tabLimit;
  const over = open + total > limit;
  bagTab.innerHTML = `
    <button type="button" class="btn ${FRIDGE ? "btn-primary" : "btn-ghost"} btn-block" data-tab-order ${over || tabBusy ? "disabled" : ""}>🧾 Put ${euro(total)} on my tab</button>
    <p class="bag-tab-note">${over
      ? `Your tab is limited to ${euro(limit)}. Pay your open tab of ${euro(open)} at the desk first, or pay now below.`
      : `Pay at the desk later${open ? ` · open now: ${euro(open)}` : ""}. The XP comes when it's paid.`}</p>
    <p class="bag-or"><span>or pay now</span></p>`;
}

async function putOnTab() {
  if (tabBusy) return;
  tabBusy = true;
  bagStatus.textContent = "";
  renderBag();
  const lines = cartLines();
  try {
    const r = await LevelUp.tabOrder(basket());
    cart = [];
    saveCart();
    closeBag();
    tabBusy = false;
    renderAll();
    showTabLoot(lines, r);
  } catch (err) {
    tabBusy = false;
    await LevelUp.loadShopCatalog();
    renderAll();
    bagStatus.textContent = err.message;
  }
}

bagTab?.addEventListener("click", (event) => {
  if (event.target.closest("[data-tab-order]")) putOnTab();
});

function renderAll() {
  renderTabs();
  renderPreview();
  renderCategories();
  renderItems();
  renderService();
  renderXpBanner();
  renderBundles();
  renderBonuses();
  renderPlayerPanel();
  renderBag();
  // a product page that is open follows the price and the stock
  if (openId && productDialog.open) {
    const item = anyItem(openId);
    const picked = productDialog.querySelector('input[name="pd-option"]:checked')?.value;
    const qty = $("pdQty")?.textContent;
    if (item) {
      productContent.innerHTML = productHtml(item);
      if (picked) { const r = [...productDialog.querySelectorAll('input[name="pd-option"]')].find((i) => i.value === picked); if (r) r.checked = true; }
      if (qty && $("pdQty")) $("pdQty").textContent = qty;
    }
  }
}

// ---------- Bag actions ----------
function addToCart(id, size, qty = 1, quiet = false) {
  const item = itemById(id);
  if (!item || !item.available) return false;
  const existing = cart.find((line) => line.id === id && line.size === size);
  if (existing) {
    if (existing.qty >= MAX_QTY) { LevelUp.toast({ title: "That's the most per order", text: `${MAX_QTY} × ${item.name}`, icon: "✋", tone: "gold" }); return false; }
    existing.qty = Math.min(MAX_QTY, existing.qty + qty);
  } else {
    cart.push({ id, size, qty: Math.min(MAX_QTY, qty) });
  }
  saveCart();
  renderBag();
  bumpBag();
  if (FRIDGE) { openBag(); return true; }
  if (!quiet) LevelUp.toast({ title: "Added to bag", text: `${item.name}${size ? ` (${size})` : ""}`, icon: "🛍", tone: "green" });
  return true;
}

function bumpBag() {
  const button = document.querySelector(".hud-cart");
  if (!button) return;
  button.classList.remove("bump");
  void button.offsetWidth; // restart animation
  button.classList.add("bump");
}

// A tap on a product: its page; "Add to bag" on a product without a choice: straight into the bag
document.addEventListener("click", (event) => {
  const open = event.target.closest("[data-open]");
  if (open && !FRIDGE) {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return; // a new tab stays a new tab
    event.preventDefault();
    openProduct(open.dataset.open, productDialog.open ? "replace" : "push");
    return;
  }
  const button = event.target.closest(".add-btn");
  if (button) addToCart(button.closest(".item-card").dataset.id, null);
});

bagItems.addEventListener("click", (event) => {
  const qtyButton = event.target.closest("[data-qty]");
  const removeButton = event.target.closest("[data-remove]");
  if (qtyButton) {
    const line = cart[Number(qtyButton.dataset.index)];
    if (!line) return;
    line.qty = Math.min(MAX_QTY, line.qty + Number(qtyButton.dataset.qty));
    if (line.qty <= 0) cart.splice(Number(qtyButton.dataset.index), 1);
  } else if (removeButton) {
    cart.splice(Number(removeButton.dataset.remove), 1);
  } else {
    return;
  }
  saveCart();
  renderBag();
});

function openBag() {
  bag.classList.add("open");
  bag.setAttribute("aria-hidden", "false");
  bagBackdrop.hidden = false;
  document.body.classList.add("no-scroll");
  renderBag();
  $("bagClose").focus();
}

function closeBag() {
  bag.classList.remove("open");
  bag.setAttribute("aria-hidden", "true");
  bagBackdrop.hidden = true;
  document.body.classList.remove("no-scroll");
  if (location.hash === "#bag") history.replaceState(history.state, "", location.pathname + location.search);
}

// The bag button lives in the header (game.js draws it)
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-bag-open]")) { event.preventDefault(); openBag(); }
  else if (event.target.closest("[data-bag-close]")) closeBag();
  else if (event.target.closest("[data-search-clear]")) { query = ""; $("shopSearch").value = ""; renderItems(); }
});
bagBackdrop.addEventListener("click", closeBag);
$("bagClose").addEventListener("click", closeBag);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && bag.classList.contains("open")) closeBag();
});

// A department tile or the sale chip jumps to that part of the collection
document.addEventListener("click", (event) => {
  const go = event.target.closest("[data-filter-go]");
  if (!go) return;
  filter = go.dataset.filterGo;
  renderTabs();
  renderItems();
  $("items").scrollIntoView({ block: "start" });
});

// Filter tabs, search and sorting
document.querySelectorAll("[data-filter]").forEach((tab) => {
  tab.addEventListener("click", () => {
    filter = tab.dataset.filter;
    renderTabs();
    renderItems();
  });
});
$("shopSearch")?.addEventListener("input", (event) => { query = event.target.value.trim(); renderItems(); });
$("shopSort")?.addEventListener("change", (event) => { sort = event.target.value; renderItems(); });

// ---------- Checkout ----------
function renderPayPal() {
  if (paypalRendered) return;
  if (!window.paypal) {
    bagStatus.textContent = "PayPal is still loading. If this stays, check your connection or turn off your ad blocker and reload.";
    window.addEventListener("load", () => { if (bag.classList.contains("open")) renderBag(); }, { once: true });
    return;
  }
  bagStatus.textContent = "";
  paypalRendered = true;

  paypal.Buttons({
    style: { layout: "vertical", color: "gold", shape: "rect", label: "pay" },

    // The server checks the bag first (sold out, drop ended) and its prices and delivery cost are the ones charged
    createOrder: async (data, actions) => {
      bagStatus.textContent = "";
      LevelUp.holdCelebrations("paypal", true); // nothing pops up while the payment window is open
      let check;
      try {
        check = await LevelUp.shopCheck(basket(), deliveryNow());
      } catch (err) {
        checkFailed = true;
        LevelUp.holdCelebrations("paypal", false);
        await Promise.all([LevelUp.loadShopCatalog(), LevelUp.loadPricing()]);
        renderAll();
        bagStatus.textContent = err.message;
        throw err;
      }
      const lines = check.items.map((i) => ({ item: { name: i.name, price: Number(i.price) }, size: i.size, qty: i.qty }));
      const itemTotal = Number(check.subtotal ?? check.total);
      const ship = Number(check.shipping || 0);
      checked = { delivery: check.delivery || "pickup", shipping: ship, note };
      const money = (n) => ({ currency_code: "EUR", value: Number(n).toFixed(2) });
      return actions.order.create({
        purchase_units: [{
          description: "LEVEL-UP shop",
          amount: { ...money(itemTotal + ship), breakdown: { item_total: money(itemTotal), ...(ship ? { shipping: money(ship) } : {}) } },
          items: lines.map((line) => ({
            name: `${line.item.name}${line.size ? ` (${line.size})` : ""}`,
            unit_amount: money(line.item.price),
            quantity: String(line.qty),
            category: "PHYSICAL_GOODS"
          }))
        }],
        // a pickup needs no address; a delivery takes the address the buyer gives PayPal
        ...(shipping() ? { application_context: { shipping_preference: checked.delivery === "ship" ? "GET_FROM_FILE" : "NO_SHIPPING" } } : {})
      });
    },

    // We only send within Belgium
    onShippingChange: (data, actions) => {
      if (checked?.delivery === "ship" && data.shipping_address?.country_code && data.shipping_address.country_code !== "BE") return actions.reject();
      return actions.resolve();
    },

    onApprove: async (data, actions) => {
      const lines = cartLines();
      const details = await actions.order.capture();
      const how = checked || { delivery: "pickup", shipping: 0, note: "" };
      const subtotal = lines.reduce((sum, line) => sum + line.item.price * line.qty, 0);
      const order = {
        id: details.id,
        date: new Date().toISOString(),
        items: lines.map((line) => ({
          id: line.item.id,
          name: line.item.name,
          size: line.size || null,
          qty: line.qty,
          price: line.item.price
        })),
        subtotal,
        shipping: how.shipping,
        delivery: how.delivery,
        note: how.note || "",
        contact: buyer(details),
        total: subtotal + how.shipping
      };

      const player = LevelUp.getPlayer();
      notifyOwner(order, player); // the order email goes out even if the XP server is down
      let reward;
      try {
        reward = await LevelUp.recordPurchase(order);
      } catch (err) {
        console.error("Recording the order failed:", err);
        reward = { guest: !player, xp: LevelUp.orderXp(order.subtotal), failed: true };
      }

      cart = [];
      note = "";
      checked = null;
      saveCart();
      closeBag();
      renderAll();
      LevelUp.holdCelebrations("paypal", false);
      finishOrder(order, reward); // not awaited: PayPal can close its window
    },

    onCancel: () => LevelUp.holdCelebrations("paypal", false),

    onError: (err) => {
      LevelUp.holdCelebrations("paypal", false);
      if (checkFailed) { checkFailed = false; return; } // the message about the bag is already shown
      console.error("PayPal error:", err);
      bagStatus.textContent = "Something went wrong with the payment. Nothing was charged. Please try again.";
    }
  }).render("#paypal-button-container");
}

// Who bought it and where it goes, as PayPal gives it
function buyer(details) {
  const payer = details.payer || {};
  const ship = details.purchase_units?.[0]?.shipping;
  const name = ship?.name?.full_name || [payer.name?.given_name, payer.name?.surname].filter(Boolean).join(" ") || "";
  const a = ship?.address;
  const address = a ? [a.address_line_1, a.address_line_2, [a.postal_code, a.admin_area_2].filter(Boolean).join(" "), a.country_code].filter(Boolean).join(", ") : "";
  return { name, email: payer.email_address || "", address };
}

// Sends the order to the LEVEL-UP inbox. The buyer gets an automatic confirmation.
function notifyOwner(order, player) {
  const name = order.contact.name || "LEVEL-UP player";
  const itemsText = order.items
    .map((item) => `${item.qty}× ${item.name}${item.size ? ` (${item.size})` : ""}: ${euro(item.price * item.qty)}`)
    .join("\n");
  const how = order.delivery === "ship" ? `Delivery (${order.shipping ? euro(order.shipping) : "free"})` : "Pickup at the gym";
  const next = order.delivery === "ship" ? "We send it to your address as soon as possible."
    : shipping() ? "We let you know when your order is ready to pick up at the gym." : "We'll contact you soon to arrange delivery or pickup.";

  fetch(`https://formsubmit.co/ajax/${OWNER_EMAIL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: `New LEVEL-UP order (${euro(order.total)})`,
      _template: "table",
      _autoresponse: `Thanks for your order, ${name}! We received your payment for:\n\n${itemsText}\n\n${how}\nTotal: ${euro(order.total)}\nOrder ID: ${order.id}\n\n${next}\n\nKeep leveling up!\nThe LEVEL-UP team`,
      name,
      email: order.contact.email,
      order_id: order.id,
      items: itemsText,
      delivery: how,
      total: euro(order.total),
      shipping_address: order.contact.address || "Not provided",
      remark: order.note || "-",
      player: player ? `${player.name} (LVL ${LevelUp.levelFromXp(player.xp)})` : "Guest"
    })
  }).catch((error) => console.error("Order email failed:", error));
}

// The payment is in: first the celebration (once), then the order summary.
// With an account the server queued it (so it never plays twice); a visitor without one gets it right here.
async function finishOrder(order, reward) {
  if (reward.guest && !reward.failed) {
    const first = order.items[0]?.name || "Your order";
    await LevelUp.celebrateLocal("purchase", { subtitle: `${first}${order.items.length > 1 ? ` and ${order.items.length - 1} more` : ""}` });
  } else if (!reward.failed) {
    await LevelUp.celebrateNow("purchase"); // a higher place on the high scores plays after the summary is closed
  }
  showLoot(order, reward);
}

function showLoot(order, reward) {
  const itemsHtml = order.items.map((item) => `
    <li><span>${item.qty}× ${esc(item.name)}${item.size ? ` (${item.size})` : ""}</span><span>${euro(item.price * item.qty)}</span></li>`).join("");

  let rewardHtml;
  if (reward.failed) {
    rewardHtml = `
      <div class="loot-reward">
        <span class="xp-chip gold">XP pending</span>
        <p>Your payment went through, but we couldn't add the XP right now. We have your order and will fix it for you.</p>
      </div>`;
  } else if (reward.guest) {
    rewardHtml = `
      <div class="loot-reward">
        <span class="xp-chip gold">+${reward.xp} XP waiting</span>
        <p>Log in or create a player on this device to claim the XP for this order.</p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary btn-small" data-auth-open="signup">New player</button>
          <button type="button" class="btn btn-ghost btn-small" data-auth-open="login">Log in</button>
        </div>
      </div>`;
  } else {
    rewardHtml = `
      <div class="loot-reward">
        <span class="xp-chip">+${reward.xp} XP</span>
        ${reward.levelAfter > reward.levelBefore
          ? `<p class="loot-levelup">LEVEL UP! LVL ${reward.levelBefore} → LVL ${reward.levelAfter}</p>`
          : "<p>Added to your profile.</p>"}
        <a href="profile.html" class="btn btn-small">View profile</a>
      </div>`;
  }

  lootContent.innerHTML = `
    <p class="section-kicker">Order confirmed</p>
    <h2 class="auth-title" id="lootTitle">Order complete!</h2>
    <ul class="loot-items">${itemsHtml}${shipping() ? `<li class="loot-ship"><span>${order.delivery === "ship" ? "Delivery" : "Pickup at the gym"}</span><span>${order.shipping ? euro(order.shipping) : "Free"}</span></li>` : ""}</ul>
    <p class="loot-total">Total paid <strong>${euro(order.total)}</strong></p>
    ${rewardHtml}
    <p class="auth-note">${!shipping() ? "A confirmation is on its way to your email. We'll contact you about delivery or pickup."
      : order.delivery === "ship" ? "A confirmation is on its way to your email. We send your order to the address you gave."
      : "A confirmation is on its way to your email. We let you know when your order is ready at the desk."}</p>`;
  lootDialog.showModal();
}

// Put on the tab: what was taken, the open total and an undo for a wrong tap
function showTabLoot(lines, r) {
  const itemsHtml = lines.map((line) => `
    <li><span>${line.qty}× ${esc(line.item.name)}</span><span>${euro(line.item.price * line.qty)}</span></li>`).join("");
  lootContent.innerHTML = `
    <p class="section-kicker">On your tab</p>
    <h2 class="auth-title" id="lootTitle">Enjoy! 🧾</h2>
    <ul class="loot-items">${itemsHtml}</ul>
    <p class="loot-total">Open tab <strong>${euro(r.openTotal)}</strong></p>
    <div class="loot-reward">
      <span class="xp-chip gold">+${r.xp} XP when paid</span>
      <p>Pay at the desk. The XP lands on your profile as soon as it's marked paid.</p>
    </div>
    <p class="auth-note">Wrong drink? <button type="button" class="text-link link-button" data-tab-undo="${esc(r.id)}">Undo</button> (within 15 minutes)</p>
    <p class="form-error" role="alert"></p>`;
  lootDialog.showModal();
}

lootContent.addEventListener("click", async (event) => {
  const undo = event.target.closest("[data-tab-undo]");
  if (!undo) return;
  undo.disabled = true;
  try {
    await LevelUp.tabCancel(undo.dataset.tabUndo);
    lootDialog.close();
    LevelUp.toast({ title: "Removed from your tab", text: "Nothing to pay for this one.", icon: "↩", tone: "green" });
  } catch (err) {
    undo.disabled = false;
    lootContent.querySelector(".form-error").textContent = err.message;
  }
});

lootDialog.querySelector("[data-close]").addEventListener("click", () => lootDialog.close());
lootDialog.addEventListener("click", (event) => {
  if (event.target === lootDialog) lootDialog.close();
  if (event.target.closest("[data-auth-open]")) lootDialog.close();
});

// ---------- Init ----------
if (FRIDGE) {
  document.body.classList.add("fridge-mode");
  document.title = "The fridge | LEVEL-UP";
}
document.addEventListener("levelup:change", renderAll);
renderAll();
LevelUp.ready.then(() => {
  renderAll();
  // a shared link to a product, or the bag button on another page
  const id = params.get("p");
  if (id && !openProduct(id, "none")) history.replaceState(history.state, "", productUrl(null));
  if (location.hash === "#bag") openBag();
});
// Drop countdowns tick every minute
setInterval(() => {
  document.querySelectorAll("[data-ends]").forEach((el) => {
    el.textContent = endsIn(el.dataset.ends, el.dataset.endsLabel || "");
    if (new Date(el.dataset.ends) <= new Date()) LevelUp.loadShopCatalog().then(renderAll);
  });
}, 60000);
