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
  threadTimer: null,
  search: "",         // the member search box
  results: null,      // chat_search rows (null = searching)
  searchSeq: 0
};
const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';

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
  if (peer.group) return `<span class="avatar group-avatar ${size}" aria-hidden="true">👥</span>`;
  const coach = peer.trainerId ? LevelUp.trainerById(peer.trainerId) : null;
  const photo = peer.avatarUrl || (coach && !coach.dynamic ? coach.img : null); // a coach: the photo of their page, else their card
  if (photo) return `<span class="avatar has-photo ${size}" aria-hidden="true"><img src="${esc(photo)}" alt="" loading="lazy" decoding="async"${coach && size === "head" ? ` data-coach="${esc(coach.id)}"` : ""}></span>`;
  return LevelUp.avatarHtml({ name: peer.name, xp: 0 }, size);
}
function peerRole(peer) {
  if (peer.group) {
    // one chat per kind of group class; the next class of the group shows when there is one
    const next = peer.next ? new Date(peer.next).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    return `Group chat · ${peer.members} member${peer.members === 1 ? "" : "s"}${next ? ` · next: ${next}` : ""}`;
  }
  const coach = peer.trainerId ? LevelUp.trainerById(peer.trainerId) : null;
  return coach?.role || peer.role || "";
}
const peerName = (peer) => peer.group ? peer.title || peer.name || ""
  : (peer.trainerId ? LevelUp.trainerById(peer.trainerId)?.name : null) || peer.name || "";

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
            <label class="chat-search">${SEARCH_ICON}<span class="sr-only">Search a member</span>
              <input type="search" id="chatSearch" placeholder="Search a member by name…" autocomplete="off" enterkeyhint="search">
            </label>
          </header>
          <div class="chat-threads" id="chatThreads"></div>
        </aside>
        <section class="chat-thread" id="chatThread" aria-live="polite"></section>
      </div>`;
  }
  // first show the conversation (on a phone it replaces the list), then fill it: a hidden list can't scroll to its end
  root.querySelector(".chat-app").classList.toggle("show-thread", Boolean(state.active));
  renderList();
  renderThread();
}

function renderList() {
  const box = document.getElementById("chatThreads");
  if (!box) return;
  if (state.threads === null) { box.innerHTML = `<p class="chat-empty muted">Loading…</p>`; return; }
  if (state.search.trim().length >= 2) { box.innerHTML = searchHtml(); return; }
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

// Members found by name: tap one to open (or start) the conversation
function searchHtml() {
  if (state.results === null) return `<p class="chat-empty muted">Searching…</p>`;
  if (!state.results.length) return `<p class="chat-empty muted">No members found with that name.</p>`;
  return `<p class="chat-start-title">Members</p>` + state.results.map((r) => `
    <button type="button" class="chat-row chat-row-new" data-user="${esc(r.userId)}">
      ${peerAvatar(r)}
      <span class="chat-row-main"><span class="chat-row-top"><b data-no-i18n>${esc(peerName(r))}</b></span><span class="chat-row-last"><em>${esc(peerRole(r))}</em></span></span>
      <span class="chat-row-plus" aria-hidden="true">›</span>
    </button>`).join("");
}

let searchTimer = null;
function onSearch(value) {
  state.search = value;
  clearTimeout(searchTimer);
  if (value.trim().length < 2) { state.results = null; renderList(); return; }
  state.results = null;
  renderList();
  const seq = ++state.searchSeq;
  searchTimer = setTimeout(async () => {
    try {
      const rows = await LevelUp.chatSearch(value.trim());
      if (seq !== state.searchSeq) return;
      state.results = rows || [];
    } catch (err) {
      if (seq !== state.searchSeq) return;
      state.results = [];
      console.warn(err.message);
    }
    renderList();
  }, 250);
}
function clearSearch() {
  const input = document.getElementById("chatSearch");
  if (input) input.value = "";
  state.search = "";
  state.results = null;
  renderList();
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
        <span class="chat-head-who" ${t.group ? "" : t.trainerId ? `data-profile-trainer="${esc(t.trainerId)}"` : t.userId ? `data-profile="${esc(t.userId)}"` : ""}>
        ${peerAvatar(t, "head")}
        <div class="chat-head-info">
          <b data-no-i18n>${esc(peerName(t))}</b>
          <span>${esc(peerRole(t))}</span>
        </div>
        </span>
        ${coach && t.side === "client" ? `<a href="index.html#schedule" class="btn btn-small btn-primary chat-book" data-book-link="${esc(coach.id)}">Book</a>` : ""}
        ${t.group ? `<button type="button" class="chat-tool ${t.muted ? "off" : ""}" data-chat-mute title="${t.muted ? "Notifications are off for this group. Tap to turn them on." : "Turn off notifications for this group"}" aria-pressed="${Boolean(t.muted)}" aria-label="${t.muted ? "Turn on notifications for this group" : "Turn off notifications for this group"}">${t.muted ? "🔕" : "🔔"}</button>
        ${t.canDelete ? `<button type="button" class="chat-tool" data-chat-delete title="Delete this group chat" aria-label="Delete this group chat">🗑</button>` : ""}
        <a href="index.html#schedule" class="btn btn-small btn-ghost chat-book">Classes</a>` : ""}
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

// The heart on a message: tap one from someone else to like it (again = take it back); your own show their count
function heartHtml(m) {
  if (m.pending || m.failed || !m.id) return "";
  const n = Number(m.likes) || 0;
  if (m.mine) return n ? `<span class="chat-heart on" aria-label="${n} like${n === 1 ? "" : "s"}"><span aria-hidden="true">♥</span>${n > 1 ? n : ""}</span>` : "";
  return `<button type="button" class="chat-heart ${m.liked ? "on" : ""} ${n ? "has" : ""}" data-chat-like="${m.id}" aria-pressed="${Boolean(m.liked)}"
    aria-label="${esc(LevelUp_t(m.liked ? "Unlike this message" : "Like this message"))}"><span aria-hidden="true">♥</span>${n > 1 || (n === 1 && !m.liked) ? n : ""}</button>`;
}
// Fresh counts for an open chat (the other person liked or took a like back)
function applyHearts(list) {
  const map = new Map((list || []).map((h) => [Number(h.id), h]));
  let changed = false;
  state.messages.forEach((m) => {
    const h = map.get(Number(m.id));
    const likes = h ? Number(h.n) : 0, liked = h ? Boolean(h.mine) : false;
    if ((Number(m.likes) || 0) !== likes || Boolean(m.liked) !== liked) { m.likes = likes; m.liked = liked; changed = true; }
  });
  return changed;
}
async function likeMessage(id) {
  const m = state.messages.find((x) => Number(x.id) === Number(id));
  if (!m || m.mine || m.liking) return;
  m.liking = true;
  const before = { likes: Number(m.likes) || 0, liked: Boolean(m.liked) };
  m.liked = !before.liked;                         // show it right away
  m.likes = Math.max(0, before.likes + (m.liked ? 1 : -1));
  renderMessages();
  try {
    const r = await LevelUp.chatLike(m.id);
    m.likes = Number(r.likes) || 0;
    m.liked = Boolean(r.liked);
  } catch (err) {
    Object.assign(m, before);
    LevelUp.toast({ title: LevelUp_t("That didn't work"), text: err.message, icon: "!" });
  }
  m.liking = false;
  renderMessages();
}

function renderMessages() {
  const list = document.getElementById("chatMessages");
  if (!list) return;
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const all = [...state.messages, ...state.pending];
  if (!all.length) {
    if (state.active.group) {
      list.innerHTML = `<p class="chat-hello">${esc(LevelUp_t("Say hi to the group 👋"))}<br><small>${esc(LevelUp_t("Everyone who joins a class of this group is in this chat, with the trainer. It stays open between classes."))}</small></p>`;
      return;
    }
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
    const groupEnd = !next || next.mine !== m.mine || next.name !== m.name || new Date(next.at) - at > 5 * 60e3;
    // class chat: the sender's name above the first of their messages
    const showName = state.active.group && !m.mine && (!prev || prev.mine || prev.name !== m.name || at - new Date(prev.at) > 5 * 60e3);
    html += `
      <div class="chat-msg ${m.mine ? "mine" : "theirs"} ${groupEnd ? "end" : ""} ${m.coach ? "coach" : ""} ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""}">
        ${showName ? `<span class="chat-from" ${m.userId ? `data-profile="${esc(m.userId)}"` : ""}>${esc(m.name)}${m.coach ? ` · ${esc(LevelUp_t("Coach"))}` : ""}</span>` : ""}
        <div class="chat-line"><p>${esc(m.body)}</p>${heartHtml(m)}</div>
        ${groupEnd ? `<span class="chat-meta">${timeLabel(m.at)}${m.failed ? ` · ${esc(LevelUp_t("Not sent"))}` : ""}${lastMineRead && m.id === lastMineRead.id ? ` · ${esc(LevelUp_t("Seen"))}` : ""}</span>` : ""}
      </div>`;
    prev = m;
  });
  list.innerHTML = html;
  if (nearBottom || list.dataset.scrolled !== "1") scrollToEnd();
}

// Go to the newest message. Opening a chat always lands here, not at its first message.
function scrollToEnd() {
  const list = document.getElementById("chatMessages");
  if (!list) return;
  list.scrollTop = list.scrollHeight;
  // a newest message that is taller than the screen (the coach's welcome) starts at its first line, not its last
  const last = [...list.querySelectorAll(".chat-msg")].pop();
  if (last && list.clientHeight && last.offsetHeight > list.clientHeight) {
    list.scrollTop = Math.max(0, last.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 8);
  }
  if (list.clientHeight) list.dataset.scrolled = "1"; // only counts once the list is on screen
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
    scrollToEnd();
    requestAnimationFrame(scrollToEnd); // once more after the layout settled (fonts, the keyboard on a phone)
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
    const heartsChanged = !state.messages.some((m) => m.liking) && applyHearts(data.hearts);
    if (fresh.length) {
      state.messages.push(...fresh);
      state.lastId = state.messages.at(-1).id;
      LevelUp.refreshChatUnread();
      loadList();
    }
    if (fresh.length || readChanged || heartsChanged) renderMessages();
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
  const user = event.target.closest("[data-user]");
  if (user) {
    user.disabled = true;
    try {
      const id = await LevelUp.chatOpenUser(user.dataset.user);
      clearSearch();
      await loadList();
      openThread(id);
    } catch (err) {
      alert(err.message);
      user.disabled = false;
    }
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
    return;
  }
  const heart = event.target.closest("[data-chat-like]");
  if (heart) { likeMessage(heart.dataset.chatLike); return; }
  // Group chat: notifications off / on for yourself
  const mute = event.target.closest("[data-chat-mute]");
  if (mute && state.active) {
    mute.disabled = true;
    try {
      await LevelUp.chatMute(state.active.id, !state.active.muted);
      state.active.muted = !state.active.muted;
      LevelUp.toast({ title: state.active.muted ? "Notifications off" : "Notifications on", text: state.active.muted ? "You won't get notifications from this group." : "You get notifications from this group again.", icon: state.active.muted ? "🔕" : "🔔", tone: "green" });
      render();
      LevelUp.refreshChatUnread();
    } catch (err) {
      mute.disabled = false;
      alert(err.message);
    }
    return;
  }
  // Group chat: only an admin can delete it (with all its messages)
  const del = event.target.closest("[data-chat-delete]");
  if (del && state.active) {
    if (!confirm(LevelUp_t(`Delete the group chat "${peerName(state.active)}" with all its messages for everyone? This can't be undone. A new class with this name starts a fresh chat.`))) return;
    del.disabled = true;
    try {
      await LevelUp.chatGroupDelete(state.active.id);
      closeThread();
    } catch (err) {
      del.disabled = false;
      alert(err.message);
    }
  }
});

root.addEventListener("input", (event) => {
  if (event.target.id === "chatSearch") onSearch(event.target.value);
});
root.addEventListener("keydown", (event) => {
  if (event.target.id === "chatSearch" && event.key === "Escape") clearSearch();
});

window.addEventListener("popstate", () => {
  const id = new URLSearchParams(location.search).get("t");
  if (id) openThread(id, { push: false });
  else closeThread({ push: false });
});

// Back in the app: fetch what came in meanwhile and show the newest message
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible") return;
  const before = state.lastId;
  loadList();
  await poll();
  if (state.lastId !== before) scrollToEnd();
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

// Double tap (or double click) on someone's message gives it a heart
root.addEventListener("dblclick", (event) => {
  const heart = event.target.closest(".chat-msg.theirs")?.querySelector("[data-chat-like]:not(.on)");
  if (heart) likeMessage(heart.dataset.chatLike);
});
