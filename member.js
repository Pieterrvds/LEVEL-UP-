// LEVEL-UP member page: what you see of another member or a coach.
// member.html?u=<user id> or member.html?trainer=<trainer id>; without either it shows your own page.
// A coach's page also has their calendar: the board and booking window come from schedule.js.

(() => {
  const { ACHIEVEMENTS, RANKS, esc } = LevelUp;
  const hero = document.getElementById("mpHero");
  const body = document.getElementById("mpBody");
  const book = document.getElementById("book");
  const params = new URLSearchParams(location.search);
  const tr = (text) => (window.t ? window.t(text) : text); // Dutch/English for confirm()

  let who = params.get("trainer") ? { trainerId: params.get("trainer") } : params.get("u") ? { userId: params.get("u") } : null;
  let page = null;       // the page as the server gave it
  let loadedFor = null;  // who was logged in when it loaded (log in or out = load again)
  let failed = "";
  const openAll = new Set(); // photos whose comments are all shown

  const when = (value) => new Date(value).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const day = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const monthYear = (value) => new Date(value).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  function ago(value) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(value)) / 60000));
    if (mins < 1) return "now";
    if (mins < 60) return `${mins} min`;
    if (mins < 1440) return `${Math.floor(mins / 60)} h`;
    if (mins < 7 * 1440) return `${Math.floor(mins / 1440)} d`;
    return day(value);
  }
  const person = (c) => c.trainerId ? `data-profile-trainer="${esc(c.trainerId)}"` : `data-profile="${esc(c.userId)}"`;

  // ---------- Loading ----------
  async function load() {
    const player = LevelUp.getPlayer();
    loadedFor = player?.id || "";
    failed = "";
    let target = who;
    if (!target && player) target = player.trainerId ? { trainerId: player.trainerId } : { userId: player.id };
    if (!target || (!target.trainerId && !player)) { page = null; failed = "login"; render(); return; }
    try {
      page = await LevelUp.publicProfile(target);
    } catch (err) {
      page = null;
      failed = err.message;
    }
    render();
    if (page && location.hash.startsWith("#photo-")) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }

  // ---------- Rendering ----------
  function render() {
    if (!LevelUp.isReady()) return;
    if (!page) {
      book.hidden = true;
      body.innerHTML = "";
      hero.innerHTML = failed === "login" ? `
        <section class="no-save pixel-frame mp-gate">
          <p class="section-kicker">Players</p>
          <h1 class="section-title">Log in to see this player</h1>
          <p>Members see each other's level, photos and group classes. Create your profile or log in.</p>
          <div class="btn-row"><button type="button" class="btn btn-primary" data-auth-open="signup">New player</button>
            <button type="button" class="btn btn-ghost" data-auth-open="login">Log in</button></div>
        </section>` : `
        <section class="no-save pixel-frame mp-gate">
          <p class="section-kicker">Players</p>
          <h1 class="section-title">Page not found</h1>
          <p>${esc(failed || "This page doesn't exist.")}</p>
          <div class="btn-row"><a class="btn btn-primary" href="index.html#highScores">To the high scores</a></div>
        </section>`;
      return;
    }
    renderHero();
    renderBody();
    renderBook();
  }

  function renderHero() {
    const d = page;
    const coach = d.trainerId ? LevelUp.trainerById(d.trainerId) : null;
    const photo = coach && !coach.dynamic ? coach.img : d.avatarUrl;
    const prog = d.xp != null ? LevelUp.progress(d.xp) : null;
    const first = String(d.name || "").split(" ")[0];
    const likes = Number(d.likes) || 0;
    const tier = prog ? RANKS.indexOf(prog.rank) : 0;
    document.title = `${d.name} | LEVEL-UP`;
    const chips = [
      d.place ? `<span>🏆 #${d.place} on the high scores</span>` : "",
      d.streak ? `<span>🔥 ${d.streak}-week streak</span>` : "",
      d.potmWins ? `<span>👑 Player of the Month${d.potmWins > 1 ? ` ×${d.potmWins}` : ""}</span>` : "",
      d.since ? `<span>${d.trainerId ? "Coach" : "Player"} since ${monthYear(d.since)}</span>` : ""
    ].filter(Boolean).join("");
    hero.innerHTML = `
      <section class="mp-hero" data-tier="${tier}">
        <div class="mp-cover" aria-hidden="true"></div>
        <div class="container mp-hero-in">
          <span class="mp-avatar ${photo ? "has-photo" : ""}">${photo ? `<img src="${esc(photo)}" alt="">` : esc(first.charAt(0).toUpperCase())}</span>
          <div class="mp-id">
            <p class="mp-kicker">${d.trainerId ? `Coach · ${esc(d.role || "Personal trainer")}` : "Player"}</p>
            <h1 class="mp-name" data-no-i18n>${esc(d.name)}</h1>
            ${prog ? `<p class="mp-rank"><span class="rank-badge" data-tier="${tier}">${prog.rank.title}</span> <b>LVL ${prog.level}</b></p>
              <div class="xp-bar mp-xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${prog.needed}" aria-valuenow="${prog.into}" aria-label="XP to next level"><i style="width:${prog.pct.toFixed(1)}%"></i></div>
              <p class="mp-xp">${prog.into} / ${prog.needed} XP · ${prog.toNext} XP to LVL ${prog.level + 1}</p>` : ""}
            ${chips ? `<p class="mp-chips">${chips}</p>` : ""}
          </div>
          <div class="mp-actions">
            ${d.isMe ? `<a class="btn btn-primary" href="profile.html#mypage">✎ Edit my page</a>` : `
              ${d.trainerId ? `<a class="btn btn-primary" href="#book">Book ${esc(first)} ▸</a>` : ""}
              ${d.linked === false ? "" : `<button type="button" class="btn ${d.trainerId ? "btn-ghost" : "btn-primary"}" data-mp-chat>💬 Chat</button>`}
              ${d.canLike || (!LevelUp.getPlayer() && d.trainerId) ? `<button type="button" class="btn btn-ghost mp-like ${d.liked ? "liked" : ""}" data-mp-like aria-pressed="${Boolean(d.liked)}"><span aria-hidden="true">♥</span> ${d.liked ? "Liked" : "Like"}${likes ? ` · ${likes}` : ""}</button>` : ""}`}
          </div>
        </div>
      </section>
      ${d.isMe ? `<p class="container mp-note">This is how other members see your page.</p>` : ""}
      ${d.private ? `<p class="container mp-note">🔒 ${esc(first)} keeps their page private.</p>` : ""}
      <p class="container form-error" role="alert" id="mpError"></p>`;
  }

  function classRow(c, coachList) {
    const known = Boolean(LevelUp.classById(c.id));
    const label = c.mine ? (page.isMe ? "Signed up ✓" : "You're going too ✓") : coachList ? "Sign up →" : "Join too →";
    const inner = `<b data-no-i18n>${esc(c.title)}</b><span>${when(c.startsAt)}${coachList ? ` · ${c.taken}/${c.capacity}` : ""}</span><small class="${c.mine ? "in" : ""}">${label}</small>`;
    return known ? `<li><button type="button" data-mp-class="${esc(c.id)}">${inner}</button></li>` : `<li><a href="index.html#schedule">${inner}</a></li>`;
  }

  function activityRow(a) {
    const ach = a.kind === "achievement" ? ACHIEVEMENTS.find((x) => x.id === a.text) : null;
    if (a.kind === "achievement" && !ach) return "";
    const [icon, text] = a.kind === "class" ? ["👥", `Did <b data-no-i18n>${esc(a.text)}</b>`]
      : a.kind === "achievement" ? [ach.icon, `Unlocked <b>${esc(ach.title)}</b>`]
      : a.kind === "photo" ? ["📸", `Posted a photo${a.text ? `: <span data-no-i18n>“${esc(a.text)}”</span>` : ""}`]
      : ["👑", `Player of the Month <b>${esc(a.text)}</b>`];
    return `<li><span class="mp-act-ico" aria-hidden="true">${icon}</span><span>${text}</span><small>${day(a.date)}</small></li>`;
  }

  function photoCard(ph) {
    const player = LevelUp.getPlayer();
    const all = openAll.has(ph.id);
    const comments = all ? ph.comments : ph.comments.slice(-3);
    const hidden = ph.commentCount - comments.length;
    return `
      <article class="mp-photo" id="photo-${esc(ph.id)}" data-photo="${esc(ph.id)}">
        <button type="button" class="mp-photo-img" data-mp-zoom aria-label="Open this photo"><img src="${esc(ph.url)}" alt="${esc(ph.caption || "")}" loading="lazy"></button>
        <div class="mp-photo-body">
          ${ph.caption ? `<p class="mp-caption" data-no-i18n>${esc(ph.caption)}</p>` : ""}
          <div class="mp-photo-bar">
            <button type="button" class="mp-heart ${ph.liked ? "liked" : ""}" data-mp-photo-like aria-pressed="${Boolean(ph.liked)}" aria-label="${ph.liked ? "Unlike this photo" : "Like this photo"}"><span aria-hidden="true">♥</span> ${ph.likes || ""}</button>
            <span class="mp-count">💬 ${ph.commentCount}</span>
            <small>${day(ph.date)}</small>
            ${page.canModerate && !page.isMe ? `<button type="button" class="mp-mod" data-mp-photo-remove title="Remove this photo (admin)">Remove</button>` : ""}
          </div>
          ${hidden > 0 ? `<button type="button" class="link-btn mp-more" data-mp-all>Show all ${ph.commentCount} comments</button>` : ""}
          ${comments.length ? `<ul class="mp-comments">${comments.map((c) => `
            <li data-comment="${esc(c.id)}">
              <span class="mp-c-av" ${person(c)}>${LevelUp.avatarHtml({ name: c.name, avatarUrl: c.avatarUrl })}</span>
              <div class="mp-c-main">
                <p><b ${person(c)} data-no-i18n>${esc(c.name)}</b> <span data-no-i18n>${esc(c.body)}</span></p>
                <p class="mp-c-meta"><small>${ago(c.date)}</small>
                  <button type="button" class="mp-heart small ${c.liked ? "liked" : ""}" data-mp-comment-like aria-pressed="${Boolean(c.liked)}" aria-label="${c.liked ? "Unlike this comment" : "Like this comment"}"><span aria-hidden="true">♥</span> ${c.likes || ""}</button>
                  ${c.canDelete ? `<button type="button" class="mp-mod" data-mp-comment-remove>Remove</button>` : ""}</p>
              </div>
            </li>`).join("")}</ul>` : ""}
          ${player ? `<form class="mp-comment-form" data-mp-comment-form>
            <label class="sr-only" for="c-${esc(ph.id)}">Comment</label>
            <input id="c-${esc(ph.id)}" name="body" maxlength="300" autocomplete="off" placeholder="Write a comment…">
            <button type="submit" class="btn btn-small btn-primary">Send</button>
          </form>` : `<p class="muted small"><button type="button" class="link-btn" data-auth-open="login">Log in</button> to like and comment.</p>`}
        </div>
      </article>`;
  }

  function renderBody() {
    const d = page;
    if (d.private) { body.innerHTML = ""; return; }
    const coach = d.trainerId ? LevelUp.trainerById(d.trainerId) : null;
    const first = String(d.name || "").split(" ")[0];
    const about = d.bio || d.trainerBio || coach?.bio || "";
    const tags = String(d.specialties || coach?.specialties || "").split(/[,·]/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
    const unlocked = ACHIEVEMENTS.filter((a) => (d.achievements || []).includes(a.id));
    const activity = (d.activity || []).map(activityRow).filter(Boolean).join("");
    const price = d.trainerId ? LevelUp.priceFor(d.trainerId) : null;
    const photos = d.photos || [];
    body.innerHTML = `
      <div class="container mp-grid">
        <div class="mp-side">
          ${about || tags.length || d.trainerId ? `<section class="panel mp-card">
            <h2>About ${esc(first)}</h2>
            ${about ? `<p class="mp-bio" data-no-i18n>${esc(about)}</p>` : ""}
            ${tags.length ? `<ul class="team-chips">${tags.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
            ${d.trainerId ? `<div class="trainer-stats" data-trainer-stats="${esc(d.trainerId)}"></div>
              ${price ? `<p class="mp-price"><b>${LevelUp.euro(price)}</b> per session · ${LevelUp.euro(LevelUp.getPricing().introPrice)} for your first one</p>` : ""}` : ""}
          </section>` : ""}

          ${d.xp != null ? `<section class="panel mp-card">
            <h2>In numbers</h2>
            <div class="mp-stats">
              <div><b>${d.xp.toLocaleString("en-US")}</b><span>XP</span></div>
              <div><b>${(Number(d.monthXp) || 0).toLocaleString("en-US")}</b><span>XP this month</span></div>
              <div><b>${Number(d.sessions) || 0}</b><span>Sessions</span></div>
              <div><b>${Number(d.classesDone) || 0}</b><span>Group classes</span></div>
              <div><b>${Number(d.likes) || 0}</b><span>Likes</span></div>
              <div><b>${unlocked.length}/${ACHIEVEMENTS.length}</b><span>Achievements</span></div>
            </div>
          </section>` : ""}

          ${(d.teaching || []).length ? `<section class="panel mp-card">
            <h2>Group classes with ${esc(first)}</h2>
            <ul class="mp-classes">${d.teaching.map((c) => classRow(c, true)).join("")}</ul>
          </section>` : ""}

          ${(d.upcoming || []).length ? `<section class="panel mp-card">
            <h2>Going to</h2>
            <ul class="mp-classes">${d.upcoming.map((c) => classRow(c, false)).join("")}</ul>
          </section>` : ""}

          ${unlocked.length ? `<section class="panel mp-card">
            <h2>Achievements <small class="muted">${unlocked.length}/${ACHIEVEMENTS.length}</small></h2>
            <ul class="mp-badges">${unlocked.map((a) => `<li title="${esc(a.desc)}"><span aria-hidden="true">${a.icon}</span><b>${esc(a.title)}</b></li>`).join("")}</ul>
          </section>` : ""}

          ${activity ? `<section class="panel mp-card">
            <h2>Lately</h2>
            <ul class="mp-activity">${activity}</ul>
          </section>` : ""}
        </div>

        <div class="mp-feed">
          <h2 class="mp-feed-title">Photos <small class="muted">${photos.length}</small></h2>
          ${photos.length ? photos.map(photoCard).join("") : `<p class="mp-empty">${d.isMe
            ? `No photos yet. <a class="text-link" href="profile.html#mypage">Add your first photo</a>.`
            : `${esc(first)} hasn't posted photos yet.`}</p>`}
        </div>
      </div>`;
    window.LevelUpSchedule?.refresh(); // fills the coach's level, sessions and open hours
  }

  // A coach's calendar: schedule.js draws the board for this trainer and handles the booking
  let bookFor = null;
  function renderBook() {
    const id = page?.trainerId || null;
    book.hidden = !id;
    if (!id || bookFor === id) return;
    bookFor = id;
    document.getElementById("bookTitle").textContent = tr(`Book ${String(page.name).split(" ")[0]}`);
    window.LevelUpSchedule?.showTrainer(id);
    if (location.hash === "#book") book.scrollIntoView({ block: "start" });
  }

  // ---------- Actions ----------
  const setError = (text) => { const el = document.getElementById("mpError"); if (el) el.textContent = text || ""; };
  const photoOf = (el) => page.photos.find((ph) => ph.id === el.closest("[data-photo]")?.dataset.photo);
  function putPhoto(fresh) {
    page.photos = page.photos.map((ph) => (ph.id === fresh.id ? fresh : ph));
    const card = document.getElementById(`photo-${fresh.id}`);
    if (card) card.outerHTML = photoCard(fresh);
  }
  const needLogin = () => { if (LevelUp.getPlayer()) return false; LevelUp.openAuth("login"); return true; };

  document.addEventListener("click", async (event) => {
    if (!page) return;
    const t = event.target;
    if (t.closest(".mp-zoom")) { t.closest(".mp-zoom").remove(); return; }
    if (t.closest("[data-mp-chat]")) {
      if (needLogin()) return;
      if (page.trainerId) { LevelUp.openChatWith(page.trainerId); return; }
      try { location.href = `chat.html?t=${encodeURIComponent(await LevelUp.chatOpenUser(page.userId))}`; } catch (err) { setError(err.message); }
      return;
    }
    const like = t.closest("[data-mp-like]");
    if (like) {
      if (needLogin()) return;
      if (page.liked) { LevelUp.toast({ title: "Already liked this week", text: `You can like ${page.name} again on Monday.`, icon: "♥", tone: "gold" }); return; }
      like.disabled = true;
      try {
        const res = await LevelUp.likeMember(page.userId);
        page.liked = true;
        page.likes = Number(res?.likes) || (Number(page.likes) || 0) + 1;
        LevelUp.toast({ title: "Like sent", text: `${page.name} gets a heart from you ❤️`, icon: "♥", tone: "green" });
        renderHero();
        renderBody();
      } catch (err) { like.disabled = false; setError(err.message); }
      return;
    }
    const cls = t.closest("[data-mp-class]");
    if (cls) { window.LevelUpSchedule?.openClass(cls.dataset.mpClass); return; }
    const zoom = t.closest("[data-mp-zoom]");
    if (zoom) {
      const ph = photoOf(zoom);
      const box = document.createElement("div");
      box.className = "mp-zoom";
      box.innerHTML = `<img src="${esc(ph.url)}" alt="">${ph.caption ? `<p data-no-i18n>${esc(ph.caption)}</p>` : ""}<small>tap to close</small>`;
      document.body.appendChild(box);
      return;
    }
    const ph = t.closest("[data-photo]") ? photoOf(t) : null;
    if (!ph) return;
    try {
      if (t.closest("[data-mp-all]")) { openAll.add(ph.id); putPhoto(ph); return; }
      if (t.closest("[data-mp-photo-like]")) { if (needLogin()) return; putPhoto(await LevelUp.photoLike(ph.id)); return; }
      const comment = t.closest("[data-comment]");
      if (t.closest("[data-mp-comment-like]")) { if (needLogin()) return; putPhoto(await LevelUp.photoCommentLike(comment.dataset.comment)); return; }
      if (t.closest("[data-mp-comment-remove]")) {
        if (!confirm(tr("Remove this comment?"))) return;
        putPhoto(await LevelUp.photoCommentDelete(comment.dataset.comment));
        return;
      }
      if (t.closest("[data-mp-photo-remove]")) {
        if (!confirm(tr("Remove this photo from this member's page? They are not told."))) return;
        await LevelUp.deletePhoto(ph.id);
        page.photos = page.photos.filter((x) => x.id !== ph.id);
        renderBody();
      }
    } catch (err) {
      LevelUp.toast({ title: "That didn't work", text: err.message, icon: "!" });
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-mp-comment-form]");
    if (!form || !page) return;
    event.preventDefault();
    const ph = photoOf(form);
    const text = form.elements.body.value.trim();
    if (!ph || !text) return;
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      openAll.add(ph.id);
      putPhoto(await LevelUp.photoComment(ph.id, text));
    } catch (err) {
      btn.disabled = false;
      LevelUp.toast({ title: "Comment not placed", text: err.message, icon: "!" });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.querySelector(".mp-zoom")?.remove();
  });

  // ---------- Start ----------
  document.addEventListener("levelup:change", () => {
    if (!LevelUp.isReady()) return;
    const now = LevelUp.getPlayer()?.id || "";
    if (loadedFor === null || now !== loadedFor) load(); // first time, or someone logged in or out
  });
  LevelUp.ready.then(() => { if (loadedFor === null) load(); });
})();
