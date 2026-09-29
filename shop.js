// LEVEL-UP item shop: items, loot bag, PayPal checkout and XP rewards.

const CART_KEY = "levelup.cart.v1";
const OWNER_EMAIL = "PieterV-D-S@hotmail.com";
const MAX_QTY = 10;
const { ITEMS, ACHIEVEMENTS, esc } = LevelUp;

const itemGrid = document.getElementById("itemGrid");
const bonusGrid = document.getElementById("bonusGrid");
const playerPanel = document.getElementById("playerPanel");
const bag = document.getElementById("bag");
const bagBackdrop = document.getElementById("bagBackdrop");
const bagButton = document.getElementById("bagButton");
const bagCount = document.getElementById("bagCount");
const bagItems = document.getElementById("bagItems");
const bagEmpty = document.getElementById("bagEmpty");
const bagFoot = document.getElementById("bagFoot");
const bagTotal = document.getElementById("bagTotal");
const bagXp = document.getElementById("bagXp");
const bagLogin = document.getElementById("bagLogin");
const bagStatus = document.getElementById("bagStatus");
const paypalContainer = document.getElementById("paypal-button-container");
const lootDialog = document.getElementById("lootDialog");
const lootContent = document.getElementById("lootContent");

let filter = "all";
let paypalRendered = false;

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
}

let cart = loadCart(); // [{ id, size, qty }]

const itemById = (id) => ITEMS.find((item) => item.id === id);
const cartLines = () => cart.map((line) => ({ ...line, item: itemById(line.id) }));
const cartTotal = () => cartLines().reduce((sum, line) => sum + line.item.price * line.qty, 0);
const cartQty = () => cart.reduce((sum, line) => sum + line.qty, 0);
const euro = (n) => `€${n.toFixed(2)}`;

// ---------- Item art ----------
// Pixel-style icon for items without a photo
const bandsArt = `
  <svg viewBox="0 0 32 32" class="item-art" aria-hidden="true" shape-rendering="crispEdges">
    <rect width="32" height="32" fill="#0b120e"/>
    <g fill="none" stroke-width="2">
      <path d="M6 10h20v4H6z" stroke="#7ee06a"/>
      <path d="M8 16h16v4H8z" stroke="#ffd23f"/>
      <path d="M10 22h12v4H10z" stroke="#ff5a5f"/>
    </g>
    <path d="M4 12h2M26 12h2M6 18h2M24 18h2M8 24h2M22 24h2" stroke="#f2f5f0" stroke-width="2"/>
  </svg>`;

