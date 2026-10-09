// LEVEL-UP chat: private conversations between a player and a coach.
// The list of conversations on the left (phones: first screen), the open conversation on the right.
// New messages: checked every 3 s while a conversation is open (and right away when a push comes in).

const root = document.getElementById("chatRoot");
const { esc } = LevelUp;

const SEND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 11.5 21 4l-6.5 17-3-7.5z"/><path d="m11.5 13.5 4-4"/></svg>';
const BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 5l-7 7 7 7"/></svg>';

const state = {
  threads: null,      // chat_list rows (null = loading)
  active: null,       // the open conversation (chat_thread result without messages)
  messages: [],
  lastId: 0,
  pending: [],        // sent by me, waiting for the server
  error: "",
  listTimer: null,
  threadTimer: null
};

const params = new URLSearchParams(location.search);
// The messages box is skipped by the translator (people's own words), so its few labels go through t()
const LevelUp_t = (s) => (window.t ? window.t(s) : s);
const isPhone = () => window.matchMedia("(max-width: 760px)").matches;
const sameDay = (a, b) => a.toDateString() === b.toDateString();

function timeLabel(at) {
  return new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(at) {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function listTime(at) {
  const d = new Date(at);
  if (sameDay(d, new Date())) return timeLabel(at);
  if (Date.now() - d < 6 * 864e5) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// The other person's photo: a coach's team photo, else their profile photo or first letter
function peerAvatar(peer, size = "") {
  const coach = peer.trainerId ? LevelUp.trainerById(peer.trainerId) : null;
  const photo = coach && !coach.dynamic ? coach.img : peer.avatarUrl;
  if (photo) return `<span class="avatar has-photo ${size}" aria-hidden="true"><img src="${esc(photo)}" alt="" loading="lazy" decoding="async"></span>`;
  return LevelUp.avatarHtml({ name: peer.name, xp: 0 }, size);
}
function peerRole(peer) {
  const coach = peer.trainerId ? LevelUp.trainerById(peer.trainerId) : null;
  return coach?.role || peer.role || "";
}
const peerName = (peer) => (peer.trainerId ? LevelUp.trainerById(peer.trainerId)?.name : null) || peer.name || "";

// ---------- Rendering ----------
function renderLoggedOut() {
  root.innerHTML = `
    <section class="no-save pixel-frame chat-locked">
      <span class="chat-locked-ico">${LevelUp.CHAT_ICON}</span>
      <p class="section-kicker">Chat</p>
      <h1 class="section-title">Talk to your coach</h1>
      <p>Log in to send your coach a message: questions about a session, your plan or your progress.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-auth-open="login">Log in</button>
        <button type="button" class="btn btn-ghost" data-auth-open="signup">Create your profile</button>
      </div>
    </section>`;
}

function render() {
  const player = LevelUp.getPlayer();
  if (!LevelUp.isReady()) return;
  if (!player) { stopTimers(); renderLoggedOut(); return; }
  if (!root.querySelector(".chat-app")) {
    root.innerHTML = `
      <div class="chat-app pixel-frame">
        <aside class="chat-list" aria-label="Conversations">
          <header class="chat-list-head">
            <p class="section-kicker">Messages</p>
            <h1>Chat</h1>
          </header>
          <div class="chat-threads" id="chatThreads"></div>
        </aside>
        <section class="chat-thread" id="chatThread" aria-live="polite"></section>
      </div>`;
  }
  renderList();
  renderThread();
  root.querySelector(".chat-app").classList.toggle("show-thread", Boolean(state.active));
}

function renderList() {
  const box = document.getElementById("chatThreads");
  if (!box) return;
  if (state.threads === null) { box.innerHTML = `<p class="chat-empty muted">Loading…</p>`; return; }
  const rows = state.threads.map((t) => `
    <a href="?t=${esc(t.id)}" class="chat-row ${state.active?.id === t.id ? "active" : ""} ${t.unread ? "unread" : ""}" data-thread="${esc(t.id)}">
      ${peerAvatar(t)}
      <span class="chat-row-main">
        <span class="chat-row-top"><b data-no-i18n>${esc(peerName(t))}</b><time>${t.lastBody ? listTime(t.lastAt) : ""}</time></span>
        <span class="chat-row-last">${t.lastBody
          ? `${t.lastMine ? `<i>You:</i> ` : ""}<span data-no-i18n>${esc(t.lastBody)}</span>`
          : `<em>${esc(peerRole(t))}</em>`}</span>
      </span>
      ${t.unread ? `<span class="chat-row-badge">${t.unread > 9 ? "9+" : t.unread}</span>` : ""}
    </a>`).join("");
  box.innerHTML = LevelUp.pushCalloutHtml("Get a notification on this phone when a message comes in.") + rows + startHtml();
}

// Coaches you can start a conversation with (players only)
function startHtml() {
  const player = LevelUp.getPlayer();
  const have = new Set((state.threads || []).filter((t) => t.side === "client").map((t) => t.trainerId));
  const coaches = LevelUp.TRAINERS.filter((t) => t.linked !== false && t.id !== player?.trainerId && !have.has(t.id));
  const coachSide = LevelUp.isTrainer() && !(state.threads || []).some((t) => t.side === "trainer");
  if (!coaches.length && !coachSide && state.threads.length) return "";
  return `
    <div class="chat-start">
      ${!state.threads.length ? `<p class="chat-empty">No conversations yet.</p>` : ""}
      ${coachSide ? `<p class="chat-empty muted">When a client sends you a message, it shows up here.</p>` : ""}
      ${coaches.length ? `<p class="chat-start-title">Start a chat</p>
        ${coaches.map((c) => `
          <button type="button" class="chat-row chat-row-new" data-start="${esc(c.id)}">
            ${peerAvatar({ trainerId: c.id, name: c.name })}
            <span class="chat-row-main"><span class="chat-row-top"><b data-no-i18n>${esc(c.name)}</b></span><span class="chat-row-last"><em>${esc(c.role || "Personal trainer")}</em></span></span>
            <span class="chat-row-plus" aria-hidden="true">+</span>
          </button>`).join("")}` : ""}
    </div>`;
}

function renderThread() {
  const box = document.getElementById("chatThread");
  if (!box) return;
  const t = state.active;
  if (!t) {
    box.innerHTML = `
      <div class="chat-placeholder">
        <span class="chat-placeholder-ico">${LevelUp.CHAT_ICON}</span>
        <p>Pick a conversation or start one with your coach.</p>
      </div>`;
    return;
  }
  const coach = t.trainerId ? LevelUp.trainerById(t.trainerId) : null;
  if (!box.querySelector(".chat-messages") || box.dataset.openThread !== t.id) {
    box.dataset.openThread = t.id;
    box.innerHTML = `
      <header class="chat-head">
        <a href="chat.html" class="chat-back" data-back aria-label="All conversations">${BACK_ICON}</a>
        ${peerAvatar(t)}
        <div class="chat-head-info">
          <b data-no-i18n>${esc(peerName(t))}</b>
          <span>${esc(peerRole(t))}</span>
        </div>
        ${coach && t.side === "client" ? `<a href="index.html#schedule" class="btn btn-small btn-primary chat-book" data-book-link="${esc(coach.id)}">Book</a>` : ""}
      </header>
      <div class="chat-messages" id="chatMessages" data-no-i18n></div>
      <form class="chat-compose" id="chatCompose">
        <label class="sr-only" for="chatInput">Message</label>
        <textarea id="chatInput" rows="1" maxlength="2000" placeholder="Write a message…" autocomplete="off"></textarea>
        <button type="submit" class="chat-send" aria-label="Send">${SEND_ICON}</button>
      </form>`;
    const input = box.querySelector("#chatInput");
    input.addEventListener("input", () => grow(input));
    input.addEventListener("keydown", (event) => {
      // Computer: Enter sends, Shift+Enter = new line. Phone: the send button sends.
      if (event.key === "Enter" && !event.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
        event.preventDefault();
        box.querySelector("#chatCompose").requestSubmit();
      }
    });
    box.querySelector("#chatCompose").addEventListener("submit", onSend);
    if (!isPhone()) input.focus();
  }
  renderMessages();
}

function grow(input) {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

function renderMessages() {
  const list = document.getElementById("chatMessages");
  if (!list) return;
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const all = [...state.messages, ...state.pending];
  if (!all.length) {
    const first = peerName(state.active).split(" ")[0];
    list.innerHTML = `<p class="chat-hello">${esc(LevelUp_t(`Say hi to ${first} 👋`))}<br><small>${esc(LevelUp_t("Only the two of you can read this chat."))}</small></p>`;
    return;
  }
  const lastMineRead = [...state.messages].reverse().find((m) => m.mine && m.id <= state.active.peerReadId);
  let html = "";
  let prev = null;
  all.forEach((m, i) => {
    const at = new Date(m.at);
    if (!prev || !sameDay(new Date(prev.at), at)) html += `<p class="chat-day"><span>${esc(LevelUp_t(dayLabel(m.at)))}</span></p>`;
    const next = all[i + 1];
    const groupEnd = !next || next.mine !== m.mine || new Date(next.at) - at > 5 * 60e3;
    html += `
      <div class="chat-msg ${m.mine ? "mine" : "theirs"} ${groupEnd ? "end" : ""} ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""}">
        <p>${esc(m.body)}</p>
        ${groupEnd ? `<span class="chat-meta">${timeLabel(m.at)}${m.failed ? ` · ${esc(LevelUp_t("Not sent"))}` : ""}${lastMineRead && m.id === lastMineRead.id ? ` · ${esc(LevelUp_t("Seen"))}` : ""}</span>` : ""}
      </div>`;
    prev = m;
  });
  list.innerHTML = html;
  if (nearBottom || list.dataset.scrolled !== "1") {
    list.scrollTop = list.scrollHeight;
    list.dataset.scrolled = "1";
  }
}

// ---------- Data ----------
async function loadList() {
  try {
    state.threads = await LevelUp.chatList();
  } catch (err) {
    state.threads = state.threads || [];
    console.error(err);
  }
  renderList();
}

async function openThread(id, { push = true } = {}) {
  if (!id) return;
  try {
    const data = await LevelUp.chatThread(id, 0);
    state.active = { ...data, messages: undefined };
    state.messages = data.messages || [];
    state.pending = [];
    state.lastId = state.messages.at(-1)?.id || 0;
    LevelUp.setChatActive(id);
    if (push && params.get("t") !== id) history.pushState({ t: id }, "", `chat.html?t=${encodeURIComponent(id)}`);
    const row = state.threads?.find((t) => t.id === id);
    if (row) row.unread = 0;
    render();
    LevelUp.refreshChatUnread();
    startThreadTimer();
  } catch (err) {
    alert(err.message);
    closeThread();
  }
}

function closeThread({ push = true } = {}) {
  state.active = null;
  state.messages = [];
  state.pending = [];
  LevelUp.setChatActive(null);
  clearInterval(state.threadTimer);
  if (push && location.search) history.pushState({}, "", "chat.html");
  render();
  loadList();
}

let polling = false;
async function poll() {
  if (!state.active || polling || document.visibilityState !== "visible") return;
  polling = true;
  try {
    const data = await LevelUp.chatThread(state.active.id, state.lastId);
    const fresh = (data.messages || []).filter((m) => !state.messages.some((x) => x.id === m.id));
    const readChanged = data.peerReadId !== state.active.peerReadId;
    state.active.peerReadId = data.peerReadId;
    if (fresh.length) {
      state.messages.push(...fresh);
      state.lastId = state.messages.at(-1).id;
      LevelUp.refreshChatUnread();
      loadList();
    }
    if (fresh.length || readChanged) renderMessages();
  } catch (err) {
    console.warn("Chat refresh failed:", err.message);
  }
  polling = false;
}

function startThreadTimer() {
  clearInterval(state.threadTimer);
  state.threadTimer = setInterval(poll, 3000);
}
function stopTimers() {
  clearInterval(state.threadTimer);
  clearInterval(state.listTimer);
}

async function onSend(event) {
  event.preventDefault();
  const input = document.getElementById("chatInput");
  const body = input.value.trim();
  if (!body || !state.active) return;
  const temp = { id: `p${Date.now()}`, mine: true, body, at: new Date().toISOString(), pending: true };
  state.pending.push(temp);
  input.value = "";
  grow(input);
  renderMessages();
  document.getElementById("chatMessages").scrollTop = 1e9;
  try {
    const msg = await LevelUp.chatSend(state.active.id, body);
    state.pending = state.pending.filter((m) => m !== temp);
    if (!state.messages.some((m) => m.id === msg.id)) state.messages.push(msg);
    state.messages.sort((a, b) => a.id - b.id);
    state.lastId = Math.max(state.lastId, msg.id);
    renderMessages();
    loadList();
  } catch (err) {
    temp.pending = false;
    temp.failed = true;
    renderMessages();
    if (!input.value) input.value = body; // keep the text so it can be sent again
    grow(input);
    LevelUp.toast({ title: "Message not sent", text: err.message, icon: "!", tone: "gold" });
  }
}

// ---------- Events ----------
root.addEventListener("click", async (event) => {
  const row = event.target.closest("[data-thread]");
  if (row) {
    event.preventDefault();
    openThread(row.dataset.thread);
    return;
  }
  const start = event.target.closest("[data-start]");
  if (start) {
    start.disabled = true;
    try {
      const id = await LevelUp.chatOpen(start.dataset.start);
      await loadList();
      openThread(id);
    } catch (err) {
      alert(err.message);
      start.disabled = false;
    }
    return;
  }
  if (event.target.closest("[data-back]")) {
    event.preventDefault();
    closeThread();
  }
});

window.addEventListener("popstate", () => {
  const id = new URLSearchParams(location.search).get("t");
  if (id) openThread(id, { push: false });
  else closeThread({ push: false });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { poll(); loadList(); }
});
// A new message anywhere (the unread check in game.js): refresh the list, and the open conversation
document.addEventListener("levelup:chat", (event) => { if (event.detail?.unread) { loadList(); poll(); } });

let started = false;
async function start() {
  render();
  if (!LevelUp.isReady() || !LevelUp.getPlayer() || started) return;
  started = true;
  await loadList();
  // chat.html?coach=pieter (the Chat button on a coach card) or ?t=<conversation> (a notification)
  const coach = params.get("coach");
  if (coach) {
    try {
      const id = await LevelUp.chatOpen(coach);
      history.replaceState({ t: id }, "", `chat.html?t=${encodeURIComponent(id)}`);
      await loadList();
      openThread(id, { push: false });
    } catch (err) {
      alert(err.message);
      history.replaceState({}, "", "chat.html");
    }
  } else if (params.get("t")) {
    openThread(params.get("t"), { push: false });
  } else if (!isPhone() && state.threads?.length) {
    openThread(state.threads[0].id, { push: false });
  }
  state.listTimer = setInterval(() => { if (document.visibilityState === "visible" && !state.active) loadList(); }, 15000);
}

document.addEventListener("levelup:change", () => {
  if (!LevelUp.getPlayer()) { started = false; state.threads = null; state.active = null; }
  start();
});
start();