// ---------- Rendering ----------
function renderItems() {
  const player = LevelUp.getPlayer();
  const items = ITEMS.filter((item) => filter === "all" || item.category === filter);

  itemGrid.innerHTML = items.map((item) => {
    const owned = player ? player.inventory[item.id] || 0 : 0;
    const sizes = item.sizes ? `
      <fieldset class="size-picker">
        <legend>Size</legend>
        ${item.sizes.map((size, i) => `
          <label><input type="radio" name="size-${item.id}" value="${size}" ${i === 1 ? "checked" : ""}><span>${size}</span></label>`).join("")}
      </fieldset>` : "";

    return `
      <article class="item-card rarity-${item.rarity}" data-id="${item.id}">
        <div class="item-media">
          ${item.img ? `<img src="${item.img}" alt="${esc(item.name)}" loading="lazy">` : bandsArt}
          <span class="rarity-tag">${item.rarity}</span>
          ${owned ? `<span class="owned-tag">Owned ×${owned}</span>` : ""}
        </div>
        <div class="item-body">
          <p class="item-type">${item.type}</p>
          <h3>${esc(item.name)}</h3>
          <p class="item-desc">${esc(item.desc)}</p>
          <ul class="item-perks">${item.perks.map((perk) => `<li>${perk}</li>`).join("")}</ul>
          ${sizes}
          <div class="item-foot">
            <span class="price"><span class="coin" aria-hidden="true"></span>${euro(item.price)}</span>
            <span class="xp-reward">+${LevelUp.orderXp(item.price)} XP</span>
          </div>
          <button type="button" class="btn btn-primary btn-block add-btn">Add to bag</button>
        </div>
      </article>`;
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
      <p class="panel-kicker">No save file loaded</p>
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
    <p class="panel-owned">Items owned: <strong>${itemsOwned}</strong> · <a href="profile.html" class="text-link">View profile</a></p>`;
}

function renderBag() {
  const lines = cartLines();
  const total = cartTotal();
  const qty = cartQty();
  const empty = lines.length === 0;

  bagCount.textContent = qty;
  bagButton.classList.toggle("has-items", !empty);
  bagEmpty.hidden = !empty;
  bagFoot.hidden = empty;

  bagItems.innerHTML = lines.map((line, index) => `
    <li class="bag-line">
      ${line.item.img ? `<img src="${line.item.img}" alt="">` : `<span class="bag-thumb">${bandsArt}</span>`}
      <div class="bag-line-info">
        <p class="bag-line-name">${esc(line.item.name)}</p>
        <p class="bag-line-meta">${line.size ? `Size ${line.size} · ` : ""}${euro(line.item.price)} · +${LevelUp.orderXp(line.item.price)} XP</p>
        <div class="qty">
          <button type="button" data-qty="-1" data-index="${index}" aria-label="Remove one">−</button>
          <span aria-label="Quantity">${line.qty}</span>
          <button type="button" data-qty="1" data-index="${index}" aria-label="Add one" ${line.qty >= MAX_QTY ? "disabled" : ""}>+</button>
        </div>
      </div>
      <button type="button" class="bag-remove" data-remove="${index}" aria-label="Remove ${esc(line.item.name)}">✕</button>
    </li>`).join("");

  bagTotal.textContent = euro(total);

  const xp = LevelUp.orderXp(total);
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

  paypalContainer.hidden = empty;
  if (!empty && bag.classList.contains("open")) renderPayPal();
}

function renderAll() {
  renderItems();
  renderBonuses();
  renderPlayerPanel();
  renderBag();
}

// ---------- Bag actions ----------
function addToCart(id, size) {
  const existing = cart.find((line) => line.id === id && line.size === size);
  if (existing) {
    if (existing.qty >= MAX_QTY) return;
    existing.qty++;
  } else {
    cart.push({ id, size, qty: 1 });
  }
  saveCart();
  renderBag();

  const item = itemById(id);
  LevelUp.toast({ title: "Added to bag", text: `${item.name}${size ? ` (${size})` : ""}`, icon: "🎒", tone: "green" });
  bagButton.classList.remove("bump");
  void bagButton.offsetWidth; // restart animation
  bagButton.classList.add("bump");
}

itemGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".add-btn");
  if (!button) return;
  const card = button.closest(".item-card");
  const size = card.querySelector('input[type="radio"]:checked')?.value || null;
  addToCart(card.dataset.id, size);
});

bagItems.addEventListener("click", (event) => {
  const qtyButton = event.target.closest("[data-qty]");
  const removeButton = event.target.closest("[data-remove]");
  if (qtyButton) {
    const line = cart[Number(qtyButton.dataset.index)];
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
  bagButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("no-scroll");
  renderBag();
  document.getElementById("bagClose").focus();
}

function closeBag() {
  bag.classList.remove("open");
  bag.setAttribute("aria-hidden", "true");
  bagBackdrop.hidden = true;
  bagButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("no-scroll");
}

bagButton.addEventListener("click", openBag);
bagBackdrop.addEventListener("click", closeBag);
document.getElementById("bagClose").addEventListener("click", closeBag);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && bag.classList.contains("open")) closeBag();
});

// Filter tabs
document.querySelectorAll("[data-filter]").forEach((tab) => {
  tab.addEventListener("click", () => {
    filter = tab.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    renderItems();
  });
});

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

    createOrder: (data, actions) => {
      const lines = cartLines();
      const total = cartTotal().toFixed(2);
      return actions.order.create({
        purchase_units: [{
          description: "LEVEL-UP gear",
          amount: {
            currency_code: "EUR",
            value: total,
            breakdown: { item_total: { currency_code: "EUR", value: total } }
          },
          items: lines.map((line) => ({
            name: `${line.item.name}${line.size ? ` (${line.size})` : ""}`,
            unit_amount: { currency_code: "EUR", value: line.item.price.toFixed(2) },
            quantity: String(line.qty),
            category: "PHYSICAL_GOODS"
          }))
        }]
      });
    },

    onApprove: async (data, actions) => {
      const lines = cartLines();
      const details = await actions.order.capture();
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
        total: lines.reduce((sum, line) => sum + line.item.price * line.qty, 0)
      };

      const player = LevelUp.getPlayer();
      notifyOwner(order, details, player); // the order email goes out even if the XP server is down
      let reward;
      try {
        reward = await LevelUp.recordPurchase(order);
      } catch (err) {
        console.error("Recording the order failed:", err);
        reward = { guest: !player, xp: LevelUp.orderXp(order.total), failed: true };
      }

      cart = [];
      saveCart();
      closeBag();
      renderAll();
      showLoot(order, reward);
    },

    onError: (err) => {
      console.error("PayPal error:", err);
      bagStatus.textContent = "Something went wrong with the payment. Nothing was charged. Please try again.";
    }
  }).render("#paypal-button-container");
}

// Sends the order to the LEVEL-UP inbox. The buyer gets an automatic confirmation.
function notifyOwner(order, details, player) {
  const payer = details.payer || {};
  const name = [payer.name?.given_name, payer.name?.surname].filter(Boolean).join(" ") || "LEVEL-UP player";
  const shipping = details.purchase_units?.[0]?.shipping;
  const address = shipping?.address
    ? [
        shipping.name?.full_name,
        shipping.address.address_line_1,
        shipping.address.address_line_2,
        [shipping.address.postal_code, shipping.address.admin_area_2].filter(Boolean).join(" "),
        shipping.address.country_code
      ].filter(Boolean).join(", ")
    : "Not provided";
  const itemsText = order.items
    .map((item) => `${item.qty}× ${item.name}${item.size ? ` (size ${item.size})` : ""}: ${euro(item.price * item.qty)}`)
    .join("\n");

  fetch(`https://formsubmit.co/ajax/${OWNER_EMAIL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: `New LEVEL-UP order (${euro(order.total)})`,
      _template: "table",
      _autoresponse: `Thanks for your order, ${name}! We received your payment for:\n\n${itemsText}\n\nTotal: ${euro(order.total)}\nOrder ID: ${order.id}\n\nWe'll contact you soon to arrange delivery or pickup.\n\nKeep leveling up!\nThe LEVEL-UP team`,
      name,
      email: payer.email_address || "",
      order_id: order.id,
      items: itemsText,
      total: euro(order.total),
      shipping_address: address,
      player: player ? `${player.name} (LVL ${LevelUp.levelFromXp(player.xp)})` : "Guest"
    })
  }).catch((error) => console.error("Order email failed:", error));
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
    <h2 class="auth-title" id="lootTitle">Loot acquired!</h2>
    <ul class="loot-items">${itemsHtml}</ul>
    <p class="loot-total">Total paid <strong>${euro(order.total)}</strong></p>
    ${rewardHtml}
    <p class="auth-note">A confirmation is on its way to your email. We'll contact you about delivery or pickup.</p>`;
  lootDialog.showModal();
}

lootDialog.querySelector("[data-close]").addEventListener("click", () => lootDialog.close());
lootDialog.addEventListener("click", (event) => {
  if (event.target === lootDialog) lootDialog.close();
  if (event.target.closest("[data-auth-open]")) lootDialog.close();
});

// ---------- Init ----------
document.addEventListener("levelup:change", renderAll);
renderAll();
